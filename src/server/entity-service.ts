import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseJson, stringifyJson } from "@/lib/json";
import {
  HierarchyError,
  canArchiveEntity,
  computeDepth,
  normalizeEntityCode,
  wouldCreateCycle,
} from "@/lib/hierarchy";
import type {
  CreateEntityInput,
  UpdateEntityInput,
} from "@/lib/schemas";
import {
  buildUniverseCsv,
  sortUniverseRows,
  topRiskDriver,
} from "@/lib/universe-table";
import type {
  SortDirection,
  UniverseSortKey,
  UniverseTableRow,
} from "@/lib/universe-table";
import type { WorkspaceAccess } from "./api";
import { ApiError } from "./api-error";
import { recordAudit } from "./audit";

const listInclude = {
  ownerUser: { select: { id: true, name: true, email: true } },
  parent: { select: { id: true, code: true, name: true } },
  _count: {
    select: {
      children: { where: { archivedAt: null } },
    },
  },
  assessments: {
    where: { status: { in: ["approved", "draft", "submitted"] } },
    orderBy: [{ isCurrent: "desc" }, { approvedAt: "desc" }, { updatedAt: "desc" }],
    take: 4,
    select: {
      id: true,
      status: true,
      isCurrent: true,
      inherentScore: true,
      controlEffectivenessScore: true,
      residualScore: true,
      riskLevel: true,
      approvedAt: true,
      assessedAt: true,
      updatedAt: true,
      version: true,
      factorScores: {
        select: {
          score: true,
          riskFactor: { select: { code: true, name: true, weight: true } },
        },
      },
    },
  },
} satisfies Prisma.AuditEntityInclude;

const detailInclude = {
  ownerUser: { select: { id: true, name: true, email: true } },
  parent: { select: { id: true, code: true, name: true } },
  children: {
    where: { archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      ownerUser: { select: { id: true, name: true } },
      assessments: {
        where: { status: "approved", isCurrent: true },
        take: 1,
        select: {
          id: true,
          residualScore: true,
          riskLevel: true,
          approvedAt: true,
        },
      },
    },
  },
} satisfies Prisma.AuditEntityInclude;

type ListRow = Prisma.AuditEntityGetPayload<{ include: typeof listInclude }>;
type DetailRow = Prisma.AuditEntityGetPayload<{ include: typeof detailInclude }>;

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function serializeAssessmentSummary(
  assessment: ListRow["assessments"][number] | undefined,
) {
  if (!assessment) {
    return null;
  }

  return {
    id: assessment.id,
    status: assessment.status,
    inherentScore: assessment.inherentScore,
    controlEffectivenessScore: assessment.controlEffectivenessScore,
    residualScore: assessment.residualScore,
    riskLevel: assessment.riskLevel,
    approvedAt: iso(assessment.approvedAt),
    assessedAt: iso(assessment.assessedAt),
    version: assessment.version,
    topDriver: topRiskDriver(
      assessment.factorScores.map((factorScore) => ({
        code: factorScore.riskFactor.code,
        label: factorScore.riskFactor.name,
        weight: factorScore.riskFactor.weight,
        score: factorScore.score,
      })),
    ),
  };
}

function serializeListEntity(entity: ListRow) {
  const current = entity.assessments.find(
    (assessment) => assessment.status === "approved" && assessment.isCurrent,
  );
  const pending = entity.assessments.find(
    (assessment) => assessment.status !== "approved",
  );

  return {
    id: entity.id,
    workspaceId: entity.workspaceId,
    parentId: entity.parentId,
    parentName: entity.parent?.name ?? null,
    code: entity.code,
    name: entity.name,
    type: entity.type,
    status: entity.status,
    owner: entity.ownerUser,
    description: entity.description,
    tags: parseJson<string[]>(entity.tags, []),
    metadata: parseJson<Record<string, unknown>>(entity.metadata, {}),
    depth: entity.depth,
    sortOrder: entity.sortOrder,
    version: entity.version,
    childCount: entity._count.children,
    assessmentState: current
      ? ("approved" as const)
      : pending
        ? ("pending" as const)
        : ("none" as const),
    currentAssessment: serializeAssessmentSummary(current),
    pendingAssessment: pending
      ? {
          id: pending.id,
          status: pending.status,
          version: pending.version,
          residualScore: pending.residualScore,
          riskLevel: pending.riskLevel,
          updatedAt: iso(pending.updatedAt),
        }
      : null,
    createdAt: iso(entity.createdAt),
    updatedAt: iso(entity.updatedAt),
    archivedAt: iso(entity.archivedAt),
  };
}

function serializeDetailEntity(entity: DetailRow) {
  return {
    id: entity.id,
    workspaceId: entity.workspaceId,
    parentId: entity.parentId,
    parent: entity.parent,
    code: entity.code,
    name: entity.name,
    type: entity.type,
    status: entity.status,
    owner: entity.ownerUser,
    description: entity.description,
    tags: parseJson<string[]>(entity.tags, []),
    metadata: parseJson<Record<string, unknown>>(entity.metadata, {}),
    depth: entity.depth,
    sortOrder: entity.sortOrder,
    version: entity.version,
    children: entity.children.map((child) => ({
      id: child.id,
      code: child.code,
      name: child.name,
      type: child.type,
      status: child.status,
      owner: child.ownerUser,
      depth: child.depth,
      currentAssessment: child.assessments[0]
        ? {
            id: child.assessments[0].id,
            residualScore: child.assessments[0].residualScore,
            riskLevel: child.assessments[0].riskLevel,
            approvedAt: iso(child.assessments[0].approvedAt),
          }
        : null,
    })),
    createdAt: iso(entity.createdAt),
    updatedAt: iso(entity.updatedAt),
    archivedAt: iso(entity.archivedAt),
  };
}

export type EntityListFilters = {
  q?: string;
  type?: string;
  status?: string;
  parentId?: string | null;
  ownerUserId?: string;
  depth?: number;
  assessmentState?: "approved" | "pending" | "none";
  riskLevel?: string[];
  includeArchived?: boolean;
};

export async function listEntities(
  access: WorkspaceAccess,
  filters: EntityListFilters = {},
) {
  const where: Prisma.AuditEntityWhereInput = {
    workspaceId: access.workspace.id,
    archivedAt: filters.includeArchived ? undefined : null,
  };
  const and: Prisma.AuditEntityWhereInput[] = [];

  if (filters.type) {
    where.type = filters.type;
  }

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.ownerUserId) {
    where.ownerUserId = filters.ownerUserId;
  }

  if (filters.depth !== undefined) {
    where.depth = filters.depth;
  }

  if (filters.parentId !== undefined) {
    where.parentId = filters.parentId;
  }

  if (filters.q) {
    const query = filters.q.trim();
    where.OR = [
      { name: { contains: query } },
      { code: { contains: query.toUpperCase() } },
      { description: { contains: query } },
    ];
  }

  if (filters.riskLevel?.length) {
    and.push({
      assessments: {
        some: {
          status: "approved",
          isCurrent: true,
          riskLevel: { in: filters.riskLevel },
        },
      },
    });
  }

  if (filters.assessmentState === "approved") {
    and.push({
      assessments: { some: { status: "approved", isCurrent: true } },
    });
  }

  if (filters.assessmentState === "pending") {
    and.push({
      assessments: { some: { status: { in: ["draft", "submitted"] } } },
    });
  }

  if (filters.assessmentState === "none") {
    and.push({
      assessments: { none: { status: { in: ["approved", "draft", "submitted"] } } },
    });
  }

  if (and.length > 0) {
    where.AND = and;
  }

  const entities = await prisma.auditEntity.findMany({
    where,
    include: listInclude,
    orderBy: [{ depth: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    take: 500,
  });

  return entities.map(serializeListEntity);
}

function toUniverseRow(entity: ReturnType<typeof serializeListEntity>): UniverseTableRow {
  return {
    id: entity.id,
    code: entity.code,
    name: entity.name,
    type: entity.type,
    status: entity.status,
    depth: entity.depth,
    sortOrder: entity.sortOrder,
    ownerName: entity.owner?.name ?? null,
    parentName: entity.parentName,
    assessmentState: entity.assessmentState,
    currentAssessment: entity.currentAssessment,
  };
}

export async function exportUniverseCsv(
  access: WorkspaceAccess,
  filters: EntityListFilters,
  sort: { key: UniverseSortKey | null; dir: SortDirection },
): Promise<{ csv: string; filename: string }> {
  const entities = await listEntities(access, filters);
  const rows = entities.map(toUniverseRow);
  const ordered = sort.key ? sortUniverseRows(rows, sort.key, sort.dir) : rows;

  return {
    csv: buildUniverseCsv(ordered),
    filename: `audit-universe-${new Date().toISOString().slice(0, 10)}.csv`,
  };
}

export async function getEntity(access: WorkspaceAccess, entityId: string) {
  const entity = await prisma.auditEntity.findFirst({
    where: { id: entityId, workspaceId: access.workspace.id },
    include: detailInclude,
  });

  if (!entity) {
    throw new ApiError(404, "ENTITY_NOT_FOUND", "Audit entity was not found");
  }

  return serializeDetailEntity(entity);
}

async function ensureOwner(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  ownerUserId: string | null | undefined,
) {
  if (!ownerUserId) {
    return;
  }

  const membership = await tx.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: ownerUserId } },
  });

  if (!membership) {
    throw new ApiError(
      422,
      "INVALID_OWNER",
      "Owner must be a member of this workspace",
    );
  }
}

export async function createEntity(
  access: WorkspaceAccess,
  input: CreateEntityInput,
) {
  let code: string;

  try {
    code = normalizeEntityCode(input.code);
  } catch (error) {
    if (error instanceof HierarchyError) {
      throw new ApiError(422, error.code, error.message);
    }
    throw error;
  }

  const created = await prisma.$transaction(async (tx) => {
    const duplicate = await tx.auditEntity.findUnique({
      where: {
        workspaceId_code: { workspaceId: access.workspace.id, code },
      },
    });

    if (duplicate) {
      throw new ApiError(
        409,
        "DUPLICATE_CODE",
        `Entity code ${code} is already used in this workspace`,
      );
    }

    let parentDepth: number | null = null;

    if (input.parentId) {
      const parent = await tx.auditEntity.findFirst({
        where: {
          id: input.parentId,
          workspaceId: access.workspace.id,
          archivedAt: null,
        },
      });

      if (!parent) {
        throw new ApiError(422, "PARENT_NOT_FOUND", "Parent entity was not found");
      }

      parentDepth = parent.depth;
    }

    await ensureOwner(tx, access.workspace.id, input.ownerUserId);

    const maxSort = await tx.auditEntity.aggregate({
      where: {
        workspaceId: access.workspace.id,
        parentId: input.parentId ?? null,
      },
      _max: { sortOrder: true },
    });

    const entity = await tx.auditEntity.create({
      data: {
        workspaceId: access.workspace.id,
        parentId: input.parentId ?? null,
        code,
        name: input.name,
        type: input.type,
        status: "active",
        ownerUserId: input.ownerUserId ?? null,
        description: input.description ?? null,
        tags: stringifyJson(input.tags ?? []),
        metadata: stringifyJson(input.metadata ?? {}),
        depth: computeDepth(parentDepth),
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
        createdById: access.user.id,
        updatedById: access.user.id,
      },
    });

    await recordAudit(tx, {
      workspaceId: access.workspace.id,
      actorId: access.user.id,
      action: "audit_entity.created",
      objectType: "audit_entity",
      objectId: entity.id,
      after: {
        code: entity.code,
        name: entity.name,
        type: entity.type,
        parentId: entity.parentId,
      },
      ...access.meta,
    });

    return entity;
  });

  return getEntity(access, created.id);
}

export async function updateEntity(
  access: WorkspaceAccess,
  entityId: string,
  input: UpdateEntityInput,
) {
  const before = await prisma.auditEntity.findFirst({
    where: { id: entityId, workspaceId: access.workspace.id },
  });

  if (!before) {
    throw new ApiError(404, "ENTITY_NOT_FOUND", "Audit entity was not found");
  }

  if (before.version !== input.version) {
    throw new ApiError(
      412,
      "STALE_VERSION",
      `Entity has changed. Current version is ${before.version}`,
      { currentVersion: before.version },
    );
  }

  if (before.archivedAt) {
    throw new ApiError(409, "ENTITY_ARCHIVED", "Archived entities cannot be edited");
  }

  await prisma.$transaction(async (tx) => {
    await ensureOwner(tx, access.workspace.id, input.ownerUserId);

    const updated = await tx.auditEntity.update({
      where: { id: entityId },
      data: {
        name: input.name,
        ownerUserId: input.ownerUserId,
        description: input.description,
        tags: input.tags ? stringifyJson(input.tags) : undefined,
        metadata: input.metadata ? stringifyJson(input.metadata) : undefined,
        status: input.status,
        version: { increment: 1 },
        updatedById: access.user.id,
      },
    });

    await recordAudit(tx, {
      workspaceId: access.workspace.id,
      actorId: access.user.id,
      action: "audit_entity.updated",
      objectType: "audit_entity",
      objectId: entityId,
      before: {
        name: before.name,
        ownerUserId: before.ownerUserId,
        description: before.description,
        tags: before.tags,
        status: before.status,
      },
      after: {
        name: updated.name,
        ownerUserId: updated.ownerUserId,
        description: updated.description,
        tags: updated.tags,
        status: updated.status,
      },
      ...access.meta,
    });
  });

  return getEntity(access, entityId);
}

export async function moveEntity(
  access: WorkspaceAccess,
  entityId: string,
  input: { parentId: string | null; version: number },
) {
  const entity = await prisma.auditEntity.findFirst({
    where: { id: entityId, workspaceId: access.workspace.id },
  });

  if (!entity) {
    throw new ApiError(404, "ENTITY_NOT_FOUND", "Audit entity was not found");
  }

  if (entity.version !== input.version) {
    throw new ApiError(
      412,
      "STALE_VERSION",
      `Entity has changed. Current version is ${entity.version}`,
      { currentVersion: entity.version },
    );
  }

  if (entity.archivedAt) {
    throw new ApiError(409, "ENTITY_ARCHIVED", "Archived entities cannot be moved");
  }

  const entities = await prisma.auditEntity.findMany({
    where: { workspaceId: access.workspace.id },
    select: { id: true, parentId: true, depth: true, archivedAt: true },
  });

  const parentById = new Map(entities.map((item) => [item.id, item.parentId]));

  try {
    if (wouldCreateCycle(entityId, input.parentId, parentById)) {
      throw new ApiError(
        409,
        "CYCLE_DETECTED",
        "Moving the entity would create a hierarchy cycle",
      );
    }
  } catch (error) {
    if (error instanceof HierarchyError) {
      throw new ApiError(422, error.code, error.message);
    }
    throw error;
  }

  let newDepth = 0;

  if (input.parentId) {
    const parent = entities.find((item) => item.id === input.parentId);

    if (!parent || parent.archivedAt) {
      throw new ApiError(422, "PARENT_NOT_FOUND", "Parent entity was not found");
    }

    newDepth = parent.depth + 1;
  }

  const depthDelta = newDepth - entity.depth;
  const childrenByParent = new Map<string, string[]>();

  for (const item of entities) {
    if (!item.parentId) continue;
    const siblings = childrenByParent.get(item.parentId) ?? [];
    siblings.push(item.id);
    childrenByParent.set(item.parentId, siblings);
  }

  const descendants: string[] = [];
  const queue = [...(childrenByParent.get(entityId) ?? [])];

  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;
    descendants.push(current);
    queue.push(...(childrenByParent.get(current) ?? []));
  }

  await prisma.$transaction(async (tx) => {
    await tx.auditEntity.update({
      where: { id: entityId },
      data: {
        parentId: input.parentId,
        depth: newDepth,
        version: { increment: 1 },
        updatedById: access.user.id,
      },
    });

    if (depthDelta !== 0) {
      for (const descendantId of descendants) {
        await tx.auditEntity.update({
          where: { id: descendantId },
          data: {
            depth: { increment: depthDelta },
            version: { increment: 1 },
          },
        });
      }
    }

    await recordAudit(tx, {
      workspaceId: access.workspace.id,
      actorId: access.user.id,
      action: "audit_entity.moved",
      objectType: "audit_entity",
      objectId: entityId,
      before: { parentId: entity.parentId, depth: entity.depth },
      after: { parentId: input.parentId, depth: newDepth },
      ...access.meta,
    });
  });

  return getEntity(access, entityId);
}

export async function archiveEntity(
  access: WorkspaceAccess,
  entityId: string,
  version: number,
) {
  const entity = await prisma.auditEntity.findFirst({
    where: { id: entityId, workspaceId: access.workspace.id },
    include: {
      _count: {
        select: { children: { where: { archivedAt: null } } },
      },
    },
  });

  if (!entity) {
    throw new ApiError(404, "ENTITY_NOT_FOUND", "Audit entity was not found");
  }

  if (entity.version !== version) {
    throw new ApiError(
      412,
      "STALE_VERSION",
      `Entity has changed. Current version is ${entity.version}`,
      { currentVersion: entity.version },
    );
  }

  if (!canArchiveEntity(entity._count.children)) {
    throw new ApiError(
      409,
      "HAS_ACTIVE_CHILDREN",
      "Archive or move active child entities before archiving this entity",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.auditEntity.update({
      where: { id: entityId },
      data: {
        status: "archived",
        archivedAt: new Date(),
        version: { increment: 1 },
        updatedById: access.user.id,
      },
    });

    await recordAudit(tx, {
      workspaceId: access.workspace.id,
      actorId: access.user.id,
      action: "audit_entity.archived",
      objectType: "audit_entity",
      objectId: entityId,
      before: { status: entity.status },
      after: { status: "archived" },
      ...access.meta,
    });
  });

  return getEntity(access, entityId);
}
