import { Prisma } from "@prisma/client";
import { ApiError } from "./api-error";
import { recordAudit } from "./audit";
import type { WorkspaceAccess } from "./api";
import { prisma } from "@/lib/db";
import { parseJson } from "@/lib/json";
import {
  assertPlanAction,
  buildPlanCsv,
  calculateCapacityWarnings,
  calculateCoverage,
  calculatePlanBudget,
  PlanError,
  resolvePlanningRisk,
  sumAllocations,
  validatePlanPeriod,
} from "@/lib/plan";
import type { RiskLevelThresholds } from "@/lib/scoring";
import type {
  CreatePlanEngagementInput,
  CreatePlanInput,
  NewPlanVersionInput,
  ReplacePlanCapacityInput,
  UpdateEngagementActualsInput,
  UpdatePlanEngagementInput,
  UpdatePlanInput,
} from "@/lib/schemas";
import type {
  PlanBaseView,
  PlanEngagementView,
  PlanListItem,
  PlanSummaryView,
  PlanView,
} from "@/lib/plan-view";

const planInclude = {
  ownerUser: { select: { id: true, name: true, email: true } },
  approvedBy: { select: { id: true, name: true, email: true } },
  engagements: {
    orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
    include: {
      entity: {
        select: { id: true, code: true, name: true, type: true, status: true },
      },
      allocations: {
        orderBy: { role: "asc" as const },
        select: { role: true, estimatedHours: true },
      },
    },
  },
  capacities: {
    orderBy: { role: "asc" as const },
    select: { role: true, availableHours: true },
  },
} satisfies Prisma.AuditPlanInclude;

type PlanRow = Prisma.AuditPlanGetPayload<{ include: typeof planInclude }>;
type EntityRiskLevel = { id: string; riskLevel: string | null };

const engagementInclude = {
  riskAssessment: {
    include: {
      riskModel: {
        select: { scaleMin: true, scaleMax: true, levelThresholds: true },
      },
    },
  },
  allocations: true,
} satisfies Prisma.AuditPlanEngagementInclude;

type EngagementRow = Prisma.AuditPlanEngagementGetPayload<{
  include: typeof engagementInclude;
}>;

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function domain<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof PlanError) {
      throw new ApiError(422, error.code, error.message);
    }
    throw error;
  }
}

function parseModelThresholds(value: string): RiskLevelThresholds {
  const parsed = parseJson<Partial<RiskLevelThresholds>>(value, {});

  if (
    typeof parsed.low !== "number" ||
    typeof parsed.medium !== "number" ||
    typeof parsed.high !== "number" ||
    typeof parsed.critical !== "number"
  ) {
    throw new ApiError(
      500,
      "INVALID_MODEL_THRESHOLDS",
      "Risk model thresholds are invalid",
    );
  }

  return parsed as RiskLevelThresholds;
}

async function getEntityRiskLevels(
  workspaceId: string,
): Promise<EntityRiskLevel[]> {
  const entities = await prisma.auditEntity.findMany({
    where: { workspaceId, archivedAt: null },
    select: {
      id: true,
      assessments: {
        where: { status: "approved", isCurrent: true },
        orderBy: { approvedAt: "desc" },
        take: 1,
        select: { riskLevel: true },
      },
    },
  });

  return entities.map((entity) => ({
    id: entity.id,
    riskLevel: entity.assessments[0]?.riskLevel ?? null,
  }));
}

async function getPlanRow(
  workspaceId: string,
  planId: string,
): Promise<PlanRow> {
  const plan = await prisma.auditPlan.findFirst({
    where: { id: planId, workspaceId },
    include: planInclude,
  });

  if (!plan) {
    throw new ApiError(404, "PLAN_NOT_FOUND", "Audit plan was not found");
  }

  return plan;
}

function summarize(plan: PlanRow, entities: EntityRiskLevel[]): PlanSummaryView {
  const engagements = plan.engagements.map((engagement) => ({
    allocations: engagement.allocations.map((allocation) => ({
      role: allocation.role,
      hours: allocation.estimatedHours,
    })),
    actualHours: engagement.actualHours,
  }));
  const budget = calculatePlanBudget(engagements);
  const warnings = calculateCapacityWarnings(plan.capacities, engagements);
  const coverage = calculateCoverage({
    plannedEntityIds: plan.engagements.map((engagement) => engagement.entityId),
    entities,
  });

  return {
    engagementCount: plan.engagements.length,
    budget,
    coverage,
    warnings,
  };
}

function serializeEngagement(
  engagement: PlanRow["engagements"][number],
): PlanEngagementView {
  return {
    id: engagement.id,
    planId: engagement.planId,
    entityId: engagement.entityId,
    riskAssessmentId: engagement.riskAssessmentId,
    title: engagement.title,
    engagementType: engagement.engagementType,
    quarter: engagement.quarter,
    plannedStart: iso(engagement.plannedStart),
    plannedEnd: iso(engagement.plannedEnd),
    sourceRiskScore: engagement.sourceRiskScore,
    sourceRiskLevel: engagement.sourceRiskLevel,
    sourceRationale: engagement.sourceRationale,
    overrideScore: engagement.overrideScore,
    overrideReason: engagement.overrideReason,
    riskScore: engagement.riskScore,
    riskLevel: engagement.riskLevel,
    estimatedHours: engagement.estimatedHours,
    actualHours: engagement.actualHours,
    status: engagement.status,
    notes: engagement.notes,
    sortOrder: engagement.sortOrder,
    entity: engagement.entity
      ? {
          id: engagement.entity.id,
          code: engagement.entity.code,
          name: engagement.entity.name,
          type: engagement.entity.type,
          status: engagement.entity.status,
        }
      : null,
    allocations: engagement.allocations.map((allocation) => ({
      role: allocation.role,
      estimatedHours: allocation.estimatedHours,
    })),
  };
}

function serializeBase(
  plan: PlanRow,
  summary: PlanSummaryView,
): PlanBaseView {
  return {
    id: plan.id,
    workspaceId: plan.workspaceId,
    year: plan.year,
    name: plan.name,
    objective: plan.objective,
    scope: plan.scope,
    periodStart: plan.periodStart.toISOString(),
    periodEnd: plan.periodEnd.toISOString(),
    status: plan.status,
    version: plan.version,
    isCurrent: plan.isCurrent,
    supersedesId: plan.supersedesId,
    changeReason: plan.changeReason,
    owner: plan.ownerUser,
    approvedBy: plan.approvedBy,
    createdById: plan.createdById,
    submittedAt: iso(plan.submittedAt),
    approvedAt: iso(plan.approvedAt),
    createdAt: iso(plan.createdAt),
    updatedAt: iso(plan.updatedAt),
    summary,
  };
}

function serializePlan(plan: PlanRow, entities: EntityRiskLevel[]): PlanView {
  return {
    ...serializeBase(plan, summarize(plan, entities)),
    engagements: plan.engagements.map(serializeEngagement),
    capacities: plan.capacities.map((capacity) => ({
      role: capacity.role,
      availableHours: capacity.availableHours,
    })),
  };
}

function ensureVersion(plan: PlanRow, version: number): void {
  if (plan.version !== version) {
    throw new ApiError(
      412,
      "STALE_VERSION",
      `Plan has changed. Current version is ${plan.version}`,
      { currentVersion: plan.version },
    );
  }
}

async function ensureOwner(
  workspaceId: string,
  ownerUserId: string,
): Promise<void> {
  const membership = await prisma.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: ownerUserId } },
    select: { id: true },
  });

  if (!membership) {
    throw new ApiError(
      422,
      "OWNER_NOT_MEMBER",
      "Plan owner must be a member of this workspace",
    );
  }
}

function validateEngagementDates(
  plan: PlanRow,
  plannedStart: Date | null,
  plannedEnd: Date | null,
): void {
  if (plannedStart && plannedEnd && plannedEnd <= plannedStart) {
    throw new ApiError(
      422,
      "INVALID_ENGAGEMENT_PERIOD",
      "Engagement end date must be after its start date",
    );
  }

  if (
    (plannedStart && plannedStart < plan.periodStart) ||
    (plannedStart && plannedStart > plan.periodEnd) ||
    (plannedEnd && plannedEnd < plan.periodStart) ||
    (plannedEnd && plannedEnd > plan.periodEnd)
  ) {
    throw new ApiError(
      422,
      "OUTSIDE_PLAN_PERIOD",
      "Engagement dates must fall inside the plan period",
    );
  }
}

async function getEngagementRow(
  planId: string,
  engagementId: string,
): Promise<EngagementRow> {
  const engagement = await prisma.auditPlanEngagement.findFirst({
    where: { id: engagementId, planId },
    include: engagementInclude,
  });

  if (!engagement) {
    throw new ApiError(
      404,
      "ENGAGEMENT_NOT_FOUND",
      "Planned engagement was not found",
    );
  }

  return engagement;
}

export async function listPlans(
  access: WorkspaceAccess,
): Promise<PlanListItem[]> {
  const [plans, entities] = await Promise.all([
    prisma.auditPlan.findMany({
      where: { workspaceId: access.workspace.id },
      include: planInclude,
      orderBy: [{ year: "desc" }, { version: "desc" }],
    }),
    getEntityRiskLevels(access.workspace.id),
  ]);

  return plans.map((plan) => serializeBase(plan, summarize(plan, entities)));
}

export async function getPlan(
  access: WorkspaceAccess,
  planId: string,
): Promise<PlanView> {
  const [plan, entities] = await Promise.all([
    getPlanRow(access.workspace.id, planId),
    getEntityRiskLevels(access.workspace.id),
  ]);

  return serializePlan(plan, entities);
}

export async function createPlan(
  access: WorkspaceAccess,
  input: CreatePlanInput,
): Promise<PlanView> {
  const periodStart = new Date(input.periodStart);
  const periodEnd = new Date(input.periodEnd);
  domain(() => validatePlanPeriod({ year: input.year, periodStart, periodEnd }));

  const existing = await prisma.auditPlan.findFirst({
    where: {
      workspaceId: access.workspace.id,
      year: input.year,
      isCurrent: true,
    },
    select: { id: true },
  });

  if (existing) {
    throw new ApiError(
      409,
      "PLAN_YEAR_EXISTS",
      `Plan aktif untuk tahun ${input.year} sudah ada. Buat versi baru dari plan tersebut.`,
      { planId: existing.id },
    );
  }

  const ownerUserId = input.ownerUserId ?? access.user.id;
  await ensureOwner(access.workspace.id, ownerUserId);
  domain(() =>
    calculateCapacityWarnings(
      (input.capacity ?? []).map((row) => ({
        role: row.role,
        availableHours: row.availableHours,
      })),
      [],
    ),
  );

  const plan = await prisma.$transaction(async (tx) => {
    const created = await tx.auditPlan.create({
      data: {
        workspaceId: access.workspace.id,
        year: input.year,
        name: input.name,
        objective: input.objective,
        scope: input.scope,
        periodStart,
        periodEnd,
        ownerUserId,
        createdById: access.user.id,
        updatedById: access.user.id,
        capacities: input.capacity?.length
          ? {
              create: input.capacity.map((row) => ({
                role: row.role,
                availableHours: row.availableHours,
              })),
            }
          : undefined,
      },
    });

    await recordAudit(tx, {
      workspaceId: access.workspace.id,
      actorId: access.user.id,
      action: "plan.created",
      objectType: "audit_plan",
      objectId: created.id,
      after: { year: created.year, name: created.name },
      ...access.meta,
    });

    return created;
  });

  return getPlan(access, plan.id);
}

export async function updatePlan(
  access: WorkspaceAccess,
  planId: string,
  input: UpdatePlanInput,
): Promise<PlanView> {
  const plan = await getPlanRow(access.workspace.id, planId);
  domain(() => assertPlanAction(plan.status, "edit"));
  ensureVersion(plan, input.version);

  const periodStart = input.periodStart
    ? new Date(input.periodStart)
    : plan.periodStart;
  const periodEnd = input.periodEnd ? new Date(input.periodEnd) : plan.periodEnd;
  domain(() => validatePlanPeriod({ year: plan.year, periodStart, periodEnd }));

  if (input.ownerUserId) {
    await ensureOwner(access.workspace.id, input.ownerUserId);
  }

  await prisma.$transaction(async (tx) => {
    await tx.auditPlan.update({
      where: { id: plan.id },
      data: {
        name: input.name ?? plan.name,
        objective: input.objective ?? plan.objective,
        scope: input.scope ?? plan.scope,
        periodStart,
        periodEnd,
        ownerUserId: input.ownerUserId ?? plan.ownerUserId,
        updatedById: access.user.id,
      },
    });

    await recordAudit(tx, {
      workspaceId: access.workspace.id,
      actorId: access.user.id,
      action: "plan.updated",
      objectType: "audit_plan",
      objectId: plan.id,
      before: { name: plan.name, periodStart: iso(plan.periodStart) },
      after: { name: input.name ?? plan.name, periodStart: iso(periodStart) },
      ...access.meta,
    });
  });

  return getPlan(access, planId);
}

export async function addPlanEngagement(
  access: WorkspaceAccess,
  planId: string,
  input: CreatePlanEngagementInput,
): Promise<PlanView> {
  const plan = await getPlanRow(access.workspace.id, planId);
  domain(() => assertPlanAction(plan.status, "add_engagement"));
  ensureVersion(plan, input.version);

  const entity = await prisma.auditEntity.findFirst({
    where: {
      id: input.entityId,
      workspaceId: access.workspace.id,
      archivedAt: null,
    },
    select: { id: true, name: true, type: true },
  });

  if (!entity) {
    throw new ApiError(404, "ENTITY_NOT_FOUND", "Audit entity was not found");
  }

  const existing = await prisma.auditPlanEngagement.findUnique({
    where: {
      planId_entityId: { planId: plan.id, entityId: input.entityId },
    },
    select: { id: true },
  });

  if (existing) {
    throw new ApiError(
      409,
      "DUPLICATE_ENGAGEMENT",
      "Entity ini sudah ada dalam plan",
    );
  }

  const assessment = await prisma.riskAssessment.findFirst({
    where: {
      workspaceId: access.workspace.id,
      entityId: input.entityId,
      status: "approved",
      isCurrent: true,
    },
    include: {
      riskModel: {
        select: { scaleMin: true, scaleMax: true, levelThresholds: true },
      },
    },
    orderBy: { approvedAt: "desc" },
  });

  if (!assessment) {
    throw new ApiError(
      409,
      "NO_APPROVED_ASSESSMENT",
      "Entity harus memiliki approved risk assessment sebelum masuk plan",
    );
  }

  if (assessment.residualScore === null || !assessment.riskLevel) {
    throw new ApiError(
      409,
      "NO_APPROVED_ASSESSMENT",
      "Approved assessment belum memiliki skor residual",
    );
  }

  const allocations = input.allocations.map((row) => ({
    role: row.role,
    hours: row.hours,
  }));
  const estimatedHours = domain(() => sumAllocations(allocations));
  const thresholds = parseModelThresholds(assessment.riskModel.levelThresholds);
  const planningRisk = domain(() =>
    resolvePlanningRisk({
      sourceScore: assessment.residualScore as number,
      sourceLevel: assessment.riskLevel as string,
      overrideScore: input.overrideScore,
      overrideReason: input.overrideReason,
      thresholds,
      scaleMin: assessment.riskModel.scaleMin,
      scaleMax: assessment.riskModel.scaleMax,
    }),
  );

  const plannedStart = input.plannedStart ? new Date(input.plannedStart) : null;
  const plannedEnd = input.plannedEnd ? new Date(input.plannedEnd) : null;
  validateEngagementDates(plan, plannedStart, plannedEnd);

  const engagement = await prisma.$transaction(async (tx) => {
    const created = await tx.auditPlanEngagement.create({
      data: {
        planId: plan.id,
        entityId: entity.id,
        riskAssessmentId: assessment.id,
        title: input.title,
        engagementType: input.engagementType ?? "operational",
        quarter: input.quarter ?? null,
        plannedStart,
        plannedEnd,
        sourceRiskScore: assessment.residualScore as number,
        sourceRiskLevel: assessment.riskLevel as string,
        sourceRationale: assessment.rationale,
        overrideScore: input.overrideScore ?? null,
        overrideReason: input.overrideReason ?? null,
        riskScore: planningRisk.score,
        riskLevel: planningRisk.level,
        estimatedHours,
        notes: input.notes ?? null,
        sortOrder: plan.engagements.length,
        allocations: {
          create: allocations.map((allocation) => ({
            role: allocation.role,
            estimatedHours: allocation.hours,
          })),
        },
      },
    });

    await recordAudit(tx, {
      workspaceId: access.workspace.id,
      actorId: access.user.id,
      action: "plan.engagement_added",
      objectType: "audit_plan",
      objectId: plan.id,
      after: {
        engagementId: created.id,
        entityId: entity.id,
        estimatedHours,
        riskScore: planningRisk.score,
        isOverride: planningRisk.isOverride,
      },
      ...access.meta,
    });

    return created;
  });

  return getPlan(access, engagement.planId);
}

export async function updatePlanEngagement(
  access: WorkspaceAccess,
  planId: string,
  engagementId: string,
  input: UpdatePlanEngagementInput,
): Promise<PlanView> {
  const plan = await getPlanRow(access.workspace.id, planId);
  domain(() => assertPlanAction(plan.status, "edit_engagement"));
  ensureVersion(plan, input.version);

  const engagement = await getEngagementRow(plan.id, engagementId);
  const allocations = input.allocations
    ? input.allocations.map((row) => ({ role: row.role, hours: row.hours }))
    : engagement.allocations.map((allocation) => ({
        role: allocation.role,
        hours: allocation.estimatedHours,
      }));
  const estimatedHours = domain(() => sumAllocations(allocations));
  const thresholds = parseModelThresholds(
    engagement.riskAssessment.riskModel.levelThresholds,
  );
  const overrideScore =
    input.overrideScore !== undefined
      ? input.overrideScore
      : engagement.overrideScore;
  const overrideReason =
    input.overrideReason !== undefined
      ? input.overrideReason
      : engagement.overrideReason;
  const planningRisk = domain(() =>
    resolvePlanningRisk({
      sourceScore: engagement.sourceRiskScore,
      sourceLevel: engagement.sourceRiskLevel,
      overrideScore,
      overrideReason,
      thresholds,
      scaleMin: engagement.riskAssessment.riskModel.scaleMin,
      scaleMax: engagement.riskAssessment.riskModel.scaleMax,
    }),
  );

  const plannedStart =
    input.plannedStart !== undefined
      ? input.plannedStart
        ? new Date(input.plannedStart)
        : null
      : engagement.plannedStart;
  const plannedEnd =
    input.plannedEnd !== undefined
      ? input.plannedEnd
        ? new Date(input.plannedEnd)
        : null
      : engagement.plannedEnd;
  validateEngagementDates(plan, plannedStart, plannedEnd);

  await prisma.$transaction(async (tx) => {
    await tx.auditPlanEngagement.update({
      where: { id: engagement.id },
      data: {
        title: input.title ?? engagement.title,
        engagementType:
          input.engagementType ?? engagement.engagementType,
        quarter: input.quarter !== undefined ? input.quarter : engagement.quarter,
        plannedStart,
        plannedEnd,
        overrideScore: overrideScore ?? null,
        overrideReason: overrideReason ?? null,
        riskScore: planningRisk.score,
        riskLevel: planningRisk.level,
        estimatedHours,
        notes: input.notes !== undefined ? input.notes : engagement.notes,
      },
    });

    if (input.allocations) {
      await tx.auditPlanAllocation.deleteMany({
        where: { engagementId: engagement.id },
      });
      await tx.auditPlanAllocation.createMany({
        data: allocations.map((allocation) => ({
          engagementId: engagement.id,
          role: allocation.role,
          estimatedHours: allocation.hours,
        })),
      });
    }

    await recordAudit(tx, {
      workspaceId: access.workspace.id,
      actorId: access.user.id,
      action: "plan.engagement_updated",
      objectType: "audit_plan",
      objectId: plan.id,
      before: {
        engagementId: engagement.id,
        estimatedHours: engagement.estimatedHours,
        riskScore: engagement.riskScore,
      },
      after: {
        engagementId: engagement.id,
        estimatedHours,
        riskScore: planningRisk.score,
        isOverride: planningRisk.isOverride,
      },
      ...access.meta,
    });
  });

  return getPlan(access, planId);
}

export async function updatePlanEngagementActuals(
  access: WorkspaceAccess,
  planId: string,
  engagementId: string,
  input: UpdateEngagementActualsInput,
): Promise<PlanView> {
  const plan = await getPlanRow(access.workspace.id, planId);
  domain(() => assertPlanAction(plan.status, "edit_actuals"));
  ensureVersion(plan, input.version);

  const engagement = await getEngagementRow(plan.id, engagementId);

  await prisma.$transaction(async (tx) => {
    await tx.auditPlanEngagement.update({
      where: { id: engagement.id },
      data: { actualHours: input.actualHours, status: input.status },
    });

    await recordAudit(tx, {
      workspaceId: access.workspace.id,
      actorId: access.user.id,
      action: "plan.actuals_updated",
      objectType: "audit_plan",
      objectId: plan.id,
      before: {
        engagementId: engagement.id,
        actualHours: engagement.actualHours,
        status: engagement.status,
      },
      after: {
        engagementId: engagement.id,
        actualHours: input.actualHours,
        status: input.status,
      },
      ...access.meta,
    });
  });

  return getPlan(access, planId);
}

export async function deletePlanEngagement(
  access: WorkspaceAccess,
  planId: string,
  engagementId: string,
  version: number,
): Promise<PlanView> {
  const plan = await getPlanRow(access.workspace.id, planId);
  domain(() => assertPlanAction(plan.status, "delete_engagement"));
  ensureVersion(plan, version);

  const engagement = await getEngagementRow(plan.id, engagementId);

  await prisma.$transaction(async (tx) => {
    await tx.auditPlanEngagement.delete({ where: { id: engagement.id } });
    await recordAudit(tx, {
      workspaceId: access.workspace.id,
      actorId: access.user.id,
      action: "plan.engagement_removed",
      objectType: "audit_plan",
      objectId: plan.id,
      before: {
        engagementId: engagement.id,
        entityId: engagement.entityId,
        title: engagement.title,
      },
      ...access.meta,
    });
  });

  return getPlan(access, planId);
}

export async function replacePlanCapacity(
  access: WorkspaceAccess,
  planId: string,
  input: ReplacePlanCapacityInput,
): Promise<PlanView> {
  const plan = await getPlanRow(access.workspace.id, planId);
  domain(() => assertPlanAction(plan.status, "edit_capacity"));
  ensureVersion(plan, input.version);

  domain(() =>
    calculateCapacityWarnings(
      input.capacity.map((row) => ({
        role: row.role,
        availableHours: row.availableHours,
      })),
      [],
    ),
  );

  await prisma.$transaction(async (tx) => {
    await tx.auditPlanCapacity.deleteMany({ where: { planId: plan.id } });
    if (input.capacity.length > 0) {
      await tx.auditPlanCapacity.createMany({
        data: input.capacity.map((row) => ({
          planId: plan.id,
          role: row.role,
          availableHours: row.availableHours,
        })),
      });
    }

    await recordAudit(tx, {
      workspaceId: access.workspace.id,
      actorId: access.user.id,
      action: "plan.capacity_updated",
      objectType: "audit_plan",
      objectId: plan.id,
      before: { capacity: plan.capacities },
      after: { capacity: input.capacity },
      ...access.meta,
    });
  });

  return getPlan(access, planId);
}

export async function submitPlan(
  access: WorkspaceAccess,
  planId: string,
  version: number,
  comment?: string,
): Promise<PlanView> {
  const plan = await getPlanRow(access.workspace.id, planId);
  domain(() => assertPlanAction(plan.status, "submit"));
  ensureVersion(plan, version);

  if (plan.engagements.length === 0) {
    throw new ApiError(
      409,
      "PLAN_HAS_NO_ENGAGEMENTS",
      "Tambahkan minimal satu engagement sebelum submit plan",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.auditPlan.update({
      where: { id: plan.id },
      data: {
        status: "submitted",
        submittedAt: new Date(),
        updatedById: access.user.id,
      },
    });

    await recordAudit(tx, {
      workspaceId: access.workspace.id,
      actorId: access.user.id,
      action: "plan.submitted",
      objectType: "audit_plan",
      objectId: plan.id,
      before: { status: plan.status },
      after: { status: "submitted", comment: comment ?? null },
      ...access.meta,
    });
  });

  return getPlan(access, planId);
}

export async function approvePlan(
  access: WorkspaceAccess,
  planId: string,
  version: number,
  comment?: string,
): Promise<PlanView> {
  const plan = await getPlanRow(access.workspace.id, planId);
  domain(() => assertPlanAction(plan.status, "approve"));
  ensureVersion(plan, version);

  if (plan.createdById === access.user.id) {
    throw new ApiError(
      403,
      "SELF_APPROVAL_FORBIDDEN",
      "Pembuat plan tidak dapat menyetujui plan yang sama",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.auditPlan.update({
      where: { id: plan.id },
      data: {
        status: "approved",
        approvedById: access.user.id,
        approvedAt: new Date(),
        isCurrent: true,
        updatedById: access.user.id,
      },
    });

    await recordAudit(tx, {
      workspaceId: access.workspace.id,
      actorId: access.user.id,
      action: "plan.approved",
      objectType: "audit_plan",
      objectId: plan.id,
      before: { status: plan.status },
      after: { status: "approved", comment: comment ?? null },
      ...access.meta,
    });
  });

  return getPlan(access, planId);
}

export async function returnPlan(
  access: WorkspaceAccess,
  planId: string,
  version: number,
  comment: string,
): Promise<PlanView> {
  const plan = await getPlanRow(access.workspace.id, planId);
  domain(() => assertPlanAction(plan.status, "return"));
  ensureVersion(plan, version);

  if (!comment.trim()) {
    throw new ApiError(
      422,
      "REVIEW_COMMENT_REQUIRED",
      "Catatan review wajib diisi saat mengembalikan plan",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.auditPlan.update({
      where: { id: plan.id },
      data: { status: "returned", updatedById: access.user.id },
    });

    await recordAudit(tx, {
      workspaceId: access.workspace.id,
      actorId: access.user.id,
      action: "plan.returned",
      objectType: "audit_plan",
      objectId: plan.id,
      before: { status: plan.status },
      after: { status: "returned", comment },
      ...access.meta,
    });
  });

  return getPlan(access, planId);
}

export async function createPlanVersion(
  access: WorkspaceAccess,
  planId: string,
  input: NewPlanVersionInput,
): Promise<PlanView> {
  const plan = await getPlanRow(access.workspace.id, planId);
  domain(() => assertPlanAction(plan.status, "new_version"));
  ensureVersion(plan, input.version);

  const aggregate = await prisma.auditPlan.aggregate({
    where: { workspaceId: access.workspace.id, year: plan.year },
    _max: { version: true },
  });
  const nextVersion = (aggregate._max.version ?? plan.version) + 1;

  const created = await prisma.$transaction(async (tx) => {
    await tx.auditPlan.update({
      where: { id: plan.id },
      data: {
        isCurrent: false,
        status: "superseded",
        updatedById: access.user.id,
      },
    });

    const next = await tx.auditPlan.create({
      data: {
        workspaceId: plan.workspaceId,
        year: plan.year,
        name: plan.name,
        objective: plan.objective,
        scope: plan.scope,
        periodStart: plan.periodStart,
        periodEnd: plan.periodEnd,
        status: "draft",
        version: nextVersion,
        isCurrent: true,
        supersedesId: plan.id,
        changeReason: input.reason,
        ownerUserId: plan.ownerUserId,
        createdById: access.user.id,
        updatedById: access.user.id,
        capacities: plan.capacities.length
          ? {
              create: plan.capacities.map((capacity) => ({
                role: capacity.role,
                availableHours: capacity.availableHours,
              })),
            }
          : undefined,
        engagements: {
          create: plan.engagements.map((engagement) => ({
            entityId: engagement.entityId,
            riskAssessmentId: engagement.riskAssessmentId,
            title: engagement.title,
            engagementType: engagement.engagementType,
            quarter: engagement.quarter,
            plannedStart: engagement.plannedStart,
            plannedEnd: engagement.plannedEnd,
            sourceRiskScore: engagement.sourceRiskScore,
            sourceRiskLevel: engagement.sourceRiskLevel,
            sourceRationale: engagement.sourceRationale,
            overrideScore: engagement.overrideScore,
            overrideReason: engagement.overrideReason,
            riskScore: engagement.riskScore,
            riskLevel: engagement.riskLevel,
            estimatedHours: engagement.estimatedHours,
            actualHours: engagement.actualHours,
            status: engagement.status,
            notes: engagement.notes,
            sortOrder: engagement.sortOrder,
            allocations: {
              create: engagement.allocations.map((allocation) => ({
                role: allocation.role,
                estimatedHours: allocation.estimatedHours,
              })),
            },
          })),
        },
      },
    });

    await recordAudit(tx, {
      workspaceId: access.workspace.id,
      actorId: access.user.id,
      action: "plan.new_version",
      objectType: "audit_plan",
      objectId: next.id,
      before: { planId: plan.id, version: plan.version },
      after: { planId: next.id, version: next.version, reason: input.reason },
      ...access.meta,
    });

    return next;
  });

  return getPlan(access, created.id);
}

export async function exportPlanCsv(
  access: WorkspaceAccess,
  planId: string,
): Promise<{ csv: string; filename: string }> {
  const plan = await getPlan(access, planId);
  const csv = buildPlanCsv({
    year: plan.year,
    name: plan.name,
    version: plan.version,
    status: plan.status,
    engagements: plan.engagements.map((engagement) => ({
      entityCode: engagement.entity?.code ?? "",
      entityName: engagement.entity?.name ?? "",
      quarter: engagement.quarter,
      riskScore: engagement.riskScore,
      riskLevel: engagement.riskLevel,
      estimatedHours: engagement.estimatedHours,
      actualHours: engagement.actualHours,
      status: engagement.status,
    })),
  });

  return {
    csv,
    filename: `audit-plan-${plan.year}-v${plan.version}.csv`,
  };
}
