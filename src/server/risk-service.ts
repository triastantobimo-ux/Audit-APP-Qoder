import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseJson, stringifyJson } from "@/lib/json";
import {
  calculateInherentScore,
  calculateResidualScore,
  riskLevelFor,
  validateFactorWeights,
  type RiskLevel,
  type RiskLevelThresholds,
} from "@/lib/scoring";
import type {
  CreateRiskModelInput,
  FactorScoresInput,
} from "@/lib/schemas";
import type { WorkspaceAccess } from "./api";
import { ApiError } from "./api-error";
import { recordAudit } from "./audit";

const defaultThresholds: RiskLevelThresholds = {
  low: 0,
  medium: 1.5,
  high: 2.5,
  critical: 3.5,
};

const assessmentInclude = {
  cycle: true,
  riskModel: {
    include: { factors: { orderBy: { sortOrder: "asc" as const } } },
  },
  factorScores: { include: { riskFactor: true } },
  reviews: { orderBy: { createdAt: "desc" as const } },
} satisfies Prisma.RiskAssessmentInclude;

type AssessmentRow = Prisma.RiskAssessmentGetPayload<{
  include: typeof assessmentInclude;
}>;

type ScoreResult = {
  inherentScore: number;
  residualScore: number;
  riskLevel: RiskLevel;
  calculationVersion: string;
};

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function parseThresholds(value: string): RiskLevelThresholds {
  const parsed = parseJson<Partial<RiskLevelThresholds>>(value, {});

  if (
    typeof parsed.low !== "number" ||
    typeof parsed.medium !== "number" ||
    typeof parsed.high !== "number" ||
    typeof parsed.critical !== "number"
  ) {
    return defaultThresholds;
  }

  return {
    low: parsed.low,
    medium: parsed.medium,
    high: parsed.high,
    critical: parsed.critical,
  };
}

function serializeRiskFactor(factor: {
  id: string;
  code: string;
  name: string;
  description: string | null;
  weight: number;
  isRequired: boolean;
  sortOrder: number;
}) {
  return {
    id: factor.id,
    code: factor.code,
    name: factor.name,
    description: factor.description,
    weight: factor.weight,
    isRequired: factor.isRequired,
    sortOrder: factor.sortOrder,
  };
}

function serializeRiskModel(model: {
  id: string;
  name: string;
  description: string | null;
  status: string;
  scaleMin: number;
  scaleMax: number;
  controlReductionMax: number;
  levelThresholds: string;
  isDefault: boolean;
  methodologyVersion: string;
  version: number;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  factors: Array<{
    id: string;
    code: string;
    name: string;
    description: string | null;
    weight: number;
    isRequired: boolean;
    sortOrder: number;
  }>;
}) {
  return {
    id: model.id,
    name: model.name,
    description: model.description,
    status: model.status,
    scale: { min: model.scaleMin, max: model.scaleMax },
    controlReductionMax: model.controlReductionMax,
    levelThresholds: parseThresholds(model.levelThresholds),
    isDefault: model.isDefault,
    methodologyVersion: model.methodologyVersion,
    version: model.version,
    approvedAt: iso(model.approvedAt),
    createdAt: iso(model.createdAt),
    updatedAt: iso(model.updatedAt),
    factors: model.factors.map(serializeRiskFactor),
  };
}

function serializeCycle(cycle: {
  id: string;
  name: string;
  periodStart: Date;
  periodEnd: Date;
  status: string;
  activatedAt: Date | null;
  closedAt: Date | null;
}) {
  return {
    id: cycle.id,
    name: cycle.name,
    periodStart: iso(cycle.periodStart),
    periodEnd: iso(cycle.periodEnd),
    status: cycle.status,
    activatedAt: iso(cycle.activatedAt),
    closedAt: iso(cycle.closedAt),
  };
}

function serializeAssessment(
  assessment: AssessmentRow,
  actorNames: Map<string, string> = new Map(),
) {
  return {
    id: assessment.id,
    workspaceId: assessment.workspaceId,
    entityId: assessment.entityId,
    cycleId: assessment.cycleId,
    riskModelId: assessment.riskModelId,
    status: assessment.status,
    inherentScore: assessment.inherentScore,
    controlEffectivenessScore: assessment.controlEffectivenessScore,
    residualScore: assessment.residualScore,
    riskLevel: assessment.riskLevel,
    rationale: assessment.rationale,
    isCurrent: assessment.isCurrent,
    supersedesId: assessment.supersedesId,
    version: assessment.version,
    submittedAt: iso(assessment.submittedAt),
    approvedAt: iso(assessment.approvedAt),
    assessedAt: iso(assessment.assessedAt),
    assessedById: assessment.assessedById,
    assessedByName: assessment.assessedById
      ? actorNames.get(assessment.assessedById) ?? null
      : null,
    approvedById: assessment.approvedById,
    approvedByName: assessment.approvedById
      ? actorNames.get(assessment.approvedById) ?? null
      : null,
    calculatedAt: iso(assessment.calculatedAt),
    calculationVersion: assessment.calculationVersion,
    cycle: assessment.cycle ? serializeCycle(assessment.cycle) : null,
    riskModel: assessment.riskModel
      ? {
          id: assessment.riskModel.id,
          name: assessment.riskModel.name,
          version: assessment.riskModel.version,
          methodologyVersion: assessment.riskModel.methodologyVersion,
          scale: {
            min: assessment.riskModel.scaleMin,
            max: assessment.riskModel.scaleMax,
          },
          controlReductionMax: assessment.riskModel.controlReductionMax,
          levelThresholds: parseThresholds(assessment.riskModel.levelThresholds),
          factors: assessment.riskModel.factors.map(serializeRiskFactor),
        }
      : null,
    factorScores: assessment.factorScores.map((score) => ({
      factorId: score.riskFactorId,
      code: score.riskFactor.code,
      name: score.riskFactor.name,
      weight: score.riskFactor.weight,
      score: score.score,
      rationale: score.rationale,
      evidenceNote: score.evidenceNote,
    })),
    reviews: assessment.reviews.map((review) => ({
      id: review.id,
      action: review.action,
      fromStatus: review.fromStatus,
      toStatus: review.toStatus,
      comment: review.comment,
      actorName: review.actorId ? actorNames.get(review.actorId) ?? "Sistem" : "Sistem",
      createdAt: iso(review.createdAt),
    })),
  };
}

function computeScores(assessment: AssessmentRow): ScoreResult | null {
  if (assessment.controlEffectivenessScore === null) {
    return null;
  }

  const scoresByCode = new Map(
    assessment.factorScores.map((score) => [
      score.riskFactor.code,
      {
        code: score.riskFactor.code,
        weight: score.riskFactor.weight,
        score: score.score,
      },
    ]),
  );

  if (scoresByCode.size !== assessment.riskModel.factors.length) {
    return null;
  }

  const factors = assessment.riskModel.factors.map((factor) =>
    scoresByCode.get(factor.code),
  );

  if (factors.some((factor) => !factor)) {
    return null;
  }

  const inherentScore = calculateInherentScore(
    factors.filter((factor): factor is NonNullable<typeof factor> => Boolean(factor)),
  );
  const residualScore = calculateResidualScore({
    inherentScore,
    controlEffectivenessScore: assessment.controlEffectivenessScore,
    scaleMin: assessment.riskModel.scaleMin,
    scaleMax: assessment.riskModel.scaleMax,
    controlReductionMax: assessment.riskModel.controlReductionMax,
  });
  const thresholds = parseThresholds(assessment.riskModel.levelThresholds);

  return {
    inherentScore,
    residualScore,
    riskLevel: riskLevelFor(residualScore, thresholds),
    calculationVersion: assessment.riskModel.methodologyVersion,
  };
}

async function getActorNames(ids: Array<string | null>): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];

  if (unique.length === 0) {
    return new Map();
  }

  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });

  return new Map(users.map((user) => [user.id, user.name]));
}

async function getAssessmentRow(
  workspaceId: string,
  assessmentId: string,
): Promise<AssessmentRow> {
  const assessment = await prisma.riskAssessment.findFirst({
    where: { id: assessmentId, workspaceId },
    include: assessmentInclude,
  });

  if (!assessment) {
    throw new ApiError(404, "ASSESSMENT_NOT_FOUND", "Risk assessment was not found");
  }

  return assessment;
}

async function serializeAssessmentWithNames(assessment: AssessmentRow) {
  const actorNames = await getActorNames([
    ...assessment.reviews.map((review) => review.actorId),
    assessment.assessedById,
    assessment.approvedById,
  ]);
  return serializeAssessment(assessment, actorNames);
}

export async function getAssessment(access: WorkspaceAccess, assessmentId: string) {
  const assessment = await getAssessmentRow(access.workspace.id, assessmentId);
  return serializeAssessmentWithNames(assessment);
}

export async function listAssessmentsForEntity(
  access: WorkspaceAccess,
  entityId: string,
) {
  const assessments = await prisma.riskAssessment.findMany({
    where: { workspaceId: access.workspace.id, entityId },
    include: assessmentInclude,
    orderBy: [{ version: "desc" }, { createdAt: "desc" }],
  });

  const actorNames = await getActorNames(
    assessments.flatMap((assessment) => [
      ...assessment.reviews.map((review) => review.actorId),
      assessment.assessedById,
      assessment.approvedById,
    ]),
  );

  return assessments.map((assessment) =>
    serializeAssessment(assessment, actorNames),
  );
}

export async function listRiskModels(access: WorkspaceAccess) {
  const models = await prisma.riskModel.findMany({
    where: { workspaceId: access.workspace.id },
    include: { factors: { orderBy: { sortOrder: "asc" } } },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });

  return models.map(serializeRiskModel);
}

export async function getDefaultRiskModel(access: WorkspaceAccess) {
  const model = await prisma.riskModel.findFirst({
    where: {
      workspaceId: access.workspace.id,
      status: "active",
      isDefault: true,
    },
    include: { factors: { orderBy: { sortOrder: "asc" } } },
  });

  return model ? serializeRiskModel(model) : null;
}

export async function getRiskModel(access: WorkspaceAccess, modelId: string) {
  const model = await prisma.riskModel.findFirst({
    where: { id: modelId, workspaceId: access.workspace.id },
    include: { factors: { orderBy: { sortOrder: "asc" } } },
  });

  if (!model) {
    throw new ApiError(404, "RISK_MODEL_NOT_FOUND", "Risk model was not found");
  }

  return serializeRiskModel(model);
}

export async function createRiskModel(
  access: WorkspaceAccess,
  input: CreateRiskModelInput,
) {
  try {
    validateFactorWeights(input.factors);
  } catch (error) {
    throw new ApiError(422, "INVALID_FACTORS", (error as Error).message);
  }

  const model = await prisma.$transaction(async (tx) => {
    const created = await tx.riskModel.create({
      data: {
        workspaceId: access.workspace.id,
        name: input.name,
        description: input.description ?? null,
        status: "draft",
        scaleMin: input.scale.min,
        scaleMax: input.scale.max,
        controlReductionMax: input.controlReductionMax,
        levelThresholds: stringifyJson(input.levelThresholds),
        isDefault: false,
        methodologyVersion: "v1",
        createdById: access.user.id,
        factors: {
          create: input.factors.map((factor, index) => ({
            code: factor.code.toLowerCase().replaceAll(" ", "_"),
            name: factor.name,
            description: factor.description ?? null,
            weight: factor.weight,
            isRequired: factor.isRequired ?? true,
            sortOrder: index,
          })),
        },
      },
      include: { factors: { orderBy: { sortOrder: "asc" } } },
    });

    await recordAudit(tx, {
      workspaceId: access.workspace.id,
      actorId: access.user.id,
      action: "risk_model.created",
      objectType: "risk_model",
      objectId: created.id,
      after: { name: created.name, version: created.version },
      ...access.meta,
    });

    return created;
  });

  return serializeRiskModel(model);
}

export async function activateRiskModel(
  access: WorkspaceAccess,
  modelId: string,
  makeDefault: boolean,
) {
  const model = await prisma.riskModel.findFirst({
    where: { id: modelId, workspaceId: access.workspace.id },
    include: { factors: true },
  });

  if (!model) {
    throw new ApiError(404, "RISK_MODEL_NOT_FOUND", "Risk model was not found");
  }

  if (model.status !== "draft") {
    throw new ApiError(409, "RISK_MODEL_NOT_DRAFT", "Only draft models can be activated");
  }

  try {
    validateFactorWeights(model.factors);
  } catch (error) {
    throw new ApiError(422, "INVALID_FACTORS", (error as Error).message);
  }

  await prisma.$transaction(async (tx) => {
    if (makeDefault) {
      await tx.riskModel.updateMany({
        where: { workspaceId: access.workspace.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    await tx.riskModel.update({
      where: { id: modelId },
      data: {
        status: "active",
        isDefault: makeDefault,
        approvedById: access.user.id,
        approvedAt: new Date(),
      },
    });

    await recordAudit(tx, {
      workspaceId: access.workspace.id,
      actorId: access.user.id,
      action: "risk_model.activated",
      objectType: "risk_model",
      objectId: modelId,
      after: { isDefault: makeDefault },
      ...access.meta,
    });
  });

  return getRiskModel(access, modelId);
}

export async function retireRiskModel(access: WorkspaceAccess, modelId: string) {
  const model = await prisma.riskModel.findFirst({
    where: { id: modelId, workspaceId: access.workspace.id },
  });

  if (!model) {
    throw new ApiError(404, "RISK_MODEL_NOT_FOUND", "Risk model was not found");
  }

  await prisma.$transaction(async (tx) => {
    await tx.riskModel.update({
      where: { id: modelId },
      data: {
        status: "retired",
        isDefault: false,
        retiredAt: new Date(),
      },
    });

    await recordAudit(tx, {
      workspaceId: access.workspace.id,
      actorId: access.user.id,
      action: "risk_model.retired",
      objectType: "risk_model",
      objectId: modelId,
      ...access.meta,
    });
  });

  return getRiskModel(access, modelId);
}

export async function listCycles(access: WorkspaceAccess) {
  const cycles = await prisma.riskCycle.findMany({
    where: { workspaceId: access.workspace.id },
    orderBy: [{ periodStart: "desc" }, { name: "asc" }],
  });

  return cycles.map(serializeCycle);
}

export async function getActiveCycle(access: WorkspaceAccess) {
  const cycle = await prisma.riskCycle.findFirst({
    where: { workspaceId: access.workspace.id, status: "active" },
    orderBy: { periodStart: "desc" },
  });

  return cycle ? serializeCycle(cycle) : null;
}

export async function createCycle(
  access: WorkspaceAccess,
  input: { name: string; periodStart: string; periodEnd: string },
) {
  const start = new Date(input.periodStart);
  const end = new Date(input.periodEnd);

  if (end <= start) {
    throw new ApiError(422, "INVALID_PERIOD", "periodEnd must be after periodStart");
  }

  const cycle = await prisma.$transaction(async (tx) => {
    const created = await tx.riskCycle.create({
      data: {
        workspaceId: access.workspace.id,
        name: input.name,
        periodStart: start,
        periodEnd: end,
        status: "draft",
        createdById: access.user.id,
      },
    });

    await recordAudit(tx, {
      workspaceId: access.workspace.id,
      actorId: access.user.id,
      action: "risk_cycle.created",
      objectType: "risk_cycle",
      objectId: created.id,
      after: { name: created.name },
      ...access.meta,
    });

    return created;
  });

  return serializeCycle(cycle);
}

export async function activateCycle(access: WorkspaceAccess, cycleId: string) {
  const cycle = await prisma.riskCycle.findFirst({
    where: { id: cycleId, workspaceId: access.workspace.id },
  });

  if (!cycle) {
    throw new ApiError(404, "RISK_CYCLE_NOT_FOUND", "Risk cycle was not found");
  }

  if (cycle.status !== "draft") {
    throw new ApiError(409, "RISK_CYCLE_NOT_DRAFT", "Only draft cycles can be activated");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.riskCycle.update({
      where: { id: cycleId },
      data: { status: "active", activatedAt: new Date() },
    });

    await recordAudit(tx, {
      workspaceId: access.workspace.id,
      actorId: access.user.id,
      action: "risk_cycle.activated",
      objectType: "risk_cycle",
      objectId: cycleId,
      ...access.meta,
    });

    return result;
  });

  return serializeCycle(updated);
}

export async function closeCycle(access: WorkspaceAccess, cycleId: string) {
  const cycle = await prisma.riskCycle.findFirst({
    where: { id: cycleId, workspaceId: access.workspace.id },
  });

  if (!cycle) {
    throw new ApiError(404, "RISK_CYCLE_NOT_FOUND", "Risk cycle was not found");
  }

  if (cycle.status !== "active") {
    throw new ApiError(409, "RISK_CYCLE_NOT_ACTIVE", "Only active cycles can be closed");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.riskCycle.update({
      where: { id: cycleId },
      data: { status: "closed", closedAt: new Date() },
    });

    await recordAudit(tx, {
      workspaceId: access.workspace.id,
      actorId: access.user.id,
      action: "risk_cycle.closed",
      objectType: "risk_cycle",
      objectId: cycleId,
      ...access.meta,
    });

    return result;
  });

  return serializeCycle(updated);
}

export async function createAssessment(
  access: WorkspaceAccess,
  entityId: string,
  input: {
    cycleId: string;
    riskModelId: string;
    controlEffectivenessScore: number;
    rationale: string;
  },
) {
  const [entity, cycle, model] = await Promise.all([
    prisma.auditEntity.findFirst({
      where: {
        id: entityId,
        workspaceId: access.workspace.id,
        archivedAt: null,
      },
    }),
    prisma.riskCycle.findFirst({
      where: { id: input.cycleId, workspaceId: access.workspace.id },
    }),
    prisma.riskModel.findFirst({
      where: {
        id: input.riskModelId,
        workspaceId: access.workspace.id,
        status: "active",
      },
    }),
  ]);

  if (!entity || entity.status !== "active") {
    throw new ApiError(404, "ENTITY_NOT_FOUND", "Active audit entity was not found");
  }

  if (!cycle || cycle.status === "closed") {
    throw new ApiError(409, "CYCLE_CLOSED", "Risk cycle is not open for assessments");
  }

  if (!model) {
    throw new ApiError(404, "RISK_MODEL_NOT_FOUND", "Active risk model was not found");
  }

  const existing = await prisma.riskAssessment.findFirst({
    where: {
      workspaceId: access.workspace.id,
      entityId,
      cycleId: input.cycleId,
      status: { in: ["draft", "returned", "submitted", "approved"] },
    },
    orderBy: { version: "desc" },
  });

  if (existing) {
    throw new ApiError(
      409,
      "ASSESSMENT_EXISTS",
      "An assessment already exists for this entity and cycle",
      { assessmentId: existing.id, status: existing.status },
    );
  }

  const latest = await prisma.riskAssessment.findFirst({
    where: { entityId, cycleId: input.cycleId },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  const created = await prisma.$transaction(async (tx) => {
    const assessment = await tx.riskAssessment.create({
      data: {
        workspaceId: access.workspace.id,
        entityId,
        cycleId: input.cycleId,
        riskModelId: input.riskModelId,
        status: "draft",
        controlEffectivenessScore: input.controlEffectivenessScore,
        rationale: input.rationale,
        isCurrent: false,
        version: (latest?.version ?? 0) + 1,
        assessedById: access.user.id,
        assessedAt: new Date(),
        createdById: access.user.id,
        updatedById: access.user.id,
      },
    });

    await recordAudit(tx, {
      workspaceId: access.workspace.id,
      actorId: access.user.id,
      action: "assessment.created",
      objectType: "risk_assessment",
      objectId: assessment.id,
      after: { entityId, cycleId: input.cycleId, status: "draft" },
      ...access.meta,
    });

    return assessment;
  });

  return getAssessment(access, created.id);
}

export async function updateAssessment(
  access: WorkspaceAccess,
  assessmentId: string,
  input: {
    controlEffectivenessScore?: number;
    rationale?: string;
    version: number;
  },
) {
  const assessment = await getAssessmentRow(access.workspace.id, assessmentId);

  if (!["draft", "returned"].includes(assessment.status)) {
    throw new ApiError(409, "ASSESSMENT_LOCKED", "Only draft or returned assessments can be edited");
  }

  if (assessment.version !== input.version) {
    throw new ApiError(
      412,
      "STALE_VERSION",
      `Assessment has changed. Current version is ${assessment.version}`,
      { currentVersion: assessment.version },
    );
  }

  const nextControl =
    input.controlEffectivenessScore ?? assessment.controlEffectivenessScore ?? 1;

  const calculated = computeScores({
    ...assessment,
    controlEffectivenessScore: nextControl,
  });

  await prisma.$transaction(async (tx) => {
    await tx.riskAssessment.update({
      where: { id: assessmentId },
      data: {
        controlEffectivenessScore: nextControl,
        rationale: input.rationale ?? assessment.rationale,
        inherentScore: calculated?.inherentScore ?? assessment.inherentScore,
        residualScore: calculated?.residualScore ?? assessment.residualScore,
        riskLevel: calculated?.riskLevel ?? assessment.riskLevel,
        calculationVersion:
          calculated?.calculationVersion ?? assessment.calculationVersion,
        calculatedAt: calculated ? new Date() : assessment.calculatedAt,
        version: { increment: 1 },
        updatedById: access.user.id,
      },
    });

    await recordAudit(tx, {
      workspaceId: access.workspace.id,
      actorId: access.user.id,
      action: "assessment.updated",
      objectType: "risk_assessment",
      objectId: assessmentId,
      before: {
        controlEffectivenessScore: assessment.controlEffectivenessScore,
        rationale: assessment.rationale,
      },
      after: {
        controlEffectivenessScore: nextControl,
        rationale: input.rationale ?? assessment.rationale,
      },
      ...access.meta,
    });
  });

  return getAssessment(access, assessmentId);
}

export async function upsertFactorScores(
  access: WorkspaceAccess,
  assessmentId: string,
  input: FactorScoresInput,
) {
  const assessment = await getAssessmentRow(access.workspace.id, assessmentId);

  if (!["draft", "returned"].includes(assessment.status)) {
    throw new ApiError(
      409,
      "ASSESSMENT_LOCKED",
      "Only draft or returned assessments can be scored",
    );
  }

  if (assessment.version !== input.version) {
    throw new ApiError(
      412,
      "STALE_VERSION",
      `Assessment has changed. Current version is ${assessment.version}`,
      { currentVersion: assessment.version },
    );
  }

  const factorByCode = new Map(
    assessment.riskModel.factors.map((factor) => [factor.code, factor]),
  );
  const seen = new Set<string>();
  const factors = input.scores.map((score) => {
    const factor = factorByCode.get(score.factorCode);

    if (!factor) {
      throw new ApiError(
        422,
        "UNKNOWN_FACTOR",
        `Factor ${score.factorCode} does not belong to this risk model`,
      );
    }

    if (seen.has(factor.code)) {
      throw new ApiError(422, "DUPLICATE_FACTOR", `Factor ${factor.code} was sent twice`);
    }

    seen.add(factor.code);

    if (
      score.score < assessment.riskModel.scaleMin ||
      score.score > assessment.riskModel.scaleMax
    ) {
      throw new ApiError(
        422,
        "SCORE_OUT_OF_RANGE",
        `Score for ${factor.code} must be between ${assessment.riskModel.scaleMin} and ${assessment.riskModel.scaleMax}`,
      );
    }

    if (factor.isRequired && !score.rationale?.trim()) {
      throw new ApiError(
        422,
        "RATIONALE_REQUIRED",
        `Rationale is required for factor ${factor.code}`,
      );
    }

    return { factor, input: score };
  });

  if (seen.size !== assessment.riskModel.factors.length) {
    const missing = assessment.riskModel.factors
      .filter((factor) => !seen.has(factor.code))
      .map((factor) => factor.code);
    throw new ApiError(
      422,
      "INCOMPLETE_FACTORS",
      `All risk factors must be scored. Missing: ${missing.join(", ")}`,
    );
  }

  const inherentScore = calculateInherentScore(
    factors.map(({ factor, input: score }) => ({
      code: factor.code,
      weight: factor.weight,
      score: score.score,
    })),
  );
  const controlScore = assessment.controlEffectivenessScore ?? 1;
  const residualScore = calculateResidualScore({
    inherentScore,
    controlEffectivenessScore: controlScore,
    scaleMin: assessment.riskModel.scaleMin,
    scaleMax: assessment.riskModel.scaleMax,
    controlReductionMax: assessment.riskModel.controlReductionMax,
  });
  const thresholds = parseThresholds(assessment.riskModel.levelThresholds);
  const riskLevel = riskLevelFor(residualScore, thresholds);

  await prisma.$transaction(async (tx) => {
    for (const { factor, input: score } of factors) {
      await tx.riskFactorScore.upsert({
        where: {
          assessmentId_riskFactorId: {
            assessmentId,
            riskFactorId: factor.id,
          },
        },
        update: {
          score: score.score,
          rationale: score.rationale ?? null,
          evidenceNote: score.evidenceNote ?? null,
        },
        create: {
          assessmentId,
          riskFactorId: factor.id,
          score: score.score,
          rationale: score.rationale ?? null,
          evidenceNote: score.evidenceNote ?? null,
        },
      });
    }

    await tx.riskAssessment.update({
      where: { id: assessmentId },
      data: {
        inherentScore,
        residualScore,
        riskLevel,
        calculationVersion: assessment.riskModel.methodologyVersion,
        calculatedAt: new Date(),
        version: { increment: 1 },
        updatedById: access.user.id,
      },
    });

    await recordAudit(tx, {
      workspaceId: access.workspace.id,
      actorId: access.user.id,
      action: "assessment.factor_scores_updated",
      objectType: "risk_assessment",
      objectId: assessmentId,
      after: { inherentScore, residualScore, riskLevel },
      ...access.meta,
    });
  });

  return getAssessment(access, assessmentId);
}

export async function submitAssessment(
  access: WorkspaceAccess,
  assessmentId: string,
  version: number,
  comment?: string,
) {
  const assessment = await getAssessmentRow(access.workspace.id, assessmentId);

  if (!["draft", "returned"].includes(assessment.status)) {
    throw new ApiError(409, "INVALID_STATUS", "Only draft or returned assessments can be submitted");
  }

  if (assessment.version !== version) {
    throw new ApiError(
      412,
      "STALE_VERSION",
      `Assessment has changed. Current version is ${assessment.version}`,
      { currentVersion: assessment.version },
    );
  }

  if (assessment.factorScores.length !== assessment.riskModel.factors.length) {
    throw new ApiError(
      422,
      "INCOMPLETE_FACTORS",
      "All risk factors must be scored before submission",
    );
  }

  const calculated = computeScores(assessment);

  if (!calculated) {
    throw new ApiError(
      422,
      "INCOMPLETE_ASSESSMENT",
      "Control effectiveness and all factor scores are required",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.riskAssessment.update({
      where: { id: assessmentId },
      data: {
        status: "submitted",
        submittedAt: new Date(),
        inherentScore: calculated.inherentScore,
        residualScore: calculated.residualScore,
        riskLevel: calculated.riskLevel,
        calculationVersion: calculated.calculationVersion,
        calculatedAt: new Date(),
        version: { increment: 1 },
        updatedById: access.user.id,
      },
    });

    await tx.riskAssessmentReview.create({
      data: {
        assessmentId,
        action: "submit",
        fromStatus: assessment.status,
        toStatus: "submitted",
        comment: comment ?? null,
        actorId: access.user.id,
      },
    });

    await recordAudit(tx, {
      workspaceId: access.workspace.id,
      actorId: access.user.id,
      action: "assessment.submitted",
      objectType: "risk_assessment",
      objectId: assessmentId,
      after: { status: "submitted", riskLevel: calculated.riskLevel },
      ...access.meta,
    });
  });

  return getAssessment(access, assessmentId);
}

export async function approveAssessment(
  access: WorkspaceAccess,
  assessmentId: string,
  version: number,
  comment?: string,
) {
  const assessment = await getAssessmentRow(access.workspace.id, assessmentId);

  if (assessment.status !== "submitted") {
    throw new ApiError(409, "INVALID_STATUS", "Only submitted assessments can be approved");
  }

  if (assessment.version !== version) {
    throw new ApiError(
      412,
      "STALE_VERSION",
      `Assessment has changed. Current version is ${assessment.version}`,
      { currentVersion: assessment.version },
    );
  }

  if (assessment.assessedById === access.user.id) {
    throw new ApiError(
      403,
      "SELF_APPROVAL_FORBIDDEN",
      "Assessors cannot approve their own risk assessment",
    );
  }

  const calculated = computeScores(assessment);

  if (!calculated) {
    throw new ApiError(
      422,
      "INCOMPLETE_ASSESSMENT",
      "Assessment is missing required factor scores",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.riskAssessment.updateMany({
      where: {
        workspaceId: access.workspace.id,
        entityId: assessment.entityId,
        cycleId: assessment.cycleId,
        status: "approved",
        isCurrent: true,
      },
      data: { status: "superseded", isCurrent: false },
    });

    await tx.riskAssessment.update({
      where: { id: assessmentId },
      data: {
        status: "approved",
        isCurrent: true,
        approvedById: access.user.id,
        approvedAt: new Date(),
        inherentScore: calculated.inherentScore,
        residualScore: calculated.residualScore,
        riskLevel: calculated.riskLevel,
        calculationVersion: calculated.calculationVersion,
        calculatedAt: new Date(),
        version: { increment: 1 },
        updatedById: access.user.id,
      },
    });

    await tx.riskAssessmentReview.create({
      data: {
        assessmentId,
        action: "approve",
        fromStatus: "submitted",
        toStatus: "approved",
        comment: comment ?? null,
        actorId: access.user.id,
      },
    });

    await recordAudit(tx, {
      workspaceId: access.workspace.id,
      actorId: access.user.id,
      action: "assessment.approved",
      objectType: "risk_assessment",
      objectId: assessmentId,
      after: { status: "approved", riskLevel: calculated.riskLevel },
      ...access.meta,
    });
  });

  return getAssessment(access, assessmentId);
}

export async function returnAssessment(
  access: WorkspaceAccess,
  assessmentId: string,
  version: number,
  comment?: string,
) {
  const assessment = await getAssessmentRow(access.workspace.id, assessmentId);

  if (assessment.status !== "submitted") {
    throw new ApiError(409, "INVALID_STATUS", "Only submitted assessments can be returned");
  }

  if (assessment.version !== version) {
    throw new ApiError(
      412,
      "STALE_VERSION",
      `Assessment has changed. Current version is ${assessment.version}`,
      { currentVersion: assessment.version },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.riskAssessment.update({
      where: { id: assessmentId },
      data: {
        status: "returned",
        version: { increment: 1 },
        updatedById: access.user.id,
      },
    });

    await tx.riskAssessmentReview.create({
      data: {
        assessmentId,
        action: "return",
        fromStatus: "submitted",
        toStatus: "returned",
        comment: comment ?? null,
        actorId: access.user.id,
      },
    });

    await recordAudit(tx, {
      workspaceId: access.workspace.id,
      actorId: access.user.id,
      action: "assessment.returned",
      objectType: "risk_assessment",
      objectId: assessmentId,
      after: { status: "returned" },
      ...access.meta,
    });
  });

  return getAssessment(access, assessmentId);
}

export async function newAssessmentVersion(
  access: WorkspaceAccess,
  assessmentId: string,
) {
  const assessment = await getAssessmentRow(access.workspace.id, assessmentId);

  if (assessment.status !== "approved") {
    throw new ApiError(
      409,
      "INVALID_STATUS",
      "A new version can only be created from an approved assessment",
    );
  }

  const existing = await prisma.riskAssessment.findFirst({
    where: {
      workspaceId: access.workspace.id,
      entityId: assessment.entityId,
      cycleId: assessment.cycleId,
      status: { in: ["draft", "returned", "submitted"] },
    },
  });

  if (existing) {
    throw new ApiError(
      409,
      "ASSESSMENT_EXISTS",
      "An open assessment already exists for this entity and cycle",
      { assessmentId: existing.id, status: existing.status },
    );
  }

  const maxVersion = await prisma.riskAssessment.aggregate({
    where: { entityId: assessment.entityId, cycleId: assessment.cycleId },
    _max: { version: true },
  });

  const created = await prisma.$transaction(async (tx) => {
    const next = await tx.riskAssessment.create({
      data: {
        workspaceId: access.workspace.id,
        entityId: assessment.entityId,
        cycleId: assessment.cycleId,
        riskModelId: assessment.riskModelId,
        status: "draft",
        controlEffectivenessScore: assessment.controlEffectivenessScore,
        rationale: assessment.rationale,
        isCurrent: false,
        supersedesId: assessment.id,
        version: (maxVersion._max.version ?? assessment.version) + 1,
        assessedById: access.user.id,
        assessedAt: new Date(),
        createdById: access.user.id,
        updatedById: access.user.id,
        factorScores: {
          create: assessment.factorScores.map((score) => ({
            riskFactorId: score.riskFactorId,
            score: score.score,
            rationale: score.rationale,
            evidenceNote: score.evidenceNote,
          })),
        },
      },
    });

    await recordAudit(tx, {
      workspaceId: access.workspace.id,
      actorId: access.user.id,
      action: "assessment.new_version",
      objectType: "risk_assessment",
      objectId: next.id,
      before: { supersedesId: assessment.id, version: assessment.version },
      after: { version: next.version },
      ...access.meta,
    });

    return next;
  });

  return getAssessment(access, created.id);
}

export async function getRankings(
  access: WorkspaceAccess,
  options: {
    cycleId?: string;
    levels?: string[];
    limit?: number;
  } = {},
) {
  const cycleId =
    options.cycleId ??
    (
      await prisma.riskCycle.findFirst({
        where: { workspaceId: access.workspace.id, status: "active" },
        orderBy: { periodStart: "desc" },
      })
    )?.id;

  if (!cycleId) {
    return [];
  }

  const assessments = await prisma.riskAssessment.findMany({
    where: {
      workspaceId: access.workspace.id,
      cycleId,
      status: "approved",
      isCurrent: true,
      riskLevel: options.levels?.length ? { in: options.levels } : undefined,
      entity: { status: "active", archivedAt: null },
    },
    include: {
      entity: {
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
          depth: true,
          ownerUser: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ residualScore: "desc" }, { riskLevel: "desc" }],
    take: options.limit ?? 50,
  });

  return assessments.map((assessment) => ({
    entityId: assessment.entity.id,
    code: assessment.entity.code,
    name: assessment.entity.name,
    type: assessment.entity.type,
    depth: assessment.entity.depth,
    owner: assessment.entity.ownerUser,
    assessmentId: assessment.id,
    inherentScore: assessment.inherentScore,
    controlEffectivenessScore: assessment.controlEffectivenessScore,
    residualScore: assessment.residualScore,
    riskLevel: assessment.riskLevel,
    approvedAt: iso(assessment.approvedAt),
    coverageStatus: "assessed" as const,
  }));
}

export async function getDashboardSummary(
  access: WorkspaceAccess,
  cycleId?: string,
) {
  const activeCycle =
    cycleId ??
    (
      await prisma.riskCycle.findFirst({
        where: { workspaceId: access.workspace.id, status: "active" },
        orderBy: { periodStart: "desc" },
      })
    )?.id;

  const [totalEntities, approved, latestEvents] = await Promise.all([
    prisma.auditEntity.count({
      where: {
        workspaceId: access.workspace.id,
        status: "active",
        archivedAt: null,
      },
    }),
    activeCycle
      ? prisma.riskAssessment.findMany({
          where: {
            workspaceId: access.workspace.id,
            cycleId: activeCycle,
            status: "approved",
            isCurrent: true,
            entity: { status: "active", archivedAt: null },
          },
          select: {
            entityId: true,
            riskLevel: true,
            residualScore: true,
          },
        })
      : Promise.resolve([]),
    prisma.auditEvent.findMany({
      where: { workspaceId: access.workspace.id },
      include: { actor: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  const counts = { low: 0, medium: 0, high: 0, critical: 0 };
  let residualTotal = 0;

  for (const assessment of approved) {
    if (assessment.riskLevel && assessment.riskLevel in counts) {
      counts[assessment.riskLevel as keyof typeof counts] += 1;
    }
    residualTotal += assessment.residualScore ?? 0;
  }

  const assessed = approved.length;
  const averageResidual = assessed ? residualTotal / assessed : 0;
  const rankings = activeCycle
    ? await getRankings(access, { cycleId: activeCycle, limit: 5 })
    : [];

  return {
    cycleId: activeCycle ?? null,
    totalEntities,
    assessed,
    unassessed: Math.max(totalEntities - assessed, 0),
    averageResidual: Math.round(averageResidual * 100) / 100,
    levels: counts,
    highOrCritical: counts.high + counts.critical,
    topRisks: rankings,
    recentEvents: latestEvents.map((event) => ({
      id: event.id,
      action: event.action,
      objectType: event.objectType,
      objectId: event.objectId,
      actorName: event.actor?.name ?? "Sistem",
      createdAt: iso(event.createdAt),
    })),
  };
}

export async function listAuditEvents(
  access: WorkspaceAccess,
  options: { objectType?: string; objectId?: string; limit?: number } = {},
) {
  const events = await prisma.auditEvent.findMany({
    where: {
      workspaceId: access.workspace.id,
      objectType: options.objectType,
      objectId: options.objectId,
    },
    include: { actor: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: options.limit ?? 100,
  });

  return events.map((event) => ({
    id: event.id,
    action: event.action,
    objectType: event.objectType,
    objectId: event.objectId,
    actorName: event.actor?.name ?? "Sistem",
    before: event.before ? parseJson<unknown>(event.before, null) : null,
    after: event.after ? parseJson<unknown>(event.after, null) : null,
    requestId: event.requestId,
    createdAt: iso(event.createdAt),
  }));
}

export async function listWorkspaceMembers(access: WorkspaceAccess) {
  const memberships = await prisma.membership.findMany({
    where: { workspaceId: access.workspace.id },
    include: {
      user: { select: { id: true, name: true, email: true, isActive: true } },
    },
    orderBy: { role: "asc" },
  });

  return memberships.map((membership) => ({
    id: membership.user.id,
    name: membership.user.name,
    email: membership.user.email,
    role: membership.role,
    isActive: membership.user.isActive,
  }));
}
