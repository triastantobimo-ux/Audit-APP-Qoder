import { describe, expect, it } from "vitest";
import {
  assertEvidenceDeletable,
  assertWorkpaperAssignment,
  assertWorkpaperEditable,
  assertWorkpaperTransition,
  instantiateWorkpaperTemplate,
  nextEvidenceVersion,
  nextWorkpaperReference,
  resolveNote,
  safeEvidenceFileName,
  summarizeWorkpaperPackage,
  validateEvidence,
  validateNote,
  validateWorkpaperFields,
  workpaperTemplates,
  WorkpaperError,
  type WorkpaperActor,
  type WorkpaperGate,
} from "./workpaper";

function expectWorkpaperError(fn: () => unknown, code: string) {
  try {
    fn();
    throw new Error("expected function to throw");
  } catch (error) {
    expect(error).toBeInstanceOf(WorkpaperError);
    expect((error as WorkpaperError).code).toBe(code);
  }
}

const auditor: WorkpaperActor = {
  canWrite: true,
  canReview: false,
  canSignOff: false,
  isPreparer: true,
  isReviewer: false,
  isAuthor: false,
  isAssignee: false,
};

const reviewer: WorkpaperActor = {
  canWrite: false,
  canReview: true,
  canSignOff: true,
  isPreparer: false,
  isReviewer: true,
  isAuthor: false,
  isAssignee: false,
};

const manager: WorkpaperActor = {
  canWrite: true,
  canReview: true,
  canSignOff: false,
  isPreparer: false,
  isReviewer: false,
  isAuthor: false,
  isAssignee: false,
};

const gate = (over: Partial<WorkpaperGate> = {}): WorkpaperGate => ({
  hasConclusion: true,
  evidenceCount: 2,
  openBlockingNotes: 0,
  ...over,
});

describe("nextWorkpaperReference", () => {
  it("starts at WP-001 for an empty engagement", () => {
    expect(nextWorkpaperReference([])).toBe("WP-001");
  });

  it("increments past the highest existing reference", () => {
    expect(nextWorkpaperReference(["WP-001", "WP-004", "WP-002"])).toBe("WP-005");
  });

  it("ignores foreign references", () => {
    expect(nextWorkpaperReference(["WP-001", "ENG-2026-001"])).toBe("WP-002");
  });
});

describe("validateWorkpaperFields", () => {
  it("trims and returns complete fields", () => {
    const result = validateWorkpaperFields({
      title: "  Uji pengendalian PO  ",
      purpose: "Kesimpulan uji pengendalian atas approval PO.",
      procedure: "Ambil 25 sampel PO dan telusuri approvalnya.",
      conclusion: "Pengendalian berjalan efektif.",
    });

    expect(result.title).toBe("Uji pengendalian PO");
    expect(result.conclusion).toBe("Pengendalian berjalan efektif.");
  });

  it("rejects a blank title", () => {
    expectWorkpaperError(
      () =>
        validateWorkpaperFields({
          title: "   ",
          purpose: "p",
          procedure: "q",
        }),
      "TITLE_REQUIRED",
    );
  });

  it("rejects a blank procedure", () => {
    expectWorkpaperError(
      () =>
        validateWorkpaperFields({
          title: "t",
          purpose: "p",
          procedure: "",
        }),
      "PROCEDURE_REQUIRED",
    );
  });

  it("rejects a blank purpose", () => {
    expectWorkpaperError(
      () =>
        validateWorkpaperFields({
          title: "t",
          purpose: " ",
          procedure: "q",
        }),
      "PURPOSE_REQUIRED",
    );
  });

  it("allows an empty conclusion while drafting", () => {
    const result = validateWorkpaperFields({
      title: "t",
      purpose: "p",
      procedure: "q",
      conclusion: "   ",
    });

    expect(result.conclusion).toBe("");
  });
});

describe("assertWorkpaperTransition", () => {
  it("lets the preparer submit a draft for review", () => {
    expect(() =>
      assertWorkpaperTransition({
        from: "draft",
        to: "in_review",
        actor: auditor,
        gate: gate(),
      }),
    ).not.toThrow();
  });

  it("blocks submission without any evidence", () => {
    expectWorkpaperError(
      () =>
        assertWorkpaperTransition({
          from: "draft",
          to: "in_review",
          actor: auditor,
          gate: gate({ evidenceCount: 0 }),
        }),
      "EVIDENCE_REQUIRED",
    );
  });

  it("blocks submission by someone who is not the preparer or a manager", () => {
    expectWorkpaperError(
      () =>
        assertWorkpaperTransition({
          from: "draft",
          to: "in_review",
          actor: reviewer,
          gate: gate(),
        }),
      "WORKPAPER_TRANSITION_FORBIDDEN",
    );
  });

  it("marks review complete only for the assigned reviewer", () => {
    expectWorkpaperError(
      () =>
        assertWorkpaperTransition({
          from: "in_review",
          to: "reviewed",
          actor: manager,
          gate: gate(),
        }),
      "REVIEWER_NOT_ASSIGNED",
    );
  });

  it("signs off when the assigned reviewer has no blocking notes", () => {
    expect(() =>
      assertWorkpaperTransition({
        from: "reviewed",
        to: "signed_off",
        actor: reviewer,
        gate: gate(),
      }),
    ).not.toThrow();
  });

  it("blocks sign-off while a blocking note is open", () => {
    expectWorkpaperError(
      () =>
        assertWorkpaperTransition({
          from: "reviewed",
          to: "signed_off",
          actor: reviewer,
          gate: gate({ openBlockingNotes: 1 }),
        }),
      "BLOCKING_NOTES_OPEN",
    );
  });

  it("blocks sign-off without a conclusion", () => {
    expectWorkpaperError(
      () =>
        assertWorkpaperTransition({
          from: "reviewed",
          to: "signed_off",
          actor: reviewer,
          gate: gate({ hasConclusion: false }),
        }),
      "CONCLUSION_REQUIRED",
    );
  });

  it("blocks self sign-off by the preparer", () => {
    expectWorkpaperError(
      () =>
        assertWorkpaperTransition({
          from: "reviewed",
          to: "signed_off",
          actor: { ...auditor, canSignOff: true, isReviewer: true },
          gate: gate(),
        }),
      "SELF_SIGNOFF_FORBIDDEN",
    );
  });

  it("returns a workpaper for rework with a note", () => {
    expect(() =>
      assertWorkpaperTransition({
        from: "in_review",
        to: "draft",
        actor: reviewer,
        gate: gate(),
        note: "Perluas sampel ke 40 PO.",
      }),
    ).not.toThrow();
  });

  it("requires a note when returning for rework", () => {
    expectWorkpaperError(
      () =>
        assertWorkpaperTransition({
          from: "in_review",
          to: "draft",
          actor: reviewer,
          gate: gate(),
          note: "  ",
        }),
      "RETURN_NOTE_REQUIRED",
    );
  });

  it("rejects skipping straight from draft to signed off", () => {
    expectWorkpaperError(
      () =>
        assertWorkpaperTransition({
          from: "draft",
          to: "signed_off",
          actor: reviewer,
          gate: gate(),
        }),
      "INVALID_WORKPAPER_TRANSITION",
    );
  });

  it("keeps a signed-off workpaper frozen", () => {
    expectWorkpaperError(
      () =>
        assertWorkpaperTransition({
          from: "signed_off",
          to: "draft",
          actor: { ...reviewer, canWrite: true },
          gate: gate(),
          note: "reopening",
        }),
      "WORKPAPER_LOCKED",
    );
  });
});

describe("validateNote", () => {
  it("normalises a valid note", () => {
    const note = validateNote({
      body: "  Evidence call-back belum dilampirkan  ",
      severity: "blocking",
      assigneeId: "usr_auditor",
    });

    expect(note.body).toBe("Evidence call-back belum dilampirkan");
    expect(note.severity).toBe("blocking");
    expect(note.assigneeId).toBe("usr_auditor");
  });

  it("rejects an empty body", () => {
    expectWorkpaperError(
      () => validateNote({ body: "  ", severity: "minor" }),
      "NOTE_BODY_REQUIRED",
    );
  });

  it("rejects an unknown severity", () => {
    expectWorkpaperError(
      () =>
        validateNote({
          body: "ok",
          severity: "catastrophic" as "minor",
        }),
      "INVALID_SEVERITY",
    );
  });
});

describe("resolveNote", () => {
  const openNote = { status: "open" as const, authorId: "usr_manager" };

  it("resolves with a substantive comment", () => {
    const result = resolveNote({
      note: openNote,
      actor: auditor,
      resolution: "Bukti call-back sudah dilampirkan pada WP-002.",
    });

    expect(result.status).toBe("resolved");
    expect(result.resolution).toBe(
      "Bukti call-back sudah dilampirkan pada WP-002.",
    );
  });

  it("requires a substantive resolution comment", () => {
    expectWorkpaperError(
      () => resolveNote({ note: openNote, actor: auditor, resolution: "ok" }),
      "RESOLUTION_REQUIRED",
    );
  });

  it("rejects resolving an already resolved note", () => {
    expectWorkpaperError(
      () =>
        resolveNote({
          note: { status: "resolved", authorId: "usr_manager" },
          actor: auditor,
          resolution: "Perbaikan sudah dilakukan dan terbukti.",
        }),
      "NOTE_ALREADY_RESOLVED",
    );
  });

  it("lets only the author, assignee, preparer, or a reviewer resolve a note", () => {
    expectWorkpaperError(
      () =>
        resolveNote({
          note: openNote,
          actor: {
            canWrite: false,
            canReview: false,
            canSignOff: false,
            isPreparer: false,
            isReviewer: false,
            isAuthor: false,
            isAssignee: false,
          },
          resolution: "Perbaikan sudah dilakukan dan terbukti.",
        }),
      "NOTE_RESOLVE_FORBIDDEN",
    );
  });
});

describe("validateEvidence", () => {
  const valid = {
    fileName: "approval-matrix.pdf",
    mimeType: "application/pdf",
    sizeBytes: 18_234,
    sha256: "a".repeat(64),
    source: "client_system",
    periodLabel: "Q1 2026",
    capturedAt: "2026-03-31",
  };

  it("normalises metadata", () => {
    const result = validateEvidence(valid);

    expect(result.fileName).toBe("approval-matrix.pdf");
    expect(result.source).toBe("client_system");
    expect(result.version).toBe(1);
  });

  it("rejects a malformed hash", () => {
    expectWorkpaperError(
      () => validateEvidence({ ...valid, sha256: "deadbeef" }),
      "INVALID_HASH",
    );
  });

  it("rejects files above the size limit", () => {
    expectWorkpaperError(
      () => validateEvidence({ ...valid, sizeBytes: 26 * 1024 * 1024 }),
      "FILE_TOO_LARGE",
    );
  });

  it("rejects an invalid capture date", () => {
    expectWorkpaperError(
      () => validateEvidence({ ...valid, capturedAt: "31/03/2026" }),
      "INVALID_CAPTURE_DATE",
    );
  });

  it("rejects a non-positive version", () => {
    expectWorkpaperError(
      () => validateEvidence({ ...valid, version: 0 }),
      "INVALID_VERSION",
    );
  });

  it("rejects a blank file name", () => {
    expectWorkpaperError(
      () => validateEvidence({ ...valid, fileName: "  " }),
      "FILE_NAME_REQUIRED",
    );
  });

  it("rejects an unknown evidence source", () => {
    expectWorkpaperError(
      () => validateEvidence({ ...valid, source: "telepathy" }),
      "INVALID_SOURCE",
    );
  });
});

describe("safeEvidenceFileName", () => {
  it("strips directory traversal", () => {
    expect(safeEvidenceFileName("../../etc/passwd")).toBe("etc-passwd");
  });

  it("replaces spaces but keeps the extension", () => {
    expect(safeEvidenceFileName("Faktur Pajak Q1.pdf")).toBe(
      "Faktur_Pajak_Q1.pdf",
    );
  });

  it("falls back for an empty name", () => {
    expect(safeEvidenceFileName("   ")).toBe("evidence.bin");
  });

  it("removes control characters", () => {
    expect(safeEvidenceFileName("no\u0000control.txt")).toBe("nocontrol.txt");
  });
});

describe("nextEvidenceVersion", () => {
  it("starts at version one", () => {
    expect(nextEvidenceVersion([])).toBe(1);
  });

  it("never overwrites an existing version", () => {
    expect(nextEvidenceVersion([1, 2, 3])).toBe(4);
  });
});

describe("assertEvidenceDeletable", () => {
  it("allows a soft delete on an editable workpaper", () => {
    expect(() =>
      assertEvidenceDeletable({
        workpaperStatus: "in_review",
        alreadyDeleted: false,
        actor: auditor,
      }),
    ).not.toThrow();
  });

  it("blocks deletion after sign-off", () => {
    expectWorkpaperError(
      () =>
        assertEvidenceDeletable({
          workpaperStatus: "signed_off",
          alreadyDeleted: false,
          actor: auditor,
        }),
      "EVIDENCE_LOCKED",
    );
  });

  it("blocks deletion by someone without write access", () => {
    expectWorkpaperError(
      () =>
        assertEvidenceDeletable({
          workpaperStatus: "draft",
          alreadyDeleted: false,
          actor: reviewer,
        }),
      "EVIDENCE_DELETE_FORBIDDEN",
    );
  });

  it("rejects deleting an already deleted file", () => {
    expectWorkpaperError(
      () =>
        assertEvidenceDeletable({
          workpaperStatus: "draft",
          alreadyDeleted: true,
          actor: auditor,
        }),
      "EVIDENCE_ALREADY_DELETED",
    );
  });
});

describe("instantiateWorkpaperTemplate", () => {
  it("exposes the agreed templates", () => {
    expect(Object.keys(workpaperTemplates).sort()).toEqual([
      "analytical_review",
      "substantive_test",
      "test_of_control",
    ]);
  });

  it("returns a deep copy so edits do not leak between workpapers", () => {
    const first = instantiateWorkpaperTemplate("test_of_control");
    first.procedure = "diubah";

    expect(instantiateWorkpaperTemplate("test_of_control").procedure).not.toBe(
      "diubah",
    );
  });

  it("rejects an unknown template", () => {
    expectWorkpaperError(
      () => instantiateWorkpaperTemplate("nope" as "test_of_control"),
      "INVALID_TEMPLATE",
    );
  });
});

describe("summarizeWorkpaperPackage", () => {
  it("reports a complete signed-off package", () => {
    const summary = summarizeWorkpaperPackage({
      status: "signed_off",
      evidenceCount: 2,
      openNotes: 0,
      openBlockingNotes: 0,
      hasConclusion: true,
    });

    expect(summary.complete).toBe(true);
    expect(summary.missing).toEqual([]);
  });

  it("withholds completeness while any note is still open", () => {
    const summary = summarizeWorkpaperPackage({
      status: "reviewed",
      evidenceCount: 1,
      openNotes: 1,
      openBlockingNotes: 0,
      hasConclusion: true,
    });

    expect(summary.complete).toBe(false);
    expect(summary.missing).toEqual(["Belum ditandatangani reviewer"]);
  });

  it("lists what a draft package is missing", () => {
    const summary = summarizeWorkpaperPackage({
      status: "draft",
      evidenceCount: 0,
      openNotes: 2,
      openBlockingNotes: 1,
      hasConclusion: false,
    });

    expect(summary.complete).toBe(false);
    expect(summary.missing).toEqual([
      "Kesimpulan belum ditulis",
      "Belum ada evidence",
      "1 catatan blocking masih open",
      "Belum ditandatangani reviewer",
    ]);
  });
});

describe("assertWorkpaperAssignment", () => {
  const team = {
    preparerId: "usr_auditor",
    reviewerId: "usr_manager",
    approverId: "usr_cae",
  };

  it("accepts preparer and reviewer taken from the engagement team", () => {
    expect(() =>
      assertWorkpaperAssignment({
        preparerId: "usr_auditor",
        reviewerId: "usr_manager",
        team,
      }),
    ).not.toThrow();
  });

  it("accepts the engagement approver as workpaper reviewer", () => {
    expect(() =>
      assertWorkpaperAssignment({
        preparerId: "usr_auditor",
        reviewerId: "usr_cae",
        team,
      }),
    ).not.toThrow();
  });

  it("rejects a preparer outside the engagement team", () => {
    expectWorkpaperError(
      () =>
        assertWorkpaperAssignment({
          preparerId: "usr_stranger",
          reviewerId: "usr_manager",
          team,
        }),
      "PREPARER_NOT_TEAM_MEMBER",
    );
  });

  it("rejects a reviewer outside the engagement team", () => {
    expectWorkpaperError(
      () =>
        assertWorkpaperAssignment({
          preparerId: "usr_auditor",
          reviewerId: "usr_stranger",
          team,
        }),
      "REVIEWER_NOT_TEAM_MEMBER",
    );
  });

  it("rejects one person holding both preparer and reviewer", () => {
    expectWorkpaperError(
      () =>
        assertWorkpaperAssignment({
          preparerId: "usr_manager",
          reviewerId: "usr_manager",
          team,
        }),
      "WORKPAPER_SOD_CONFLICT",
    );
  });
});

describe("assertWorkpaperEditable", () => {
  it("allows content edits while the workpaper is still in the workflow", () => {
    for (const status of ["draft", "in_review", "reviewed"] as const) {
      expect(() => assertWorkpaperEditable(status)).not.toThrow();
    }
  });

  it("blocks content edits after sign-off", () => {
    expectWorkpaperError(() => assertWorkpaperEditable("signed_off"), "WORKPAPER_LOCKED");
  });
});
