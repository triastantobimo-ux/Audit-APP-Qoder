import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  assertEvidenceDeletable,
  assertWorkpaperAssignment,
  assertWorkpaperEditable,
  assertWorkpaperTransition,
  nextEvidenceVersion,
  nextWorkpaperReference,
  resolveNote,
  safeEvidenceFileName,
  summarizeWorkpaperPackage,
  validateEvidence,
  validateNote,
  validateWorkpaperFields,
  WorkpaperError,
  type WorkpaperActor,
  type WorkpaperGate,
  type WorkpaperStatus,
} from "@/lib/workpaper";
import {
  putEvidence,
  readEvidence,
  storageKeyFor,
} from "@/lib/evidence-store";
import { sha256Hex } from "@/lib/hash";
import { can, type Role } from "@/lib/rbac";
import type {
  CreateWorkpaperInput,
  CreateWorkpaperNoteInput,
  DeleteEvidenceInput,
  ResolveWorkpaperNoteInput,
  TransitionWorkpaperInput,
  UpdateWorkpaperInput,
  UploadEvidenceInput,
} from "@/lib/schemas";
import type {
  WorkpaperActionsView,
  WorkpaperEvidenceView,
  WorkpaperListItem,
  WorkpaperMemberView,
  WorkpaperNoteView,
  WorkpaperPackageSummary,
  WorkpaperView,
} from "@/lib/workpaper-view";
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

const workpaperInclude = {
  engagement: { select: engagementSelect },
  rcmRow: {
    select: {
      id: true,
      riskDescription: true,
      procedureDescription: true,
      evidenceRequirement: true,
    },
  },
  preparer: { select: memberSelect },
  reviewer: { select: memberSelect },
  signedOffBy: { select: memberSelect },
  notes: {
    orderBy: { createdAt: "asc" as const },
    include: {
      author: { select: memberSelect },
      assignee: { select: memberSelect },
      resolvedBy: { select: memberSelect },
    },
  },
  evidence: {
    orderBy: [{ label: "asc" as const }, { version: "desc" as const }],
    include: {
      uploadedBy: { select: memberSelect },
      deletedBy: { select: memberSelect },
    },
  },
} satisfies Prisma.WorkpaperInclude;

type WorkpaperRow = Prisma.WorkpaperGetPayload<{ include: typeof workpaperInclude }>;

const openEngagementStatuses = new Set(["draft", "planning", "fieldwork", "review"]);

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function domain<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof WorkpaperError) {
      throw new ApiError(422, error.code, error.message);
    }
    throw error;
  }
}

function ensureVersion(current: number, expected: number): void {
  if (current !== expected) {
    throw new ApiError(412, "STALE_VERSION", `Workpaper telah berubah. Versi saat ini ${current}`, {
      currentVersion: current,
    });
  }
}

function assertEngagementOpen(status: string): void {
  if (!openEngagementStatuses.has(status)) {
    throw new ApiError(
      422,
      "ENGAGEMENT_LOCKED",
      `Workpaper tidak dapat diubah saat engagement berstatus ${status}`,
    );
  }
}

export function isWorkpaperTeamMember(
  engagement: {
    preparerId?: string | null;
    reviewerId?: string | null;
    approverId?: string | null;
  },
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

function assertTeam(
  engagement: { preparerId: string; reviewerId: string; approverId: string },
  access: WorkspaceAccess,
): void {
  if (!isWorkpaperTeamMember(engagement, access)) {
    throw new ApiError(
      403,
      "WORKPAPER_ACCESS_DENIED",
      "Hanya anggota tim engagement atau pengawas yang dapat mengakses workpaper ini",
    );
  }
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

async function getWorkpaperRow(
  workspaceId: string,
  engagementId: string,
  workpaperId: string,
): Promise<WorkpaperRow> {
  const row = await prisma.workpaper.findFirst({
    where: { id: workpaperId, engagementId, engagement: { workspaceId } },
    include: workpaperInclude,
  });

  if (!row) {
    throw new ApiError(404, "WORKPAPER_NOT_FOUND", "Workpaper was not found");
  }

  return row;
}

function actorFor(
  row: {
    preparerId: string;
    reviewerId: string;
  },
  access: WorkspaceAccess,
  note?: { authorId: string; assigneeId: string | null },
): WorkpaperActor {
  const role = access.membership.role;

  return {
    canWrite: can(role, "workpaper:write"),
    canReview: can(role, "workpaper:review"),
    canSignOff: can(role, "workpaper:signoff"),
    isPreparer: row.preparerId === access.user.id,
    isReviewer: row.reviewerId === access.user.id,
    isAuthor: note ? note.authorId === access.user.id : false,
    isAssignee: note ? note.assigneeId === access.user.id : false,
  };
}

function activeEvidence(row: WorkpaperRow) {
  return row.evidence.filter((item) => !item.deletedAt);
}

function gateFor(row: WorkpaperRow): WorkpaperGate {
  const openNotes = row.notes.filter((note) => note.status === "open");

  return {
    hasConclusion: row.conclusion.trim().length > 0,
    evidenceCount: activeEvidence(row).length,
    openBlockingNotes: openNotes.filter((note) => note.severity === "blocking").length,
  };
}

function transitionIsAllowed(
  row: WorkpaperRow,
  access: WorkspaceAccess,
  to: WorkpaperStatus,
  note?: string | null,
): boolean {
  try {
    assertWorkpaperTransition({
      from: row.status as WorkpaperStatus,
      to,
      actor: actorFor(row, access),
      gate: gateFor(row),
      note,
    });
    return true;
  } catch (error) {
    if (error instanceof WorkpaperError) {
      return false;
    }
    throw error;
  }
}

function actionsFor(row: WorkpaperRow, access: WorkspaceAccess): WorkpaperActionsView {
  const actor = actorFor(row, access);
  const engagementOpen = openEngagementStatuses.has(row.engagement.status);
  const editable =
    engagementOpen && row.status !== "signed_off" && actor.canWrite;

  return {
    canEdit: editable,
    canUploadEvidence: editable,
    canDeleteEvidence: editable,
    canAddNote: engagementOpen && row.status !== "signed_off" && (actor.canReview || actor.canWrite),
    canResolveNote: engagementOpen && (actor.canReview || actor.canWrite || actor.isPreparer),
    canSubmit: engagementOpen && transitionIsAllowed(row, access, "in_review"),
    canMarkReviewed: engagementOpen && transitionIsAllowed(row, access, "reviewed"),
    canReturn: engagementOpen && transitionIsAllowed(row, access, "draft", "x"),
    canSignOff: engagementOpen && transitionIsAllowed(row, access, "signed_off"),
  };
}

function serializeMember(user: { id: string; name: string; email: string } | null): WorkpaperMemberView | null {
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email };
}

function serializeNote(note: WorkpaperRow["notes"][number]): WorkpaperNoteView {
  return {
    id: note.id,
    body: note.body,
    severity: note.severity,
    status: note.status,
    author: serializeMember(note.author) as WorkpaperMemberView,
    assignee: serializeMember(note.assignee),
    resolution: note.resolution,
    resolvedBy: serializeMember(note.resolvedBy),
    resolvedAt: iso(note.resolvedAt),
    createdAt: note.createdAt.toISOString(),
  };
}

function serializeEvidence(item: WorkpaperRow["evidence"][number]): WorkpaperEvidenceView {
  return {
    id: item.id,
    label: item.label,
    fileName: item.fileName,
    mimeType: item.mimeType,
    sizeBytes: item.sizeBytes,
    sha256: item.sha256,
    source: item.source,
    periodLabel: item.periodLabel,
    capturedAt: item.capturedAt.toISOString(),
    version: item.version,
    supersedesId: item.supersedesId,
    uploadedBy: serializeMember(item.uploadedBy),
    deletedAt: iso(item.deletedAt),
    deletedBy: serializeMember(item.deletedBy),
    deleteReason: item.deleteReason,
    createdAt: item.createdAt.toISOString(),
  };
}

function packageFor(row: WorkpaperRow) {
  const gate = gateFor(row);
  const openNotes = row.notes.filter((note) => note.status === "open").length;

  return {
    ...summarizeWorkpaperPackage({
      status: row.status as WorkpaperStatus,
      evidenceCount: gate.evidenceCount,
      openNotes,
      openBlockingNotes: gate.openBlockingNotes,
      hasConclusion: gate.hasConclusion,
    }),
    openNotes,
    gate,
  };
}

function serializeListItem(row: WorkpaperRow): WorkpaperListItem {
  const summary = packageFor(row);

  return {
    id: row.id,
    reference: row.reference,
    title: row.title,
    status: row.status,
    version: row.version,
    templateKey: row.templateKey,
    rcmRow: row.rcmRow ? { ...row.rcmRow } : null,
    preparer: serializeMember(row.preparer) as WorkpaperMemberView,
    reviewer: serializeMember(row.reviewer) as WorkpaperMemberView,
    evidenceCount: summary.gate.evidenceCount,
    openNotes: summary.openNotes,
    openBlockingNotes: summary.gate.openBlockingNotes,
    packageComplete: summary.complete,
    packageMissing: summary.missing,
    signedOffAt: iso(row.signedOffAt),
    signedOffByName: row.signedOffByName,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeWorkpaper(row: WorkpaperRow, access: WorkspaceAccess): WorkpaperView {
  return {
    ...serializeListItem(row),
    engagementId: row.engagementId,
    purpose: row.purpose,
    procedure: row.procedure,
    conclusion: row.conclusion,
    submittedAt: iso(row.submittedAt),
    reviewedAt: iso(row.reviewedAt),
    signedOffById: row.signedOffById,
    signoffHash: row.signoffHash,
    notes: row.notes.map(serializeNote),
    evidence: row.evidence.map(serializeEvidence),
    actions: actionsFor(row, access),
  };
}

export async function listWorkpapers(
  access: WorkspaceAccess,
  engagementId: string,
): Promise<WorkpaperListItem[]> {
  const engagement = await getEngagementRow(access.workspace.id, engagementId);
  assertTeam(engagement, access);

  const rows = await prisma.workpaper.findMany({
    where: { engagementId: engagement.id },
    include: workpaperInclude,
    orderBy: { reference: "asc" },
  });

  return rows.map(serializeListItem);
}

export async function summarizeWorkpaperPackageForEngagement(
  access: WorkspaceAccess,
  engagementId: string,
): Promise<WorkpaperPackageSummary> {
  const engagement = await getEngagementRow(access.workspace.id, engagementId);
  assertTeam(engagement, access);

  const rows = await prisma.workpaper.findMany({
    where: { engagementId: engagement.id },
    include: workpaperInclude,
    orderBy: { reference: "asc" },
  });

  const items = rows.map(serializeListItem);

  return {
    engagement: {
      id: engagement.id,
      code: engagement.code,
      title: engagement.title,
      status: engagement.status,
      version: engagement.version,
    },
    totals: {
      workpapers: items.length,
      signedOff: items.filter((item) => item.status === "signed_off").length,
      inReview: items.filter((item) => item.status === "in_review").length,
      draft: items.filter((item) => item.status === "draft").length,
      evidence: items.reduce((total, item) => total + item.evidenceCount, 0),
      openBlockingNotes: items.reduce((total, item) => total + item.openBlockingNotes, 0),
    },
    items,
  };
}

export async function getWorkpaper(
  access: WorkspaceAccess,
  engagementId: string,
  workpaperId: string,
): Promise<WorkpaperView> {
  const row = await getWorkpaperRow(access.workspace.id, engagementId, workpaperId);
  assertTeam(row.engagement, access);

  return serializeWorkpaper(row, access);
}

async function assertAssignable(
  workspaceId: string,
  userId: string,
  capability: "workpaper:write" | "workpaper:review",
  label: string,
): Promise<void> {
  const membership = await prisma.membership.findFirst({
    where: { workspaceId, userId, user: { isActive: true } },
    select: { role: true },
  });

  if (!membership) {
    throw new ApiError(422, "TEAM_NOT_MEMBER", `${label} harus menjadi member workspace`);
  }

  if (!can(membership.role as Role, capability)) {
    throw new ApiError(
      422,
      capability === "workpaper:write" ? "PREPARER_NOT_AUTHORIZED" : "REVIEWER_NOT_AUTHORIZED",
      `Role ${membership.role} tidak dapat menjadi ${label}`,
    );
  }
}

export async function createWorkpaper(
  access: WorkspaceAccess,
  engagementId: string,
  input: CreateWorkpaperInput,
): Promise<WorkpaperView> {
  const engagement = await getEngagementRow(access.workspace.id, engagementId);
  assertTeam(engagement, access);
  assertEngagementOpen(engagement.status);

  const preparerId = input.preparerId ?? engagement.preparerId;
  const reviewerId = input.reviewerId ?? engagement.reviewerId;
  domain(() => assertWorkpaperAssignment({ preparerId, reviewerId, team: engagement }));
  await assertAssignable(access.workspace.id, preparerId, "workpaper:write", "preparer workpaper");
  await assertAssignable(access.workspace.id, reviewerId, "workpaper:review", "reviewer workpaper");

  let rcmRowId: string | null = null;
  if (input.rcmRowId) {
    const rcmRow = await prisma.engagementRcmRow.findFirst({
      where: { id: input.rcmRowId, engagementId: engagement.id },
      select: { id: true },
    });
    if (!rcmRow) {
      throw new ApiError(422, "RCM_ROW_NOT_FOUND", "Baris RCM tidak ditemukan pada engagement ini");
    }
    rcmRowId = rcmRow.id;
  }

  const fields = domain(() => validateWorkpaperFields(input));
  const existing = await prisma.workpaper.findMany({
    where: { engagementId: engagement.id },
    select: { reference: true },
  });
  const reference = nextWorkpaperReference(existing.map((row) => row.reference));

  const created = await prisma.workpaper.create({
    data: {
      engagementId: engagement.id,
      reference,
      title: fields.title,
      purpose: fields.purpose,
      procedure: fields.procedure,
      conclusion: fields.conclusion,
      templateKey: input.templateKey ?? null,
      rcmRowId,
      status: "draft",
      version: 1,
      preparerId,
      reviewerId,
      createdById: access.user.id,
      updatedById: access.user.id,
    },
  });

  await recordAudit(prisma, {
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    action: "workpaper.created",
    objectType: "workpaper",
    objectId: created.id,
    after: { reference, title: fields.title, engagementCode: engagement.code },
    ...access.meta,
  });

  return getWorkpaper(access, engagementId, created.id);
}

export async function updateWorkpaper(
  access: WorkspaceAccess,
  engagementId: string,
  workpaperId: string,
  input: UpdateWorkpaperInput,
): Promise<WorkpaperView> {
  const row = await getWorkpaperRow(access.workspace.id, engagementId, workpaperId);
  assertTeam(row.engagement, access);
  assertEngagementOpen(row.engagement.status);

  const actor = actorFor(row, access);
  if (!actor.canWrite) {
    throw new ApiError(403, "WORKPAPER_WRITE_FORBIDDEN", "Anda tidak berwenang mengubah workpaper ini");
  }
  domain(() => assertWorkpaperEditable(row.status as WorkpaperStatus));

  ensureVersion(row.version, input.version);

  let rcmRowId = row.rcmRowId;
  if (input.rcmRowId !== undefined) {
    if (input.rcmRowId === null) {
      rcmRowId = null;
    } else {
      const rcmRow = await prisma.engagementRcmRow.findFirst({
        where: { id: input.rcmRowId, engagementId: row.engagementId },
        select: { id: true },
      });
      if (!rcmRow) {
        throw new ApiError(422, "RCM_ROW_NOT_FOUND", "Baris RCM tidak ditemukan pada engagement ini");
      }
      rcmRowId = rcmRow.id;
    }
  }

  const fields = domain(() =>
    validateWorkpaperFields({
      title: input.title ?? row.title,
      purpose: input.purpose ?? row.purpose,
      procedure: input.procedure ?? row.procedure,
      conclusion: input.conclusion ?? row.conclusion,
    }),
  );

  await prisma.workpaper.update({
    where: { id: row.id },
    data: { ...fields, rcmRowId, version: { increment: 1 }, updatedById: access.user.id },
  });

  await recordAudit(prisma, {
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    action: "workpaper.updated",
    objectType: "workpaper",
    objectId: row.id,
    before: { title: row.title, conclusion: row.conclusion, version: row.version },
    after: { title: fields.title, conclusion: fields.conclusion, version: row.version + 1 },
    ...access.meta,
  });

  return getWorkpaper(access, engagementId, row.id);
}

export async function transitionWorkpaper(
  access: WorkspaceAccess,
  engagementId: string,
  workpaperId: string,
  input: TransitionWorkpaperInput,
): Promise<WorkpaperView> {
  const row = await getWorkpaperRow(access.workspace.id, engagementId, workpaperId);
  assertTeam(row.engagement, access);
  assertEngagementOpen(row.engagement.status);
  ensureVersion(row.version, input.version);

  domain(() =>
    assertWorkpaperTransition({
      from: row.status as WorkpaperStatus,
      to: input.toStatus,
      actor: actorFor(row, access),
      gate: gateFor(row),
      note: input.note ?? null,
    }),
  );

  const now = new Date();
  const data: Prisma.WorkpaperUncheckedUpdateInput = {
    status: input.toStatus,
    version: { increment: 1 },
    updatedById: access.user.id,
  };

  if (input.toStatus === "in_review") data.submittedAt = now;
  if (input.toStatus === "reviewed") data.reviewedAt = now;
  if (input.toStatus === "signed_off") {
    const signoffHash = sha256Hex(
      JSON.stringify({
        title: row.title,
        purpose: row.purpose,
        procedure: row.procedure,
        conclusion: row.conclusion,
      }),
    );
    data.signedOffAt = now;
    data.signedOffById = access.user.id;
    data.signedOffByName = access.user.name;
    data.signoffHash = signoffHash;
  }

  await prisma.workpaper.update({ where: { id: row.id }, data });

  await recordAudit(prisma, {
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    action:
      input.toStatus === "signed_off" ? "workpaper.signed_off" : "workpaper.status_changed",
    objectType: "workpaper",
    objectId: row.id,
    before: { status: row.status, version: row.version },
    after: {
      status: input.toStatus,
      version: row.version + 1,
      note: input.note ?? null,
      signoffHash: input.toStatus === "signed_off" ? data.signoffHash : undefined,
      signedOffByName: input.toStatus === "signed_off" ? access.user.name : undefined,
    },
    ...access.meta,
  });

  return getWorkpaper(access, engagementId, row.id);
}

export async function addWorkpaperNote(
  access: WorkspaceAccess,
  engagementId: string,
  workpaperId: string,
  input: CreateWorkpaperNoteInput,
): Promise<WorkpaperView> {
  const row = await getWorkpaperRow(access.workspace.id, engagementId, workpaperId);
  assertTeam(row.engagement, access);
  assertEngagementOpen(row.engagement.status);

  if (row.status === "signed_off") {
    throw new ApiError(422, "WORKPAPER_LOCKED", "Workpaper yang sudah ditandatangani tidak dapat diberi catatan baru");
  }

  const actor = actorFor(row, access);
  if (!actor.canReview && !actor.canWrite) {
    throw new ApiError(403, "NOTE_FORBIDDEN", "Anda tidak berwenang menambahkan catatan review");
  }

  let assigneeId: string | null = null;
  if (input.assigneeId) {
    const membership = await prisma.membership.findFirst({
      where: { workspaceId: access.workspace.id, userId: input.assigneeId },
      select: { userId: true },
    });
    if (!membership) {
      throw new ApiError(422, "TEAM_NOT_MEMBER", "Assignee harus menjadi member workspace");
    }
    assigneeId = membership.userId;
  }

  const note = domain(() => validateNote({ body: input.body, severity: input.severity, assigneeId }));

  const created = await prisma.workpaperNote.create({
    data: {
      workpaperId: row.id,
      body: note.body,
      severity: note.severity,
      status: "open",
      authorId: access.user.id,
      assigneeId: note.assigneeId,
    },
  });

  await recordAudit(prisma, {
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    action: "workpaper.note_added",
    objectType: "workpaper_note",
    objectId: created.id,
    after: { workpaperId: row.id, severity: note.severity, body: note.body },
    ...access.meta,
  });

  return getWorkpaper(access, engagementId, row.id);
}

export async function resolveWorkpaperNote(
  access: WorkspaceAccess,
  engagementId: string,
  workpaperId: string,
  noteId: string,
  input: ResolveWorkpaperNoteInput,
): Promise<WorkpaperView> {
  const row = await getWorkpaperRow(access.workspace.id, engagementId, workpaperId);
  assertTeam(row.engagement, access);
  assertEngagementOpen(row.engagement.status);

  const note = row.notes.find((candidate) => candidate.id === noteId);
  if (!note) {
    throw new ApiError(404, "NOTE_NOT_FOUND", "Catatan review tidak ditemukan");
  }

  const result = domain(() =>
    resolveNote({
      note: { status: note.status, authorId: note.authorId },
      actor: actorFor(row, access, { authorId: note.authorId, assigneeId: note.assigneeId }),
      resolution: input.resolution,
    }),
  );

  await prisma.workpaperNote.update({
    where: { id: note.id },
    data: {
      status: result.status,
      resolution: result.resolution,
      resolvedById: access.user.id,
      resolvedAt: new Date(),
    },
  });

  await recordAudit(prisma, {
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    action: "workpaper.note_resolved",
    objectType: "workpaper_note",
    objectId: note.id,
    before: { status: note.status },
    after: { status: result.status, resolution: result.resolution },
    ...access.meta,
  });

  return getWorkpaper(access, engagementId, row.id);
}

export async function uploadEvidence(
  access: WorkspaceAccess,
  engagementId: string,
  workpaperId: string,
  meta: UploadEvidenceInput,
  file: { name: string; type: string; bytes: Buffer },
): Promise<WorkpaperView> {
  const row = await getWorkpaperRow(access.workspace.id, engagementId, workpaperId);
  assertTeam(row.engagement, access);
  assertEngagementOpen(row.engagement.status);

  if (row.status === "signed_off") {
    throw new ApiError(
      422,
      "EVIDENCE_LOCKED",
      "Workpaper yang sudah ditandatangani tidak dapat menerima evidence baru",
    );
  }

  const actor = actorFor(row, access);
  if (!actor.canWrite) {
    throw new ApiError(403, "EVIDENCE_UPLOAD_FORBIDDEN", "Anda tidak berwenang mengunggah evidence");
  }

  let rcmRowId = row.rcmRowId;
  if (meta.rcmRowId !== undefined) {
    if (meta.rcmRowId === null) {
      rcmRowId = null;
    } else {
      const rcmRow = await prisma.engagementRcmRow.findFirst({
        where: { id: meta.rcmRowId, engagementId: row.engagementId },
        select: { id: true },
      });
      if (!rcmRow) {
        throw new ApiError(422, "RCM_ROW_NOT_FOUND", "Baris RCM tidak ditemukan pada engagement ini");
      }
      rcmRowId = rcmRow.id;
    }
  }

  let supersedesId: string | null = null;
  if (meta.supersedesId) {
    const superseded = row.evidence.find((item) => item.id === meta.supersedesId);
    if (!superseded) {
      throw new ApiError(404, "EVIDENCE_NOT_FOUND", "Evidence yang akan digantikan tidak ditemukan");
    }
    if (superseded.label !== meta.label) {
      throw new ApiError(422, "EVIDENCE_LABEL_MISMATCH", "Versi baru harus menggunakan label evidence yang sama");
    }
    supersedesId = superseded.id;
  }

  const versionsForLabel = row.evidence
    .filter((item) => item.label === meta.label)
    .map((item) => item.version);

  const normalized = domain(() =>
    validateEvidence({
      fileName: safeEvidenceFileName(file.name),
      mimeType: file.type,
      sizeBytes: file.bytes.byteLength,
      sha256: sha256Hex(file.bytes),
      source: meta.source,
      periodLabel: meta.periodLabel ?? null,
      capturedAt: meta.capturedAt,
      version: nextEvidenceVersion(versionsForLabel),
    }),
  );

  const storageKey = storageKeyFor({
    workspaceId: access.workspace.id,
    engagementId: row.engagementId,
    workpaperId: row.id,
    version: normalized.version,
    fileName: normalized.fileName,
  });
  const stored = await putEvidence(storageKey, file.bytes);

  if (stored.sha256 !== normalized.sha256) {
    throw new ApiError(500, "EVIDENCE_WRITE_MISMATCH", "Gagal memverifikasi file evidence yang disimpan");
  }

  const created = await prisma.evidenceFile.create({
    data: {
      workpaperId: row.id,
      rcmRowId,
      label: meta.label,
      fileName: file.name,
      storageKey,
      mimeType: normalized.mimeType,
      sizeBytes: normalized.sizeBytes,
      sha256: normalized.sha256,
      source: normalized.source,
      periodLabel: normalized.periodLabel,
      capturedAt: new Date(normalized.capturedAt),
      version: normalized.version,
      supersedesId,
      uploadedById: access.user.id,
    },
  });

  await recordAudit(prisma, {
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    action: "evidence.uploaded",
    objectType: "evidence_file",
    objectId: created.id,
    after: {
      workpaperId: row.id,
      label: created.label,
      version: created.version,
      fileName: created.fileName,
      sha256: created.sha256,
      sizeBytes: created.sizeBytes,
    },
    ...access.meta,
  });

  return getWorkpaper(access, engagementId, row.id);
}

export async function downloadEvidence(
  access: WorkspaceAccess,
  engagementId: string,
  evidenceId: string,
): Promise<{ fileName: string; mimeType: string; content: Buffer }> {
  const record = await prisma.evidenceFile.findFirst({
    where: { id: evidenceId, workpaper: { engagementId, engagement: { workspaceId: access.workspace.id } } },
    include: { workpaper: { select: { id: true, preparerId: true, reviewerId: true, engagement: { select: engagementSelect } } } },
  });

  if (!record) {
    throw new ApiError(404, "EVIDENCE_NOT_FOUND", "Evidence was not found");
  }

  assertTeam(record.workpaper.engagement, access);

  if (record.deletedAt) {
    throw new ApiError(410, "EVIDENCE_DELETED", "Evidence ini telah di-soft delete dan tidak dapat diunduh");
  }

  const content = await readEvidence(record.storageKey);

  await recordAudit(prisma, {
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    action: "evidence.downloaded",
    objectType: "evidence_file",
    objectId: record.id,
    after: { workpaperId: record.workpaperId, fileName: record.fileName, sha256: record.sha256 },
    ...access.meta,
  });

  return { fileName: record.fileName, mimeType: record.mimeType, content };
}

export async function deleteEvidence(
  access: WorkspaceAccess,
  engagementId: string,
  workpaperId: string,
  evidenceId: string,
  input: DeleteEvidenceInput,
): Promise<WorkpaperView> {
  const record = await prisma.evidenceFile.findFirst({
    where: {
      id: evidenceId,
      workpaper: { id: workpaperId, engagementId, engagement: { workspaceId: access.workspace.id } },
    },
    include: {
      workpaper: {
        select: {
          id: true,
          status: true,
          preparerId: true,
          reviewerId: true,
          engagement: { select: engagementSelect },
        },
      },
    },
  });

  if (!record) {
    throw new ApiError(404, "EVIDENCE_NOT_FOUND", "Evidence was not found");
  }

  assertTeam(record.workpaper.engagement, access);
  assertEngagementOpen(record.workpaper.engagement.status);

  const workpaperRow = await getWorkpaperRow(access.workspace.id, engagementId, record.workpaperId);

  domain(() =>
    assertEvidenceDeletable({
      workpaperStatus: record.workpaper.status as WorkpaperStatus,
      alreadyDeleted: Boolean(record.deletedAt),
      actor: actorFor(workpaperRow, access),
    }),
  );

  await prisma.evidenceFile.update({
    where: { id: record.id },
    data: {
      deletedAt: new Date(),
      deletedById: access.user.id,
      deleteReason: input.reason,
    },
  });

  await recordAudit(prisma, {
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    action: "evidence.deleted",
    objectType: "evidence_file",
    objectId: record.id,
    before: { deletedAt: null },
    after: { deletedAt: new Date().toISOString(), reason: input.reason, storageKey: record.storageKey },
    ...access.meta,
  });

  return getWorkpaper(access, engagementId, record.workpaperId);
}
