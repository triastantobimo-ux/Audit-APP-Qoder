export const workpaperStatuses = [
  "draft",
  "in_review",
  "reviewed",
  "signed_off",
] as const;
export type WorkpaperStatus = (typeof workpaperStatuses)[number];

export const noteSeverities = ["minor", "major", "blocking"] as const;
export type NoteSeverity = (typeof noteSeverities)[number];

export const noteStatuses = ["open", "resolved"] as const;
export type NoteStatus = (typeof noteStatuses)[number];

export const evidenceSources = [
  "client_system",
  "document_request",
  "interview",
  "reperformance",
  "external_confirmation",
  "observation",
] as const;
export type EvidenceSource = (typeof evidenceSources)[number];

export const maxEvidenceBytes = 25 * 1024 * 1024;

export type WorkpaperActor = {
  canWrite: boolean;
  canReview: boolean;
  canSignOff: boolean;
  isPreparer: boolean;
  isReviewer: boolean;
  isAuthor: boolean;
  isAssignee: boolean;
};

export type WorkpaperGate = {
  hasConclusion: boolean;
  evidenceCount: number;
  openBlockingNotes: number;
};

export class WorkpaperError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "WorkpaperError";
  }
}

const transitions: Record<WorkpaperStatus, readonly WorkpaperStatus[]> = {
  draft: ["in_review"],
  in_review: ["reviewed", "draft"],
  reviewed: ["signed_off"],
  signed_off: [],
};

export function nextWorkpaperReference(references: readonly string[]): string {
  let highest = 0;
  for (const reference of references) {
    const match = /^WP-(\d{1,6})$/.exec(reference.trim().toUpperCase());
    if (!match) continue;
    highest = Math.max(highest, Number(match[1]));
  }
  return `WP-${String(highest + 1).padStart(3, "0")}`;
}

export type WorkpaperFields = {
  title: string;
  purpose: string;
  procedure: string;
  conclusion: string;
};

export type WorkpaperFieldInput = {
  title?: string | null;
  purpose?: string | null;
  procedure?: string | null;
  conclusion?: string | null;
};

export function validateWorkpaperFields(input: WorkpaperFieldInput): WorkpaperFields {
  const title = (input.title ?? "").trim();
  const purpose = (input.purpose ?? "").trim();
  const procedure = (input.procedure ?? "").trim();
  const conclusion = (input.conclusion ?? "").trim();

  if (!title) throw new WorkpaperError("TITLE_REQUIRED", "Judul workpaper wajib diisi.");
  if (!purpose) throw new WorkpaperError("PURPOSE_REQUIRED", "Tujuan workpaper wajib diisi.");
  if (!procedure)
    throw new WorkpaperError("PROCEDURE_REQUIRED", "Prosedur pengujian wajib diisi.");

  return { title, purpose, procedure, conclusion };
}

export type EngagementTeamIds = {
  preparerId: string;
  reviewerId: string;
  approverId: string;
};

export function assertWorkpaperAssignment(input: {
  preparerId: string;
  reviewerId: string;
  team: EngagementTeamIds;
}): void {
  const isTeamMember = (userId: string) =>
    userId === input.team.preparerId ||
    userId === input.team.reviewerId ||
    userId === input.team.approverId;

  if (!isTeamMember(input.preparerId)) {
    throw new WorkpaperError(
      "PREPARER_NOT_TEAM_MEMBER",
      "Preparer workpaper harus menjadi anggota tim engagement.",
    );
  }

  if (!isTeamMember(input.reviewerId)) {
    throw new WorkpaperError(
      "REVIEWER_NOT_TEAM_MEMBER",
      "Reviewer workpaper harus menjadi anggota tim engagement.",
    );
  }

  if (input.preparerId === input.reviewerId) {
    throw new WorkpaperError(
      "WORKPAPER_SOD_CONFLICT",
      "Preparer dan reviewer workpaper harus orang berbeda.",
    );
  }
}

export function assertWorkpaperEditable(status: WorkpaperStatus): void {
  if (status === "signed_off") {
    throw new WorkpaperError(
      "WORKPAPER_LOCKED",
      "Workpaper yang sudah ditandatangani tidak dapat diubah.",
    );
  }
}

export function assertWorkpaperTransition(input: {
  from: WorkpaperStatus;
  to: WorkpaperStatus;
  actor: WorkpaperActor;
  gate: WorkpaperGate;
  note?: string | null;
}): void {
  const { from, to, actor, gate } = input;

  assertWorkpaperEditable(from);

  if (!transitions[from].includes(to)) {
    throw new WorkpaperError(
      "INVALID_WORKPAPER_TRANSITION",
      `Status workpaper tidak dapat berubah dari ${from} ke ${to}.`,
    );
  }

  if (from === "draft" && to === "in_review") {
    if (!actor.isPreparer && !(actor.canWrite && actor.canReview)) {
      throw new WorkpaperError(
        "WORKPAPER_TRANSITION_FORBIDDEN",
        "Hanya preparer atau penyelia yang dapat mengirim workpaper untuk review.",
      );
    }
    if (gate.evidenceCount <= 0) {
      throw new WorkpaperError(
        "EVIDENCE_REQUIRED",
        "Workpaper harus memiliki minimal satu evidence sebelum dikirim untuk review.",
      );
    }
  }

  if (from === "in_review" && to === "reviewed") {
    if (!actor.isReviewer) {
      throw new WorkpaperError(
        "REVIEWER_NOT_ASSIGNED",
        "Hanya reviewer yang ditugaskan dapat menyelesaikan review.",
      );
    }
  }

  if (from === "reviewed" && to === "signed_off") {
    if (actor.isPreparer) {
      throw new WorkpaperError(
        "SELF_SIGNOFF_FORBIDDEN",
        "Preparer tidak dapat menandatangani workpaper sendiri.",
      );
    }
    if (!actor.canSignOff || !actor.isReviewer) {
      throw new WorkpaperError(
        "WORKPAPER_TRANSITION_FORBIDDEN",
        "Anda tidak berwenang menandatangani workpaper ini.",
      );
    }
    if (gate.openBlockingNotes > 0) {
      throw new WorkpaperError(
        "BLOCKING_NOTES_OPEN",
        `${gate.openBlockingNotes} catatan blocking masih open dan harus diselesaikan sebelum sign-off.`,
      );
    }
    if (!gate.hasConclusion) {
      throw new WorkpaperError(
        "CONCLUSION_REQUIRED",
        "Kesimpulan workpaper harus ditulis sebelum sign-off.",
      );
    }
  }

  if (from === "in_review" && to === "draft") {
    if (!actor.isReviewer && !actor.canReview) {
      throw new WorkpaperError(
        "WORKPAPER_TRANSITION_FORBIDDEN",
        "Hanya reviewer atau penyelia yang dapat mengembalikan workpaper untuk perbaikan.",
      );
    }
    if (!(input.note ?? "").trim()) {
      throw new WorkpaperError(
        "RETURN_NOTE_REQUIRED",
        "Catatan perbaikan wajib diisi saat mengembalikan workpaper.",
      );
    }
  }
}

export function validateNote(input: {
  body: string;
  severity: NoteSeverity | string;
  assigneeId?: string | null;
}): { body: string; severity: NoteSeverity; assigneeId: string | null } {
  const body = (input.body ?? "").trim();
  if (!body) throw new WorkpaperError("NOTE_BODY_REQUIRED", "Isi catatan review wajib diisi.");

  const severity = input.severity as NoteSeverity;
  if (!noteSeverities.includes(severity)) {
    throw new WorkpaperError(
      "INVALID_SEVERITY",
      `Tingkat catatan harus salah satu dari ${noteSeverities.join(", ")}.`,
    );
  }

  const assigneeId = (input.assigneeId ?? "").trim();
  return { body, severity, assigneeId: assigneeId || null };
}

export function resolveNote(input: {
  note: { status: NoteStatus | string; authorId: string };
  actor: WorkpaperActor;
  resolution: string;
}): { status: "resolved"; resolution: string } {
  if (input.note.status !== "open") {
    throw new WorkpaperError("NOTE_ALREADY_RESOLVED", "Catatan ini sudah diselesaikan.");
  }

  const { actor } = input;
  if (!actor.isAuthor && !actor.isAssignee && !actor.isPreparer && !actor.canReview) {
    throw new WorkpaperError(
      "NOTE_RESOLVE_FORBIDDEN",
      "Hanya penulis, assignee, preparer, atau reviewer yang dapat menyelesaikan catatan.",
    );
  }

  const resolution = (input.resolution ?? "").trim();
  if (resolution.length < 10) {
    throw new WorkpaperError(
      "RESOLUTION_REQUIRED",
      "Komentar resolusi minimal 10 karakter dan harus menjelaskan perbaikan yang dilakukan.",
    );
  }

  return { status: "resolved", resolution };
}

export type EvidenceInput = {
  fileName: string;
  mimeType?: string | null;
  sizeBytes: number;
  sha256: string;
  source: EvidenceSource | string;
  periodLabel?: string | null;
  capturedAt: string;
  version?: number;
};

export type EvidenceMetadata = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  source: EvidenceSource;
  periodLabel: string | null;
  capturedAt: string;
  version: number;
};

const sha256Pattern = /^[0-9a-f]{64}$/;
const isoDatePattern = /^\d{4}-\d{2}-\d{2}([T ].*)?$/;

export function validateEvidence(input: EvidenceInput): EvidenceMetadata {
  const fileName = (input.fileName ?? "").trim();
  if (!fileName) throw new WorkpaperError("FILE_NAME_REQUIRED", "Nama file evidence wajib diisi.");

  const sha256 = (input.sha256 ?? "").trim().toLowerCase();
  if (!sha256Pattern.test(sha256)) {
    throw new WorkpaperError("INVALID_HASH", "SHA-256 evidence tidak valid.");
  }

  if (input.sizeBytes > maxEvidenceBytes) {
    throw new WorkpaperError(
      "FILE_TOO_LARGE",
      `Ukuran evidence melebihi batas ${Math.round(maxEvidenceBytes / (1024 * 1024))} MB.`,
    );
  }

  const source = input.source as EvidenceSource;
  if (!evidenceSources.includes(source)) {
    throw new WorkpaperError(
      "INVALID_SOURCE",
      `Sumber evidence harus salah satu dari ${evidenceSources.join(", ")}.`,
    );
  }

  const version = input.version ?? 1;
  if (!Number.isInteger(version) || version < 1) {
    throw new WorkpaperError("INVALID_VERSION", "Versi evidence harus bilangan bulat positif.");
  }

  const capturedAt = (input.capturedAt ?? "").trim();
  if (!isoDatePattern.test(capturedAt) || Number.isNaN(Date.parse(capturedAt))) {
    throw new WorkpaperError(
      "INVALID_CAPTURE_DATE",
      "Tanggal perolehan evidence harus menggunakan format YYYY-MM-DD.",
    );
  }

  const mimeType = (input.mimeType ?? "").trim();
  const periodLabel = (input.periodLabel ?? "").trim();

  return {
    fileName,
    mimeType: mimeType || "application/octet-stream",
    sizeBytes: input.sizeBytes,
    sha256,
    source,
    periodLabel: periodLabel || null,
    capturedAt,
    version,
  };
}

export function safeEvidenceFileName(fileName: string): string {
  const segments = (fileName ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) =>
      segment
        .trim()
        .replace(/[<>:"|?*]/g, "-")
        .replace(/\s+/g, "_")
        .replace(/^\.+/, ""),
    )
    .filter((segment) => segment.length > 0);

  const safe = segments.join("-").slice(0, 120);
  return safe || "evidence.bin";
}

export function nextEvidenceVersion(versions: readonly number[]): number {
  return versions.reduce((highest, version) => Math.max(highest, version), 0) + 1;
}

export function assertEvidenceDeletable(input: {
  workpaperStatus: WorkpaperStatus;
  alreadyDeleted: boolean;
  actor: WorkpaperActor;
}): void {
  if (input.workpaperStatus === "signed_off") {
    throw new WorkpaperError(
      "EVIDENCE_LOCKED",
      "Evidence pada workpaper yang sudah ditandatangani tidak dapat dihapus.",
    );
  }
  if (!input.actor.canWrite) {
    throw new WorkpaperError(
      "EVIDENCE_DELETE_FORBIDDEN",
      "Anda tidak berwenang menghapus evidence ini.",
    );
  }
  if (input.alreadyDeleted) {
    throw new WorkpaperError("EVIDENCE_ALREADY_DELETED", "Evidence ini sudah dihapus.");
  }
}

export const workpaperTemplates = {
  test_of_control: {
    title: "Uji Pengendalian",
    purpose:
      "Menguji apakah rancangan dan pelaksanaan pengendalian kunci berjalan efektif sesuai risiko yang diidentifikasi.",
    procedure:
      "1. Konfirmasi deskripsi pengendalian dan pemiliknya dengan process owner.\n2. Tentukan populasi dan metode pemilihan sampel (jumlah, interval, atau judgemental).\n3. Telusuri setiap sampel terhadap bukti pelaksanaan pengendalian (approval, sistem, atau dokumen pendukung).\n4. Catat pengecualian, sifat kegagalan, dan dampaknya terhadap reliance.\n5. Tarik kesimpulan reliance dan tindak lanjut yang diperlukan.",
    conclusion: "",
  },
  substantive_test: {
    title: "Uji Substantif",
    purpose:
      "Memperoleh keyakinan atas saldo, transaksi, atau afirmasi manajemen melalui pengujian rinci atas isi.",
    procedure:
      "1. Tentukan afirmasi audit dan saldo atau transaksi yang diuji.\n2. Lakukan vouching dan tracing antara catatan akuntansi dengan dokumen sumber.\n3. Rekonfirmasi saldo atau kondisi penting ke pihak eksternal bila diperlukan.\n4. Analisis cut-off, valuasi, dan klasifikasi atas sampel yang dipilih.\n5. Dokumentasikan perbedaan, kuantifikasi salah saji, dan simpulkan dampaknya.",
    conclusion: "",
  },
  analytical_review: {
    title: "Review Analitis",
    purpose:
      "Mengevaluasi kewajaran informasi keuangan melalui analisis hubungan, tren, dan penyimpangan dari ekspektasi.",
    procedure:
      "1. Susun ekspektasi berdasarkan anggaran, periode lalu, atau data non-keuangan.\n2. Hitung varians dan rasio kunci, lalu tetapkan threshold investigasi.\n3. Selidiki penyimpangan yang melampaui threshold bersama process owner.\n4. Kaji penjelasan manajemen dan uji bukti pendukungnya.\n5. Simpulkan apakah hasil analitis mengubah penilaian risiko atau kebutuhan pengujian lanjutan.",
    conclusion: "",
  },
} satisfies Record<string, WorkpaperFields>;

export type WorkpaperTemplateKey = keyof typeof workpaperTemplates;

export function instantiateWorkpaperTemplate(key: WorkpaperTemplateKey): WorkpaperFields {
  const template = workpaperTemplates[key];
  if (!template) {
    throw new WorkpaperError("INVALID_TEMPLATE", "Template workpaper tidak dikenal.");
  }
  return { ...template };
}

export function summarizeWorkpaperPackage(input: {
  status: WorkpaperStatus;
  evidenceCount: number;
  openNotes: number;
  openBlockingNotes: number;
  hasConclusion: boolean;
}): { complete: boolean; missing: string[] } {
  const missing: string[] = [];

  if (!input.hasConclusion) missing.push("Kesimpulan belum ditulis");
  if (input.evidenceCount <= 0) missing.push("Belum ada evidence");
  if (input.openBlockingNotes > 0)
    missing.push(`${input.openBlockingNotes} catatan blocking masih open`);
  if (input.status !== "signed_off") missing.push("Belum ditandatangani reviewer");

  return { complete: missing.length === 0 && input.openNotes === 0, missing };
}
