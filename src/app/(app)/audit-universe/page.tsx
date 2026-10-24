import Link from "next/link";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronRight,
  ChevronsUpDown,
  Download,
  Filter,
  Gauge,
  Network,
  Search,
} from "lucide-react";
import { NewEntityPanel } from "@/components/new-entity-panel";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge, RiskBadge, TypeBadge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/form";
import { can } from "@/lib/rbac";
import { cn } from "@/lib/cn";
import { formatPercent, formatScore } from "@/lib/format";
import {
  assessmentStateLabel,
  buildUniverseQuery,
  entityTypeLabels,
  nextSortState,
  parseUniverseQuery,
  riskBarWidth,
  riskLevelLabel,
  sortUniverseRows,
  type UniverseAssessmentState,
  type UniverseQuery,
  type UniverseSortKey,
  type UniverseTableRow,
} from "@/lib/universe-table";
import { requirePageAuth } from "@/server/auth";
import { listEntities } from "@/server/entity-service";
import { toWorkspaceAccess } from "@/server/page-access";
import {
  getDefaultRiskModel,
  listWorkspaceMembers,
} from "@/server/risk-service";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const bandStyles: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-amber-500",
  medium: "bg-blue-500",
  low: "bg-emerald-500",
};

const assessmentTones: Record<UniverseAssessmentState, "success" | "warning" | "neutral"> =
  {
    approved: "success",
    pending: "warning",
    none: "neutral",
  };

const columns: {
  key: string;
  label: string;
  sortKey: UniverseSortKey | null;
  className: string;
}[] = [
  { key: "entity", label: "Entity audit", sortKey: "name", className: "min-w-[280px]" },
  { key: "type", label: "Tipe", sortKey: "type", className: "whitespace-nowrap" },
  { key: "owner", label: "Process owner", sortKey: "owner", className: "whitespace-nowrap" },
  { key: "level", label: "Level", sortKey: "depth", className: "whitespace-nowrap" },
  { key: "inherent", label: "Inherent", sortKey: "inherent", className: "whitespace-nowrap" },
  { key: "control", label: "Control", sortKey: "control", className: "whitespace-nowrap" },
  { key: "band", label: "Banding", sortKey: "level", className: "whitespace-nowrap" },
  { key: "residual", label: "Residual risk", sortKey: "residual", className: "min-w-[130px]" },
  { key: "driver", label: "Pendorong utama", sortKey: null, className: "whitespace-nowrap" },
  { key: "state", label: "Status penilaian", sortKey: "assessment", className: "whitespace-nowrap" },
  { key: "assessed", label: "Terakhir dinilai", sortKey: "assessedAt", className: "whitespace-nowrap" },
];

function readSearch(params: Record<string, string | string[] | undefined>) {
  return (key: string) => {
    const value = params[key];

    return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
  };
}

function pageHref(query: UniverseQuery, overrides: Partial<UniverseQuery> = {}): string {
  const search = buildUniverseQuery({
    filters: overrides.filters ?? query.filters,
    sortKey: "sortKey" in overrides ? overrides.sortKey : query.sortKey,
    sortDir: overrides.sortDir ?? query.sortDir,
    view: overrides.view ?? query.view,
  });

  return search ? `/audit-universe?${search}` : "/audit-universe";
}

function sortHref(query: UniverseQuery, key: UniverseSortKey): string {
  const next = nextSortState(query.sortKey, query.sortDir, key);

  return pageHref(query, { sortKey: next.key, sortDir: next.dir });
}

function toRow(entity: Awaited<ReturnType<typeof listEntities>>[number]): UniverseTableRow {
  return {
    id: entity.id,
    code: entity.code,
    name: entity.name,
    type: entity.type,
    status: entity.status,
    depth: entity.depth,
    sortOrder: entity.sortOrder,
    ownerName: entity.owner?.name ?? null,
    parentName: entity.parentName,
    assessmentState: entity.assessmentState,
    currentAssessment: entity.currentAssessment,
  };
}

export default async function AuditUniversePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const auth = await requirePageAuth();
  const access = toWorkspaceAccess(auth);
  const query = parseUniverseQuery(readSearch(await searchParams));
  const { filters, sortKey, sortDir, view } = query;

  const canWrite = can(auth.membership.role, "entity:write");
  const [entities, parentEntities, members, model] = await Promise.all([
    listEntities(access, {
      ...filters,
      riskLevel: filters.riskLevel ? [filters.riskLevel] : undefined,
    }),
    canWrite ? listEntities(access) : Promise.resolve([]),
    listWorkspaceMembers(access),
    getDefaultRiskModel(access),
  ]);

  const scaleMax = model?.scale.max ?? 5;
  const builtRows = entities.map(toRow);
  const ordered = sortKey
    ? sortUniverseRows(builtRows, sortKey, sortDir)
    : view === "flat"
      ? sortUniverseRows(builtRows, "residual", "desc")
      : builtRows;
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  const rows = ordered.map((row) => ({ row, entity: entityById.get(row.id)! }));

  const assessed = entities.filter((entity) => entity.currentAssessment).length;
  const unassessed = entities.length - assessed;
  const critical = entities.filter(
    (entity) => entity.currentAssessment?.riskLevel === "critical",
  ).length;
  const high = entities.filter(
    (entity) => entity.currentAssessment?.riskLevel === "high",
  ).length;
  const pending = entities.filter(
    (entity) => entity.assessmentState === "pending",
  ).length;
  const residualScores = entities
    .map((entity) => entity.currentAssessment?.residualScore)
    .filter((score): score is number => typeof score === "number");
  const averageResidual = residualScores.length
    ? residualScores.reduce((total, score) => total + score, 0) / residualScores.length
    : null;
  const maxDepth = entities.reduce((deepest, entity) => Math.max(deepest, entity.depth), 0);
  const isFiltered = Boolean(
    filters.q ||
      filters.type ||
      filters.riskLevel ||
      filters.ownerUserId ||
      filters.assessmentState ||
      filters.depth !== undefined,
  );
  const exportSearch = buildUniverseQuery(query);
  const exportHref = `/api/v1/workspaces/${auth.workspace.id}/audit-entities/export${
    exportSearch ? `?${exportSearch}` : ""
  }`;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Audit universe"
        title="Apa yang diaudit, seberapa besar risikonya."
        description="Kelola hierarki auditable entity, nilai inherent dan residual risk, lalu gunakan ranking untuk menyusun prioritas audit."
        actions={
          canWrite ? (
            <NewEntityPanel
              workspaceId={auth.workspace.id}
              entities={parentEntities.map((entity) => ({
                id: entity.id,
                code: entity.code,
                name: entity.name,
                depth: entity.depth,
              }))}
              members={members.filter((member) => member.isActive)}
            />
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="flex items-center gap-3 px-4 py-3">
          <span className="rounded-lg bg-teal-50 p-2 text-accent">
            <Network className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-lg font-semibold text-ink">{entities.length}</p>
            <p className="text-[11px] text-muted">
              Entity dalam tampilan · {maxDepth + 1} level hierarki
            </p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 px-4 py-3">
          <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-lg font-semibold text-ink">
              {formatPercent(assessed, entities.length)}
            </p>
            <p className="text-[11px] text-muted">
              Coverage penilaian · {unassessed} belum dinilai
            </p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 px-4 py-3">
          <span className="rounded-lg bg-amber-50 p-2 text-amber-700">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-lg font-semibold text-ink">{critical + high}</p>
            <p className="text-[11px] text-muted">
              High / critical · {critical} critical, {pending} draf
            </p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 px-4 py-3">
          <span className="rounded-lg bg-blue-50 p-2 text-blue-700">
            <Gauge className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-lg font-semibold tabular-nums text-ink">
              {formatScore(averageResidual)}
            </p>
            <p className="text-[11px] text-muted">
              Rerata residual risk · skala 1–{scaleMax}
            </p>
          </div>
        </Card>
      </div>

      <Card>
        <div className="space-y-3 border-b border-line px-4 py-3">
          <form className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <Input
                name="q"
                defaultValue={filters.q ?? ""}
                placeholder="Cari kode, nama, atau deskripsi..."
                className="pl-9"
              />
            </div>
            <Select name="type" defaultValue={filters.type ?? ""} className="lg:w-40">
              <option value="">Semua tipe</option>
              {Object.entries(entityTypeLabels).map(([type, label]) => (
                <option key={type} value={type}>
                  {label}
                </option>
              ))}
            </Select>
            <Select name="riskLevel" defaultValue={filters.riskLevel ?? ""} className="lg:w-36">
              <option value="">Semua risiko</option>
              {(["critical", "high", "medium", "low"] as const).map((level) => (
                <option key={level} value={level}>
                  {riskLevelLabel(level)}
                </option>
              ))}
            </Select>
            <Select
              name="assessmentState"
              defaultValue={filters.assessmentState ?? ""}
              className="lg:w-40"
            >
              <option value="">Semua status penilaian</option>
              <option value="approved">Disetujui</option>
              <option value="pending">Draf berjalan</option>
              <option value="none">Belum dinilai</option>
            </Select>
            <Select
              name="ownerUserId"
              defaultValue={filters.ownerUserId ?? ""}
              className="lg:w-44"
            >
              <option value="">Semua process owner</option>
              {members
                .filter((member) => member.isActive)
                .map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
            </Select>
            <Select
              name="depth"
              defaultValue={filters.depth === undefined ? "" : String(filters.depth)}
              className="lg:w-32"
            >
              <option value="">Semua level</option>
              {Array.from({ length: maxDepth + 1 }, (_, depth) => (
                <option key={depth} value={String(depth)}>
                  Level {depth + 1}
                </option>
              ))}
            </Select>
            <input type="hidden" name="sort" value={sortKey ?? ""} />
            <input type="hidden" name="dir" value={sortKey ? sortDir : ""} />
            <input type="hidden" name="view" value={view} />
            <Button type="submit" variant="secondary">
              <Filter className="h-3.5 w-3.5" aria-hidden="true" />
              Filter
            </Button>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                Tampilan
              </span>
              <Link
                href={pageHref(query, { view: "hierarchy" })}
                className={buttonClasses(view === "hierarchy" ? "secondary" : "ghost", "sm")}
                aria-current={view === "hierarchy" ? "page" : undefined}
              >
                Hierarki
              </Link>
              <Link
                href={pageHref(query, { view: "flat" })}
                className={buttonClasses(view === "flat" ? "secondary" : "ghost", "sm")}
                aria-current={view === "flat" ? "page" : undefined}
              >
                Peringkat risiko
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <a href={exportHref} className={buttonClasses("secondary", "sm")}>
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Export CSV
              </a>
              {isFiltered || sortKey || query.view !== "hierarchy" ? (
                <Link href="/audit-universe" className={buttonClasses("ghost", "sm")}>
                  Reset
                </Link>
              ) : null}
            </div>
          </div>

          {sortKey ? (
            <p className="text-[11px] text-muted">
              Dipesan menurut{" "}
              <span className="font-semibold text-slate-700">
                {columns.find((column) => column.sortKey === sortKey)?.label ?? sortKey}
              </span>{" "}
              ({sortDir === "asc" ? "menanjak" : "menurun"}). Entity tanpa penilaian ditampilkan
              paling akhir.
            </p>
          ) : (
            <p className="text-[11px] text-muted">
              Klik judul kolom untuk sorts; gunakan tampilan “Peringkat risiko” untuk daftar
              ranking tanpa hierarki.
            </p>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<Network className="h-4 w-4" />}
              title={
                isFiltered ? "Tidak ada entity yang cocok" : "Audit universe masih kosong"
              }
              description={
                isFiltered
                  ? "Coba ubah kata kunci, owner, atau filter risiko."
                  : "Mulai dengan membuat entity root, lalu tambahkan proses bisnis di bawahnya."
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1240px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line bg-slate-50/80 text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
                  {columns.map((column) => {
                    const isActive =
                      column.sortKey !== null && column.sortKey === sortKey;

                    return (
                      <th
                        key={column.key}
                        scope="col"
                        aria-sort={
                          isActive ? (sortDir === "asc" ? "ascending" : "descending") : "none"
                        }
                        className={cn("px-4 py-3", column.className)}
                      >
                        {column.sortKey ? (
                          <Link
                            href={sortHref(query, column.sortKey)}
                            className={cn(
                              "group inline-flex items-center gap-1 hover:text-accent",
                              isActive && "text-accent",
                            )}
                          >
                            {column.label}
                            {isActive ? (
                              sortDir === "asc" ? (
                                <ArrowUp className="h-3 w-3" aria-hidden="true" />
                              ) : (
                                <ArrowDown className="h-3 w-3" aria-hidden="true" />
                              )
                            ) : (
                              <ChevronsUpDown
                                className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-70"
                                aria-hidden="true"
                              />
                            )}
                          </Link>
                        ) : (
                          column.label
                        )}
                      </th>
                    );
                  })}
                  <th scope="col" className="w-10 px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map(({ row, entity }) => {
                  const assessment = entity.currentAssessment;

                  return (
                    <tr key={row.id} className="group transition-colors hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div
                          className="flex items-start gap-2"
                          style={{
                            paddingLeft:
                              view === "hierarchy" && !sortKey ? `${row.depth * 18}px` : 0,
                          }}
                        >
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                          <div className="min-w-0">
                            <Link
                              href={`/audit-universe/${row.id}`}
                              className="flex items-center gap-2 text-sm font-semibold text-ink hover:text-accent"
                            >
                              {row.name}
                              {entity.childCount > 0 ? (
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                  {entity.childCount} child
                                </span>
                              ) : null}
                              {row.status !== "active" ? (
                                <Badge tone="neutral">{row.status}</Badge>
                              ) : null}
                            </Link>
                            <p className="mt-0.5 text-[11px] text-muted">
                              {row.code}
                              {view === "flat" && row.parentName ? ` · ${row.parentName}` : ""}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <TypeBadge type={row.type} />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700">
                        {row.ownerName ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs tabular-nums text-slate-700">
                        {row.depth + 1}
                      </td>
                      <td className="px-4 py-3 text-sm tabular-nums text-slate-700">
                        {formatScore(assessment?.inherentScore)}
                      </td>
                      <td className="px-4 py-3 text-sm tabular-nums text-slate-700">
                        {formatScore(assessment?.controlEffectivenessScore)}
                      </td>
                      <td className="px-4 py-3">
                        <RiskBadge level={assessment?.riskLevel} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-10 text-sm font-semibold tabular-nums text-ink">
                            {formatScore(assessment?.residualScore)}
                          </span>
                          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                            <span
                              className={cn(
                                "block h-full rounded-full",
                                assessment?.riskLevel
                                  ? bandStyles[assessment.riskLevel]
                                  : "bg-slate-300",
                              )}
                              style={{
                                width: `${riskBarWidth(assessment?.residualScore, scaleMax)}%`,
                              }}
                            />
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700">
                        {assessment?.topDriver ? (
                          <span className="whitespace-nowrap">
                            {assessment.topDriver.label}
                            <span className="ml-1 tabular-nums text-muted">
                              {formatScore(assessment.topDriver.contribution)}
                            </span>
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={assessmentTones[row.assessmentState]}>
                          {assessmentStateLabel(row.assessmentState)}
                        </Badge>
                        {entity.pendingAssessment ? (
                          <p className="mt-0.5 text-[10px] text-muted">
                            Draf v{entity.pendingAssessment.version} menunggu review
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-xs tabular-nums text-slate-700">
                        {assessment?.approvedAt
                          ? assessment.approvedAt.slice(0, 10)
                          : (assessment?.assessedAt?.slice(0, 10) ?? "—")}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Link
                          href={`/audit-universe/${row.id}`}
                          className="inline-flex rounded p-1 text-slate-400 group-hover:text-accent"
                          aria-label={`Buka ${row.name}`}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
