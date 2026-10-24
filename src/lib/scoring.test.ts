import { describe, expect, it } from "vitest";
import {
  ScoringError,
  calculateInherentScore,
  calculateResidualScore,
  riskLevelFor,
  validateFactorWeights,
} from "./scoring";

const factors = [
  { code: "impact", weight: 0.25, score: 4 },
  { code: "likelihood", weight: 0.25, score: 4 },
  { code: "fraud", weight: 0.15, score: 3 },
  { code: "regulatory", weight: 0.15, score: 4 },
  { code: "complexity", weight: 0.1, score: 3 },
  { code: "change", weight: 0.05, score: 2 },
  { code: "third_party", weight: 0.05, score: 2 },
];

const thresholds = { low: 0, medium: 1.5, high: 2.5, critical: 3.5 };

describe("calculateInherentScore", () => {
  it("weights factor scores and rounds to two decimals", () => {
    expect(calculateInherentScore(factors)).toBe(3.55);
  });

  it("rejects an empty factor list", () => {
    expect(() => calculateInherentScore([])).toThrow(ScoringError);
  });
});

describe("calculateResidualScore", () => {
  it("reduces the inherent score based on control effectiveness", () => {
    expect(
      calculateResidualScore({
        inherentScore: 3.55,
        controlEffectivenessScore: 3,
        scaleMin: 1,
        scaleMax: 5,
        controlReductionMax: 0.5,
      }),
    ).toBe(2.66);
  });

  it("does not reduce risk at the minimum control score", () => {
    expect(
      calculateResidualScore({
        inherentScore: 3.55,
        controlEffectivenessScore: 1,
      }),
    ).toBe(3.55);
  });

  it("applies the maximum configured reduction at the maximum control score", () => {
    expect(
      calculateResidualScore({
        inherentScore: 3.55,
        controlEffectivenessScore: 5,
      }),
    ).toBe(1.78);
  });

  it("rejects an invalid control scale", () => {
    expect(() =>
      calculateResidualScore({
        inherentScore: 3.55,
        controlEffectivenessScore: 3,
        scaleMin: 5,
        scaleMax: 1,
      }),
    ).toThrow(ScoringError);
  });
});

describe("riskLevelFor", () => {
  it("maps scores to the highest reached threshold", () => {
    expect(riskLevelFor(1.49, thresholds)).toBe("low");
    expect(riskLevelFor(1.5, thresholds)).toBe("medium");
    expect(riskLevelFor(2.66, thresholds)).toBe("high");
    expect(riskLevelFor(3.5, thresholds)).toBe("critical");
  });

  it("rejects unsorted thresholds", () => {
    expect(() =>
      riskLevelFor(2.5, { low: 0, medium: 3, high: 2.5, critical: 4 }),
    ).toThrow(ScoringError);
  });
});

describe("validateFactorWeights", () => {
  it("accepts weights that sum to one", () => {
    expect(() =>
      validateFactorWeights([
        { code: "impact", weight: 0.6 },
        { code: "likelihood", weight: 0.4 },
      ]),
    ).not.toThrow();
  });

  it("rejects weights that do not sum to one", () => {
    try {
      validateFactorWeights([
        { code: "impact", weight: 0.6 },
        { code: "likelihood", weight: 0.3 },
      ]);
      throw new Error("expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ScoringError);
      expect((error as ScoringError).code).toBe("INVALID_WEIGHT_SUM");
    }
  });

  it("rejects duplicate factor codes", () => {
    try {
      validateFactorWeights([
        { code: "impact", weight: 0.5 },
        { code: "impact", weight: 0.5 },
      ]);
      throw new Error("expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ScoringError);
      expect((error as ScoringError).code).toBe("DUPLICATE_FACTOR");
    }
  });

  it("rejects non-positive weights", () => {
    try {
      validateFactorWeights([
        { code: "impact", weight: 1 },
        { code: "likelihood", weight: 0 },
      ]);
      throw new Error("expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ScoringError);
      expect((error as ScoringError).code).toBe("INVALID_WEIGHT");
    }
  });
});
