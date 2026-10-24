import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileCheck2,
} from "lucide-react";
import { NewEngagementPanel } from "@/components/new-engagement-panel";
import { PageHeader } from "@/components/ui/page-header";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateOnly, formatHours, humanize } from "@/lib/format";
import { can } from "@/lib/rbac";
import { requirePageAuth } from "@/server/auth";
import {
  listEngagementCreateOptions,
  listEngagements,
} from "@/server/engagement-service";
import { toWorkspaceAccess } from "@/server/page-access";

export default async function EngagementsPage() {
  const auth = await requirePageAuth();
  const access = toWorkspaceAccess(auth);
  const [engagements, options] = await Promise.all([
    listEngagements(access),
    listEngagementCreateOptions(access),
  ]);
  const canWrite = can(auth.membership.role, "engagement:write");
  const suggestedYear =
    options.planCandidates[0]?.plan.year ?? new Date().getFullYear();

  const activeCount = engagements.filter((engagement) =>
    ["planning", "fieldwork", "review"].includes(engagement.status),
  ).length;
  const awaitingReview = engagements.filter(
    (engagement) => engagement.status === "review",
  ).length;
  const rcmGaps = engagements.reduce(
    (total, engagement) => total + engagement.coverage.incompleteRows,
    0,
  );
  const finalized = engagements.filter((engagement) =>
    ["issued", "closed"].includes(engagement.status),
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Engagement workspace"
        title="Eksekusi audit dari planning sampai closure."
        description="Setiap engagement memiliki objective, risk-control matrix, tim dengan pemisahan tugas, dan workflow status yang tercatat."
        actions={
          canWrite ? (
            <NewEngagementPanel
              workspaceId={auth.workspace.id}
              suggestedYear={suggestedYear}
              options={options}
            />
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              Active engagements
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-ink">
              {activeCount}
            </p>
            <p className="mt-1 text-xs text-muted">
              planning, fieldwork, atau review
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              Menunggu review
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-ink">
              {awaitingReview}
            </p>
            <p className="mt-1 text-xs text-muted">siap di-issue approver</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              RCM gaps
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-ink">
              {rcmGaps}
            </p>
            <p className="mt-1 text-xs text-muted">
              baris tanpa procedure/evidence
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              Issued / closed
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-ink">
              {finalized}
            </p>
            <p className="mt-1 text-xs text-muted">hasil audit final</p>
          </CardContent>
        </Card>
      </div>

      {engagements.length === 0 ? (
        <Card className="p-5">
          <EmptyState
            icon={<ClipboardList className="h-4 w-4" />}
            title="Belum ada engagement"
            description="Mulai dari approved plan atau buat engagement ad-hoc dengan alasan yang tercatat."
            action={
              canWrite ? (
                <NewEngagementPanel
                  workspaceId={auth.workspace.id}
                  suggestedYear={suggestedYear}
                  options={options}
                />
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {engagements.map((engagement) => (
            <Link
              key={engagement.id}
              href={`/engagements/${engagement.id}`}
              className="group flex flex-col rounded-xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-teal-200 hover:bg-teal-50/20"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] font-bold uppercase tracking-wide text-accent">
                    {engagement.code}
                  </span>
                  <StatusBadge status={engagement.status} />
                </div>
                <Badge tone="neutral">
                  {humanize(engagement.engagementType)}
                </Badge>
              </div>

              <h2 className="mt-2 text-sm font-semibold text-ink group-hover:text-accent-strong">
                {engagement.title}
              </h2>
              <p className="mt-1 text-xs text-muted">
                {engagement.entity
                  ? `${engagement.entity.code} · ${engagement.entity.name}`
                  : "Tanpa entity"}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {engagement.plan ? (
                  <Badge tone="accent">
                    Plan {engagement.plan.year}
                  </Badge>
                ) : (
                  <Badge tone="warning">Ad-hoc</Badge>
                )}
                <Badge tone="neutral">v{engagement.version}</Badge>
              </div>

              <p className="mt-3 text-[11px] text-muted">
                {engagement.preparer?.name ?? "—"} →{" "}
                {engagement.reviewer?.name ?? "—"} · approver{" "}
                {engagement.approver?.name ?? "—"}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  {formatDateOnly(engagement.startDate)} —{" "}
                  {formatDateOnly(engagement.endDate)}
                </span>
                <span>{formatHours(engagement.budgetHours)} jam</span>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-medium text-slate-700">
                    RCM coverage
                  </span>
                  <span
                    className={`tabular-nums ${
                      engagement.coverage.incompleteRows > 0
                        ? "font-semibold text-amber-700"
                        : "text-muted"
                    }`}
                  >
                    {engagement.coverage.coveragePercent}%
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${
                      engagement.coverage.incompleteRows > 0
                        ? "bg-amber-500"
                        : "bg-accent"
                    }`}
                    style={{
                      width: `${engagement.coverage.coveragePercent}%`,
                    }}
                  />
                </div>
                <p className="mt-1.5 text-[10px] text-muted">
                  {engagement.coverage.completeRows}/
                  {engagement.coverage.totalRows} baris lengkap
                  {engagement.coverage.incompleteRows > 0
                    ? ` · ${engagement.coverage.incompleteRows} perlu dilengkapi`
                    : ""}
                </p>
              </div>

              <div className="mt-4 flex items-center gap-3 border-t border-line pt-3 text-[10px] text-muted">
                {engagement.coverage.incompleteRows > 0 ? (
                  <span className="inline-flex items-center gap-1 text-amber-700">
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                    RCM belum lengkap
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-emerald-700">
                    <FileCheck2 className="h-3 w-3" aria-hidden="true" />
                    RCM lengkap
                  </span>
                )}
                {engagement.status === "issued" ||
                engagement.status === "closed" ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700">
                    <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                    Final
                  </span>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
