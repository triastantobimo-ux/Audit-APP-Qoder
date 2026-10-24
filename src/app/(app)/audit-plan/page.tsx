import Link from "next/link";
import {
  AlertTriangle,
  CalendarRange,
  ChevronRight,
  Target,
  Users,
} from "lucide-react";
import { NewPlanPanel } from "@/components/new-plan-panel";
import { PageHeader } from "@/components/ui/page-header";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateOnly, formatHours } from "@/lib/format";
import { can } from "@/lib/rbac";
import { requirePageAuth } from "@/server/auth";
import { listPlans } from "@/server/plan-service";
import { listWorkspaceMembers } from "@/server/risk-service";
import { toWorkspaceAccess } from "@/server/page-access";

export default async function AuditPlanPage() {
  const auth = await requirePageAuth();
  const access = toWorkspaceAccess(auth);
  const [plans, members] = await Promise.all([
    listPlans(access),
    listWorkspaceMembers(access),
  ]);
  const canWrite = can(auth.membership.role, "plan:write");
  const latestYear = plans.reduce(
    (max, plan) => Math.max(max, plan.year),
    new Date().getFullYear(),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Annual plan"
        title="Rencana audit yang berbasis risiko dan kapasitas."
        description="Susun plan tahunan dari entity yang sudah dinilai, alokasikan jam per role, lalu kunci plan lewat approval."
        actions={
          canWrite ? (
            <NewPlanPanel
              workspaceId={auth.workspace.id}
              members={members.filter((member) => member.isActive)}
              currentUserId={auth.user.id}
              suggestedYear={latestYear + 1}
            />
          ) : null
        }
      />

      {plans.length === 0 ? (
        <Card className="p-5">
          <EmptyState
            icon={<CalendarRange className="h-4 w-4" />}
            title="Belum ada audit plan"
            description="Buat plan tahunan pertama, lalu tambahkan engagement dari audit universe yang sudah memiliki approved risk assessment."
          />
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {plans.map((plan) => (
            <Link
              key={plan.id}
              href={`/audit-plan/${plan.id}`}
              className={`group rounded-xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-teal-200 hover:bg-teal-50/20 ${
                plan.isCurrent ? "" : "opacity-80"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
                      {plan.year}
                    </span>
                    <StatusBadge status={plan.status} />
                    <Badge tone="neutral">v{plan.version}</Badge>
                    {plan.isCurrent ? (
                      <Badge tone="accent">Current</Badge>
                    ) : null}
                  </div>
                  <h2 className="mt-2 truncate text-lg font-semibold tracking-tight text-ink">
                    {plan.name}
                  </h2>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">
                    {plan.objective}
                  </p>
                </div>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition-colors group-hover:text-accent" />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
                <span>
                  {formatDateOnly(plan.periodStart)} —{" "}
                  {formatDateOnly(plan.periodEnd)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3 w-3" aria-hidden="true" />
                  {plan.owner?.name ?? "—"}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-lg bg-slate-50 p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Engagements
                  </p>
                  <p className="mt-1 text-sm font-semibold text-ink">
                    {plan.summary.engagementCount}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Budget
                  </p>
                  <p className="mt-1 text-sm font-semibold text-ink">
                    {formatHours(plan.summary.budget.totalEstimatedHours)} jam
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Coverage
                  </p>
                  <p className="mt-1 text-sm font-semibold text-ink">
                    {plan.summary.coverage.coveragePercent}%
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    High/Critical
                  </p>
                  <p className="mt-1 text-sm font-semibold text-ink">
                    {plan.summary.coverage.highCriticalCoveragePercent}%
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
                  <Target className="h-3 w-3" aria-hidden="true" />
                  {plan.summary.coverage.coveredCount}/
                  {plan.summary.coverage.totalCount} entity tercakup
                </span>
                {plan.summary.warnings.length > 0 ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700">
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                    {plan.summary.warnings.length} capacity warning
                  </span>
                ) : (
                  <span className="text-[11px] text-emerald-700">
                    Kapasitas aman
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
