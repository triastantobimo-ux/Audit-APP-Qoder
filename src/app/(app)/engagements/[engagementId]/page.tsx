import Link from "next/link";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  ClipboardList,
  Clock,
  FileCheck2,
  Link2,
  Lock,
  ShieldAlert,
  Target,
} from "lucide-react";
import { EngagementEditPanel } from "@/components/engagement-edit-panel";
import { NewFindingPanel } from "@/components/new-finding-panel";
import { NewWorkpaperPanel } from "@/components/new-workpaper-panel";
import { RcmRowActions } from "@/components/rcm-row-actions";
import { RcmRowPanel } from "@/components/rcm-row-panel";
import { TransitionActions } from "@/components/transition-actions";
import { Avatar } from "@/components/ui/avatar";
import { Badge, FindingBadge, RiskBadge, StatusBadge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { engagementStatuses } from "@/lib/engagement";
import {
  formatDateOnly,
  formatDateTime,
  formatHours,
  formatScore,
  humanize,
} from "@/lib/format";
import type { EngagementMemberView } from "@/lib/engagement-view";
import { can, isRole, type Role } from "@/lib/rbac";
import { requirePageAuth } from "@/server/auth";
import {
  getEngagement,
  listEngagementMembers,
} from "@/server/engagement-service";
import { listEngagementFindings } from "@/server/finding-service";
import { toWorkspaceAccess } from "@/server/page-access";
import {
  isWorkpaperTeamMember,
  summarizeWorkpaperPackageForEngagement,
} from "@/server/workpaper-service";

function TeamRow({
  label,
  member,
  note,
}: {
  label: string;
  member: EngagementMemberView | null;
  note: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        {member ? (
          <Avatar name={member.name} size="sm" />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-[10px] text-muted">
            —
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-ink">
            {member?.name ?? "Belum ditetapkan"}
          </p>
          <p className="truncate text-[10px] text-muted">{note}</p>
        </div>
      </div>
      <Badge tone="neutral">{label}</Badge>
    </div>
  );
}

export default async function EngagementDetailPage({
  params,
}: {
  params: Promise<{ engagementId: string }>;
}) {
  const auth = await requirePageAuth();
  const access = toWorkspaceAccess(auth);
  const { engagementId } = await params;
  const [engagement, members] = await Promise.all([
    getEngagement(access, engagementId),
    listEngagementMembers(access),
  ]);

  const canWrite = can(auth.membership.role, "engagement:write");
  const isEditable = ["draft", "planning", "fieldwork"].includes(
    engagement.status,
  );
  const currentStep = engagementStatuses.indexOf(
    engagement.status as (typeof engagementStatuses)[number],
  );
  const coverage = engagement.coverage;
  const rowIds = engagement.rcmRows.map((row) => row.id);

  const isTeam = isWorkpaperTeamMember(
    {
      preparerId: engagement.preparer?.id,
      reviewerId: engagement.reviewer?.id,
      approverId: engagement.approver?.id,
    },
    access,
  );
  const canReadWorkpapers = can(auth.membership.role, "workpaper:read") && isTeam;
  const workpapers = canReadWorkpapers
    ? await summarizeWorkpaperPackageForEngagement(access, engagement.id)
    : null;
  const canCreateWorkpaper =
    can(auth.membership.role, "workpaper:write") && isEditable;

  const canReadFindings = can(auth.membership.role, "finding:read") && isTeam;
  const findings = canReadFindings
    ? await listEngagementFindings(access, engagement.id)
    : null;
  const findingsOpen = ["draft", "planning", "fieldwork", "review"].includes(
    engagement.status,
  );
  const canCreateFinding =
    can(auth.membership.role, "finding:write") && findingsOpen;
  const ownerCandidates = members.filter((member) => {
    const role = (member.role ?? "") as Role;
    return isRole(role) && can(role, "finding:respond");
  });
  const openFindings = findings?.filter(
    (item) => item.status !== "closed" && item.status !== "accepted_risk",
  );

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        <Link href="/engagements" className="font-medium hover:text-accent">
          Engagements
        </Link>
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
        <span className="font-mono">{engagement.code}</span>
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
        <span className="text-slate-600">Versi {engagement.version}</span>
      </nav>

      <PageHeader
        eyebrow={`${engagement.code} · ${humanize(engagement.engagementType)}`}
        title={engagement.title}
        description={engagement.objective}
        actions={
          <>
            {isEditable && canWrite ? (
              <EngagementEditPanel
                workspaceId={auth.workspace.id}
                engagement={engagement}
                members={members}
              />
            ) : null}
            <TransitionActions
              workspaceId={auth.workspace.id}
              engagement={engagement}
              role={auth.membership.role}
              currentUserId={auth.user.id}
            />
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={engagement.status} />
        <Badge tone="neutral">v{engagement.version}</Badge>
        {engagement.entity ? (
          <Link
            href={`/audit-universe/${engagement.entity.id}`}
            className="text-xs font-medium text-accent hover:text-accent-strong"
          >
            {engagement.entity.code} · {engagement.entity.name}
          </Link>
        ) : null}
        <span className="text-xs text-muted">
          {formatDateOnly(engagement.startDate)} —{" "}
          {formatDateOnly(engagement.endDate)}
        </span>
        {engagement.plan ? (
          <>
            <span className="text-xs text-muted">·</span>
            <Link
              href={`/audit-plan/${engagement.plan.id}`}
              className="inline-flex items-center gap-1 text-xs text-muted hover:text-accent"
            >
              <Link2 className="h-3 w-3" aria-hidden="true" />
              Plan {engagement.plan.year}
            </Link>
          </>
        ) : (
          <Badge tone="warning">Ad-hoc</Badge>
        )}
      </div>

      <div className="rounded-xl border border-line bg-surface px-4 py-3">
        <div className="overflow-x-auto">
          <ol className="flex min-w-[680px] items-center gap-1">
            {engagementStatuses.map((status, index) => {
              const done = index < currentStep;
              const current = index === currentStep;
              const finalStep =
                engagement.status === "closed" && index === currentStep;

              return (
                <li
                  key={status}
                  className="flex flex-1 items-center gap-2"
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                      done || finalStep
                        ? "bg-accent text-white"
                        : current
                          ? "bg-accent-soft text-accent-strong ring-2 ring-accent"
                          : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {done || finalStep ? (
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span
                    className={`text-[11px] font-semibold ${
                      current ? "text-accent-strong" : done ? "text-ink" : "text-muted"
                    }`}
                  >
                    {humanize(status)}
                  </span>
                  {index < engagementStatuses.length - 1 ? (
                    <ChevronRight
                      className="ml-auto h-3 w-3 shrink-0 text-slate-300"
                      aria-hidden="true"
                    />
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              Budget
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-ink">
              {formatHours(engagement.budgetHours)}{" "}
              <span className="text-sm font-medium text-muted">jam</span>
            </p>
            <p className="mt-1 text-xs text-muted">
              {formatDateOnly(engagement.startDate)} —{" "}
              {formatDateOnly(engagement.endDate)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              RCM coverage
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-ink">
              {coverage.coveragePercent}%
            </p>
            <p
              className={`mt-1 text-xs ${
                coverage.incompleteRows > 0
                  ? "font-medium text-amber-700"
                  : "text-muted"
              }`}
            >
              {coverage.completeRows}/{coverage.totalRows} baris lengkap
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              Tim engagement
            </p>
            <p className="mt-2 text-sm font-semibold text-ink">
              {engagement.preparer?.name ?? "—"}
            </p>
            <p className="mt-1 text-xs text-muted">
              Reviewer {engagement.reviewer?.name ?? "—"} · Approver{" "}
              {engagement.approver?.name ?? "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              Risk snapshot
            </p>
            {engagement.riskAssessment ? (
              <>
                <div className="mt-2 flex items-center gap-2">
                  <RiskBadge level={engagement.riskAssessment.riskLevel} />
                  <span className="text-sm font-semibold tabular-nums text-ink">
                    {formatScore(engagement.riskAssessment.residualScore)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  approved{" "}
                  {formatDateOnly(engagement.riskAssessment.approvedAt)}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm font-semibold text-muted">
                Belum terhubung
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {coverage.incompleteRows > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 text-amber-700"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-semibold text-ink">
                RCM belum lengkap
              </p>
              <p className="mt-1 text-xs text-amber-800">
                {coverage.rowsMissingProcedure} baris tanpa procedure dan{" "}
                {coverage.rowsMissingEvidence} baris tanpa evidence. Fieldwork
                tidak bisa dimulai sampai seluruh baris lengkap.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <Card className="min-w-0">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Risk-control matrix</CardTitle>
            <p className="mt-1 text-xs text-muted">
              Risiko, kontrol, assertion, procedure, dan evidence per baris.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                Coverage
              </p>
              <p className="text-sm font-semibold tabular-nums text-ink">
                {coverage.coveragePercent}%
              </p>
            </div>
            {isEditable && canWrite ? (
              <RcmRowPanel
                workspaceId={auth.workspace.id}
                engagementId={engagement.id}
                version={engagement.version}
                triggerLabel="Tambah baris"
              />
            ) : null}
          </div>
        </CardHeader>

        {engagement.rcmRows.length === 0 ? (
          <CardContent>
            <div className="rounded-lg border border-dashed border-line px-4 py-8 text-center">
              <ClipboardList
                className="mx-auto h-6 w-6 text-slate-400"
                aria-hidden="true"
              />
              <p className="mt-2 text-sm font-semibold text-ink">
                Belum ada baris RCM
              </p>
              <p className="mt-1 text-xs text-muted">
                Tambahkan minimal satu risiko dengan procedure dan evidence
                sebelum memulai fieldwork.
              </p>
            </div>
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line bg-slate-50/80 text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
                  <th className="w-10 px-3 py-3">#</th>
                  <th className="px-4 py-3">Risk</th>
                  <th className="px-4 py-3">Control</th>
                  <th className="px-4 py-3">Assertion</th>
                  <th className="px-4 py-3">Procedure</th>
                  <th className="px-4 py-3">Evidence</th>
                  {isEditable && canWrite ? (
                    <th className="px-3 py-3 text-right">Aksi</th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-line align-top">
                {engagement.rcmRows.map((row, index) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-3 py-3 text-xs tabular-nums text-muted">
                      {index + 1}
                    </td>
                    <td className="max-w-[220px] px-4 py-3 text-xs leading-5 text-slate-700">
                      {row.riskDescription}
                    </td>
                    <td className="max-w-[220px] px-4 py-3 text-xs leading-5 text-slate-700">
                      {row.controlDescription}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone="accent">
                        {humanize(row.assertion)}
                      </Badge>
                    </td>
                    <td className="max-w-[240px] px-4 py-3 text-xs leading-5 text-slate-700">
                      {row.procedureDescription}
                    </td>
                    <td className="max-w-[200px] px-4 py-3 text-xs leading-5 text-slate-700">
                      {row.evidenceRequirement}
                    </td>
                    {isEditable && canWrite ? (
                      <td className="px-3 py-3">
                        <div className="flex flex-col items-end gap-1">
                          <RcmRowPanel
                            workspaceId={auth.workspace.id}
                            engagementId={engagement.id}
                            version={engagement.version}
                            initial={row}
                            triggerLabel="Edit"
                            triggerVariant="ghost"
                            triggerSize="sm"
                          />
                          <RcmRowActions
                            workspaceId={auth.workspace.id}
                            engagementId={engagement.id}
                            version={engagement.version}
                            orderedIds={rowIds}
                            rowId={row.id}
                            index={index}
                            label={`Baris ${index + 1} (${row.riskDescription.slice(0, 60)}…)`}
                          />
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t border-line px-5 py-3">
          <div className="flex items-center gap-2 text-[11px] text-muted">
            <FileCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
            {coverage.incompleteRows === 0 && coverage.totalRows > 0
              ? "Seluruh baris memiliki procedure dan evidence."
              : `${coverage.incompleteRows} baris belum lengkap.`}
          </div>
        </div>
      </Card>

      {workpapers ? (
        <Card className="min-w-0">
          <CardHeader className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>Workpaper &amp; evidence</CardTitle>
              <CardDescription>
                {workpapers.totals.workpapers} workpaper ·{" "}
                {workpapers.totals.signedOff} sign-off ·{" "}
                {workpapers.totals.evidence} evidence aktif ·{" "}
                {workpapers.totals.openBlockingNotes} catatan blocking open
              </CardDescription>
            </div>
            {canCreateWorkpaper ? (
              <NewWorkpaperPanel
                workspaceId={auth.workspace.id}
                engagementId={engagement.id}
                rcmRows={engagement.rcmRows.map((row) => ({
                  id: row.id,
                  riskDescription: row.riskDescription,
                }))}
              />
            ) : null}
          </CardHeader>

          <CardContent className="space-y-2">
            {workpapers.items.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-xs text-muted">
                Belum ada workpaper. Mulai dari template uji pengendalian, uji
                substantif, atau review analitis.
              </p>
            ) : null}

            {workpapers.items.map((item) => (
              <Link
                key={item.id}
                href={`/engagements/${engagement.id}/workpapers/${item.id}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line px-3 py-2.5 transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                <Badge tone="accent" className="shrink-0 font-mono">
                  {item.reference}
                </Badge>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-ink">
                    {item.title}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-muted">
                    {item.preparer.name} → {item.reviewer.name} · v
                    {item.version} · {item.evidenceCount} evidence
                    {item.openNotes > 0
                      ? ` · ${item.openNotes} catatan open`
                      : ""}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {item.openBlockingNotes > 0 ? (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-danger">
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                      {item.openBlockingNotes} blocking
                    </span>
                  ) : null}
                  <StatusBadge status={item.status} />
                  <ChevronRight className="h-4 w-4 text-muted" aria-hidden="true" />
                </div>

                {item.signedOffAt ? (
                  <p className="w-full border-t border-line pt-1.5 text-[11px] text-muted">
                    Ditandatangani {item.signedOffByName ?? "-"} ·{" "}
                    {formatDateTime(item.signedOffAt)}
                  </p>
                ) : !item.packageComplete ? (
                  <p className="w-full border-t border-line pt-1.5 text-[11px] text-amber-700">
                    {item.packageMissing.join(" · ")}
                  </p>
                ) : null}
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {findings ? (
        <Card className="min-w-0">
          <CardHeader className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>Temuan &amp; remediasi</CardTitle>
              <CardDescription>
                {findings.length} temuan · {openFindings?.length ?? 0} masih
                open ·{" "}
                {findings.filter((item) => item.isOverdue).length} melewati
                target
              </CardDescription>
            </div>
            {canCreateFinding ? (
              <NewFindingPanel
                workspaceId={auth.workspace.id}
                engagementId={engagement.id}
                owners={ownerCandidates}
                workpapers={(workpapers?.items ?? []).map((item) => ({
                  id: item.id,
                  reference: item.reference,
                  title: item.title,
                }))}
                rcmRows={engagement.rcmRows.map((row) => ({
                  id: row.id,
                  riskDescription: row.riskDescription,
                }))}
              />
            ) : null}
          </CardHeader>

          <CardContent className="space-y-2">
            {findings.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-xs text-muted">
                Belum ada temuan. Catat selisih kondisi terhadap kriteria dari
                workpaper yang sudah disign-off.
              </p>
            ) : null}

            {findings.map((item) => (
              <Link
                key={item.id}
                href={`/engagements/${engagement.id}/findings/${item.id}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line px-3 py-2.5 transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                <Badge tone="accent" className="shrink-0 font-mono">
                  {item.reference}
                </Badge>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-ink">
                    {item.title}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-muted">
                    {item.owner?.name ?? "Penanggung jawab belum ditetapkan"} ·
                    target{" "}
                    {item.dueDate ? formatDateOnly(item.dueDate) : "—"} · v
                    {item.version}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {item.isOverdue ? (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-danger">
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                      Terlambat
                    </span>
                  ) : null}
                  <RiskBadge level={item.severity} />
                  <FindingBadge status={item.status} />
                  <ChevronRight className="h-4 w-4 text-muted" aria-hidden="true" />
                </div>

                <div className="flex w-full items-center gap-2 border-t border-line pt-1.5">
                  <div className="h-1 w-full max-w-40 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-teal-500"
                      style={{ width: `${item.progressPercent}%` }}
                      aria-hidden="true"
                    />
                  </div>
                  <span className="text-[11px] text-muted">
                    Progres {item.progressPercent}%
                  </span>
                  {item.workpaper ? (
                    <span className="ml-auto text-[11px] text-muted">
                      {item.workpaper.reference}
                    </span>
                  ) : null}
                </div>
              </Link>
            ))}
          </CardContent>

          <div className="border-t border-line px-5 py-3">
            <Link
              href="/remediation"
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-accent hover:text-accent-strong"
            >
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
              Buka register remediasi workspace
            </Link>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Tim & pemisahan tugas</CardTitle>
            <p className="mt-1 text-xs text-muted">
              Reviewer tidak boleh sama dengan preparer; approver menerbitkan
              hasil.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            <TeamRow
              label="Preparer"
              member={engagement.preparer}
              note="Menyusun RCM dan mengeksekusi procedure"
            />
            <TeamRow
              label="Reviewer"
              member={engagement.reviewer}
              note="Mereview kualitas dan mengembalikan bila perlu"
            />
            <TeamRow
              label="Approver"
              member={engagement.approver}
              note="Meng-issue dan menutup engagement"
            />
            <p className="flex items-start gap-1.5 pt-1 text-[11px] text-muted">
              <ShieldAlert
                className="mt-0.5 h-3 w-3 shrink-0"
                aria-hidden="true"
              />
              Penugasan tim divalidasi saat dibuat dan setiap perubahan.
            </p>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Engagement information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                Objective
              </p>
              <p className="mt-1 whitespace-pre-line leading-5 text-slate-700">
                {engagement.objective}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                Scope
              </p>
              <p className="mt-1 whitespace-pre-line leading-5 text-slate-700">
                {engagement.scope}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-slate-50 p-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Entity
                </p>
                <p className="mt-1 text-slate-700">
                  {engagement.entity
                    ? `${engagement.entity.code} · ${engagement.entity.name}`
                    : "—"}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Sumber
                </p>
                <p className="mt-1 text-slate-700">
                  {engagement.plan
                    ? `Plan ${engagement.plan.year} · ${engagement.plan.title}`
                    : "Ad-hoc"}
                </p>
              </div>
            </div>

            {engagement.adHocReason ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                  Alasan ad-hoc
                </p>
                <p className="mt-1 leading-5 text-amber-900">
                  {engagement.adHocReason}
                </p>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-slate-50 p-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Periode
                </p>
                <p className="mt-1 text-slate-700">
                  {formatDateOnly(engagement.startDate)} —{" "}
                  {formatDateOnly(engagement.endDate)}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Template
                </p>
                <p className="mt-1 text-slate-700">
                  {engagement.templateKey
                    ? humanize(engagement.templateKey)
                    : "—"}
                </p>
              </div>
            </div>

            {engagement.status === "review" ? (
              <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-[11px] text-amber-800">
                <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                RCM terkunci selama review. Reviewer dapat mengembalikan ke
                fieldwork dengan catatan.
              </p>
            ) : null}

            {engagement.status === "issued" ||
            engagement.status === "closed" ? (
              <p className="flex items-start gap-1.5 rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-[11px] text-emerald-800">
                <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                Engagement final dan terkunci. Issued{" "}
                {formatDateTime(engagement.issuedAt)}
                {engagement.closedAt
                  ? ` · closed ${formatDateTime(engagement.closedAt)}`
                  : ""}
                .
              </p>
            ) : null}

            {engagement.status === "draft" ? (
              <p className="flex items-start gap-1.5 rounded-lg border border-line bg-slate-50 px-3 py-2 text-[11px] text-muted">
                <Target
                  className="mt-0.5 h-3 w-3 shrink-0"
                  aria-hidden="true"
                />
                Draft dapat diubah. Mulai planning setelah objective, scope,
                jadwal, dan tim siap.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Workflow timeline</CardTitle>
            <p className="mt-1 text-xs text-muted">
              Setiap transisi menyimpan actor, waktu, dan catatan.
            </p>
          </div>
          <Badge tone="neutral">{engagement.transitions.length} transisi</Badge>
        </CardHeader>
        <CardContent>
          {engagement.transitions.length === 0 ? (
            <p className="text-xs text-muted">Belum ada transisi.</p>
          ) : (
            <ol className="space-y-3">
              {[...engagement.transitions].reverse().map((transition) => (
                <li
                  key={transition.id}
                  className="flex items-start gap-3 rounded-lg border border-line px-3 py-2.5"
                >
                  <span
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                      transition.action === "send_back"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-teal-50 text-accent"
                    }`}
                  >
                    {transition.action === "send_back" ? (
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-ink">
                      {humanize(transition.fromStatus)} →{" "}
                      {humanize(transition.toStatus)}
                      {transition.action === "send_back" ? " · dikembalikan" : ""}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {transition.actor?.name ?? "System"} ·{" "}
                      {formatDateTime(transition.createdAt)}
                    </p>
                    {transition.note ? (
                      <p className="mt-1 text-[11px] leading-5 text-slate-700">
                        {transition.note}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
