import { describe, expect, it } from "vitest";
import {
  assertEngagementTransition,
  calculateRcmCoverage,
  EngagementError,
  engagementTemplates,
  engagementTypes,
  formatEngagementCode,
  getEngagementTemplate,
  instantiateTemplate,
  nextSequenceFromCodes,
  reorderRcmIds,
  validateEngagementAssignment,
  validateEngagementPeriod,
  validateEngagementSource,
  validateRcmRow,
  type TransitionActor,
  type TransitionChecklist,
} from "./engagement";

function expectEngagementError(fn: () => unknown, code: string) {
  try {
    fn();
    throw new Error("expected function to throw");
  } catch (error) {
    expect(error).toBeInstanceOf(EngagementError);
    expect((error as EngagementError).code).toBe(code);
  }
}

const preparer: TransitionActor = {
  canWrite: true,
  canManage: false,
  canIssue: false,
  isPreparer: true,
  isReviewer: false,
  isApprover: false,
};

const manager: TransitionActor = {
  canWrite: true,
  canManage: true,
  canIssue: false,
  isPreparer: false,
  isReviewer: false,
  isApprover: false,
};

const reviewer: TransitionActor = {
  canWrite: false,
  canManage: false,
  canIssue: false,
  isPreparer: false,
  isReviewer: false,
  isApprover: false,
};

const assignedReviewer: TransitionActor = { ...reviewer, isReviewer: true };

const approver: TransitionActor = {
  canWrite: false,
  canManage: true,
  canIssue: true,
  isPreparer: false,
  isReviewer: false,
  isApprover: true,
};

const readyChecklist: TransitionChecklist = {
  hasObjective: true,
  hasScope: true,
  hasSchedule: true,
  rcmRowCount: 2,
  incompleteRcmRows: 0,
  hasPreparer: true,
  hasReviewer: true,
  hasApprover: true,
  note: "",
};

const completeRow = {
  riskDescription: "Akses vendor master tidak dibatasi",
  controlDescription: "Akses berdasarkan role dan approval perubahan",
  assertion: "authorization",
  procedureDescription: "Uji sampel 25 perubahan vendor master",
  evidenceRequirement: "Log perubahan dan approval",
};

describe("validateEngagementAssignment", () => {
  it("accepts three distinct team members", () => {
    expect(() =>
      validateEngagementAssignment({
        preparerId: "usr_auditor",
        reviewerId: "usr_manager",
        approverId: "usr_cae",
      }),
    ).not.toThrow();
  });

  it("requires preparer, reviewer, and approver", () => {
    expectEngagementError(
      () =>
        validateEngagementAssignment({
          preparerId: null,
          reviewerId: "usr_manager",
          approverId: "usr_cae",
        }),
      "ASSIGNMENT_REQUIRED",
    );
    expectEngagementError(
      () =>
        validateEngagementAssignment({
          preparerId: "usr_auditor",
          reviewerId: "",
          approverId: "usr_cae",
        }),
      "ASSIGNMENT_REQUIRED",
    );
    expectEngagementError(
      () =>
        validateEngagementAssignment({
          preparerId: "usr_auditor",
          reviewerId: "usr_manager",
          approverId: undefined,
        }),
      "ASSIGNMENT_REQUIRED",
    );
  });

  it("forbids the preparer from reviewing their own engagement", () => {
    expectEngagementError(
      () =>
        validateEngagementAssignment({
          preparerId: "usr_manager",
          reviewerId: "usr_manager",
          approverId: "usr_cae",
        }),
      "REVIEWER_CONFLICT",
    );
  });

  it("forbids the preparer from approving their own engagement", () => {
    expectEngagementError(
      () =>
        validateEngagementAssignment({
          preparerId: "usr_cae",
          reviewerId: "usr_manager",
          approverId: "usr_cae",
        }),
      "APPROVER_CONFLICT",
    );
  });
});

describe("validateEngagementPeriod", () => {
  it("accepts a valid schedule and budget", () => {
    expect(() =>
      validateEngagementPeriod({
        startDate: new Date("2026-02-01T00:00:00.000Z"),
        endDate: new Date("2026-03-31T00:00:00.000Z"),
        budgetHours: 120,
      }),
    ).not.toThrow();
  });

  it("rejects an end date before the start date", () => {
    expectEngagementError(
      () =>
        validateEngagementPeriod({
          startDate: new Date("2026-04-01T00:00:00.000Z"),
          endDate: new Date("2026-03-01T00:00:00.000Z"),
          budgetHours: 80,
        }),
      "INVALID_PERIOD",
    );
  });

  it("rejects invalid dates", () => {
    expectEngagementError(
      () =>
        validateEngagementPeriod({
          startDate: new Date("not-a-date"),
          endDate: new Date("2026-03-01T00:00:00.000Z"),
          budgetHours: 80,
        }),
      "INVALID_PERIOD",
    );
  });

  it("rejects a non-positive budget", () => {
    expectEngagementError(
      () =>
        validateEngagementPeriod({
          startDate: new Date("2026-02-01T00:00:00.000Z"),
          endDate: new Date("2026-03-01T00:00:00.000Z"),
          budgetHours: 0,
        }),
      "INVALID_BUDGET",
    );
  });
});

describe("validateEngagementSource", () => {
  it("accepts an engagement linked to a plan line", () => {
    expect(() =>
      validateEngagementSource({ planEngagementId: "pe_1", adHocReason: null }),
    ).not.toThrow();
  });

  it("accepts an ad-hoc engagement with a clear reason", () => {
    expect(() =>
      validateEngagementSource({
        planEngagementId: null,
        adHocReason: "Permintaan khusus audit committee atas pengadaan Q2",
      }),
    ).not.toThrow();
  });

  it("requires a reason for ad-hoc engagements", () => {
    expectEngagementError(
      () =>
        validateEngagementSource({ planEngagementId: null, adHocReason: null }),
      "ADHOC_REASON_REQUIRED",
    );
    expectEngagementError(
      () =>
        validateEngagementSource({
          planEngagementId: null,
          adHocReason: "singkat",
        }),
      "ADHOC_REASON_REQUIRED",
    );
  });
});

describe("validateRcmRow", () => {
  it("trims and normalizes a complete row", () => {
    const row = validateRcmRow({
      ...completeRow,
      riskDescription: `  ${completeRow.riskDescription}  `,
      assertion: " Authorization ",
    });

    expect(row.riskDescription).toBe(completeRow.riskDescription);
    expect(row.assertion).toBe("authorization");
  });

  it("rejects rows with missing required fields", () => {
    expectEngagementError(
      () => validateRcmRow({ ...completeRow, riskDescription: "   " }),
      "RCM_FIELD_REQUIRED",
    );
    expectEngagementError(
      () => validateRcmRow({ ...completeRow, controlDescription: "" }),
      "RCM_FIELD_REQUIRED",
    );
    expectEngagementError(
      () => validateRcmRow({ ...completeRow, procedureDescription: "" }),
      "RCM_FIELD_REQUIRED",
    );
    expectEngagementError(
      () => validateRcmRow({ ...completeRow, evidenceRequirement: "" }),
      "RCM_FIELD_REQUIRED",
    );
  });

  it("rejects an unknown assertion", () => {
    expectEngagementError(
      () => validateRcmRow({ ...completeRow, assertion: "vibes" }),
      "INVALID_ASSERTION",
    );
  });
});

describe("calculateRcmCoverage", () => {
  it("reports complete and incomplete rows", () => {
    const coverage = calculateRcmCoverage([
      completeRow,
      { ...completeRow, procedureDescription: "" },
      { ...completeRow, evidenceRequirement: " " },
      { ...completeRow, procedureDescription: "", evidenceRequirement: "" },
    ]);

    expect(coverage.totalRows).toBe(4);
    expect(coverage.completeRows).toBe(1);
    expect(coverage.incompleteRows).toBe(3);
    expect(coverage.rowsMissingProcedure).toBe(2);
    expect(coverage.rowsMissingEvidence).toBe(2);
    expect(coverage.coveragePercent).toBe(25);
  });

  it("returns zero coverage for an empty matrix", () => {
    const coverage = calculateRcmCoverage([]);
    expect(coverage.totalRows).toBe(0);
    expect(coverage.coveragePercent).toBe(0);
  });

  it("returns 100 percent when every row is complete", () => {
    expect(calculateRcmCoverage([completeRow, completeRow]).coveragePercent).toBe(
      100,
    );
  });
});

describe("reorderRcmIds", () => {
  it("returns the requested order when ids match", () => {
    expect(reorderRcmIds(["a", "b", "c"], ["c", "a", "b"])).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("rejects missing or duplicate ids", () => {
    expectEngagementError(
      () => reorderRcmIds(["a", "b", "c"], ["a", "b"]),
      "RCM_REORDER_MISMATCH",
    );
    expectEngagementError(
      () => reorderRcmIds(["a", "b", "c"], ["a", "a", "b"]),
      "RCM_REORDER_MISMATCH",
    );
  });
});

describe("engagement codes", () => {
  it("formats a zero-padded code", () => {
    expect(formatEngagementCode(2026, 1)).toBe("ENG-2026-001");
    expect(formatEngagementCode(2026, 42)).toBe("ENG-2026-042");
  });

  it("derives the next sequence for the same year only", () => {
    expect(
      nextSequenceFromCodes(
        ["ENG-2026-001", "ENG-2026-007", "ENG-2025-020"],
        2026,
      ),
    ).toBe(8);
    expect(nextSequenceFromCodes([], 2026)).toBe(1);
  });
});

describe("engagement templates", () => {
  it("covers every engagement type", () => {
    expect(Object.keys(engagementTemplates).sort()).toEqual(
      [...engagementTypes].sort(),
    );
  });

  it("provides at least two complete RCM rows per template", () => {
    for (const type of engagementTypes) {
      const template = getEngagementTemplate(type);
      expect(template.rows.length).toBeGreaterThanOrEqual(2);
      for (const row of template.rows) {
        expect(() => validateRcmRow(row)).not.toThrow();
      }
    }
  });

  it("instantiates independent copies of the template", () => {
    const first = instantiateTemplate("sox");
    first.rows[0].riskDescription = "diubah";

    const second = instantiateTemplate("sox");
    expect(second.rows[0].riskDescription).not.toBe("diubah");
    expect(second.objective.length).toBeGreaterThan(10);
    expect(second.scope.length).toBeGreaterThan(10);
  });

  it("rejects unknown templates", () => {
    expectEngagementError(() => getEngagementTemplate("forensic"), "INVALID_TEMPLATE");
  });
});

describe("assertEngagementTransition", () => {
  it("lets the preparer start planning when objective and scope are set", () => {
    expect(() =>
      assertEngagementTransition({
        from: "draft",
        to: "planning",
        actor: preparer,
        checklist: readyChecklist,
      }),
    ).not.toThrow();
  });

  it("lets a manager start planning for the team", () => {
    expect(() =>
      assertEngagementTransition({
        from: "draft",
        to: "planning",
        actor: manager,
        checklist: readyChecklist,
      }),
    ).not.toThrow();
  });

  it("rejects an objective-less start", () => {
    expectEngagementError(
      () =>
        assertEngagementTransition({
          from: "draft",
          to: "planning",
          actor: preparer,
          checklist: { ...readyChecklist, hasObjective: false },
        }),
      "CHECKLIST_INCOMPLETE",
    );
  });

  it("rejects transitions that are not part of the workflow", () => {
    expectEngagementError(
      () =>
        assertEngagementTransition({
          from: "draft",
          to: "issued",
          actor: approver,
          checklist: readyChecklist,
        }),
      "INVALID_TRANSITION",
    );
    expectEngagementError(
      () =>
        assertEngagementTransition({
          from: "closed",
          to: "review",
          actor: approver,
          checklist: readyChecklist,
        }),
      "INVALID_TRANSITION",
    );
  });

  it("only lets the preparer move planning into fieldwork", () => {
    expect(() =>
      assertEngagementTransition({
        from: "planning",
        to: "fieldwork",
        actor: preparer,
        checklist: readyChecklist,
      }),
    ).not.toThrow();
    expectEngagementError(
      () =>
        assertEngagementTransition({
          from: "planning",
          to: "fieldwork",
          actor: manager,
          checklist: readyChecklist,
        }),
      "TRANSITION_FORBIDDEN",
    );
  });

  it("blocks fieldwork with incomplete RCM coverage", () => {
    expectEngagementError(
      () =>
        assertEngagementTransition({
          from: "planning",
          to: "fieldwork",
          actor: preparer,
          checklist: { ...readyChecklist, incompleteRcmRows: 1 },
        }),
      "CHECKLIST_INCOMPLETE",
    );
    expectEngagementError(
      () =>
        assertEngagementTransition({
          from: "planning",
          to: "fieldwork",
          actor: preparer,
          checklist: { ...readyChecklist, rcmRowCount: 0 },
        }),
      "CHECKLIST_INCOMPLETE",
    );
  });

  it("requires the preparer to submit fieldwork for review", () => {
    expect(() =>
      assertEngagementTransition({
        from: "fieldwork",
        to: "review",
        actor: preparer,
        checklist: readyChecklist,
      }),
    ).not.toThrow();
    expectEngagementError(
      () =>
        assertEngagementTransition({
          from: "fieldwork",
          to: "review",
          actor: manager,
          checklist: readyChecklist,
        }),
      "TRANSITION_FORBIDDEN",
    );
  });

  it("lets only the assigned approver issue a reviewed engagement", () => {
    expect(() =>
      assertEngagementTransition({
        from: "review",
        to: "issued",
        actor: approver,
        checklist: readyChecklist,
      }),
    ).not.toThrow();
    expectEngagementError(
      () =>
        assertEngagementTransition({
          from: "review",
          to: "issued",
          actor: preparer,
          checklist: readyChecklist,
        }),
      "TRANSITION_FORBIDDEN",
    );
    expectEngagementError(
      () =>
        assertEngagementTransition({
          from: "review",
          to: "issued",
          actor: approver,
          checklist: { ...readyChecklist, hasApprover: false },
        }),
      "CHECKLIST_INCOMPLETE",
    );
  });

  it("requires a note when the reviewer sends work back", () => {
    expectEngagementError(
      () =>
        assertEngagementTransition({
          from: "review",
          to: "fieldwork",
          actor: assignedReviewer,
          checklist: { ...readyChecklist, note: "  " },
        }),
      "TRANSITION_NOTE_REQUIRED",
    );
    expect(() =>
      assertEngagementTransition({
        from: "review",
        to: "fieldwork",
        actor: assignedReviewer,
        checklist: { ...readyChecklist, note: "Lengkapi evidence untuk dua prosedur" },
      }),
    ).not.toThrow();
  });

  it("lets the approver close an issued engagement", () => {
    expect(() =>
      assertEngagementTransition({
        from: "issued",
        to: "closed",
        actor: approver,
        checklist: readyChecklist,
      }),
    ).not.toThrow();
    expectEngagementError(
      () =>
        assertEngagementTransition({
          from: "issued",
          to: "closed",
          actor: reviewer,
          checklist: readyChecklist,
        }),
      "TRANSITION_FORBIDDEN",
    );
  });
});
