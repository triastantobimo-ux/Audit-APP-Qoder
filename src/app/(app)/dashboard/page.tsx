import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Gauge,
  Network,
  ShieldCheck,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, RiskBadge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { formatDateTime, formatPercent, formatScore, humanize, relativeTime } from "@/lib/format";
import { requirePageAuth } from "@/server/auth";
import {
  getActiveCycle,
  getDashboardSummary,
  getDefaultRiskModel,
} from "@/server/risk-service";

const levelConfig = [
  { key: "critical", label: "Critical", className: "bg-red-500" },
  { key: "high", label: "High", className: "bg-amber-500" },
  { key: "medium", label: "Medium", className: "bg-blue-500" },
  { key: "low", label: "Low", className: "bg-emerald-500" },
] as const;

export default async function DashboardPage() {
  const auth = await requirePageAuth();
  const [summary, cycle, model] = await Promise.all([
    getDashboardSummary({
      user: auth.user,
      workspace: auth.workspace,
      membership: auth.membership,
      meta: { requestId: "page", ip: null, userAgent: null },
    }),
    getActiveCycle({
      user: auth.user,
      workspace: auth.workspace,
      membership: auth.membership,
      meta: { requestId: "page", ip: null, userAgent: null },
    }),
    getDefaultRiskModel({
      user: auth.user,
      workspace: auth.workspace,
      membership: auth.membership,
      meta: { requestId: "page", ip: null, userAgent: null },
    }),
  ]);

  const assessedPercent = summary.totalEntities
    ? summary.assessed / summary.totalEntities
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Overview"
        title="Risk & coverage"
        description="Ringkasan audit universe, hasil penilaian risiko, dan aktivitas terbaru dalam satu pandangan."
        actions={
          <>
            {cycle ? (
              <Badge tone="success" className="h-8 px-3">
                {cycle.name} · Active
              </Badge>
            ) : (
              <Badge tone="warning" className="h-8 px-3">
                Belum ada cycle aktif
              </Badge>
            )}
            <Link href="/audit-universe" className={buttonClasses("primary", "md")}>
              Buka audit universe
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                Auditable entities
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-ink">
                {summary.totalEntities}
              </p>
              <p className="mt-1 text-xs text-muted">Aktif di universe</p>
            </div>
            <span className="rounded-lg bg-teal-50 p-2 text-accent">
              <Network className="h-4 w-4" aria-hidden="true" />
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                Sudah dinilai
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-ink">
                {summary.assessed}
              </p>
              <p className="mt-1 text-xs text-muted">
                {formatPercent(summary.assessed, summary.totalEntities)} coverage
              </p>
            </div>
            <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                High & critical
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-ink">
                {summary.highOrCritical}
              </p>
              <p className="mt-1 text-xs text-muted">Perlu perhatian audit committee</p>
            </div>
            <span className="rounded-lg bg-amber-50 p-2 text-amber-700">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                Avg. residual risk
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-ink">
                {formatScore(summary.averageResidual)}
              </p>
              <p className="mt-1 text-xs text-muted">Skala {model?.scale.min ?? 1}–{model?.scale.max ?? 5}</p>
            </div>
            <span className="rounded-lg bg-blue-50 p-2 text-blue-700">
              <Gauge className="h-4 w-4" aria-hidden="true" />
            </span>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <div>
                <CardTitle>Top residual risks</CardTitle>
                <p className="mt-1 text-xs text-muted">
                  Entity dengan skor residual tertinggi pada cycle aktif.
                </p>
              </div>
              <Link href="/audit-universe" className="text-xs font-semibold text-accent hover:text-accent-strong">
                Lihat semua
              </Link>
            </CardHeader>
            <div className="divide-y divide-line">
              {summary.topRisks.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm font-medium text-ink">Belum ada assessment approved.</p>
                  <p className="mt-1 text-xs text-muted">
                    Setujui minimal satu risk assessment untuk melihat ranking.
                  </p>
                </div>
              ) : (
                summary.topRisks.map((risk, index) => (
                  <Link
                    key={risk.assessmentId}
                    href={`/audit-universe/${risk.entityId}`}
                    className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-slate-50"
                  >
                    <span className="w-5 text-xs font-semibold tabular-nums text-muted">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-ink">{risk.name}</p>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                          {risk.code}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {humanize(risk.type)} · owner {risk.owner?.name ?? "—"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums text-ink">
                        {formatScore(risk.residualScore)}
                      </p>
                      <div className="mt-1">
                        <RiskBadge level={risk.riskLevel} />
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Risk distribution</CardTitle>
              <p className="mt-1 text-xs text-muted">
                Distribusi level risiko dari assessment yang sudah approved.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {levelConfig.map((level) => {
                const count = summary.levels[level.key];
                const percentage = summary.assessed ? (count / summary.assessed) * 100 : 0;
                return (
                  <div key={level.key}>
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700">{level.label}</span>
                      <span className="tabular-nums text-muted">{count}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${level.className}`}
                        style={{ width: `${Math.max(percentage, count > 0 ? 4 : 0)}%` }}
                      />
                    </div>
                  </div>
                );
              })}

              <div className="mt-5 rounded-lg border border-line bg-slate-50 px-3.5 py-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700">Assessment coverage</span>
                  <span className="font-semibold text-ink">
                    {summary.assessed}/{summary.totalEntities}
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${Math.max(assessedPercent * 100, summary.assessed > 0 ? 4 : 0)}%` }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-muted">
                  {summary.unassessed} entity belum memiliki approved assessment.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Recent activity</CardTitle>
              <Activity className="h-4 w-4 text-muted" aria-hidden="true" />
            </CardHeader>
            <div className="divide-y divide-line">
              {summary.recentEvents.length === 0 ? (
                <p className="px-5 py-8 text-center text-xs text-muted">Belum ada aktivitas.</p>
              ) : (
                summary.recentEvents.map((event) => (
                  <div key={event.id} className="flex gap-3 px-5 py-3">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-teal-400" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-ink">
                        {humanize(event.action.replace(".", " "))}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {event.actorName} · {relativeTime(event.createdAt ?? new Date())}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Active methodology</CardTitle>
              <ShieldCheck className="h-4 w-4 text-muted" aria-hidden="true" />
            </CardHeader>
            <CardContent>
              {model ? (
                <>
                  <p className="text-sm font-semibold text-ink">{model.name}</p>
                  <p className="mt-1 text-xs leading-5 text-muted">{model.description}</p>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                        Methodology
                      </p>
                      <p className="mt-1 font-semibold text-ink">{model.methodologyVersion}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                        Factors
                      </p>
                      <p className="mt-1 font-semibold text-ink">{model.factors.length}</p>
                    </div>
                  </div>
                  <Link
                    href="/risk-model"
                    className="mt-4 inline-flex text-xs font-semibold text-accent hover:text-accent-strong"
                  >
                    Lihat model & threshold →
                  </Link>
                </>
              ) : (
                <p className="text-xs text-muted">Belum ada risk model aktif.</p>
              )}
            </CardContent>
          </Card>

          {cycle ? (
            <Card>
              <CardContent>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                  Active cycle
                </p>
                <p className="mt-1 text-sm font-semibold text-ink">{cycle.name}</p>
                <p className="mt-1 text-[11px] text-muted">
                  {formatDateTime(cycle.periodStart)} — {formatDateTime(cycle.periodEnd)}
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
