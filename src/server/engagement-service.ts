import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  assertEngagementTransition,
  calculateRcmCoverage,
  EngagementError,
  formatEngagementCode,
  instantiateTemplate,
  isEngagementType,
  nextSequenceFromCodes,
  reorderRcmIds,
  validateEngagementAssignment,
  validateEngagementPeriod,
  validateEngagementSource,
  validateRcmRow,
  type EngagementStatus,
  type TransitionActor,
  type TransitionChecklist,
} from "@/lib/engagement";
import type {
  CreateEngagementInput,
  CreateRcmRowInput,
  ReorderRcmRowsInput,
  TransitionEngagementInput,
  UpdateEngagementInput,
  UpdateRcmRowInput,
} from "@/lib/schemas";
import { can, type Role } from "@/lib/rbac";
import type {
  EngagementCreateOptions,
  EngagementListItem,
  EngagementPlanCandidate,
  EngagementRcmRowView,
  EngagementView,
} from "@/lib/engagement-view";
import { ApiError } from "./api-error";
import type { WorkspaceAccess } from "./api";
import { recordAudit } from "./audit";

const memberSelect = {
  id: true,
  name: true,
  email: true,
} satisfies Prisma.UserSelect;

const engagementInclude = {
  entity: {
    select: { id: true, code: true, name: true, type: true, status: true },
  },
  riskAssessment: {
    select: {
      id: true,
      residualScore: true,
      riskLevel: true,
      approvedAt: true,
    },
  },
  planEngagement: {
    include: {
      plan: { select: { id: true, year: true, name: true, status: true } },
    },
  },
  preparer: { select: memberSelect },
  reviewer: { select: memberSelect },
  approver: { select: memberSelect },
  rcmRows: { orderBy: { sortOrder: "asc" as const } },
  transitions: {
    orderBy: { createdAt: "asc" as const },
    include: { actor: { select: { id: true, name: true } } },
  },
} satisfies Prisma.EngagementInclude;

type EngagementRow = Prisma.EngagementGetPayload<{
  include: typeof engagementInclude;
}>;

const editableStatuses = new Set(["draft", "planning", "fieldwork"]);

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function domain<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof EngagementError) {
      throw new ApiError(422, error.code, error.message);
    }
    throw error;
  }
}

function ensureVersion(current: number, expected: number): void {
  if (current !== expected) {
    throw new ApiError(
      412,
      "STALE_VERSION",
      `Engagement has changed. Current version is ${current}`,
      { currentVersion: current },
    );
  }
}

function assertEditable(status: string): void {
  if (!editableStatuses.has(status)) {
    throw new ApiError(
      422,
      "ENGAGEMENT_LOCKED",
      `Konten engagement tidak dapat diubah saat status ${status}`,
    );
  }
}

async function getEngagementRow(
  workspaceId: string,
  engagementId: string,
): Promise<EngagementRow> {
  const row = await prisma.engagement.findFirst({
    where: { id: engagementId, workspaceId },
    include: engagementInclude,
  });

  if (!row) {
    throw new ApiError(
      404,
      "ENGAGEMENT_NOT_FOUND",
      "Engagement was not found",
    );
  }

  return row;
}

function serializeEntity(row: EngagementRow["entity"]) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    status: row.status,
  };
}

function serializePlan(row: EngagementRow["planEngagement"]) {
  if (!row) {
    return null;
  }

  return {
    id: row.plan.id,
    year: row.plan.year,
    name: row.plan.name,
    status: row.plan.status,
    title: row.title,
    estimatedHours: row.estimatedHours,
    quarter: row.quarter,
  };
}

function serializeRcmRow(
  row: EngagementRow["rcmRows"][number],
): EngagementRcmRowView {
  return {
    id: row.id,
    sortOrder: row.sortOrder,
    riskDescription: row.riskDescription,
    controlDescription: row.controlDescription,
    assertion: row.assertion,
    procedureDescription: row.procedureDescription,
    evidenceRequirement: row.evidenceRequirement,
  };
}

function serializeListItem(row: EngagementRow): EngagementListItem {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    engagementType: row.engagementType,
    templateKey: row.templateKey,
    status: row.status,
    version: row.version,
    startDate: row.startDate.toISOString(),
    endDate: row.endDate.toISOString(),
    budgetHours: row.budgetHours,
    entity: serializeEntity(row.entity),
    plan: serializePlan(row.planEngagement),
    preparer: row.preparer,
    reviewer: row.reviewer,
    approver: row.approver,
    coverage: calculateRcmCoverage(row.rcmRows),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeEngagement(row: EngagementRow): EngagementView {
  return {
    ...serializeListItem(row),
    workspaceId: row.workspaceId,
    objective: row.objective,
    scope: row.scope,
    adHocReason: row.adHocReason,
    riskAssessment: row.riskAssessment
      ? {
          id: row.riskAssessment.id,
          residualScore: row.riskAssessment.residualScore,
          riskLevel: row.riskAssessment.riskLevel,
          approvedAt: iso(row.riskAssessment.approvedAt),
        }
      : null,
    rcmRows: row.rcmRows.map(serializeRcmRow),
    transitions: row.transitions.map((transition) => ({
      id: transition.id,
      action: transition.action,
      fromStatus: transition.fromStatus,
      toStatus: transition.toStatus,
      note: transition.note,
      actor: transition.actor,
      createdAt: transition.createdAt.toISOString(),
    })),
    createdById: row.createdById,
    issuedAt: iso(row.issuedAt),
    closedAt: iso(row.closedAt),
    createdAt: row.createdAt.toISOString(),
  };
}

function mapPlanType(type: string): string {
  if (isEngagementType(type)) {
    return type;
  }
  if (type === "fraud") {
    return "financial";
  }
  return "operational";
}

async function ensureTeam(
  workspaceId: string,
  team: { preparerId: string; reviewerId: string; approverId: string },
): Promise<void> {
  domain(() => validateEngagementAssignment(team));

  const memberships = await prisma.membership.findMany({
    where: {
      workspaceId,
      userId: {
        in: [team.preparerId, team.reviewerId, team.approverId],
      },
    },
    select: { userId: true, role: true },
  });
  const roleByUser = new Map(
    memberships.map((membership) => [membership.userId, membership.role]),
  );

  for (const userId of [team.preparerId, team.reviewerId, team.approverId]) {
    if (!roleByUser.has(userId)) {
      throw new ApiError(
        422,
        "TEAM_NOT_MEMBER",
        "Seluruh anggota tim harus merupakan member workspace",
      );
    }
  }

  const preparerRole = roleByUser.get(team.preparerId) as Role;
  const reviewerRole = roleByUser.get(team.reviewerId) as Role;
  const approverRole = roleByUser.get(team.approverId) as Role;

  if (!can(preparerRole, "engagement:write")) {
    throw new ApiError(
      422,
      "PREPARER_NOT_AUTHORIZED",
      `Role ${preparerRole} tidak dapat menjadi preparer`,
    );
  }
  if (!can(reviewerRole, "engagement:review")) {
    throw new ApiError(
      422,
      "REVIEWER_NOT_AUTHORIZED",
      `Role ${reviewerRole} tidak dapat menjadi reviewer`,
    );
  }
  if (!can(approverRole, "engagement:issue")) {
    throw new ApiError(
      422,
      "APPROVER_NOT_AUTHORIZED",
      `Role ${approverRole} tidak dapat menjadi approver`,
    );
  }
}

function assertObjectiveScope(objective: string, scope: string): void {
  if (objective.trim().length < 10) {
    throw new ApiError(
      422,
      "OBJECTIVE_REQUIRED",
      "Objective engagement wajib diisi minimal 10 karakter",
    );
  }
  if (scope.trim().length < 10) {
    throw new ApiError(
      422,
      "SCOPE_REQUIRED",
      "Scope engagement wajib diisi minimal 10 karakter",
    );
  }
}

export async function listEngagements(
  access: WorkspaceAccess,
): Promise<EngagementListItem[]> {
  const rows = await prisma.engagement.findMany({
    where: { workspaceId: access.workspace.id },
    include: engagementInclude,
    orderBy: [{ createdAt: "desc" }],
  });

  return rows.map(serializeListItem);
}

export async function getEngagement(
  access: WorkspaceAccess,
  engagementId: string,
): Promise<EngagementView> {
  return serializeEngagement(
    await getEngagementRow(access.workspace.id, engagementId),
  );
}

export async function listEngagementCreateOptions(
  access: WorkspaceAccess,
): Promise<EngagementCreateOptions> {
  const [planLines, entities, memberships] = await Promise.all([
    prisma.auditPlanEngagement.findMany({
      where: {
        plan: {
          workspaceId: access.workspace.id,
          status: "approved",
          isCurrent: true,
        },
        engagement: null,
      },
      include: {
        entity: {
          select: { id: true, code: true, name: true, type: true, status: true },
        },
        plan: { select: { id: true, year: true, name: true, status: true } },
      },
      orderBy: [{ plan: { year: "desc" } }, { sortOrder: "asc" }],
    }),
    prisma.auditEntity.findMany({
      where: {
        workspaceId: access.workspace.id,
        archivedAt: null,
        status: "active",
      },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        status: true,
        assessments: {
          where: { status: "approved", isCurrent: true },
          orderBy: { approvedAt: "desc" },
          take: 1,
          select: { residualScore: true, riskLevel: true },
        },
      },
      orderBy: [{ code: "asc" }],
    }),
    prisma.membership.findMany({
      where: {
        workspaceId: access.workspace.id,
        user: { isActive: true },
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { user: { name: "asc" } },
    }),
  ]);

  const planCandidates: EngagementPlanCandidate[] = planLines.map((line) => ({
    id: line.id,
    title: line.title,
    engagementType: line.engagementType,
    quarter: line.quarter,
    estimatedHours: line.estimatedHours,
    riskScore: line.riskScore,
    riskLevel: line.riskLevel,
    entity: {
      id: line.entity.id,
      code: line.entity.code,
      name: line.entity.name,
      type: line.entity.type,
      status: line.entity.status,
    },
    plan: {
      id: line.plan.id,
      year: line.plan.year,
      name: line.plan.name,
      status: line.plan.status,
      title: line.title,
      estimatedHours: line.estimatedHours,
      quarter: line.quarter,
    },
  }));

  return {
    planCandidates,
    entities: entities.map((entity) => ({
      id: entity.id,
      code: entity.code,
      name: entity.name,
      type: entity.type,
      status: entity.status,
      riskScore: entity.assessments[0]?.residualScore ?? null,
      riskLevel: entity.assessments[0]?.riskLevel ?? null,
    })),
    members: memberships.map((membership) => ({
      id: membership.user.id,
      name: membership.user.name,
      email: membership.user.email,
      role: membership.role,
    })),
  };
}

export async function listEngagementMembers(
  access: WorkspaceAccess,
): Promise<EngagementCreateOptions["members"]> {
  const memberships = await prisma.membership.findMany({
    where: {
      workspaceId: access.workspace.id,
      user: { isActive: true },
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { user: { name: "asc" } },
  });

  return memberships.map((membership) => ({
    id: membership.user.id,
    name: membership.user.name,
    email: membership.user.email,
    role: membership.role,
  }));
}

export async function createEngagement(
  access: WorkspaceAccess,
  input: CreateEngagementInput,
): Promise<EngagementView> {
  domain(() =>
    validateEngagementSource({
      planEngagementId: input.planEngagementId,
      adHocReason: input.adHocReason,
    }),
  );
  await ensureTeam(access.workspace.id, {
    preparerId: input.preparerId,
    reviewerId: input.reviewerId,
    approverId: input.approverId,
  });

  const startDate = new Date(input.startDate);
  const endDate = new Date(input.endDate);
  domain(() =>
    validateEngagementPeriod({
      startDate,
      endDate,
      budgetHours: input.budgetHours,
    }),
  );

  let entityId: string;
  let riskAssessmentId: string | null = null;
  let planEngagementId: string | null = null;
  let planType: string | null = null;

  if (input.planEngagementId) {
    const planLine = await prisma.auditPlanEngagement.findFirst({
      where: {
        id: input.planEngagementId,
        plan: { workspaceId: access.workspace.id },
      },
      include: {
        plan: { select: { id: true, status: true, isCurrent: true } },
      },
    });

    if (!planLine) {
      throw new ApiError(
        404,
        "PLAN_ENGAGEMENT_NOT_FOUND",
        "Plan engagement was not found",
      );
    }

    if (planLine.plan.status !== "approved" || !planLine.plan.isCurrent) {
      throw new ApiError(
        409,
        "PLAN_NOT_APPROVED",
        "Engagement hanya bisa dibuat dari plan yang approved dan current",
      );
    }

    const existing = await prisma.engagement.findUnique({
      where: { planEngagementId: planLine.id },
      select: { id: true },
    });

    if (existing) {
      throw new ApiError(
        409,
        "ENGAGEMENT_EXISTS",
        "Plan engagement ini sudah memiliki workspace engagement",
      );
    }

    entityId = planLine.entityId;
    riskAssessmentId = planLine.riskAssessmentId;
    planEngagementId = planLine.id;
    planType = planLine.engagementType;
  } else {
    if (!input.entityId) {
      throw new ApiError(
        422,
        "ENTITY_REQUIRED",
        "Entity wajib dipilih untuk engagement ad-hoc",
      );
    }

    const entity = await prisma.auditEntity.findFirst({
      where: {
        id: input.entityId,
        workspaceId: access.workspace.id,
        archivedAt: null,
      },
      select: { id: true },
    });

    if (!entity) {
      throw new ApiError(404, "ENTITY_NOT_FOUND", "Audit entity was not found");
    }

    entityId = entity.id;

    if (input.riskAssessmentId) {
      const assessment = await prisma.riskAssessment.findFirst({
        where: {
          id: input.riskAssessmentId,
          workspaceId: access.workspace.id,
          entityId,
          status: "approved",
          isCurrent: true,
        },
        select: { id: true },
      });

      if (!assessment) {
        throw new ApiError(
          422,
          "INVALID_RISK_ASSESSMENT",
          "Risk assessment harus approved, current, dan milik entity yang sama",
        );
      }
      riskAssessmentId = assessment.id;
    } else {
      const assessment = await prisma.riskAssessment.findFirst({
        where: {
          workspaceId: access.workspace.id,
          entityId,
          status: "approved",
          isCurrent: true,
        },
        orderBy: { approvedAt: "desc" },
        select: { id: true },
      });
      riskAssessmentId = assessment?.id ?? null;
    }
  }

  const templateKey = input.templateKey ?? mapPlanType(planType ?? input.engagementType);
  const template = domain(() => instantiateTemplate(templateKey));
  const objective = input.objective?.trim() || template.objective;
  const scope = input.scope?.trim() || template.scope;
  assertObjectiveScope(objective, scope);

  const year = startDate.getUTCFullYear();
  const existingCodes = await prisma.engagement.findMany({
    where: {
      workspaceId: access.workspace.id,
      code: { startsWith: `ENG-${year}-` },
    },
    select: { code: true },
  });
  const sequence = nextSequenceFromCodes(
    existingCodes.map((row) => row.code),
    year,
  );
  const code = formatEngagementCode(year, sequence);

  const created = await prisma.engagement.create({
    data: {
      workspaceId: access.workspace.id,
      code,
      title: input.title,
      engagementType: input.engagementType,
      templateKey,
      objective,
      scope,
      status: "draft",
      entityId,
      riskAssessmentId,
      planEngagementId,
      adHocReason: input.adHocReason?.trim() || null,
      startDate,
      endDate,
      budgetHours: input.budgetHours,
      preparerId: input.preparerId,
      reviewerId: input.reviewerId,
      approverId: input.approverId,
      createdById: access.user.id,
      updatedById: access.user.id,
      rcmRows: {
        create: template.rows.map((row, index) => ({
          ...row,
          sortOrder: index,
        })),
      },
      transitions: {
        create: {
          action: "created",
          fromStatus: "draft",
          toStatus: "draft",
          note: "Engagement dibuat",
          actorId: access.user.id,
        },
      },
    },
    select: { id: true, code: true },
  });

  await recordAudit(prisma, {
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    action: "engagement.created",
    objectType: "engagement",
    objectId: created.id,
    after: {
      code: created.code,
      title: input.title,
      planEngagementId,
      entityId,
    },
    ...access.meta,
  });

  return getEngagement(access, created.id);
}

export async function updateEngagement(
  access: WorkspaceAccess,
  engagementId: string,
  input: UpdateEngagementInput,
): Promise<EngagementView> {
  const row = await getEngagementRow(access.workspace.id, engagementId);
  assertEditable(row.status);
  ensureVersion(row.version, input.version);

  const team = {
    preparerId: input.preparerId ?? row.preparerId,
    reviewerId: input.reviewerId ?? row.reviewerId,
    approverId: input.approverId ?? row.approverId,
  };
  await ensureTeam(access.workspace.id, team);

  const startDate = input.startDate ? new Date(input.startDate) : row.startDate;
  const endDate = input.endDate ? new Date(input.endDate) : row.endDate;
  const budgetHours = input.budgetHours ?? row.budgetHours;
  domain(() =>
    validateEngagementPeriod({ startDate, endDate, budgetHours }),
  );

  const objective = input.objective ?? row.objective;
  const scope = input.scope ?? row.scope;
  assertObjectiveScope(objective, scope);

  await prisma.engagement.update({
    where: { id: row.id },
    data: {
      title: input.title ?? row.title,
      engagementType: input.engagementType ?? row.engagementType,
      objective,
      scope,
      startDate,
      endDate,
      budgetHours,
      ...team,
      version: { increment: 1 },
      updatedById: access.user.id,
    },
  });

  await recordAudit(prisma, {
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    action: "engagement.updated",
    objectType: "engagement",
    objectId: row.id,
    before: {
      title: row.title,
      status: row.status,
      version: row.version,
      preparerId: row.preparerId,
      reviewerId: row.reviewerId,
      approverId: row.approverId,
    },
    after: {
      title: input.title ?? row.title,
      version: row.version + 1,
      ...team,
    },
    ...access.meta,
  });

  return getEngagement(access, row.id);
}

async function lockEngagementRow(
  access: WorkspaceAccess,
  engagementId: string,
  version: number,
): Promise<EngagementRow> {
  const row = await getEngagementRow(access.workspace.id, engagementId);
  assertEditable(row.status);
  ensureVersion(row.version, version);
  return row;
}

export async function addRcmRow(
  access: WorkspaceAccess,
  engagementId: string,
  input: CreateRcmRowInput,
): Promise<EngagementView> {
  const row = await lockEngagementRow(access, engagementId, input.version);
  const normalized = domain(() => validateRcmRow(input));
  const last = await prisma.engagementRcmRow.findFirst({
    where: { engagementId: row.id },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await prisma.$transaction([
    prisma.engagementRcmRow.create({
      data: {
        engagementId: row.id,
        ...normalized,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    }),
    prisma.engagement.update({
      where: { id: row.id },
      data: { version: { increment: 1 }, updatedById: access.user.id },
    }),
  ]);

  await recordAudit(prisma, {
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    action: "engagement.rcm_added",
    objectType: "engagement",
    objectId: row.id,
    after: normalized,
    ...access.meta,
  });

  return getEngagement(access, row.id);
}

export async function updateRcmRow(
  access: WorkspaceAccess,
  engagementId: string,
  rowId: string,
  input: UpdateRcmRowInput,
): Promise<EngagementView> {
  const row = await lockEngagementRow(access, engagementId, input.version);
  const current = row.rcmRows.find((candidate) => candidate.id === rowId);

  if (!current) {
    throw new ApiError(404, "RCM_ROW_NOT_FOUND", "RCM row was not found");
  }

  const normalized = domain(() =>
    validateRcmRow({
      riskDescription: input.riskDescription ?? current.riskDescription,
      controlDescription:
        input.controlDescription ?? current.controlDescription,
      assertion: input.assertion ?? current.assertion,
      procedureDescription:
        input.procedureDescription ?? current.procedureDescription,
      evidenceRequirement:
        input.evidenceRequirement ?? current.evidenceRequirement,
    }),
  );

  await prisma.$transaction([
    prisma.engagementRcmRow.update({
      where: { id: current.id },
      data: normalized,
    }),
    prisma.engagement.update({
      where: { id: row.id },
      data: { version: { increment: 1 }, updatedById: access.user.id },
    }),
  ]);

  await recordAudit(prisma, {
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    action: "engagement.rcm_updated",
    objectType: "engagement",
    objectId: row.id,
    before: {
      riskDescription: current.riskDescription,
      procedureDescription: current.procedureDescription,
    },
    after: normalized,
    ...access.meta,
  });

  return getEngagement(access, row.id);
}

export async function deleteRcmRow(
  access: WorkspaceAccess,
  engagementId: string,
  rowId: string,
  version: number,
): Promise<EngagementView> {
  const row = await lockEngagementRow(access, engagementId, version);
  const current = row.rcmRows.find((candidate) => candidate.id === rowId);

  if (!current) {
    throw new ApiError(404, "RCM_ROW_NOT_FOUND", "RCM row was not found");
  }

  await prisma.$transaction([
    prisma.engagementRcmRow.delete({ where: { id: current.id } }),
    prisma.engagement.update({
      where: { id: row.id },
      data: { version: { increment: 1 }, updatedById: access.user.id },
    }),
  ]);

  await recordAudit(prisma, {
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    action: "engagement.rcm_removed",
    objectType: "engagement",
    objectId: row.id,
    before: {
      riskDescription: current.riskDescription,
      assertion: current.assertion,
    },
    ...access.meta,
  });

  return getEngagement(access, row.id);
}

export async function reorderRcmRows(
  access: WorkspaceAccess,
  engagementId: string,
  input: ReorderRcmRowsInput,
): Promise<EngagementView> {
  const row = await lockEngagementRow(access, engagementId, input.version);
  const currentIds = row.rcmRows.map((candidate) => candidate.id);
  const orderedIds = domain(() => reorderRcmIds(currentIds, input.orderedIds));

  await prisma.$transaction([
    ...orderedIds.map((id, index) =>
      prisma.engagementRcmRow.update({
        where: { id },
        data: { sortOrder: index },
      }),
    ),
    prisma.engagement.update({
      where: { id: row.id },
      data: { version: { increment: 1 }, updatedById: access.user.id },
    }),
  ]);

  await recordAudit(prisma, {
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    action: "engagement.rcm_reordered",
    objectType: "engagement",
    objectId: row.id,
    after: { orderedIds },
    ...access.meta,
  });

  return getEngagement(access, row.id);
}

function actorFor(row: EngagementRow, access: WorkspaceAccess): TransitionActor {
  const role = access.membership.role;

  return {
    canWrite: can(role, "engagement:write"),
    canManage: role === "MANAGER" || role === "CAE",
    canIssue: can(role, "engagement:issue"),
    isPreparer: row.preparerId === access.user.id,
    isReviewer: row.reviewerId === access.user.id,
    isApprover: row.approverId === access.user.id,
  };
}

function checklistFor(row: EngagementRow): TransitionChecklist {
  const coverage = calculateRcmCoverage(row.rcmRows);

  return {
    hasObjective: row.objective.trim().length > 0,
    hasScope: row.scope.trim().length > 0,
    hasSchedule:
      row.endDate.getTime() >= row.startDate.getTime() && row.budgetHours > 0,
    rcmRowCount: coverage.totalRows,
    incompleteRcmRows: coverage.incompleteRows,
    hasPreparer: Boolean(row.preparerId),
    hasReviewer: Boolean(row.reviewerId),
    hasApprover: Boolean(row.approverId),
    note: null,
  };
}

export async function transitionEngagement(
  access: WorkspaceAccess,
  engagementId: string,
  input: TransitionEngagementInput,
): Promise<EngagementView> {
  const row = await getEngagementRow(access.workspace.id, engagementId);
  ensureVersion(row.version, input.version);

  const checklist = { ...checklistFor(row), note: input.note ?? null };
  domain(() =>
    assertEngagementTransition({
      from: row.status as EngagementStatus,
      to: input.toStatus,
      actor: actorFor(row, access),
      checklist,
    }),
  );

  const sendBack = row.status === "review" && input.toStatus === "fieldwork";
  const now = new Date();

  await prisma.$transaction([
    prisma.engagement.update({
      where: { id: row.id },
      data: {
        status: input.toStatus,
        version: { increment: 1 },
        updatedById: access.user.id,
        ...(input.toStatus === "issued" ? { issuedAt: now } : {}),
        ...(input.toStatus === "closed" ? { closedAt: now } : {}),
      },
    }),
    prisma.engagementTransition.create({
      data: {
        engagementId: row.id,
        action: sendBack ? "send_back" : "advance",
        fromStatus: row.status,
        toStatus: input.toStatus,
        note: input.note?.trim() || null,
        actorId: access.user.id,
      },
    }),
  ]);

  await recordAudit(prisma, {
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    action: "engagement.status_changed",
    objectType: "engagement",
    objectId: row.id,
    before: { status: row.status, version: row.version },
    after: {
      status: input.toStatus,
      version: row.version + 1,
      note: input.note ?? null,
    },
    ...access.meta,
  });

  return getEngagement(access, row.id);
}
