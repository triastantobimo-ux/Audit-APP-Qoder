export const engagementTypes = [
  "financial",
  "operational",
  "compliance",
  "sox",
  "it",
] as const;
export type EngagementType = (typeof engagementTypes)[number];

export const engagementStatuses = [
  "draft",
  "planning",
  "fieldwork",
  "review",
  "issued",
  "closed",
] as const;
export type EngagementStatus = (typeof engagementStatuses)[number];

export const auditAssertions = [
  "existence",
  "completeness",
  "accuracy",
  "cutoff",
  "classification",
  "occurrence",
  "authorization",
  "valuation",
  "rights_obligations",
  "presentation",
] as const;
export type AuditAssertion = (typeof auditAssertions)[number];

export type RcmRowInput = {
  riskDescription: string;
  controlDescription: string;
  assertion: string;
  procedureDescription: string;
  evidenceRequirement: string;
};

export type RcmCoverage = {
  totalRows: number;
  completeRows: number;
  incompleteRows: number;
  rowsMissingProcedure: number;
  rowsMissingEvidence: number;
  coveragePercent: number;
};

export type TransitionActor = {
  canWrite: boolean;
  canManage: boolean;
  canIssue: boolean;
  isPreparer: boolean;
  isReviewer: boolean;
  isApprover: boolean;
};

export type TransitionChecklist = {
  hasObjective: boolean;
  hasScope: boolean;
  hasSchedule: boolean;
  rcmRowCount: number;
  incompleteRcmRows: number;
  hasPreparer: boolean;
  hasReviewer: boolean;
  hasApprover: boolean;
  note?: string | null;
};

export type EngagementTemplate = {
  key: EngagementType;
  name: string;
  objective: string;
  scope: string;
  rows: RcmRowInput[];
};

export class EngagementError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "EngagementError";
  }
}

const transitions: Record<EngagementStatus, readonly EngagementStatus[]> = {
  draft: ["planning"],
  planning: ["fieldwork"],
  fieldwork: ["review"],
  review: ["issued", "fieldwork"],
  issued: ["closed"],
  closed: [],
};

function round1(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function required(value: string | null | undefined, field: string): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    throw new EngagementError(
      "RCM_FIELD_REQUIRED",
      `${field} wajib diisi pada risk-control matrix`,
    );
  }
  return trimmed;
}

export function isEngagementType(value: string): value is EngagementType {
  return (engagementTypes as readonly string[]).includes(value);
}

export function isEngagementStatus(value: string): value is EngagementStatus {
  return (engagementStatuses as readonly string[]).includes(value);
}

export function validateEngagementAssignment(input: {
  preparerId?: string | null;
  reviewerId?: string | null;
  approverId?: string | null;
}): void {
  const preparerId = input.preparerId?.trim() ?? "";
  const reviewerId = input.reviewerId?.trim() ?? "";
  const approverId = input.approverId?.trim() ?? "";

  if (!preparerId || !reviewerId || !approverId) {
    throw new EngagementError(
      "ASSIGNMENT_REQUIRED",
      "Preparer, reviewer, dan approver wajib ditetapkan",
    );
  }

  if (preparerId === reviewerId) {
    throw new EngagementError(
      "REVIEWER_CONFLICT",
      "Reviewer tidak boleh sama dengan preparer",
    );
  }

  if (preparerId === approverId) {
    throw new EngagementError(
      "APPROVER_CONFLICT",
      "Approver tidak boleh sama dengan preparer",
    );
  }
}

export function validateEngagementPeriod(input: {
  startDate: Date | string;
  endDate: Date | string;
  budgetHours: number;
}): void {
  const start = new Date(input.startDate);
  const end = new Date(input.endDate);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end.getTime() < start.getTime()
  ) {
    throw new EngagementError(
      "INVALID_PERIOD",
      "Tanggal selesai harus valid dan tidak lebih awal dari tanggal mulai",
    );
  }

  if (!Number.isFinite(input.budgetHours) || input.budgetHours <= 0) {
    throw new EngagementError(
      "INVALID_BUDGET",
      "Budget jam engagement harus lebih besar dari 0",
    );
  }
}

export function validateEngagementSource(input: {
  planEngagementId?: string | null;
  adHocReason?: string | null;
}): void {
  if (input.planEngagementId?.trim()) {
    return;
  }

  if ((input.adHocReason?.trim().length ?? 0) < 10) {
    throw new EngagementError(
      "ADHOC_REASON_REQUIRED",
      "Engagement ad-hoc wajib memiliki alasan minimal 10 karakter",
    );
  }
}

export function validateRcmRow(input: Partial<RcmRowInput>): RcmRowInput {
  const assertion = input.assertion?.trim().toLowerCase() ?? "";

  if (!(auditAssertions as readonly string[]).includes(assertion)) {
    throw new EngagementError(
      "INVALID_ASSERTION",
      `Assertion ${input.assertion ?? "—"} tidak valid`,
    );
  }

  return {
    riskDescription: required(input.riskDescription, "Risk"),
    controlDescription: required(input.controlDescription, "Control"),
    assertion,
    procedureDescription: required(
      input.procedureDescription,
      "Procedure",
    ),
    evidenceRequirement: required(input.evidenceRequirement, "Evidence"),
  };
}

export function calculateRcmCoverage(
  rows: Array<Partial<RcmRowInput>>,
): RcmCoverage {
  let completeRows = 0;
  let rowsMissingProcedure = 0;
  let rowsMissingEvidence = 0;

  for (const row of rows) {
    const missingProcedure = !row.procedureDescription?.trim();
    const missingEvidence = !row.evidenceRequirement?.trim();

    if (missingProcedure) {
      rowsMissingProcedure += 1;
    }
    if (missingEvidence) {
      rowsMissingEvidence += 1;
    }
    if (
      row.riskDescription?.trim() &&
      row.controlDescription?.trim() &&
      row.assertion?.trim() &&
      !missingProcedure &&
      !missingEvidence
    ) {
      completeRows += 1;
    }
  }

  const totalRows = rows.length;

  return {
    totalRows,
    completeRows,
    incompleteRows: totalRows - completeRows,
    rowsMissingProcedure,
    rowsMissingEvidence,
    coveragePercent:
      totalRows > 0 ? round1((completeRows / totalRows) * 100) : 0,
  };
}

export function reorderRcmIds(ids: string[], orderedIds: string[]): string[] {
  const current = new Set(ids);
  const ordered = new Set(orderedIds);
  const valid =
    ids.length === orderedIds.length &&
    current.size === ids.length &&
    ordered.size === orderedIds.length &&
    orderedIds.every((id) => current.has(id));

  if (!valid) {
    throw new EngagementError(
      "RCM_REORDER_MISMATCH",
      "Urutan RCM harus memuat seluruh baris tepat satu kali",
    );
  }

  return orderedIds;
}

export function formatEngagementCode(year: number, sequence: number): string {
  if (!Number.isInteger(year) || !Number.isInteger(sequence) || sequence < 1) {
    throw new EngagementError(
      "INVALID_SEQUENCE",
      "Tahun dan nomor urut engagement harus valid",
    );
  }

  return `ENG-${year}-${String(sequence).padStart(3, "0")}`;
}

export function nextSequenceFromCodes(codes: string[], year: number): number {
  const pattern = new RegExp(`^ENG-${year}-(\\d+)$`);
  let max = 0;

  for (const code of codes) {
    const match = pattern.exec(code);
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }

  return max + 1;
}

const templates: Record<EngagementType, EngagementTemplate> = {
  financial: {
    key: "financial",
    name: "Financial audit",
    objective:
      "Memberikan assurance atas kewajaran pelaporan keuangan dan keandalan pengendalian pada proses finansial utama.",
    scope:
      "Jurnal, rekonsiliasi akun, akrual, dan pelaporan keuangan pada periode yang diaudit.",
    rows: [
      {
        riskDescription:
          "Jurnal manual material dibuat tanpa dokumentasi dan approval yang memadai.",
        controlDescription:
          "Jurnal manual di atas threshold direview dan di-approve oleh controller sebelum posting.",
        assertion: "occurrence",
        procedureDescription:
          "Uji sampel 30 jurnal manual di atas threshold dan cocokkan ke dokumen pendukung serta approval.",
        evidenceRequirement:
          "Daftar jurnal, workflow approval, dan bukti pendukung transaksi.",
      },
      {
        riskDescription:
          "Rekonsiliasi akun tidak diselesaikan tepat waktu sehingga selisih tidak terdeteksi.",
        controlDescription:
          "Rekonsiliasi bulanan disiapkan oleh staf dan direview serta di-sign-off oleh supervisor.",
        assertion: "completeness",
        procedureDescription:
          "Uji tiga periode rekonsiliasi, telusuri item outstanding, dan periksa bukti review.",
        evidenceRequirement:
          "Rekonsiliasi bank, aging item outstanding, dan sign-off reviewer.",
      },
      {
        riskDescription:
          "Estimasi akrual tidak didukung asumsi yang wajar dan perhitungan yang dapat diuji.",
        controlDescription:
          "Model akrual direview setiap periode dengan analisis variance terhadap realisasi.",
        assertion: "valuation",
        procedureDescription:
          "Review perhitungan akrual dan hitung ulang sampel estimasi utama.",
        evidenceRequirement:
          "Kertas kerja akrual, dokumentasi asumsi, dan perhitungan ulang.",
      },
    ],
  },
  operational: {
    key: "operational",
    name: "Operational audit",
    objective:
      "Menilai efektivitas dan efisiensi proses operasional utama serta kepatuhan pada prosedur yang berlaku.",
    scope:
      "Proses pengadaan, pengelolaan vendor, dan operasi gudang pada unit yang dipilih.",
    rows: [
      {
        riskDescription:
          "Pengadaan dipecah menjadi beberapa PO untuk menghindari batas approval.",
        controlDescription:
          "Sistem memblokir PO duplikat dan approval matrix diterapkan berdasarkan nilai agregat vendor.",
        assertion: "authorization",
        procedureDescription:
          "Analisis PO per vendor per bulan untuk mendeteksi pemecahan dan uji approval di atas threshold.",
        evidenceRequirement:
          "Daftar PO, approval matrix, dan analisis agregasi vendor.",
      },
      {
        riskDescription:
          "Data rekening vendor duplikat atau tidak valid menyebabkan pembayaran salah tujuan.",
        controlDescription:
          "Perubahan bank account vendor memerlukan verifikasi call-back dan approval maker-checker.",
        assertion: "accuracy",
        procedureDescription:
          "Uji sampel perubahan bank account dan cocokkan dengan bukti verifikasi call-back.",
        evidenceRequirement:
          "Master vendor, log perubahan, checklist call-back, dan approval.",
      },
      {
        riskDescription:
          "Selisih stok tidak terdeteksi karena perhitungan fisik dan pencatatan tidak akurat.",
        controlDescription:
          "Stock count periodik dilakukan dan selisih diinvestigasi serta disetujui sebelum adjustment.",
        assertion: "existence",
        procedureDescription:
          "Observasi stock count, hitung ulang sampel lokasi, dan telusuri adjustment ke approval.",
        evidenceRequirement:
          "Berita acara stock count, daftar selisih, dan approval adjustment.",
      },
    ],
  },
  compliance: {
    key: "compliance",
    name: "Compliance audit",
    objective:
      "Menguji kepatuhan terhadap regulasi eksternal dan kebijakan internal yang berlaku.",
    scope:
      "Kewajiban pelaporan regulator, perpajakan, dan kebijakan kepatuhan kunci pada periode audit.",
    rows: [
      {
        riskDescription:
          "Pelaporan regulator terlambat atau tidak lengkap sehingga menimbulkan sanksi.",
        controlDescription:
          "Regulatory calendar dimonitor dan submission direview serta diarsipkan sebelum deadline.",
        assertion: "completeness",
        procedureDescription:
          "Bandingkan daftar kewajiban dengan bukti submission dan tanggal penerimaan regulator.",
        evidenceRequirement:
          "Regulatory calendar, bukti submission, dan tanda terima regulator.",
      },
      {
        riskDescription:
          "Perhitungan pajak tidak akurat karena data dan tarif yang digunakan tidak sesuai.",
        controlDescription:
          "Perhitungan pajak direkonsiliasi ke ledger dan direview oleh tax manager setiap masa pajak.",
        assertion: "accuracy",
        procedureDescription:
          "Hitung ulang sampel perhitungan pajak dan cocokkan tarif serta basis pengenaan.",
        evidenceRequirement:
          "SPT, rekonsiliasi pajak, master tarif, dan review tax manager.",
      },
      {
        riskDescription:
          "Pengecualian kebijakan diberikan tanpa approval yang sah.",
        controlDescription:
          "Semua exception dicatat pada register dan memerlukan approval pejabat berwenang.",
        assertion: "authorization",
        procedureDescription:
          "Uji sampel exception dan telusuri ke approval serta dasar pengecualian.",
        evidenceRequirement:
          "Exception register, formulir permohonan, dan approval pejabat.",
      },
    ],
  },
  sox: {
    key: "sox",
    name: "SOX / ICOFR testing",
    objective:
      "Menguji desain dan efektivitas operasi key controls atas pelaporan keuangan.",
    scope:
      "Key controls pada proses revenue, procure-to-pay, payroll, dan financial close.",
    rows: [
      {
        riskDescription:
          "Pemisahan tugas tidak memadai pada proses procure-to-pay sehingga terjadi konflik akses.",
        controlDescription:
          "Role matrix direview periodik dan konflik SoD pada sistem ERP diidentifikasi serta dimitigasi.",
        assertion: "authorization",
        procedureDescription:
          "Ekstrak user access dan uji konflik role matrix pada sampel pengguna kunci.",
        evidenceRequirement:
          "Role matrix, user access report, dan bukti mitigasi konflik.",
      },
      {
        riskDescription:
          "Key control tidak dijalankan sesuai frekuensi sehingga risiko tidak termitigasi.",
        controlDescription:
          "Control owner menjalankan control sesuai kalender dan menyimpan bukti pelaksanaan.",
        assertion: "occurrence",
        procedureDescription:
          "Uji sampel bukti pelaksanaan control untuk seluruh periode dan periksa konsistensi.",
        evidenceRequirement:
          "Control evidence, checklist pelaksanaan, dan sign-off control owner.",
      },
      {
        riskDescription:
          "Perubahan konfigurasi sistem produksi tidak melalui change management yang disetujui.",
        controlDescription:
          "Perubahan produksi memerlukan tiket, pengujian, dan approval sebelum deployment.",
        assertion: "authorization",
        procedureDescription:
          "Uji sampel perubahan produksi dan telusuri tiket, hasil uji, serta approval deployment.",
        evidenceRequirement:
          "Change ticket, test evidence, approval, dan deployment log.",
      },
    ],
  },
  it: {
    key: "it",
    name: "IT audit",
    objective:
      "Menilai pengendalian umum TI atas akses, perubahan, dan kelangsungan layanan sistem utama.",
    scope:
      "Aplikasi finansial utama, database, dan infrastruktur pendukung pada periode audit.",
    rows: [
      {
        riskDescription:
          "Akses istimewa berlebihan diberikan kepada pengguna tanpa kebutuhan bisnis yang jelas.",
        controlDescription:
          "Akses privileged direview berkala dan hanya diberikan berdasarkan approval serta kebutuhan tervalidasi.",
        assertion: "authorization",
        procedureDescription:
          "Review daftar privileged user dan uji approval untuk akses baru pada sampel pengguna.",
        evidenceRequirement:
          "Privileged access report, approval akses, dan bukti review berkala.",
      },
      {
        riskDescription:
          "Perubahan langsung ke produksi dilakukan tanpa pengujian dan approval.",
        controlDescription:
          "Perubahan melalui environment pengembangan, diuji, dan di-approve sebelum release.",
        assertion: "authorization",
        procedureDescription:
          "Uji sampel perubahan produksi dan bandingkan dengan tiket serta bukti approval.",
        evidenceRequirement:
          "Tiket perubahan, test result, approval, dan release log.",
      },
      {
        riskDescription:
          "Backup tidak lengkap atau restore gagal sehingga kelangsungan layanan terancam.",
        controlDescription:
          "Backup terjadwal dipantau dan uji restore dilakukan secara berkala dengan dokumentasi.",
        assertion: "completeness",
        procedureDescription:
          "Periksa log backup periode audit dan review bukti uji restore terakhir.",
        evidenceRequirement:
          "Backup log, backup success report, dan dokumentasi uji restore.",
      },
    ],
  },
};

export const engagementTemplates = templates;

export function getEngagementTemplate(type: string): EngagementTemplate {
  if (!isEngagementType(type)) {
    throw new EngagementError(
      "INVALID_TEMPLATE",
      `Template engagement ${type} tidak tersedia`,
    );
  }

  return templates[type];
}

export function instantiateTemplate(type: string): {
  objective: string;
  scope: string;
  rows: RcmRowInput[];
} {
  const template = getEngagementTemplate(type);

  return {
    objective: template.objective,
    scope: template.scope,
    rows: template.rows.map((row) => ({ ...row })),
  };
}

export function assertEngagementTransition(input: {
  from: EngagementStatus;
  to: EngagementStatus;
  actor: TransitionActor;
  checklist: TransitionChecklist;
}): void {
  const { from, to, actor, checklist } = input;

  if (!transitions[from].includes(to)) {
    throw new EngagementError(
      "INVALID_TRANSITION",
      `Transisi ${from} → ${to} tidak diizinkan`,
    );
  }

  const note = checklist.note?.trim() ?? "";

  if (to === "planning") {
    if (!actor.canWrite || (!actor.isPreparer && !actor.canManage)) {
      throw new EngagementError(
        "TRANSITION_FORBIDDEN",
        "Hanya preparer atau manager yang dapat memulai planning",
      );
    }
    if (
      !checklist.hasObjective ||
      !checklist.hasScope ||
      !checklist.hasSchedule ||
      !checklist.hasPreparer ||
      !checklist.hasReviewer ||
      !checklist.hasApprover
    ) {
      throw new EngagementError(
        "CHECKLIST_INCOMPLETE",
        "Objective, scope, jadwal, dan tim harus lengkap sebelum planning",
      );
    }
    return;
  }

  if (from === "planning" && to === "fieldwork") {
    if (!actor.isPreparer) {
      throw new EngagementError(
        "TRANSITION_FORBIDDEN",
        "Hanya preparer yang dapat memulai fieldwork",
      );
    }
    if (checklist.rcmRowCount === 0 || checklist.incompleteRcmRows > 0) {
      throw new EngagementError(
        "CHECKLIST_INCOMPLETE",
        "RCM harus memiliki minimal satu baris dan seluruh procedure/evidence lengkap",
      );
    }
    return;
  }

  if (to === "review") {
    if (!actor.isPreparer) {
      throw new EngagementError(
        "TRANSITION_FORBIDDEN",
        "Hanya preparer yang dapat mengajukan review",
      );
    }
    if (
      checklist.rcmRowCount === 0 ||
      checklist.incompleteRcmRows > 0 ||
      !checklist.hasReviewer
    ) {
      throw new EngagementError(
        "CHECKLIST_INCOMPLETE",
        "RCM harus lengkap dan reviewer harus ditetapkan sebelum review",
      );
    }
    return;
  }

  if (to === "issued") {
    if (!actor.canIssue || !actor.isApprover) {
      throw new EngagementError(
        "TRANSITION_FORBIDDEN",
        "Hanya approver yang ditetapkan yang dapat meng-issued engagement",
      );
    }
    if (
      checklist.rcmRowCount === 0 ||
      checklist.incompleteRcmRows > 0 ||
      !checklist.hasReviewer ||
      !checklist.hasApprover
    ) {
      throw new EngagementError(
        "CHECKLIST_INCOMPLETE",
        "RCM lengkap dan reviewer/approver harus ditetapkan sebelum issuance",
      );
    }
    return;
  }

  if (from === "review" && to === "fieldwork") {
    if (!actor.isReviewer && !actor.canManage) {
      throw new EngagementError(
        "TRANSITION_FORBIDDEN",
        "Hanya reviewer atau manager yang dapat mengembalikan ke fieldwork",
      );
    }
    if (!note) {
      throw new EngagementError(
        "TRANSITION_NOTE_REQUIRED",
        "Catatan alasan wajib diisi saat mengembalikan ke fieldwork",
      );
    }
    return;
  }

  if (to === "closed") {
    if (!actor.canIssue || !(actor.isApprover || actor.canManage)) {
      throw new EngagementError(
        "TRANSITION_FORBIDDEN",
        "Hanya approver atau CAE yang dapat menutup engagement",
      );
    }
  }
}
