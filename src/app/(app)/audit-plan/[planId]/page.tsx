import Link from "next/link";
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  ChevronRight,
  Clock,
  Lock,
  Target,
  Users,
} from "lucide-react";
import { CapacityEditor } from "@/components/capacity-editor";
import { EngagementPanel } from "@/components/engagement-panel";
import { PlanActions } from "@/components/plan-actions";
import { PlanEngagementActions } from "@/components/plan-engagement-actions";
import { Badge, RiskBadge, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import {
  formatDateOnly,
  formatDateTime,
  formatHours,
  formatScore,
  humanize,
} from "@/lib/format";
import { planRoles } from "@/lib/plan";
import { can } from "@/lib/rbac";
import { requirePageAuth } from "@/server/auth";
import { listEntities } from "@/server/entity-service";
import { toWorkspaceAccess } from "@/server/page-access";
import { getPlan } from "@/server/plan-service";

export default async function AuditPlanDetailPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const auth = await requirePageAuth();
  const access = toWorkspaceAccess(auth);
  const { planId } = await params;
  const [plan, entities] = await Promise.all([
    getPlan(access, planId),
    listEntities(access),
  ]);

  const canWrite = can(auth.membership.role, "plan:write");
  const canApprove = can(auth.membership.role, "plan:approve");
  const isEditable = ["draft", "returned"].includes(plan.status);
  const existingEntityIds = plan.engagements.map((engagement) => engagement.entityId);
  const candidates = entities
    .filter(
      (entity) =>
        entity.currentAssessment &&
        entity.currentAssessment.residualScore !== null &&
        entity.currentAssessment.riskLevel,
    )
    .map((entity) => ({
      id: entity.id,
      code: entity.code,
      name: entity.name,
      type: entity.type,
      riskScore: entity.currentAssessment?.residualScore as number,
      riskLevel: entity.currentAssessment?.riskLevel as string,
      riskAssessmentId: entity.currentAssessment?.id as string,
    }));

  const budget = plan.summary.budget;
  const coverage = plan.summary.coverage;
  const capacityTotal = plan.capacities.reduce(
    (total, capacity) => total + capacity.availableHours,
    0,
  );
  const varianceTone =
    budget.varianceHours > 0
      ? "text-danger"
      : budget.varianceHours < 0
        ? "text-emerald-700"
        : "text-ink";

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        <Link href="/audit-plan" className="font-medium hover:text-accent">
          Audit plan
        </Link>
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
        <span>{plan.year}</span>
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
        <span className="text-slate-600">Versi {plan.version}</span>
      </nav>

      <PageHeader
        eyebrow={`Annual plan · ${plan.year}`}
        title={plan.name}
        description={plan.objective}
        actions={
          <PlanActions
            workspaceId={auth.workspace.id}
            plan={plan}
            canWrite={canWrite}
            canApprove={canApprove}
            currentUserId={auth.user.id}
          />
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={plan.status} />
        <Badge tone="neutral">v{plan.version}</Badge>
        {plan.isCurrent ? <Badge tone="accent">Current</Badge> : null}
        <span className="text-xs text-muted">
          {formatDateOnly(plan.periodStart)} —{" "}
          {formatDateOnly(plan.periodEnd)}
        </span>
        <span className="text-xs text-muted">·</span>
        <span className="inline-flex items-center gap-1 text-xs text-muted">
          <Users className="h-3 w-3" aria-hidden="true" />
          {plan.owner?.name ?? "—"}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              Total budget
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-ink">
              {formatHours(budget.totalEstimatedHours)}{" "}
              <span className="text-sm font-medium text-muted">jam</span>
            </p>
            <p className="mt-1 text-xs text-muted">
              {plan.summary.engagementCount} engagement{" "}
              {capacityTotal > 0
                ? `· kapasitas ${formatHours(capacityTotal)} jam`
                : "· kapasitas belum diatur"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              Actual hours
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-ink">
              {formatHours(budget.totalActualHours)}{" "}
              <span className="text-sm font-medium text-muted">jam</span>
            </p>
            <p className={`mt-1 text-xs font-medium ${varianceTone}`}>
              {budget.varianceHours > 0 ? "+" : ""}
              {formatHours(budget.varianceHours)} jam ·{" "}
              {budget.variancePercent > 0 ? "+" : ""}
              {budget.variancePercent}% vs plan
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              Risk coverage
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-ink">
              {coverage.coveragePercent}%
            </p>
            <p className="mt-1 text-xs text-muted">
              {coverage.coveredCount}/{coverage.totalCount} entity dalam universe
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              High/critical coverage
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-ink">
              {coverage.highCriticalCoveragePercent}%
            </p>
            <p className="mt-1 text-xs text-muted">
              {coverage.highCriticalCovered}/{coverage.highCriticalTotal} entity
              high/critical
            </p>
          </CardContent>
        </Card>
      </div>

      {plan.summary.warnings.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-700" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">Capacity warning</p>
              <ul className="mt-1 space-y-1 text-xs text-amber-800">
                {plan.summary.warnings.map((warning) => (
                  <li key={warning.role}>
                    {warning.kind === "unconfigured"
                      ? `${warning.role}: ${formatHours(warning.estimatedHours)} jam teralokasi, kapasitas belum diatur.`
                      : `${warning.role}: ${formatHours(warning.estimatedHours)} jam dialokasikan dari ${formatHours(warning.availableHours)} jam kapasitas (over ${formatHours(warning.overBy)} jam).`}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {plan.status === "returned" ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs font-medium text-amber-800">
          Plan dikembalikan untuk diperbaiki. Perbarui engagement atau kapasitas, lalu
          submit ulang.
        </div>
      ) : null}

      <div className="space-y-4">
        <Card className="min-w-0">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>Planned engagements</CardTitle>
              <p className="mt-1 text-xs text-muted">
                Engagement yang masuk plan tahun ini dan alokasi jamnya.
              </p>
            </div>
            {isEditable && canWrite ? (
              <EngagementPanel
                workspaceId={auth.workspace.id}
                planId={plan.id}
                planVersion={plan.version}
                entities={candidates}
                existingEntityIds={existingEntityIds}
                triggerLabel="Tambah engagement"
                triggerVariant="primary"
              />
            ) : null}
          </CardHeader>

          {plan.engagements.length === 0 ? (
            <CardContent>
              <EmptyState
                icon={<CalendarRange className="h-4 w-4" />}
                title="Belum ada engagement"
                description="Tambahkan minimal satu engagement sebelum plan bisa disubmit untuk approval."
                action={
                  isEditable && canWrite ? (
                    <EngagementPanel
                      workspaceId={auth.workspace.id}
                      planId={plan.id}
                      planVersion={plan.version}
                      entities={candidates}
                      existingEntityIds={existingEntityIds}
                      triggerLabel="Tambah engagement"
                      triggerVariant="primary"
                    />
                  ) : undefined
                }
              />
            </CardContent>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line bg-slate-50/80 text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
                    <th className="px-4 py-3">Engagement</th>
                    <th className="px-4 py-3">Risk</th>
                    <th className="px-4 py-3">Q</th>
                    <th className="px-4 py-3">Budget</th>
                    <th className="px-4 py-3">Actual</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {plan.engagements.map((engagement) => (
                    <tr key={engagement.id} className="align-top hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-ink">
                          {engagement.title}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted">
                          {engagement.entity?.code ?? "—"} ·{" "}
                          {humanize(engagement.engagementType)}
                        </p>
                        {engagement.overrideScore !== null ? (
                          <p className="mt-1 inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                            Override {formatScore(engagement.overrideScore)}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <RiskBadge level={engagement.riskLevel} />
                          <span className="text-xs font-semibold tabular-nums text-ink">
                            {formatScore(engagement.riskScore)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700">
                        {engagement.quarter ? `Q${engagement.quarter}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs font-medium tabular-nums text-ink">
                        {formatHours(engagement.estimatedHours)}
                      </td>
                      <td className="px-4 py-3 text-xs tabular-nums text-slate-700">
                        {formatHours(engagement.actualHours)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={engagement.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {isEditable && canWrite ? (
                            <EngagementPanel
                              workspaceId={auth.workspace.id}
                              planId={plan.id}
                              planVersion={plan.version}
                              entities={candidates}
                              existingEntityIds={existingEntityIds}
                              initial={engagement}
                              triggerLabel="Edit"
                              triggerVariant="ghost"
                              triggerSize="sm"
                            />
                          ) : null}
                          <PlanEngagementActions
                            workspaceId={auth.workspace.id}
                            planId={plan.id}
                            planVersion={plan.version}
                            engagement={engagement}
                            planStatus={plan.status}
                            canWrite={canWrite}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <div>
                <CardTitle>Capacity by role</CardTitle>
                <p className="mt-1 text-xs text-muted">
                  Estimasi jam dibanding kapasitas plan.
                </p>
              </div>
              {isEditable && canWrite ? (
                <CapacityEditor
                  workspaceId={auth.workspace.id}
                  planId={plan.id}
                  planVersion={plan.version}
                  capacities={plan.capacities}
                />
              ) : null}
            </CardHeader>
            <CardContent className="space-y-4">
              {planRoles.map((role) => {
                const estimated = budget.estimatedByRole[role] ?? 0;
                const capacity =
                  plan.capacities.find((row) => row.role === role)
                    ?.availableHours ?? null;
                const warning = plan.summary.warnings.find(
                  (row) => row.role === role,
                );
                const percent =
                  capacity && capacity > 0
                    ? Math.min(100, Math.round((estimated / capacity) * 100))
                    : estimated > 0
                      ? 100
                      : 0;

                return (
                  <div key={role}>
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700">{role}</span>
                      <span
                        className={`tabular-nums ${
                          warning ? "font-semibold text-amber-700" : "text-muted"
                        }`}
                      >
                        {formatHours(estimated)} /{" "}
                        {capacity === null ? "—" : formatHours(capacity)} jam
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${
                          warning?.kind === "exceeded"
                            ? "bg-red-500"
                            : warning?.kind === "unconfigured"
                              ? "bg-amber-500"
                              : "bg-accent"
                        }`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}

              <div className="rounded-lg border border-line bg-slate-50 px-3 py-2.5 text-[11px] text-muted">
                Total {formatHours(budget.totalEstimatedHours)} jam dari{" "}
                {capacityTotal > 0 ? formatHours(capacityTotal) : "—"} jam kapasitas.
                Warning tidak memblokir submit, tetapi perlu dijelaskan ke approver.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Plan information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Objective
                </p>
                <p className="mt-1 whitespace-pre-line leading-5 text-slate-700">
                  {plan.objective}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Scope
                </p>
                <p className="mt-1 whitespace-pre-line leading-5 text-slate-700">
                  {plan.scope}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-50 p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Periode
                  </p>
                  <p className="mt-1 text-slate-700">
                    {formatDateOnly(plan.periodStart)} —{" "}
                    {formatDateOnly(plan.periodEnd)}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Owner
                  </p>
                  <p className="mt-1 text-slate-700">{plan.owner?.name ?? "—"}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-50 p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Submitted
                  </p>
                  <p className="mt-1 text-slate-700">
                    {formatDateTime(plan.submittedAt)}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Approved
                  </p>
                  <p className="mt-1 text-slate-700">
                    {plan.approvedBy?.name ?? "—"}
                    {plan.approvedAt ? ` · ${formatDateTime(plan.approvedAt)}` : ""}
                  </p>
                </div>
              </div>

              {plan.changeReason ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                    Alasan versi ini
                  </p>
                  <p className="mt-1 leading-5 text-amber-900">{plan.changeReason}</p>
                </div>
              ) : null}

              {plan.supersedesId ? (
                <Link
                  href={`/audit-plan/${plan.supersedesId}`}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-strong"
                >
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  Lihat versi sebelumnya
                </Link>
              ) : null}

              {plan.status === "approved" ? (
                <p className="flex items-start gap-1.5 rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-[11px] text-emerald-800">
                  <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                  Plan approved terkunci. Perubahan konten harus melalui versi baru;
                  actual hours dan status eksekusi tetap bisa diperbarui.
                </p>
              ) : null}

              {plan.status === "draft" ? (
                <p className="flex items-start gap-1.5 rounded-lg border border-line bg-slate-50 px-3 py-2 text-[11px] text-muted">
                  <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                  Draft masih bisa diubah. Submit setelah engagement dan kapasitas siap.
                </p>
              ) : null}

              <p className="flex items-start gap-1.5 text-[11px] text-muted">
                <Target className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                Coverage dihitung dari {plan.engagements.length} engagement terhadap
                entity aktif di audit universe.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
