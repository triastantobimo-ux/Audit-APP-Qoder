export type RiskLevel = "low" | "medium" | "high" | "critical";

export type RiskLevelThresholds = {
  low: number;
  medium: number;
  high: number;
  critical: number;
};

export type FactorScore = {
  code: string;
  weight: number;
  score: number;
};

export class ScoringError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ScoringError";
  }
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateInherentScore(factors: FactorScore[]): number {
  if (factors.length === 0) {
    throw new ScoringError("EMPTY_FACTORS", "At least one factor score is required");
  }

  return round2(
    factors.reduce((total, factor) => total + factor.weight * factor.score, 0),
  );
}

export function calculateResidualScore(input: {
  inherentScore: number;
  controlEffectivenessScore: number;
  scaleMin?: number;
  scaleMax?: number;
  controlReductionMax?: number;
}): number {
  const {
    inherentScore,
    controlEffectivenessScore,
    scaleMin = 1,
    scaleMax = 5,
    controlReductionMax = 0.5,
  } = input;

  if (scaleMin >= scaleMax) {
    throw new ScoringError("INVALID_SCALE", "scaleMin must be below scaleMax");
  }

  if (controlReductionMax < 0 || controlReductionMax > 1) {
    throw new ScoringError(
      "INVALID_REDUCTION",
      "controlReductionMax must be between 0 and 1",
    );
  }

  const controlScore = Math.min(
    Math.max(controlEffectivenessScore, scaleMin),
    scaleMax,
  );
  const controlFactor = (controlScore - scaleMin) / (scaleMax - scaleMin);
  const residual = inherentScore * (1 - controlFactor * controlReductionMax);

  return round2(residual);
}

export function riskLevelFor(
  score: number,
  thresholds: RiskLevelThresholds,
): RiskLevel {
  const entries = Object.entries(thresholds) as [RiskLevel, number][];

  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index][1] < entries[index - 1][1]) {
      throw new ScoringError(
        "INVALID_THRESHOLDS",
        "risk level thresholds must be in ascending order",
      );
    }
  }

  let level: RiskLevel = "low";

  for (const [candidate, minimum] of entries) {
    if (score >= minimum) {
      level = candidate;
    }
  }

  return level;
}

export function validateFactorWeights(
  factors: { code: string; weight: number }[],
): void {
  if (factors.length === 0) {
    throw new ScoringError("EMPTY_FACTORS", "At least one factor is required");
  }

  const codes = new Set<string>();

  for (const factor of factors) {
    if (codes.has(factor.code)) {
      throw new ScoringError(
        "DUPLICATE_FACTOR",
        `Duplicate factor code: ${factor.code}`,
      );
    }

    codes.add(factor.code);

    if (!Number.isFinite(factor.weight) || factor.weight <= 0) {
      throw new ScoringError(
        "INVALID_WEIGHT",
        `Factor ${factor.code} must have a positive weight`,
      );
    }
  }

  const total = factors.reduce((sum, factor) => sum + factor.weight, 0);

  if (Math.abs(total - 1) > 0.0001) {
    throw new ScoringError(
      "INVALID_WEIGHT_SUM",
      `Factor weights must sum to 1.0 (received ${total.toFixed(4)})`,
    );
  }
}
