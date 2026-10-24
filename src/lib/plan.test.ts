import { describe, expect, it } from "vitest";
import {
  assertPlanAction,
  assertUniqueEngagement,
  buildPlanCsv,
  calculateCapacityWarnings,
  calculateCoverage,
  calculatePlanBudget,
  PlanError,
  resolvePlanningRisk,
  sumAllocations,
  validatePlanPeriod,
} from "./plan";

const thresholds = { low: 0, medium: 1.5, high: 2.5, critical: 3.5 };

function expectPlanError(fn: () => unknown, code: string) {
  try {
    fn();
    throw new Error("expected function to throw");
  } catch (error) {
    expect(error).toBeInstanceOf(PlanError);
    expect((error as PlanError).code).toBe(code);
  }
}

describe("sumAllocations", () => {
  it("sums role hours and rounds to two decimals", () => {
    expect(
      sumAllocations([
        { role: "MANAGER", hours: 12.345 },
        { role: "AUDITOR", hours: 27.5 },
      ]),
    ).toBe(39.85);
  });

  it("rejects an empty allocation list", () => {
    expectPlanError(() => sumAllocations([]), "EMPTY_ALLOCATIONS");
  });

  it("rejects zero or negative hours", () => {
    expectPlanError(
      () => sumAllocations([{ role: "AUDITOR", hours: 0 }]),
      "INVALID_HOURS",
    );
    expectPlanError(
      () => sumAllocations([{ role: "AUDITOR", hours: -4 }]),
      "INVALID_HOURS",
    );
  });

  it("rejects duplicate roles", () => {
    expectPlanError(
      () =>
        sumAllocations([
          { role: "AUDITOR", hours: 10 },
          { role: "AUDITOR", hours: 20 },
        ]),
      "DUPLICATE_ROLE",
    );
  });

  it("rejects roles outside the planning matrix", () => {
    expectPlanError(
      () => sumAllocations([{ role: "PROCESS_OWNER" as never, hours: 10 }]),
      "INVALID_ROLE",
    );
  });
});

describe("calculatePlanBudget", () => {
  it("returns zeroed totals for an empty plan", () => {
    expect(calculatePlanBudget([])).toEqual({
      totalEstimatedHours: 0,
      totalActualHours: 0,
      varianceHours: 0,
      variancePercent: 0,
      estimatedByRole: { CAE: 0, MANAGER: 0, AUDITOR: 0, REVIEWER: 0 },
    });
  });

  it("aggregates estimates by role and compares actuals", () => {
    const budget = calculatePlanBudget([
      {
        allocations: [
          { role: "MANAGER", hours: 20 },
          { role: "AUDITOR", hours: 80 },
        ],
        actualHours: 40,
      },
      {
        allocations: [
          { role: "MANAGER", hours: 10 },
          { role: "AUDITOR", hours: 30 },
          { role: "REVIEWER", hours: 10 },
        ],
        actualHours: 0,
      },
    ]);

    expect(budget.totalEstimatedHours).toBe(150);
    expect(budget.totalActualHours).toBe(40);
    expect(budget.varianceHours).toBe(-110);
    expect(budget.variancePercent).toBe(-73.3);
    expect(budget.estimatedByRole).toEqual({
      CAE: 0,
      MANAGER: 30,
      AUDITOR: 110,
      REVIEWER: 10,
    });
  });
});

describe("calculateCapacityWarnings", () => {
  it("warns when a role exceeds capacity and when capacity is missing", () => {
    const warnings = calculateCapacityWarnings(
      [
        { role: "MANAGER", availableHours: 20 },
        { role: "AUDITOR", availableHours: 100 },
      ],
      [
        {
          allocations: [
            { role: "MANAGER", hours: 30 },
            { role: "AUDITOR", hours: 80 },
            { role: "REVIEWER", hours: 10 },
          ],
        },
      ],
    );

    expect(warnings).toEqual([
      {
        role: "REVIEWER",
        estimatedHours: 10,
        availableHours: 0,
        overBy: 10,
        kind: "unconfigured",
      },
      {
        role: "MANAGER",
        estimatedHours: 30,
        availableHours: 20,
        overBy: 10,
        kind: "exceeded",
      },
    ]);
  });

  it("returns no warnings when allocations fit capacity", () => {
    const warnings = calculateCapacityWarnings(
      [{ role: "AUDITOR", availableHours: 200 }],
      [{ allocations: [{ role: "AUDITOR", hours: 120 }] }],
    );

    expect(warnings).toEqual([]);
  });

  it("rejects negative capacity and duplicate capacity roles", () => {
    expectPlanError(
      () =>
        calculateCapacityWarnings(
          [{ role: "AUDITOR", availableHours: -1 }],
          [],
        ),
      "INVALID_CAPACITY",
    );
    expectPlanError(
      () =>
        calculateCapacityWarnings(
          [
            { role: "AUDITOR", availableHours: 10 },
            { role: "AUDITOR", availableHours: 20 },
          ],
          [],
        ),
      "DUPLICATE_CAPACITY_ROLE",
    );
  });
});

describe("calculateCoverage", () => {
  it("counts distinct planned active entities and high/critical coverage", () => {
    const coverage = calculateCoverage({
      plannedEntityIds: ["e1", "e3", "e1", "archived"],
      entities: [
        { id: "e1", riskLevel: "high" },
        { id: "e2", riskLevel: "critical" },
        { id: "e3", riskLevel: "medium" },
        { id: "e4", riskLevel: "low" },
        { id: "e5", riskLevel: null },
      ],
    });

    expect(coverage).toEqual({
      coveredCount: 2,
      totalCount: 5,
      coveragePercent: 40,
      highCriticalCovered: 1,
      highCriticalTotal: 2,
      highCriticalCoveragePercent: 50,
    });
  });

  it("returns zero percentages for an empty universe", () => {
    expect(
      calculateCoverage({ plannedEntityIds: ["e1"], entities: [] }),
    ).toEqual({
      coveredCount: 0,
      totalCount: 0,
      coveragePercent: 0,
      highCriticalCovered: 0,
      highCriticalTotal: 0,
      highCriticalCoveragePercent: 0,
    });
  });
});

describe("validatePlanPeriod", () => {
  it("accepts a period inside the plan year", () => {
    expect(() =>
      validatePlanPeriod({
        year: 2026,
        periodStart: new Date("2026-01-01T00:00:00Z"),
        periodEnd: new Date("2026-12-31T23:59:59Z"),
      }),
    ).not.toThrow();
  });

  it("rejects an inverted period", () => {
    expectPlanError(
      () =>
        validatePlanPeriod({
          year: 2026,
          periodStart: new Date("2026-12-31T00:00:00Z"),
          periodEnd: new Date("2026-01-01T00:00:00Z"),
        }),
      "INVALID_PERIOD",
    );
  });

  it("rejects dates outside the plan year", () => {
    expectPlanError(
      () =>
        validatePlanPeriod({
          year: 2026,
          periodStart: new Date("2025-12-01T00:00:00Z"),
          periodEnd: new Date("2026-12-31T00:00:00Z"),
        }),
      "PERIOD_YEAR_MISMATCH",
    );
    expectPlanError(
      () =>
        validatePlanPeriod({
          year: 2026,
          periodStart: new Date("2026-01-01T00:00:00Z"),
          periodEnd: new Date("2027-01-05T00:00:00Z"),
        }),
      "PERIOD_YEAR_MISMATCH",
    );
  });
});

describe("resolvePlanningRisk", () => {
  it("carries the source score when no override is supplied", () => {
    expect(
      resolvePlanningRisk({
        sourceScore: 3.1,
        sourceLevel: "high",
        thresholds,
        scaleMin: 1,
        scaleMax: 5,
      }),
    ).toEqual({ score: 3.1, level: "high", isOverride: false });
  });

  it("recalculates the level for a justified override", () => {
    expect(
      resolvePlanningRisk({
        sourceScore: 3.1,
        sourceLevel: "high",
        overrideScore: 2,
        overrideReason: "Kontrol baru sudah diuji pada Q4.",
        thresholds,
        scaleMin: 1,
        scaleMax: 5,
      }),
    ).toEqual({ score: 2, level: "medium", isOverride: true });
  });

  it("requires a reason for an override", () => {
    expectPlanError(
      () =>
        resolvePlanningRisk({
          sourceScore: 3.1,
          sourceLevel: "high",
          overrideScore: 2,
          overrideReason: "   ",
          thresholds,
          scaleMin: 1,
          scaleMax: 5,
        }),
      "OVERRIDE_REASON_REQUIRED",
    );
  });

  it("rejects an override outside the model scale", () => {
    expectPlanError(
      () =>
        resolvePlanningRisk({
          sourceScore: 3.1,
          sourceLevel: "high",
          overrideScore: 9,
          overrideReason: "Alasan kuat.",
          thresholds,
          scaleMin: 1,
          scaleMax: 5,
        }),
      "INVALID_OVERRIDE",
    );
  });
});

describe("assertPlanAction", () => {
  it("allows edits only on draft or returned plans", () => {
    expect(() => assertPlanAction("draft", "edit")).not.toThrow();
    expect(() => assertPlanAction("returned", "add_engagement")).not.toThrow();
    expectPlanError(
      () => assertPlanAction("approved", "edit"),
      "INVALID_PLAN_STATUS",
    );
  });

  it("allows approval only from submitted and new versions only from approved", () => {
    expect(() => assertPlanAction("submitted", "approve")).not.toThrow();
    expectPlanError(
      () => assertPlanAction("draft", "approve"),
      "INVALID_PLAN_STATUS",
    );
    expect(() => assertPlanAction("approved", "new_version")).not.toThrow();
    expectPlanError(
      () => assertPlanAction("draft", "new_version"),
      "INVALID_PLAN_STATUS",
    );
  });

  it("allows actuals only after approval", () => {
    expect(() => assertPlanAction("approved", "edit_actuals")).not.toThrow();
    expectPlanError(
      () => assertPlanAction("submitted", "edit_actuals"),
      "INVALID_PLAN_STATUS",
    );
  });
});

describe("assertUniqueEngagement", () => {
  it("rejects an entity already present in the plan", () => {
    expectPlanError(
      () => assertUniqueEngagement(["e1", "e2"], "e2"),
      "DUPLICATE_ENGAGEMENT",
    );
    expect(() => assertUniqueEngagement(["e1"], "e3")).not.toThrow();
  });
});

describe("buildPlanCsv", () => {
  it("emits a header and escapes values with commas and quotes", () => {
    const csv = buildPlanCsv({
      year: 2026,
      name: "Audit Plan 2026",
      version: 1,
      status: "approved",
      engagements: [
        {
          entityCode: "VENDOR",
          entityName: 'Vendor "Master", Phase 1',
          quarter: 1,
          riskScore: 3.59,
          riskLevel: "critical",
          estimatedHours: 160,
          actualHours: 40,
          status: "in_progress",
        },
      ],
    });

    const [header, row] = csv.trim().split("\n");
    expect(header).toBe(
      "Year,Plan,Version,Status,Entity Code,Entity,Quarter,Risk Score,Risk Level,Estimated Hours,Actual Hours,Execution Status",
    );
    expect(row).toBe(
      '2026,Audit Plan 2026,1,approved,VENDOR,"Vendor ""Master"", Phase 1",1,3.59,critical,160,40,in_progress',
    );
  });
});
