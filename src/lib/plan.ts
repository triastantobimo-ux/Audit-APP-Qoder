import { riskLevelFor, type RiskLevelThresholds } from "./scoring";

export const planRoles = ["CAE", "MANAGER", "AUDITOR", "REVIEWER"] as const;
export type PlanRole = (typeof planRoles)[number];

export type PlanAction =
  | "submit"
  | "approve"
  | "return"
  | "new_version"
  | "edit"
  | "add_engagement"
  | "edit_engagement"
  | "delete_engagement"
  | "edit_capacity"
  | "edit_actuals";

export type CapacityWarning = {
  role: PlanRole;
  estimatedHours: number;
  availableHours: number;
  overBy: number;
  kind: "exceeded" | "unconfigured";
};

export type PlanBudget = {
  totalEstimatedHours: number;
  totalActualHours: number;
  varianceHours: number;
  variancePercent: number;
  estimatedByRole: Record<PlanRole, number>;
};

type AllocationLike = { role: string; hours: number };
type EngagementLike = {
  allocations: AllocationLike[];
  actualHours?: number;
};
type CapacityLike = { role: string; availableHours: number };

const actionStatuses: Record<PlanAction, readonly string[]> = {
  submit: ["draft", "returned"],
  approve: ["submitted"],
  return: ["submitted"],
  new_version: ["approved"],
  edit: ["draft", "returned"],
  add_engagement: ["draft", "returned"],
  edit_engagement: ["draft", "returned"],
  delete_engagement: ["draft", "returned"],
  edit_capacity: ["draft", "returned"],
  edit_actuals: ["approved"],
};

export class PlanError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PlanError";
  }
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function round1(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

export function isPlanRole(value: string): value is PlanRole {
  return (planRoles as readonly string[]).includes(value);
}

function assertHours(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new PlanError("INVALID_HOURS", `${field} harus lebih besar dari 0`);
  }
}

export function sumAllocations(allocations: AllocationLike[]): number {
  if (allocations.length === 0) {
    throw new PlanError(
      "EMPTY_ALLOCATIONS",
      "Minimal satu alokasi role diperlukan",
    );
  }

  const seen = new Set<string>();
  let total = 0;

  for (const allocation of allocations) {
    if (!isPlanRole(allocation.role)) {
      throw new PlanError(
        "INVALID_ROLE",
        `Role ${allocation.role} tidak valid untuk perencanaan`,
      );
    }

    if (seen.has(allocation.role)) {
      throw new PlanError(
        "DUPLICATE_ROLE",
        `Role ${allocation.role} hanya boleh muncul sekali per engagement`,
      );
    }

    assertHours(allocation.hours, `Jam ${allocation.role}`);
    seen.add(allocation.role);
    total += allocation.hours;
  }

  return round2(total);
}

export function calculatePlanBudget(engagements: EngagementLike[]): PlanBudget {
  const estimatedByRole = Object.fromEntries(
    planRoles.map((role) => [role, 0]),
  ) as Record<PlanRole, number>;
  let totalEstimatedHours = 0;
  let totalActualHours = 0;

  for (const engagement of engagements) {
    const estimated = sumAllocations(engagement.allocations);
    totalEstimatedHours += estimated;

    for (const allocation of engagement.allocations) {
      estimatedByRole[allocation.role as PlanRole] = round2(
        estimatedByRole[allocation.role as PlanRole] + allocation.hours,
      );
    }

    const actual = engagement.actualHours ?? 0;
    if (!Number.isFinite(actual) || actual < 0) {
      throw new PlanError(
        "INVALID_HOURS",
        "Actual hours tidak boleh negatif",
      );
    }
    totalActualHours += actual;
  }

  const roundedEstimated = round2(totalEstimatedHours);
  const roundedActual = round2(totalActualHours);
  const varianceHours = round2(roundedActual - roundedEstimated);

  return {
    totalEstimatedHours: roundedEstimated,
    totalActualHours: roundedActual,
    varianceHours,
    variancePercent:
      roundedEstimated > 0
        ? round1((varianceHours / roundedEstimated) * 100)
        : 0,
    estimatedByRole,
  };
}

export function calculateCapacityWarnings(
  capacity: CapacityLike[],
  engagements: EngagementLike[],
): CapacityWarning[] {
  const capacityByRole = new Map<PlanRole, number>();

  for (const row of capacity) {
    if (!isPlanRole(row.role)) {
      throw new PlanError(
        "INVALID_ROLE",
        `Role ${row.role} tidak valid untuk perencanaan`,
      );
    }
    if (capacityByRole.has(row.role)) {
      throw new PlanError(
        "DUPLICATE_CAPACITY_ROLE",
        `Kapasitas role ${row.role} hanya boleh didefinisikan sekali`,
      );
    }
    if (!Number.isFinite(row.availableHours) || row.availableHours < 0) {
      throw new PlanError(
        "INVALID_CAPACITY",
        "Kapasitas role tidak boleh negatif",
      );
    }
    capacityByRole.set(row.role, row.availableHours);
  }

  const estimatedByRole = Object.fromEntries(
    planRoles.map((role) => [role, 0]),
  ) as Record<PlanRole, number>;

  for (const engagement of engagements) {
    sumAllocations(engagement.allocations);
    for (const allocation of engagement.allocations) {
      estimatedByRole[allocation.role as PlanRole] = round2(
        estimatedByRole[allocation.role as PlanRole] + allocation.hours,
      );
    }
  }

  const warnings: CapacityWarning[] = [];

  for (const role of planRoles) {
    const estimated = estimatedByRole[role];
    if (estimated <= 0) {
      continue;
    }

    const available = capacityByRole.get(role);

    if (available === undefined) {
      warnings.push({
        role,
        estimatedHours: estimated,
        availableHours: 0,
        overBy: estimated,
        kind: "unconfigured",
      });
      continue;
    }

    if (estimated > available) {
      warnings.push({
        role,
        estimatedHours: estimated,
        availableHours: available,
        overBy: round2(estimated - available),
        kind: "exceeded",
      });
    }
  }

  return warnings.sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === "unconfigured" ? -1 : 1;
    }
    if (right.overBy !== left.overBy) {
      return right.overBy - left.overBy;
    }
    return left.role.localeCompare(right.role);
  });
}

export function calculateCoverage({
  plannedEntityIds,
  entities,
}: {
  plannedEntityIds: string[];
  entities: Array<{ id: string; riskLevel?: string | null }>;
}) {
  const planned = new Set(plannedEntityIds);
  const totalCount = entities.length;
  const highCritical = entities.filter(
    (entity) =>
      entity.riskLevel?.toLowerCase() === "high" ||
      entity.riskLevel?.toLowerCase() === "critical",
  );
  const coveredCount = entities.filter((entity) => planned.has(entity.id)).length;
  const highCriticalCovered = highCritical.filter((entity) =>
    planned.has(entity.id),
  ).length;

  return {
    coveredCount,
    totalCount,
    coveragePercent:
      totalCount > 0 ? round1((coveredCount / totalCount) * 100) : 0,
    highCriticalCovered,
    highCriticalTotal: highCritical.length,
    highCriticalCoveragePercent:
      highCritical.length > 0
        ? round1((highCriticalCovered / highCritical.length) * 100)
        : 0,
  };
}

export function validatePlanPeriod({
  year,
  periodStart,
  periodEnd,
}: {
  year: number;
  periodStart: Date;
  periodEnd: Date;
}): void {
  if (
    Number.isNaN(periodStart.getTime()) ||
    Number.isNaN(periodEnd.getTime()) ||
    periodEnd.getTime() <= periodStart.getTime()
  ) {
    throw new PlanError(
      "INVALID_PERIOD",
      "Periode plan tidak valid: tanggal akhir harus setelah tanggal mulai",
    );
  }

  if (
    periodStart.getUTCFullYear() !== year ||
    periodEnd.getUTCFullYear() !== year
  ) {
    throw new PlanError(
      "PERIOD_YEAR_MISMATCH",
      "Periode plan harus berada dalam tahun plan",
    );
  }
}

export function resolvePlanningRisk({
  sourceScore,
  sourceLevel,
  overrideScore,
  overrideReason,
  thresholds,
  scaleMin,
  scaleMax,
}: {
  sourceScore: number;
  sourceLevel: string;
  overrideScore?: number | null;
  overrideReason?: string | null;
  thresholds: RiskLevelThresholds;
  scaleMin: number;
  scaleMax: number;
}) {
  if (overrideScore === undefined || overrideScore === null) {
    return { score: sourceScore, level: sourceLevel, isOverride: false };
  }

  if (
    !Number.isFinite(overrideScore) ||
    overrideScore < scaleMin ||
    overrideScore > scaleMax
  ) {
    throw new PlanError(
      "INVALID_OVERRIDE",
      `Override score harus berada pada skala ${scaleMin}–${scaleMax}`,
    );
  }

  if (!overrideReason?.trim()) {
    throw new PlanError(
      "OVERRIDE_REASON_REQUIRED",
      "Alasan override wajib diisi",
    );
  }

  return {
    score: overrideScore,
    level: riskLevelFor(overrideScore, thresholds),
    isOverride: true,
  };
}

export function assertPlanAction(status: string, action: PlanAction): void {
  if (!actionStatuses[action].includes(status)) {
    throw new PlanError(
      "INVALID_PLAN_STATUS",
      `Aksi ${action} tidak diizinkan saat plan berstatus ${status}`,
    );
  }
}

export function assertUniqueEngagement(
  existingEntityIds: string[],
  entityId: string,
): void {
  if (existingEntityIds.includes(entityId)) {
    throw new PlanError(
      "DUPLICATE_ENGAGEMENT",
      "Entity ini sudah ada dalam plan",
    );
  }
}

function csvValue(value: string | number | null | undefined): string {
  const text = String(value ?? "");

  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

export function buildPlanCsv({
  year,
  name,
  version,
  status,
  engagements,
}: {
  year: number;
  name: string;
  version: number;
  status: string;
  engagements: Array<{
    entityCode: string;
    entityName: string;
    quarter: number | null;
    riskScore: number;
    riskLevel: string;
    estimatedHours: number;
    actualHours: number;
    status: string;
  }>;
}): string {
  const header = [
    "Year",
    "Plan",
    "Version",
    "Status",
    "Entity Code",
    "Entity",
    "Quarter",
    "Risk Score",
    "Risk Level",
    "Estimated Hours",
    "Actual Hours",
    "Execution Status",
  ].join(",");

  const rows = engagements.map((engagement) =>
    [
      year,
      name,
      version,
      status,
      engagement.entityCode,
      engagement.entityName,
      engagement.quarter ?? "",
      engagement.riskScore,
      engagement.riskLevel,
      engagement.estimatedHours,
      engagement.actualHours,
      engagement.status,
    ]
      .map(csvValue)
      .join(","),
  );

  return `${[header, ...rows].join("\n")}\n`;
}
