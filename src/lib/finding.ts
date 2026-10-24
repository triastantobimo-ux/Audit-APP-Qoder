export const findingStatuses = [
  "draft",
  "communicated",
  "in_remediation",
  "pending_validation",
  "closed",
  "reopened",
  "accepted_risk",
] as const;
export type FindingStatus = (typeof findingStatuses)[number];

export const findingStatusLabels = {
  draft: "Draft",
  communicated: "Telah dikomunikasikan",
  in_remediation: "Dalam remediasi",
  pending_validation: "Menunggu validasi",
  closed: "Selesai",
  reopened: "Dibuka kembali",
  accepted_risk: "Risiko diterima",
} satisfies Record<FindingStatus, string>;

export const findingSeverities = ["low", "medium", "high", "critical"] as const;
export type FindingSeverity = (typeof findingSeverities)[number];

export const findingSeverityLabels = {
  low: "Rendah",
  medium: "Sedang",
  high: "Tinggi",
  critical: "Kritis",
} satisfies Record<FindingSeverity, string>;

export class FindingError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "FindingError";
  }
}

export type FindingActor = {
  isOwner: boolean;
  canWrite: boolean;
  canValidate: boolean;
  canAcceptRisk: boolean;
};

export type FindingGate = {
  hasCondition: boolean;
  hasCriteria: boolean;
  hasCause: boolean;
  hasEffect: boolean;
  hasRecommendation: boolean;
  hasOwner: boolean;
  hasDueDate: boolean;
  hasResponse: boolean;
  hasPlannedAction: boolean;
};

const transitions: Record<FindingStatus, readonly FindingStatus[]> = {
  draft: ["communicated"],
  communicated: ["in_remediation"],
  in_remediation: ["pending_validation", "accepted_risk"],
  pending_validation: ["closed", "reopened"],
  reopened: ["in_remediation", "accepted_risk"],
  closed: ["reopened"],
  accepted_risk: [],
};

const remediationPending: readonly FindingStatus[] = [
  "draft",
  "communicated",
  "in_remediation",
  "reopened",
];

const ownerTransitions: readonly (readonly FindingStatus[])[] = [
  ["communicated", "in_remediation"],
  ["in_remediation", "pending_validation"],
  ["reopened", "in_remediation"],
];

const editableStatuses: readonly FindingStatus[] = [
  "draft",
  "communicated",
  "in_remediation",
  "pending_validation",
  "reopened",
];

const updatableStatuses: readonly FindingStatus[] = [
  "communicated",
  "in_remediation",
  "pending_validation",
  "reopened",
];

export function isUpdatableFindingStatus(status: string): boolean {
  return updatableStatuses.includes(status as FindingStatus);
}

const dayMs = 24 * 60 * 60 * 1000;

export function nextFindingReference(references: readonly string[]): string {
  let highest = 0;
  for (const reference of references) {
    const match = /^TD-(\d{1,6})$/.exec(reference.trim().toUpperCase());
    if (!match) continue;
    highest = Math.max(highest, Number(match[1]));
  }
  return `TD-${String(highest + 1).padStart(3, "0")}`;
}

export type FindingFieldInput = {
  title?: string | null;
  condition?: string | null;
  criteria?: string | null;
  cause?: string | null;
  effect?: string | null;
  recommendation?: string | null;
};

export type FindingFields = {
  title: string;
  condition: string;
  criteria: string;
  cause?: string;
  effect?: string;
  recommendation?: string;
};

function optional(value: string | null | undefined): string | undefined {
  const trimmed = (value ?? "").trim();
  return trimmed || undefined;
}

export function validateFindingFields(input: FindingFieldInput): FindingFields {
  const title = (input.title ?? "").trim();
  const condition = (input.condition ?? "").trim();
  const criteria = (input.criteria ?? "").trim();

  if (!title) throw new FindingError("TITLE_REQUIRED", "Judul temuan wajib diisi.");
  if (!condition)
    throw new FindingError("CONDITION_REQUIRED", "Kondisi (what is) temuan wajib diisi.");
  if (!criteria)
    throw new FindingError("CRITERIA_REQUIRED", "Kriteria (what should be) temuan wajib diisi.");

  return {
    title,
    condition,
    criteria,
    cause: optional(input.cause),
    effect: optional(input.effect),
    recommendation: optional(input.recommendation),
  };
}

export type ManagementResponseInput = {
  response?: string | null;
  plannedAction?: string | null;
  ownerUserId?: string | null;
  dueDate?: string | Date | null;
};

export type ManagementResponse = {
  response: string;
  plannedAction: string;
  ownerUserId: string;
  dueDate: Date;
};

function asDate(value: string | Date | null | undefined): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = (value ?? "").toString().trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseDueDate(value: string | Date | null | undefined): Date {
  const date = asDate(value);
  if (!date) {
    throw new FindingError(
      "INVALID_DUE_DATE",
      "Target penyelesaian harus berupa tanggal yang valid (YYYY-MM-DD).",
    );
  }
  return date;
}

export function validateManagementResponse(input: ManagementResponseInput): ManagementResponse {
  const response = (input.response ?? "").trim();
  const plannedAction = (input.plannedAction ?? "").trim();
  const ownerUserId = (input.ownerUserId ?? "").trim();

  if (!response)
    throw new FindingError("RESPONSE_REQUIRED", "Respons manajemen atas temuan wajib diisi.");
  if (!plannedAction)
    throw new FindingError(
      "PLANNED_ACTION_REQUIRED",
      "Rencana aksi remediasi wajib diisi bersama respons manajemen.",
    );
  if (!ownerUserId)
    throw new FindingError("OWNER_REQUIRED", "Penanggung jawab remediasi wajib dipilih.");

  return { response, plannedAction, ownerUserId, dueDate: parseDueDate(input.dueDate) };
}

export function assertFindingEditable(status: FindingStatus): void {
  if (!editableStatuses.includes(status)) {
    throw new FindingError(
      "FINDING_LOCKED",
      "Temuan yang sudah ditutup atau diterima sebagai risiko tidak dapat diubah.",
    );
  }
}

export function validateSeverity(value: string): FindingSeverity {
  if (!findingSeverities.includes(value as FindingSeverity)) {
    throw new FindingError(
      "INVALID_SEVERITY",
      `Tingkat temuan harus salah satu dari ${findingSeverities.join(", ")}.`,
    );
  }
  return value as FindingSeverity;
}

export type FindingUpdateInput = {
  body?: string | null;
  status?: string | null;
  progressPercent?: number | null;
};

export function validateFindingUpdate(input: FindingUpdateInput): {
  body: string;
  status: FindingStatus;
  progressPercent: number;
} {
  const body = (input.body ?? "").trim();
  if (!body)
    throw new FindingError("UPDATE_BODY_REQUIRED", "Catatan perkembangan remediasi wajib diisi.");
  if (body.length < 10)
    throw new FindingError(
      "UPDATE_BODY_TOO_SHORT",
      "Catatan perkembangan remediasi minimal 10 karakter.",
    );

  const status = input.status as FindingStatus;
  if (!updatableStatuses.includes(status)) {
    throw new FindingError(
      "INVALID_UPDATE_STATUS",
      `Catatan perkembangan hanya dapat diisi saat temuan berstatus ${updatableStatuses.join(", ")}.`,
    );
  }

  const progressPercent = input.progressPercent ?? 0;
  if (!Number.isInteger(progressPercent) || progressPercent < 0 || progressPercent > 100) {
    throw new FindingError(
      "INVALID_PROGRESS",
      "Persentase progres remediasi harus antara 0 sampai 100.",
    );
  }

  return { body, status, progressPercent };
}

export function assertFindingTransition(input: {
  from: FindingStatus;
  to: FindingStatus;
  actor: FindingActor;
  gate: FindingGate;
  dueDate: Date | null;
  now: Date;
  note?: string | null;
}): void {
  const { from, to, actor, gate } = input;

  if (!transitions[from].includes(to)) {
    throw new FindingError(
      "INVALID_FINDING_TRANSITION",
      `Temuan tidak dapat berubah dari ${from} ke ${to}.`,
    );
  }

  const note = (input.note ?? "").trim();

  if (from === "draft" && to === "communicated") {
    if (!actor.canWrite && !actor.canValidate) {
      throw new FindingError(
        "FINDING_TRANSITION_FORBIDDEN",
        "Hanya auditor atau penyelia yang dapat mengomunikasikan temuan.",
      );
    }
    if (!gate.hasCondition)
      throw new FindingError("CONDITION_REQUIRED", "Kondisi temuan wajib dilengkapi.");
    if (!gate.hasCriteria)
      throw new FindingError("CRITERIA_REQUIRED", "Kriteria temuan wajib dilengkapi.");
    if (!gate.hasCause)
      throw new FindingError(
        "CAUSE_REQUIRED",
        "Sebab temuan wajib dianalisis sebelum dikomunikasikan.",
      );
    if (!gate.hasEffect)
      throw new FindingError(
        "EFFECT_REQUIRED",
        "Akibat (dampak risiko) temuan wajib dianalisis sebelum dikomunikasikan.",
      );
    if (!gate.hasRecommendation)
      throw new FindingError(
        "RECOMMENDATION_REQUIRED",
        "Rekomendasi perbaikan wajib ditulis sebelum temuan dikomunikasikan.",
      );
    if (!gate.hasOwner)
      throw new FindingError(
        "OWNER_REQUIRED",
        "Penanggung jawab remediasi wajib ditetapkan sebelum temuan dikomunikasikan.",
      );
    if (!gate.hasDueDate)
      throw new FindingError(
        "DUE_DATE_REQUIRED",
        "Target penyelesaian wajib ditetapkan sebelum temuan dikomunikasikan.",
      );
  }

  if (ownerTransitions.some(([ownerFrom, ownerTo]) => ownerFrom === from && ownerTo === to)) {
    if (!actor.isOwner) {
      throw new FindingError(
        "RESPONSE_FORBIDDEN",
        "Hanya penanggung jawab remediasi yang dapat memperbarui status aksi atas temuan ini.",
      );
    }
    if (to === "in_remediation" && from === "communicated" && !gate.hasPlannedAction) {
      throw new FindingError(
        "PLANNED_ACTION_REQUIRED",
        "Rencana aksi remediasi wajib diisi sebelum temuan masuk remediasi.",
      );
    }
  }

  if (to === "closed") {
    if (actor.isOwner) {
      throw new FindingError(
        "VALIDATOR_IS_OWNER",
        "Penanggung jawab remediasi tidak dapat memvalidasi dan menutup temuannya sendiri.",
      );
    }
    if (!actor.canValidate) {
      throw new FindingError(
        "FINDING_TRANSITION_FORBIDDEN",
        "Anda tidak berwenang memvalidasi penutupan temuan.",
      );
    }
  }

  if (to === "reopened") {
    if (actor.isOwner) {
      throw new FindingError(
        "VALIDATOR_IS_OWNER",
        "Hanya sisi audit yang dapat membuka kembali temuan.",
      );
    }
    if (!actor.canValidate && !actor.canWrite) {
      throw new FindingError(
        "FINDING_TRANSITION_FORBIDDEN",
        "Anda tidak berwenang membuka kembali temuan.",
      );
    }
    if (!note) {
      throw new FindingError(
        "REOPEN_NOTE_REQUIRED",
        "Alasan membuka kembali temuan wajib ditulis.",
      );
    }
  }

  if (to === "accepted_risk") {
    if (!actor.canAcceptRisk) {
      throw new FindingError(
        "RISK_ACCEPT_FORBIDDEN",
        "Hanya pihak dengan wewenang (CAE atau manajemen senior) yang dapat menerima residual risiko.",
      );
    }
    if (!note) {
      throw new FindingError(
        "RISK_ACCEPT_JUSTIFICATION_REQUIRED",
        "Justifikasi tertulis wajib diisi saat menerima residual risiko.",
      );
    }
  }

  if (to === "pending_validation" && !gate.hasResponse) {
    throw new FindingError(
      "RESPONSE_REQUIRED",
      "Respons manajemen wajib tercatat sebelum temuan dikirim untuk validasi.",
    );
  }
}

export function findingReadiness(gate: FindingGate): { ready: boolean; missing: string[] } {
  const missing: string[] = [];

  if (!gate.hasCondition) missing.push("Kondisi temuan");
  if (!gate.hasCriteria) missing.push("Kriteria temuan");
  if (!gate.hasCause) missing.push("Sebab temuan");
  if (!gate.hasEffect) missing.push("Akibat temuan");
  if (!gate.hasRecommendation) missing.push("Rekomendasi");
  if (!gate.hasOwner) missing.push("Penanggung jawab remediasi");
  if (!gate.hasDueDate) missing.push("Target penyelesaian");

  return { ready: missing.length === 0, missing };
}

export function isFindingOverdue(input: {
  status: FindingStatus;
  dueDate: Date | null;
  now: Date;
}): boolean {
  if (!input.dueDate) return false;
  if (!remediationPending.includes(input.status)) return false;
  return input.dueDate.getTime() < input.now.getTime();
}

export type RemediationItem = {
  status: FindingStatus;
  dueDate: Date | null;
  closedAt: Date | null;
  createdAt?: Date | null;
};

export type RemediationSummary = {
  total: number;
  open: number;
  pendingValidation: number;
  closed: number;
  acceptedRisk: number;
  overdue: number;
  closureRatePercent: number;
  averageDaysToClose: number | null;
  aging: {
    notDue: number;
    late1to30: number;
    late31to60: number;
    late61to90: number;
    lateOver90: number;
  };
};

export function summarizeRemediation(input: {
  items: readonly RemediationItem[];
  now: Date;
}): RemediationSummary {
  const aging = {
    notDue: 0,
    late1to30: 0,
    late31to60: 0,
    late61to90: 0,
    lateOver90: 0,
  };
  let open = 0;
  let pendingValidation = 0;
  let closed = 0;
  let acceptedRisk = 0;
  let overdue = 0;
  const daysToClose: number[] = [];

  for (const item of input.items) {
    if (remediationPending.includes(item.status)) open += 1;
    if (item.status === "pending_validation") pendingValidation += 1;
    if (item.status === "closed") closed += 1;
    if (item.status === "accepted_risk") acceptedRisk += 1;

    const late = isFindingOverdue({ status: item.status, dueDate: item.dueDate, now: input.now });
    if (late) overdue += 1;

    if (item.dueDate && remediationPending.includes(item.status)) {
      if (!late) {
        aging.notDue += 1;
      } else {
        const daysLate = Math.floor((input.now.getTime() - item.dueDate.getTime()) / dayMs);
        if (daysLate <= 30) aging.late1to30 += 1;
        else if (daysLate <= 60) aging.late31to60 += 1;
        else if (daysLate <= 90) aging.late61to90 += 1;
        else aging.lateOver90 += 1;
      }
    }

    if (item.status === "closed" && item.closedAt && item.createdAt) {
      daysToClose.push((item.closedAt.getTime() - item.createdAt.getTime()) / dayMs);
    }
  }

  const total = input.items.length;
  const resolved = closed + acceptedRisk;

  return {
    total,
    open,
    pendingValidation,
    closed,
    acceptedRisk,
    overdue,
    closureRatePercent: total === 0 ? 0 : Math.round((resolved / total) * 100),
    averageDaysToClose:
      daysToClose.length === 0
        ? null
        : Math.round(daysToClose.reduce((sum, days) => sum + days, 0) / daysToClose.length),
    aging,
  };
}
