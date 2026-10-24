import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  assertFindingEditable,
  assertFindingTransition,
  findingReadiness,
  isFindingOverdue,
  isUpdatableFindingStatus,
  nextFindingReference,
  parseDueDate,
  summarizeRemediation,
  validateFindingFields,
  validateFindingUpdate,
  validateManagementResponse,
  validateSeverity,
  FindingError,
  type FindingActor,
  type FindingGate,
  type FindingStatus,
} from "@/lib/finding";
import { can, type Capability, type Role } from "@/lib/rbac";
import type {
  CreateFindingInput,
  CreateFindingUpdateInput,
  FindingResponseInput,
  TransitionFindingInput,
  UpdateFindingInput,
} from "@/lib/schemas";
import type {
  FindingActionsView,
  FindingEvidenceView,
  FindingListItem,
  FindingMemberView,
  FindingRegisterView,
  FindingUpdateView,
  FindingView,
} from "@/lib/finding-view";
import { ApiError } from "./api-error";
import type { WorkspaceAccess } from "./api";
import { recordAudit } from "./audit";

const memberSelect = { id: true, name: true, email: true } satisfies Prisma.UserSelect;

const engagementSelect = {
  id: true,
  code: true,
  title: true,
  status: true,
  version: true,
  preparerId: true,
  reviewerId: true,
  approverId: true,
} satisfies Prisma.EngagementSelect;

const findingInclude = {
  engagement: { select: engagementSelect },
  workpaper: { select: { id: true, reference: true, title: true } },
  rcmRow: { select: { id: true, riskDescription: true, controlDescription: true } },
  owner: { select: memberSelect },
  validatedBy: { select: memberSelect },
  riskAcceptedBy: { select: memberSelect },
  updates: {
    orderBy: { createdAt: "asc" as const },
    include: { author: { select: memberSelect } },
  },
  evidence: {
    orderBy: { createdAt: "asc" as const },
    include: { uploadedBy: { select: memberSelect } },
  },
} satisfies Prisma.FindingInclude;

type FindingRow = Prisma.FindingGetPayload<{ include: typeof findingInclude }>;

const openEngagementStatuses = new Set(["draft", "planning", "fieldwork", "review"]);

const transitionCapability: Partial<Record<FindingStatus, Capability>> = {
  communicated: "finding:write",
  in_remediation: "finding:respond",
  pending_validation: "finding:respond",
  closed: "finding:validate",
  reopened: "finding:validate",
  accepted_risk: "finding:acceptRisk",
};

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function domain<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof FindingError) {
      throw new ApiError(422, error.code, error.message);
    }
    throw error;
  }
}

function ensureVersion(current: number, expected: number): void {
  if (current !== expected) {
    throw new ApiError(412, "STALE_VERSION", `Temuan telah berubah. Versi saat ini ${current}`, {
      currentVersion: current,
    });
  }
}

function assertEngagementOpen(status: string): void {
  if (!openEngagementStatuses.has(status)) {
    throw new ApiError(
      422,
      "ENGAGEMENT_LOCKED",
      `Temuan tidak dapat disusun ulang saat engagement berstatus ${status}`,
    );
  }
}

function assertCapability(access: WorkspaceAccess, capability: Capability, detail: string): void {
  if (!can(access.membership.role, capability)) {
    throw new ApiError(403, "FINDING_FORBIDDEN", detail);
  }
}

function isTeamMember(
  engagement: { preparerId: string; reviewerId: string; approverId: string },
  access: WorkspaceAccess,
): boolean {
  const isTeam =
    engagement.preparerId === access.user.id ||
    engagement.reviewerId === access.user.id ||
    engagement.approverId === access.user.id;
  const isOversight =
    access.membership.role === "CAE" || access.membership.role === "ADMIN";

  return isTeam || isOversight;
}

function isOversight(access: WorkspaceAccess): boolean {
  return access.membership.role === "CAE" || access.membership.role === "ADMIN";
}

function isOwnerResponder(row: FindingRow, access: WorkspaceAccess): boolean {
  return (
    row.ownerUserId === access.user.id && can(access.membership.role, "finding:respond")
  );
}

function actorFor(row: FindingRow, access: WorkspaceAccess): FindingActor {
  const role = access.membership.role;

  return {
    isOwner: Boolean(row.ownerUserId) && row.ownerUserId === access.user.id,
    canWrite: can(role, "finding:write"),
    canValidate: can(role, "finding:validate"),
    canAcceptRisk: can(role, "finding:acceptRisk"),
  };
}

function gateFor(row: FindingRow): FindingGate {
  return {
    hasCondition: row.condition.trim().length > 0,
    hasCriteria: row.criteria.trim().length > 0,
    hasCause: row.cause.trim().length > 0,
    hasEffect: row.effect.trim().length > 0,
    hasRecommendation: row.recommendation.trim().length > 0,
    hasOwner: Boolean(row.ownerUserId),
    hasDueDate: Boolean(row.dueDate),
    hasResponse: row.managementResponse.trim().length > 0,
    hasPlannedAction: row.plannedAction.trim().length > 0,
  };
}

function assertVisibility(row: FindingRow, access: WorkspaceAccess): void {
  const allowed =
    isTeamMember(row.engagement, access) ||
    (Boolean(row.ownerUserId) && row.ownerUserId === access.user.id);

  if (!allowed) {
    throw new ApiError(
      403,
      "FINDING_ACCESS_DENIED",
      "Hanya tim engagement, pengawas, atau penanggung jawab remediasi yang dapat mengakses temuan ini",
    );
  }
}

function engagementFilter(access: WorkspaceAccess): Prisma.EngagementWhereInput {
  if (isOversight(access)) {
    return { workspaceId: access.workspace.id };
  }

  return {
    workspaceId: access.workspace.id,
    OR: [
      { preparerId: access.user.id },
      { reviewerId: access.user.id },
      { approverId: access.user.id },
    ],
  };
}

async function getEngagementRow(workspaceId: string, engagementId: string) {
  const engagement = await prisma.engagement.findFirst({
    where: { id: engagementId, workspaceId },
    select: engagementSelect,
  });

  if (!engagement) {
    throw new ApiError(404, "ENGAGEMENT_NOT_FOUND", "Engagement was not found");
  }

  return engagement;
}

async function getFindingRow(
  workspaceId: string,
  engagementId: string,
  findingId: string,
): Promise<FindingRow> {
  const row = await prisma.finding.findFirst({
    where: { id: findingId, engagementId, engagement: { workspaceId } },
    include: findingInclude,
  });

  if (!row) {
    throw new ApiError(404, "FINDING_NOT_FOUND", "Temuan tidak ditemukan");
  }

  return row;
}

async function assertLinkedEngagementRow(
  engagementId: string,
  id: string,
  kind: "workpaper" | "rcm",
): Promise<string> {
  if (kind === "workpaper") {
    const found = await prisma.workpaper.findFirst({
      where: { id, engagementId },
      select: { id: true },
    });
    if (!found) {
      throw new ApiError(422, "WORKPAPER_NOT_FOUND", "Workpaper tidak ada pada engagement ini");
    }
    return found.id;
  }

  const found = await prisma.engagementRcmRow.findFirst({
    where: { id, engagementId },
    select: { id: true },
  });
  if (!found) {
    throw new ApiError(422, "RCM_ROW_NOT_FOUND", "Baris RCM tidak ada pada engagement ini");
  }
  return found.id;
}

async function resolveOwnerCandidate(
  workspaceId: string,
  userId: string,
): Promise<string> {
  const membership = await prisma.membership.findFirst({
    where: { workspaceId, userId, user: { isActive: true } },
    select: { role: true },
  });

  if (!membership) {
    throw new ApiError(
      422,
      "OWNER_NOT_MEMBER",
      "Penanggung jawab remediasi harus menjadi member workspace yang aktif",
    );
  }

  if (!can(membership.role as Role, "finding:respond")) {
    throw new ApiError(
      422,
      "OWNER_NOT_AUTHORIZED",
      `Role ${membership.role} tidak dapat menjadi penanggung jawab remediasi`,
    );
  }

  return userId;
}

function serializeMember(user: { id: string; name: string; email: string } | null): FindingMemberView | null {
  return user ? { id: user.id, name: user.name, email: user.email } : null;
}

function serializeUpdate(row: FindingRow["updates"][number]): FindingUpdateView {
  return {
    id: row.id,
    body: row.body,
    statusFrom: row.statusFrom,
    statusTo: row.statusTo,
    progressPercent: row.progressPercent,
    author: serializeMember(row.author) as FindingMemberView,
    createdAt: row.createdAt.toISOString(),
  };
}

function serializeEvidence(row: FindingRow["evidence"][number]): FindingEvidenceView {
  return {
    id: row.id,
    label: row.label,
    fileName: row.fileName,
    sha256: row.sha256,
    sizeBytes: row.sizeBytes,
    version: row.version,
    uploadedBy: serializeMember(row.uploadedBy),
    deletedAt: iso(row.deletedAt),
  };
}

function actionsFor(row: FindingRow, access: WorkspaceAccess): FindingActionsView {
  const actor = actorFor(row, access);
  const gate = gateFor(row);
  const status = row.status as FindingStatus;
  const engagementOpen = openEngagementStatuses.has(row.engagement.status);
  const team = isTeamMember(row.engagement, access);

  const probe = (assert: () => void): boolean => {
    try {
      assert();
      return true;
    } catch (error) {
      if (error instanceof FindingError) {
        return false;
      }
      throw error;
    }
  };

  const editable =
    engagementOpen && team && actor.canWrite && probe(() => assertFindingEditable(status));

  const allowed = (to: FindingStatus): boolean =>
    probe(() =>
      assertFindingTransition({
        from: status,
        to,
        actor,
        gate,
        dueDate: row.dueDate,
        now: new Date(),
        note: "probe",
      }),
    );

  const canCommunicate =
    editable && actor.canWrite && status === "draft" && findingReadiness(gate).ready;
  const isOwnerActor = isOwnerResponder(row, access);
  const canRespond =
    isOwnerActor && (status === "communicated" || status === "reopened");
  const canAddUpdate =
    (isOwnerActor || (team && (actor.canWrite || actor.canValidate))) &&
    isUpdatableFindingStatus(status);

  return {
    canEdit: editable,
    canCommunicate,
    canRespond,
    canAddUpdate,
    canSubmitForValidation:
      isOwnerActor && status === "in_remediation" && allowed("pending_validation"),
    canValidate:
      team && actor.canValidate && status === "pending_validation" && allowed("closed"),
    canReopen:
      team &&
      actor.canValidate &&
      (status === "pending_validation" || status === "closed") &&
      allowed("reopened"),
    canAcceptRisk:
      team &&
      actor.canAcceptRisk &&
      (status === "in_remediation" || status === "reopened") &&
      allowed("accepted_risk"),
  };
}

function serializeListItem(row: FindingRow): FindingListItem {
  return {
    id: row.id,
    reference: row.reference,
    title: row.title,
    status: row.status,
    severity: row.severity,
    progressPercent: row.progressPercent,
    version: row.version,
    dueDate: iso(row.dueDate),
    isOverdue: isFindingOverdue({
      status: row.status as FindingStatus,
      dueDate: row.dueDate,
      now: new Date(),
    }),
    owner: serializeMember(row.owner),
    engagement: {
      id: row.engagement.id,
      code: row.engagement.code,
      title: row.engagement.title,
      status: row.engagement.status,
    },
    workpaper: row.workpaper ? { ...row.workpaper } : null,
    closedAt: iso(row.closedAt),
    riskAcceptedAt: iso(row.riskAcceptedAt),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeFinding(
  row: FindingRow,
  access: WorkspaceAccess,
  createdBy: FindingMemberView | null,
): FindingView {
  return {
    ...serializeListItem(row),
    engagementId: row.engagementId,
    condition: row.condition,
    criteria: row.criteria,
    cause: row.cause,
    effect: row.effect,
    recommendation: row.recommendation,
    managementResponse: row.managementResponse,
    plannedAction: row.plannedAction,
    riskJustification: row.riskJustification,
    rcmRow: row.rcmRow ? { ...row.rcmRow } : null,
    validatedBy: serializeMember(row.validatedBy),
    riskAcceptedBy: serializeMember(row.riskAcceptedBy),
    createdBy,
    communicatedAt: iso(row.communicatedAt),
    remediationStartedAt: iso(row.remediationStartedAt),
    validationSubmittedAt: iso(row.validationSubmittedAt),
    reopenedAt: iso(row.reopenedAt),
    createdAt: row.createdAt.toISOString(),
    evidence: row.evidence.map(serializeEvidence),
    updates: row.updates.map(serializeUpdate),
    readiness: findingReadiness(gateFor(row)),
    actions: actionsFor(row, access),
  };
}

async function writeUpdate(
  findingId: string,
  input: {
    body: string;
    statusFrom: string;
    statusTo: string;
    progressPercent: number;
    authorId: string;
  },
): Promise<void> {
  await prisma.findingUpdate.create({
    data: {
      findingId,
      body: input.body,
      statusFrom: input.statusFrom,
      statusTo: input.statusTo,
      progressPercent: input.progressPercent,
      authorId: input.authorId,
    },
  });
}

export async function listEngagementFindings(
  access: WorkspaceAccess,
  engagementId: string,
): Promise<FindingListItem[]> {
  const engagement = await getEngagementRow(access.workspace.id, engagementId);
  assertCapability(access, "finding:read", "Anda tidak berwenang membaca temuan");

  if (!isTeamMember(engagement, access)) {
    throw new ApiError(
      403,
      "FINDING_ACCESS_DENIED",
      "Hanya anggota tim engagement atau pengawas yang dapat melihat seluruh temuan engagement",
    );
  }

  const rows = await prisma.finding.findMany({
    where: { engagementId: engagement.id },
    include: findingInclude,
    orderBy: { reference: "asc" },
  });

  return rows.map(serializeListItem);
}

async function serializeFindingView(row: FindingRow, access: WorkspaceAccess): Promise<FindingView> {
  const createdBy = row.createdById
    ? serializeMember(
        await prisma.user.findUnique({ where: { id: row.createdById }, select: memberSelect }),
      )
    : null;

  return serializeFinding(row, access, createdBy);
}

export async function getFinding(
  access: WorkspaceAccess,
  engagementId: string,
  findingId: string,
): Promise<FindingView> {
  const row = await getFindingRow(access.workspace.id, engagementId, findingId);
  assertCapability(access, "finding:read", "Anda tidak berwenang membaca temuan");
  assertVisibility(row, access);

  return serializeFindingView(row, access);
}

export async function createFinding(
  access: WorkspaceAccess,
  engagementId: string,
  input: CreateFindingInput,
): Promise<FindingView> {
  const engagement = await getEngagementRow(access.workspace.id, engagementId);
  assertCapability(access, "finding:write", "Anda tidak berwenang menyusun temuan");

  if (!isTeamMember(engagement, access)) {
    throw new ApiError(
      403,
      "FINDING_ACCESS_DENIED",
      "Hanya anggota tim engagement atau pengawas yang dapat menyusun temuan",
    );
  }

  assertEngagementOpen(engagement.status);

  const fields = domain(() =>
    validateFindingFields({
      title: input.title,
      condition: input.condition,
      criteria: input.criteria,
      cause: input.cause,
      effect: input.effect,
      recommendation: input.recommendation,
    }),
  );

  const severity = domain(() => validateSeverity(input.severity ?? "medium"));

  let workpaperId: string | null = null;
  if (input.workpaperId) {
    workpaperId = await assertLinkedEngagementRow(engagement.id, input.workpaperId, "workpaper");
  }

  let rcmRowId: string | null = null;
  if (input.rcmRowId) {
    rcmRowId = await assertLinkedEngagementRow(engagement.id, input.rcmRowId, "rcm");
  }

  let ownerUserId: string | null = null;
  if (input.ownerUserId) {
    ownerUserId = await resolveOwnerCandidate(access.workspace.id, input.ownerUserId);
  }

  let dueDate: Date | null = null;
  if (input.dueDate) {
    dueDate = domain(() => parseDueDate(input.dueDate));
  }

  const existing = await prisma.finding.findMany({
    where: { engagementId: engagement.id },
    select: { reference: true },
  });
  const reference = nextFindingReference(existing.map((row) => row.reference));

  const created = await prisma.finding.create({
    data: {
      engagementId: engagement.id,
      reference,
      title: fields.title,
      condition: fields.condition,
      criteria: fields.criteria,
      cause: fields.cause ?? "",
      effect: fields.effect ?? "",
      recommendation: fields.recommendation ?? "",
      severity,
      status: "draft",
      version: 1,
      workpaperId,
      rcmRowId,
      ownerUserId,
      dueDate,
      createdById: access.user.id,
      updatedById: access.user.id,
    },
  });

  await recordAudit(prisma, {
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    action: "finding.created",
    objectType: "finding",
    objectId: created.id,
    after: { reference, title: fields.title, engagementCode: engagement.code },
    ...access.meta,
  });

  return getFinding(access, engagementId, created.id);
}

export async function updateFinding(
  access: WorkspaceAccess,
  engagementId: string,
  findingId: string,
  input: UpdateFindingInput,
): Promise<FindingView> {
  const row = await getFindingRow(access.workspace.id, engagementId, findingId);
  assertCapability(access, "finding:write", "Anda tidak berwenang mengubah temuan");

  if (!isTeamMember(row.engagement, access)) {
    throw new ApiError(
      403,
      "FINDING_ACCESS_DENIED",
      "Hanya anggota tim engagement atau pengawas yang dapat mengubah temuan",
    );
  }

  assertEngagementOpen(row.engagement.status);
  domain(() => assertFindingEditable(row.status as FindingStatus));
  ensureVersion(row.version, input.version);

  const fields = domain(() =>
    validateFindingFields({
      title: input.title ?? row.title,
      condition: input.condition ?? row.condition,
      criteria: input.criteria ?? row.criteria,
      cause: input.cause === undefined ? row.cause : input.cause,
      effect: input.effect === undefined ? row.effect : input.effect,
      recommendation:
        input.recommendation === undefined ? row.recommendation : input.recommendation,
    }),
  );

  const severity = domain(() => validateSeverity(input.severity ?? row.severity));

  let workpaperId = row.workpaperId;
  if (input.workpaperId !== undefined) {
    workpaperId = input.workpaperId
      ? await assertLinkedEngagementRow(row.engagementId, input.workpaperId, "workpaper")
      : null;
  }

  let rcmRowId = row.rcmRowId;
  if (input.rcmRowId !== undefined) {
    rcmRowId = input.rcmRowId
      ? await assertLinkedEngagementRow(row.engagementId, input.rcmRowId, "rcm")
      : null;
  }

  let ownerUserId = row.ownerUserId;
  if (input.ownerUserId !== undefined) {
    ownerUserId = input.ownerUserId
      ? await resolveOwnerCandidate(access.workspace.id, input.ownerUserId)
      : null;
  }

  let dueDate = row.dueDate;
  if (input.dueDate !== undefined) {
    dueDate = input.dueDate ? domain(() => parseDueDate(input.dueDate)) : null;
  }

  await prisma.finding.update({
    where: { id: row.id },
    data: {
      title: fields.title,
      condition: fields.condition,
      criteria: fields.criteria,
      cause: fields.cause ?? "",
      effect: fields.effect ?? "",
      recommendation: fields.recommendation ?? "",
      severity,
      workpaperId,
      rcmRowId,
      ownerUserId,
      dueDate,
      version: { increment: 1 },
      updatedById: access.user.id,
    },
  });

  await recordAudit(prisma, {
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    action: "finding.updated",
    objectType: "finding",
    objectId: row.id,
    before: { title: row.title, severity: row.severity, version: row.version },
    after: { title: fields.title, severity, version: row.version + 1 },
    ...access.meta,
  });

  return getFinding(access, engagementId, row.id);
}

export async function respondFinding(
  access: WorkspaceAccess,
  engagementId: string,
  findingId: string,
  input: FindingResponseInput,
): Promise<FindingView> {
  const row = await getFindingRow(access.workspace.id, engagementId, findingId);
  assertCapability(access, "finding:respond", "Anda tidak berwenang merespons temuan");
  assertVisibility(row, access);
  ensureVersion(row.version, input.version);

  const normalized = domain(() =>
    validateManagementResponse({
      response: input.response,
      plannedAction: input.plannedAction,
      ownerUserId: input.ownerUserId ?? row.ownerUserId,
      dueDate: input.dueDate,
    }),
  );

  const actor = actorFor(row, access);
  domain(() =>
    assertFindingTransition({
      from: row.status as FindingStatus,
      to: "in_remediation",
      actor,
      gate: { ...gateFor(row), hasResponse: true, hasPlannedAction: true, hasDueDate: true },
      dueDate: normalized.dueDate,
      now: new Date(),
    }),
  );

  const now = new Date();
  await prisma.finding.update({
    where: { id: row.id },
    data: {
      status: "in_remediation",
      managementResponse: normalized.response,
      plannedAction: normalized.plannedAction,
      ownerUserId: normalized.ownerUserId,
      dueDate: normalized.dueDate,
      remediationStartedAt: row.remediationStartedAt ?? now,
      version: { increment: 1 },
      updatedById: access.user.id,
    },
  });

  await writeUpdate(row.id, {
    body: `Respons manajemen diterima dan temuan masuk remediasi. Rencana aksi: ${normalized.plannedAction}`,
    statusFrom: row.status,
    statusTo: "in_remediation",
    progressPercent: row.progressPercent,
    authorId: access.user.id,
  });

  await recordAudit(prisma, {
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    action: "finding.responded",
    objectType: "finding",
    objectId: row.id,
    before: { status: row.status, version: row.version },
    after: { status: "in_remediation", dueDate: normalized.dueDate, version: row.version + 1 },
    ...access.meta,
  });

  return getFinding(access, engagementId, row.id);
}

export async function addFindingUpdate(
  access: WorkspaceAccess,
  engagementId: string,
  findingId: string,
  input: CreateFindingUpdateInput,
): Promise<FindingView> {
  const row = await getFindingRow(access.workspace.id, engagementId, findingId);
  assertCapability(access, "finding:read", "Anda tidak berwenang mencatat progres temuan");
  assertVisibility(row, access);
  ensureVersion(row.version, input.version);

  const actor = actorFor(row, access);
  const isAuditSide = isTeamMember(row.engagement, access) && (actor.canWrite || actor.canValidate);

  if (!isAuditSide && !isOwnerResponder(row, access)) {
    throw new ApiError(
      403,
      "FINDING_UPDATE_FORBIDDEN",
      "Hanya penanggung jawab remediasi atau tim audit yang dapat mencatat progres temuan",
    );
  }

  const progressPercent = input.progressPercent ?? row.progressPercent;
  const note = domain(() =>
    validateFindingUpdate({
      body: input.body,
      status: row.status,
      progressPercent,
    }),
  );

  await prisma.finding.update({
    where: { id: row.id },
    data: {
      progressPercent: note.progressPercent,
      version: { increment: 1 },
      updatedById: access.user.id,
    },
  });

  await writeUpdate(row.id, {
    body: note.body,
    statusFrom: row.status,
    statusTo: row.status,
    progressPercent: note.progressPercent,
    authorId: access.user.id,
  });

  await recordAudit(prisma, {
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    action: "finding.updated_progress",
    objectType: "finding",
    objectId: row.id,
    after: { progressPercent: note.progressPercent, version: row.version + 1 },
    ...access.meta,
  });

  return getFinding(access, engagementId, row.id);
}

export async function transitionFinding(
  access: WorkspaceAccess,
  engagementId: string,
  findingId: string,
  input: TransitionFindingInput,
): Promise<FindingView> {
  const row = await getFindingRow(access.workspace.id, engagementId, findingId);
  assertCapability(access, "finding:read", "Anda tidak berwenang mengubah status temuan");
  assertVisibility(row, access);

  const required = transitionCapability[input.toStatus] ?? "finding:write";
  assertCapability(
    access,
    required,
    `Role Anda tidak berwenang memindahkan temuan ke status ${input.toStatus}`,
  );

  ensureVersion(row.version, input.version);

  const note = (input.note ?? "").trim();
  const actor = actorFor(row, access);
  const gate = gateFor(row);

  domain(() =>
    assertFindingTransition({
      from: row.status as FindingStatus,
      to: input.toStatus,
      actor,
      gate,
      dueDate: row.dueDate,
      now: new Date(),
      note: note || null,
    }),
  );

  const now = new Date();
  const data: Prisma.FindingUncheckedUpdateInput = {
    status: input.toStatus,
    version: { increment: 1 },
    updatedById: access.user.id,
  };

  if (input.toStatus === "communicated") data.communicatedAt = now;
  if (input.toStatus === "pending_validation") data.validationSubmittedAt = now;
  if (input.toStatus === "closed") {
    data.closedAt = now;
    data.validatedById = access.user.id;
  }
  if (input.toStatus === "reopened") {
    data.reopenedAt = now;
    data.closedAt = null;
    data.validatedById = null;
    data.validationSubmittedAt = null;
  }
  if (input.toStatus === "accepted_risk") {
    data.riskAcceptedAt = now;
    data.riskAcceptedById = access.user.id;
    data.riskJustification = note;
  }

  await prisma.finding.update({ where: { id: row.id }, data });

  await writeUpdate(row.id, {
    body:
      note ||
      defaultTransitionNote(input.toStatus, row.status as FindingStatus),
    statusFrom: row.status,
    statusTo: input.toStatus,
    progressPercent: row.progressPercent,
    authorId: access.user.id,
  });

  await recordAudit(prisma, {
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    action: `finding.${input.toStatus}`,
    objectType: "finding",
    objectId: row.id,
    before: { status: row.status, version: row.version },
    after: { status: input.toStatus, version: row.version + 1 },
    ...access.meta,
  });

  return getFinding(access, engagementId, row.id);
}

function defaultTransitionNote(to: FindingStatus, from: FindingStatus): string {
  if (to === "communicated") {
    return "Temuan beserta analisis lima C dan rencana aksi dikomunikasikan kepada manajemen.";
  }
  if (to === "pending_validation") {
    return "Remediasi dinyatakan selesai dan diajukan untuk validasi audit.";
  }
  if (to === "closed") {
    return `Validasi atas perbaikan dari status ${from} selesai; temuan dinyatakan ditutup.`;
  }
  return `Status temuan diubah dari ${from} ke ${to}.`;
}

export async function listRemediationRegister(
  access: WorkspaceAccess,
  options: { scope?: "mine" | "all"; status?: FindingStatus } = {},
): Promise<FindingRegisterView> {
  assertCapability(access, "finding:read", "Anda tidak berwenang membaca register temuan");

  const scope = options.scope ?? "mine";

  if (scope === "all" && !can(access.membership.role, "engagement:read")) {
    throw new ApiError(
      403,
      "FINDING_SCOPE_FORBIDDEN",
      "Hanya tim audit yang dapat melihat register remediasi seluruh workspace",
    );
  }

  const where: Prisma.FindingWhereInput =
    scope === "all"
      ? {
          engagement: engagementFilter(access),
          ...(options.status ? { status: options.status } : {}),
        }
      : {
          ownerUserId: access.user.id,
          ...(options.status ? { status: options.status } : {}),
        };

  const rows = await prisma.finding.findMany({
    where,
    include: findingInclude,
    orderBy: [{ dueDate: "asc" }, { reference: "asc" }],
  });

  const items = rows.map(serializeListItem);
  const now = new Date();

  return {
    scope,
    totals: summarizeRemediation({
      now,
      items: rows.map((row) => ({
        status: row.status as FindingStatus,
        dueDate: row.dueDate,
        closedAt: row.closedAt,
        createdAt: row.createdAt,
      })),
    }),
    items,
  };
}
