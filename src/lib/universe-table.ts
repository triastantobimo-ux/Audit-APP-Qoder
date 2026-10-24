export type UniverseSortKey =
  | "name"
  | "code"
  | "type"
  | "owner"
  | "depth"
  | "inherent"
  | "control"
  | "residual"
  | "level"
  | "assessment"
  | "assessedAt"
  | "status";

export type SortDirection = "asc" | "desc";
export type UniverseViewMode = "hierarchy" | "flat";
export type UniverseAssessmentState = "approved" | "pending" | "none";

export type UniverseAssessmentSummary = {
  id: string;
  status: string;
  inherentScore: number | null;
  controlEffectivenessScore: number | null;
  residualScore: number | null;
  riskLevel: string | null;
  topDriver: RiskDriver | null;
  approvedAt: string | null;
  assessedAt: string | null;
};

export type UniverseTableRow = {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
  depth: number;
  sortOrder: number;
  ownerName: string | null;
  parentName?: string | null;
  assessmentState: UniverseAssessmentState;
  currentAssessment: UniverseAssessmentSummary | null;
};

export type RiskFactorContribution = {
  code: string;
  label: string;
  weight: number;
  score: number;
};

export type RiskDriver = RiskFactorContribution & { contribution: number };

const sortKeys: readonly UniverseSortKey[] = [
  "name",
  "code",
  "type",
  "owner",
  "depth",
  "inherent",
  "control",
  "residual",
  "level",
  "assessment",
  "assessedAt",
  "status",
];

const descendingFirstKeys: readonly UniverseSortKey[] = [
  "depth",
  "inherent",
  "control",
  "residual",
  "level",
  "assessment",
  "assessedAt",
];

const levelRank: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const assessmentRank: Record<UniverseAssessmentState, number | null> = {
  approved: 3,
  pending: 2,
  none: null,
};

const assessmentLabels: Record<UniverseAssessmentState, string> = {
  approved: "Disetujui",
  pending: "Draf berjalan",
  none: "Belum dinilai",
};

export const entityTypeLabels: Record<string, string> = {
  organization_unit: "Unit organisasi",
  business_process: "Proses bisnis",
  risk_domain: "Domain risiko",
  system: "Sistem",
  third_party: "Pihak ketiga",
  other: "Lainnya",
};

const riskLevelLabels: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export function entityTypeLabel(type: string): string {
  return entityTypeLabels[type] ?? type;
}

export function riskLevelLabel(level: string | null | undefined): string {
  return level ? (riskLevelLabels[level] ?? level) : "";
}

export function assessmentStateLabel(
  state: UniverseAssessmentState,
): string {
  return assessmentLabels[state];
}

export function parseSortKey(raw: string | null | undefined): UniverseSortKey | null {
  return sortKeys.includes(raw as UniverseSortKey)
    ? (raw as UniverseSortKey)
    : null;
}

export function parseSortDirection(
  raw: string | null | undefined,
): SortDirection {
  return String(raw ?? "").toLowerCase() === "asc" ? "asc" : "desc";
}

export function nextSortState(
  currentKey: UniverseSortKey | null,
  currentDirection: SortDirection,
  clickedKey: UniverseSortKey,
): { key: UniverseSortKey; dir: SortDirection } {
  if (currentKey === clickedKey) {
    return { key: clickedKey, dir: currentDirection === "asc" ? "desc" : "asc" };
  }

  return {
    key: clickedKey,
    dir: descendingFirstKeys.includes(clickedKey) ? "desc" : "asc",
  };
}

export function riskLevelRank(level: string | null | undefined): number {
  return level ? (levelRank[level] ?? 0) : 0;
}

export function resolveViewMode(input: {
  view: string | null | undefined;
  sortKey: UniverseSortKey | null;
}): UniverseViewMode {
  if (input.view === "hierarchy" || input.view === "flat") {
    return input.view;
  }

  return input.sortKey ? "flat" : "hierarchy";
}

function timestamp(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);

  return Number.isNaN(parsed) ? null : parsed;
}

function sortValue(
  row: UniverseTableRow,
  key: UniverseSortKey,
): number | string | null {
  const assessment = row.currentAssessment;

  switch (key) {
    case "name":
      return row.name.toLowerCase();
    case "code":
      return row.code.toLowerCase();
    case "type":
      return row.type;
    case "status":
      return row.status;
    case "depth":
      return row.depth;
    case "owner":
      return row.ownerName ? row.ownerName.toLowerCase() : null;
    case "inherent":
      return assessment?.inherentScore ?? null;
    case "control":
      return assessment?.controlEffectivenessScore ?? null;
    case "residual":
      return assessment?.residualScore ?? null;
    case "level":
      return assessment ? riskLevelRank(assessment.riskLevel) : null;
    case "assessment":
      return assessmentRank[row.assessmentState];
    case "assessedAt":
      return timestamp(assessment?.approvedAt ?? assessment?.assessedAt ?? null);
  }
}

export function sortUniverseRows(
  rows: UniverseTableRow[],
  key: UniverseSortKey,
  dir: SortDirection,
): UniverseTableRow[] {
  const sign = dir === "asc" ? 1 : -1;

  return [...rows].sort((left, right) => {
    const a = sortValue(left, key);
    const b = sortValue(right, key);

    if (a === null && b === null) {
      return left.name.localeCompare(right.name);
    }

    if (a === null) {
      return 1;
    }

    if (b === null) {
      return -1;
    }

    const compared =
      typeof a === "number" && typeof b === "number"
        ? a - b
        : String(a).localeCompare(String(b));

    return compared !== 0 ? compared * sign : left.name.localeCompare(right.name);
  });
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function topRiskDriver(
  factors: RiskFactorContribution[],
): RiskDriver | null {
  let best: RiskDriver | null = null;

  for (const factor of factors) {
    const contribution = round2(factor.weight * factor.score);

    if (!best || contribution > best.contribution) {
      best = { ...factor, contribution };
    }
  }

  return best;
}

export function riskBarWidth(
  score: number | null | undefined,
  scaleMax: number,
): number {
  if (score === null || score === undefined || !Number.isFinite(score)) {
    return 0;
  }

  if (scaleMax <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((score / scaleMax) * 100)));
}

function csvValue(value: string | number | null | undefined): string {
  const text = String(value ?? "");

  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

export function buildUniverseCsv(rows: UniverseTableRow[]): string {
  const header = [
    "Kode",
    "Entity",
    "Tipe",
    "Process owner",
    "Level",
    "Inherent",
    "Control",
    "Banding",
    "Residual",
    "Pendorong utama",
    "Status penilaian",
    "Terakhir dinilai",
  ].join(",");

  const body = rows.map((row) => {
    const assessment = row.currentAssessment;

    return [
      row.code,
      row.name,
      entityTypeLabel(row.type),
      row.ownerName,
      row.depth + 1,
      assessment?.inherentScore,
      assessment?.controlEffectivenessScore,
      riskLevelLabel(assessment?.riskLevel),
      assessment?.residualScore,
      assessment?.topDriver
        ? `${assessment.topDriver.label} ${assessment.topDriver.contribution.toFixed(2)}`
        : "",
      assessmentStateLabel(row.assessmentState),
      (assessment?.approvedAt ?? assessment?.assessedAt ?? "").slice(0, 10),
    ]
      .map(csvValue)
      .join(",");
  });

  return `${[header, ...body].join("\n")}\n`;
}

export type UniverseFilters = {
  q?: string;
  type?: string;
  riskLevel?: string;
  ownerUserId?: string;
  assessmentState?: UniverseAssessmentState;
  depth?: number;
};

export type UniverseQuery = {
  filters: UniverseFilters;
  sortKey: UniverseSortKey | null;
  sortDir: SortDirection;
  view: UniverseViewMode;
};

const entityTypes: readonly string[] = Object.keys(entityTypeLabels);

const riskLevels: readonly string[] = Object.keys(riskLevelLabels);

const assessmentStates: readonly UniverseAssessmentState[] = [
  "approved",
  "pending",
  "none",
];

export function parseUniverseQuery(
  read: (key: string) => string | null | undefined,
): UniverseQuery {
  const filters: UniverseFilters = {};

  const search = (read("q") ?? "").trim();

  if (search) {
    filters.q = search;
  }

  const type = read("type") ?? "";

  if (entityTypes.includes(type)) {
    filters.type = type;
  }

  const riskLevel = read("riskLevel") ?? "";

  if (riskLevels.includes(riskLevel)) {
    filters.riskLevel = riskLevel;
  }

  const owner = (read("ownerUserId") ?? "").trim();

  if (owner) {
    filters.ownerUserId = owner;
  }

  const state = read("assessmentState") ?? "";

  if (assessmentStates.includes(state as UniverseAssessmentState)) {
    filters.assessmentState = state as UniverseAssessmentState;
  }

  const rawDepth = (read("depth") ?? "").trim();

  if (rawDepth) {
    const depth = Number(rawDepth);

    if (Number.isInteger(depth) && depth >= 0) {
      filters.depth = depth;
    }
  }

  const sortKey = parseSortKey(read("sort"));

  return {
    filters,
    sortKey,
    sortDir: parseSortDirection(read("dir")),
    view: resolveViewMode({ view: read("view"), sortKey }),
  };
}

export function buildUniverseQuery(input: {
  filters?: UniverseFilters;
  sortKey?: UniverseSortKey | null;
  sortDir?: SortDirection;
  view?: UniverseViewMode;
}): string {
  const params = new URLSearchParams();
  const filters = input.filters ?? {};

  for (const key of [
    "q",
    "type",
    "riskLevel",
    "ownerUserId",
    "assessmentState",
  ] as const) {
    const value = filters[key];

    if (value) {
      params.set(key, value);
    }
  }

  if (filters.depth !== undefined) {
    params.set("depth", String(filters.depth));
  }

  if (input.sortKey) {
    params.set("sort", input.sortKey);
    params.set("dir", input.sortDir ?? "desc");
  }

  if (input.view) {
    params.set("view", input.view);
  }

  return params.toString();
}
