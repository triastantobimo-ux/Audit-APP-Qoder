import { describe, expect, it } from "vitest";
import {
  assertFindingEditable,
  assertFindingTransition,
  findingReadiness,
  findingStatusLabels,
  isFindingOverdue,
  isUpdatableFindingStatus,
  nextFindingReference,
  parseDueDate,
  summarizeRemediation,
  validateFindingFields,
  validateFindingUpdate,
  validateManagementResponse,
  validateSeverity,
  findingStatuses,
  FindingError,
  type FindingActor,
  type FindingGate,
} from "./finding";

function expectFindingError(fn: () => unknown, code: string) {
  try {
    fn();
    throw new Error("expected function to throw");
  } catch (error) {
    expect(error).toBeInstanceOf(FindingError);
    expect((error as FindingError).code).toBe(code);
  }
}

const auditor: FindingActor = {
  isOwner: false,
  canWrite: true,
  canValidate: true,
  canAcceptRisk: true,
};

const owner: FindingActor = {
  isOwner: true,
  canWrite: false,
  canValidate: false,
  canAcceptRisk: false,
};

const outsider: FindingActor = {
  isOwner: false,
  canWrite: false,
  canValidate: false,
  canAcceptRisk: false,
};

const openGate: FindingGate = {
  hasCondition: true,
  hasCriteria: true,
  hasCause: true,
  hasEffect: true,
  hasRecommendation: true,
  hasOwner: true,
  hasDueDate: true,
  hasResponse: true,
  hasPlannedAction: true,
};

const emptyGate: FindingGate = {
  hasCondition: false,
  hasCriteria: false,
  hasCause: false,
  hasEffect: false,
  hasRecommendation: false,
  hasOwner: false,
  hasDueDate: false,
  hasResponse: false,
  hasPlannedAction: false,
};

const dueDate = new Date("2026-12-31T00:00:00Z");

function transition(
  input: Partial<Parameters<typeof assertFindingTransition>[0]> = {},
) {
  return () =>
    assertFindingTransition({
      from: "draft",
      to: "communicated",
      actor: auditor,
      gate: openGate,
      dueDate,
      now: new Date("2026-10-24T00:00:00Z"),
      ...input,
    });
}

describe("nextFindingReference", () => {
  it("starts a fresh register at TD-001", () => {
    expect(nextFindingReference([])).toBe("TD-001");
  });

  it("increments past the highest existing reference", () => {
    expect(nextFindingReference(["TD-001", "TD-009", "TD-012"])).toBe("TD-013");
  });

  it("ignores references from other series", () => {
    expect(nextFindingReference(["WP-004", "TD-002", "temuan lama"])).toBe("TD-003");
  });
});

describe("validateFindingFields", () => {
  const complete = {
    title: "Approval master vendor tidak lengkap",
    condition: "Tiga dari 25 perubahan master vendor tidak memiliki approval lapis kedua.",
    criteria: "Kebijakan GA-04 mewajibkan approval berlapis untuk perubahan master.",
  };

  it("trims and returns the raising fields", () => {
    expect(validateFindingFields(complete)).toEqual({
      title: "Approval master vendor tidak lengkap",
      condition: complete.condition,
      criteria: complete.criteria,
    });
  });

  it("accepts optional analysis fields untouched", () => {
    const result = validateFindingFields({
      ...complete,
      cause: "Sistem tidak memblokir perubahan tanpa approver kedua.",
      effect: "Perubahan master berisiko tidak sah lolos ke produksi.",
      recommendation: "Aktifkan validasi dua tingkat pada modul master vendor.",
    });

    expect(result.cause).toBe("Sistem tidak memblokir perubahan tanpa approver kedua.");
    expect(result.recommendation).toBe(
      "Aktifkan validasi dua tingkat pada modul master vendor.",
    );
  });

  it("requires a title", () => {
    expectFindingError(
      () => validateFindingFields({ ...complete, title: "  " }),
      "TITLE_REQUIRED",
    );
  });

  it("requires the condition", () => {
    expectFindingError(
      () => validateFindingFields({ ...complete, condition: "" }),
      "CONDITION_REQUIRED",
    );
  });

  it("requires the criteria", () => {
    expectFindingError(
      () => validateFindingFields({ ...complete, criteria: null }),
      "CRITERIA_REQUIRED",
    );
  });
});

describe("parseDueDate", () => {
  it("reads an ISO calendar date", () => {
    expect(parseDueDate("2026-12-31")).toEqual(new Date("2026-12-31T00:00:00Z"));
  });

  it("rejects an unparseable due date", () => {
    expectFindingError(() => parseDueDate("kuarto depan"), "INVALID_DUE_DATE");
  });
});

describe("validateManagementResponse", () => {
  const response = {
    response: "Manajemen menerima temuan dan akan memperbaiki modul master vendor.",
    plannedAction: "Menambahkan validasi approver kedua dan retest sampel.",
    ownerUserId: "usr_owner",
    dueDate: "2026-12-31",
  };

  it("normalises a complete action plan", () => {
    expect(validateManagementResponse(response)).toEqual({
      response: response.response,
      plannedAction: response.plannedAction,
      ownerUserId: "usr_owner",
      dueDate: new Date("2026-12-31T00:00:00Z"),
    });
  });

  it("requires a management response", () => {
    expectFindingError(
      () => validateManagementResponse({ ...response, response: "   " }),
      "RESPONSE_REQUIRED",
    );
  });

  it("requires a planned action", () => {
    expectFindingError(
      () => validateManagementResponse({ ...response, plannedAction: "" }),
      "PLANNED_ACTION_REQUIRED",
    );
  });

  it("requires a remediation owner", () => {
    expectFindingError(
      () => validateManagementResponse({ ...response, ownerUserId: "" }),
      "OWNER_REQUIRED",
    );
  });

  it("rejects a due date that is not a valid date", () => {
    expectFindingError(
      () => validateManagementResponse({ ...response, dueDate: "bulan depan" }),
      "INVALID_DUE_DATE",
    );
  });
});

describe("assertFindingTransition", () => {
  it("communicates a finding that carries the full five C analysis", () => {
    expect(transition()).not.toThrow();
  });

  it("refuses to communicate without a cause", () => {
    expectFindingError(
      transition({ gate: { ...openGate, hasCause: false } }),
      "CAUSE_REQUIRED",
    );
  });

  it("refuses to communicate without an effect", () => {
    expectFindingError(
      transition({ gate: { ...openGate, hasEffect: false } }),
      "EFFECT_REQUIRED",
    );
  });

  it("refuses to communicate without a recommendation", () => {
    expectFindingError(
      transition({ gate: { ...openGate, hasRecommendation: false } }),
      "RECOMMENDATION_REQUIRED",
    );
  });

  it("refuses to communicate without an owner and a due date", () => {
    expectFindingError(
      transition({ gate: { ...openGate, hasOwner: false } }),
      "OWNER_REQUIRED",
    );
    expectFindingError(
      transition({ gate: { ...openGate, hasDueDate: false } }),
      "DUE_DATE_REQUIRED",
    );
  });

  it("stops anyone but the assigned owner from responding", () => {
    expectFindingError(
      transition({ from: "communicated", to: "in_remediation", actor: auditor }),
      "RESPONSE_FORBIDDEN",
    );
  });

  it("requires a real action plan when the owner responds", () => {
    expectFindingError(
      transition({
        from: "communicated",
        to: "in_remediation",
        actor: owner,
        gate: { ...openGate, hasPlannedAction: false },
      }),
      "PLANNED_ACTION_REQUIRED",
    );
  });

  it("lets the owner submit finished remediation for validation", () => {
    expect(
      transition({ from: "in_remediation", to: "pending_validation", actor: owner }),
    ).not.toThrow();
  });

  it("closes a validated finding through the auditor, not the owner", () => {
    expect(
      transition({ from: "pending_validation", to: "closed", actor: auditor }),
    ).not.toThrow();
    expectFindingError(
      transition({ from: "pending_validation", to: "closed", actor: owner }),
      "VALIDATOR_IS_OWNER",
    );
  });

  it("requires a reason when sending a finding back for rework", () => {
    expectFindingError(
      transition({ from: "pending_validation", to: "reopened", actor: auditor, note: null }),
      "REOPEN_NOTE_REQUIRED",
    );
    expect(
      transition({
        from: "pending_validation",
        to: "reopened",
        actor: auditor,
        note: "Bukti retest belum melampirkan sampel ketiga.",
      }),
    ).not.toThrow();
  });

  it("sends a reopened finding back into remediation", () => {
    expect(
      transition({ from: "reopened", to: "in_remediation", actor: owner }),
    ).not.toThrow();
  });

  it("reopens a closed finding only with a validation note", () => {
    expectFindingError(
      transition({ from: "closed", to: "reopened", actor: auditor, note: "" }),
      "REOPEN_NOTE_REQUIRED",
    );
  });

  it("accepts residual risk only with authority and a written justification", () => {
    expectFindingError(
      transition({ from: "in_remediation", to: "accepted_risk", actor: owner, note: "ok" }),
      "RISK_ACCEPT_FORBIDDEN",
    );
    expectFindingError(
      transition({
        from: "in_remediation",
        to: "accepted_risk",
        actor: auditor,
        note: "  ",
      }),
      "RISK_ACCEPT_JUSTIFICATION_REQUIRED",
    );
    expect(
      transition({
        from: "in_remediation",
        to: "accepted_risk",
        actor: auditor,
        note: "Manajemen menerima residual risiko; compensating control dipantau kuartalan.",
      }),
    ).not.toThrow();
  });

  it("rejects transitions that skip a step", () => {
    expectFindingError(
      transition({ to: "pending_validation", actor: auditor }),
      "INVALID_FINDING_TRANSITION",
    );
  });

  it("keeps accepted risk terminal", () => {
    expectFindingError(
      transition({ from: "accepted_risk", to: "in_remediation", actor: owner }),
      "INVALID_FINDING_TRANSITION",
    );
  });

  it("refuses every transition for someone without a role in the finding", () => {
    expectFindingError(transition({ actor: outsider }), "FINDING_TRANSITION_FORBIDDEN");
  });
});

describe("isFindingOverdue", () => {
  it("flags an open finding whose due date has passed", () => {
    expect(
      isFindingOverdue({
        status: "in_remediation",
        dueDate: new Date("2026-10-01T00:00:00Z"),
        now: new Date("2026-10-24T00:00:00Z"),
      }),
    ).toBe(true);
  });

  it("does not flag a finding that is still within its due date", () => {
    expect(
      isFindingOverdue({
        status: "in_remediation",
        dueDate: new Date("2026-11-30T00:00:00Z"),
        now: new Date("2026-10-24T00:00:00Z"),
      }),
    ).toBe(false);
  });

  it("does not flag work that no longer needs remediation", () => {
    for (const status of ["closed", "accepted_risk", "pending_validation"] as const) {
      expect(
        isFindingOverdue({
          status,
          dueDate: new Date("2026-10-01T00:00:00Z"),
          now: new Date("2026-10-24T00:00:00Z"),
        }),
      ).toBe(false);
    }
  });

  it("does not flag a finding without a due date", () => {
    expect(
      isFindingOverdue({ status: "in_remediation", dueDate: null, now: new Date() }),
    ).toBe(false);
  });
});

describe("summarizeRemediation", () => {
  const now = new Date("2026-10-24T00:00:00Z");

  it("reports an empty register without dividing by zero", () => {
    expect(summarizeRemediation({ items: [], now })).toEqual({
      total: 0,
      open: 0,
      pendingValidation: 0,
      closed: 0,
      acceptedRisk: 0,
      overdue: 0,
      closureRatePercent: 0,
      averageDaysToClose: null,
      aging: {
        notDue: 0,
        late1to30: 0,
        late31to60: 0,
        late61to90: 0,
        lateOver90: 0,
      },
    });
  });

  it("counts each state once and derives the closure rate", () => {
    const summary = summarizeRemediation({
      now,
      items: [
        { status: "draft", dueDate: null, closedAt: null },
        { status: "communicated", dueDate: new Date("2026-12-01T00:00:00Z"), closedAt: null },
        { status: "in_remediation", dueDate: new Date("2026-09-30T00:00:00Z"), closedAt: null },
        { status: "pending_validation", dueDate: new Date("2026-10-01T00:00:00Z"), closedAt: null },
        {
          status: "closed",
          dueDate: new Date("2026-09-01T00:00:00Z"),
          closedAt: new Date("2026-09-11T00:00:00Z"),
        },
        { status: "accepted_risk", dueDate: new Date("2026-08-01T00:00:00Z"), closedAt: null },
      ],
    });

    expect(summary).toMatchObject({
      total: 6,
      open: 3,
      pendingValidation: 1,
      closed: 1,
      acceptedRisk: 1,
      overdue: 1,
      closureRatePercent: 33,
    });
  });

  it("buckets overdue findings by how late they are", () => {
    const summary = summarizeRemediation({
      now,
      items: [
        { status: "in_remediation", dueDate: new Date("2026-12-01T00:00:00Z"), closedAt: null },
        { status: "in_remediation", dueDate: new Date("2026-10-10T00:00:00Z"), closedAt: null },
        { status: "reopened", dueDate: new Date("2026-09-01T00:00:00Z"), closedAt: null },
        { status: "communicated", dueDate: new Date("2026-08-10T00:00:00Z"), closedAt: null },
        { status: "communicated", dueDate: new Date("2026-06-01T00:00:00Z"), closedAt: null },
      ],
    });

    expect(summary.aging).toEqual({
      notDue: 1,
      late1to30: 1,
      late31to60: 1,
      late61to90: 1,
      lateOver90: 1,
    });
  });

  it("averages the days taken to close validated findings", () => {
    const summary = summarizeRemediation({
      now,
      items: [
        {
          status: "closed",
          dueDate: null,
          closedAt: new Date("2026-01-11T00:00:00Z"),
          createdAt: new Date("2026-01-01T00:00:00Z"),
        },
        {
          status: "closed",
          dueDate: null,
          closedAt: new Date("2026-02-05T00:00:00Z"),
          createdAt: new Date("2026-02-01T00:00:00Z"),
        },
        { status: "closed", dueDate: null, closedAt: new Date("2026-03-01T00:00:00Z") },
      ],
    });

    expect(summary.averageDaysToClose).toBe(7);
  });
});

describe("assertFindingEditable", () => {
  it("allows edits while the finding is being raised, remediated, or validated", () => {
    for (const status of [
      "draft",
      "communicated",
      "in_remediation",
      "pending_validation",
      "reopened",
    ] as const) {
      expect(() => assertFindingEditable(status)).not.toThrow();
    }
  });

  it("locks the finding once it is closed or the risk is accepted", () => {
    expectFindingError(() => assertFindingEditable("closed"), "FINDING_LOCKED");
    expectFindingError(() => assertFindingEditable("accepted_risk"), "FINDING_LOCKED");
  });
});

describe("validateSeverity", () => {
  it("keeps a known severity", () => {
    expect(validateSeverity("high")).toBe("high");
  });

  it("rejects an unknown severity", () => {
    expectFindingError(() => validateSeverity("sedang"), "INVALID_SEVERITY");
  });
});

describe("validateFindingUpdate", () => {
  it("trims a progress note", () => {
    expect(
      validateFindingUpdate({
        body: "  Perbaikan sudah masuk rilis 2.14 dan sedang diuji oleh IT.  ",
        status: "in_remediation",
        progressPercent: 60,
      }),
    ).toEqual({
      body: "Perbaikan sudah masuk rilis 2.14 dan sedang diuji oleh IT.",
      status: "in_remediation",
      progressPercent: 60,
    });
  });

  it("requires a substantive progress note", () => {
    expectFindingError(
      () => validateFindingUpdate({ body: "ok", status: "in_remediation", progressPercent: 10 }),
      "UPDATE_BODY_TOO_SHORT",
    );
  });

  it("requires a progress note at all", () => {
    expectFindingError(
      () => validateFindingUpdate({ body: "   ", status: "in_remediation", progressPercent: 10 }),
      "UPDATE_BODY_REQUIRED",
    );
  });

  it("rejects progress outside the remediation statuses", () => {
    expectFindingError(
      () => validateFindingUpdate({ body: "Masih menunggu persetujuan CAE.", status: "closed", progressPercent: 0 }),
      "INVALID_UPDATE_STATUS",
    );
  });

  it("keeps progress percent within bounds", () => {
    expectFindingError(
      () =>
        validateFindingUpdate({
          body: "Sedang menunggu completion patch.",
          status: "in_remediation",
          progressPercent: 140,
        }),
      "INVALID_PROGRESS",
    );
  });
});

describe("isUpdatableFindingStatus", () => {
  function isAccepted(status: string) {
    try {
      validateFindingUpdate({
        body: "Catatan progres remediasi yang memadai.",
        status,
        progressPercent: 20,
      });
      return true;
    } catch (error) {
      if (error instanceof FindingError && error.code === "INVALID_UPDATE_STATUS") return false;
      throw error;
    }
  }

  it("tracks exactly the statuses that accept a progress note", () => {
    for (const status of findingStatuses) {
      expect(isUpdatableFindingStatus(status)).toBe(isAccepted(status));
    }
  });

  it("keeps draft, closed and accepted-risk findings out of the progress log", () => {
    for (const status of ["draft", "closed", "accepted_risk"]) {
      expect(isUpdatableFindingStatus(status)).toBe(false);
    }
  });
});

describe("findingStatusLabels", () => {
  it("labels every status shown in the register", () => {
    for (const status of findingStatuses) {
      expect(findingStatusLabels[status]).toBeTruthy();
    }
  });
});

describe("findingReadiness", () => {
  it("reports readiness when the five C and the action plan are complete", () => {
    expect(findingReadiness(openGate)).toEqual({ ready: true, missing: [] });
  });

  it("lists every element still missing before communication", () => {
    expect(
      findingReadiness({ ...emptyGate, hasCondition: true, hasCriteria: true }).missing,
    ).toEqual([
      "Sebab temuan",
      "Akibat temuan",
      "Rekomendasi",
      "Penanggung jawab remediasi",
      "Target penyelesaian",
    ]);
  });
});
