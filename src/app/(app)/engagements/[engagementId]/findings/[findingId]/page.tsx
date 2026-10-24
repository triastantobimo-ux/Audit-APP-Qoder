import Link from "next/link";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Link2,
  Lock,
  Paperclip,
  ShieldAlert,
  UserCheck,
} from "lucide-react";
import { FindingContentPanel } from "@/components/finding-content-panel";
import { FindingResponsePanel } from "@/components/finding-response-panel";
import { FindingTransitionActions } from "@/components/finding-transition-actions";
import { Avatar } from "@/components/ui/avatar";
import { Badge, FindingBadge, RiskBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { formatBytes, formatDateOnly, formatDateTime, relativeTime } from "@/lib/format";
import { findingStatusLabels, type FindingStatus } from "@/lib/finding";
import type { FindingMemberView } from "@/lib/finding-view";
import { can, isRole, type Role } from "@/lib/rbac";
import { ApiError } from "@/server/api-error";
import { requirePageAuth } from "@/server/auth";
import { getEngagement, listEngagementMembers } from "@/server/engagement-service";
import { getFinding } from "@/server/finding-service";
import { toWorkspaceAccess } from "@/server/page-access";
import { listWorkpapers } from "@/server/workpaper-service";

function TimelineRow({
  label,
  value,
  done,
  icon: Icon,
}: {
  label: string;
  value: string;
  done: boolean;
  icon: typeof Check;
}) {
  return (
    <div className="flex items-center gap-2.5 text-xs">
      <span
        className={
          done
            ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"
            : "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400"
        }
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="font-medium text-ink">{label}</p>
        <p className="truncate text-[11px] text-muted">{value}</p>
      </div>
    </div>
  );
}

function PartyRow({
  label,
  member,
  note,
}: {
  label: string;
  member: FindingMemberView | null;
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

export default async function FindingDetailPage({
  params,
}: {
  params: Promise<{ engagementId: string; findingId: string }>;
}) {
  const auth = await requirePageAuth();
  const access = toWorkspaceAccess(auth);
  const { engagementId, findingId } = await params;

  const finding = await getFinding(access, engagementId, findingId).catch(
    (error: unknown) => {
      if (
        error instanceof ApiError &&
        (error.status === 403 || error.status === 404)
      ) {
        return null;
      }
      throw error;
    },
  );

  if (!finding) {
    return (
      <EmptyState
        icon={<ShieldAlert className="h-5 w-5" aria-hidden="true" />}
        title="Temuan tidak tersedia"
        description="Temuan ini belum ada, atau hanya dapat diakses penanggung jawab remediasi dan tim engagement."
        action={
          <Link
            href="/remediation"
            className="text-xs font-semibold text-accent hover:underline"
          >
            Kembali ke register remediasi
          </Link>
        }
      />
    );
  }

  const canReadEngagement = can(auth.membership.role, "engagement:read");
  const engagement = canReadEngagement
    ? await getEngagement(access, engagementId).catch(() => null)
    : null;

  const editorOptions = finding.actions.canEdit
    ? {
        owners: (await listEngagementMembers(access)).filter((member) => {
          const role = (member.role ?? "") as Role;
          return isRole(role) && can(role, "finding:respond");
        }),
        workpapers: (await listWorkpapers(access, engagementId)).map(
          (workpaper) => ({
            id: workpaper.id,
            reference: workpaper.reference,
            title: workpaper.title,
          }),
        ),
        rcmRows:
          engagement?.rcmRows.map((row) => ({
            id: row.id,
            riskDescription: row.riskDescription,
          })) ?? [],
      }
    : { owners: [], workpapers: [], rcmRows: [] };

  const terminal =
    finding.status === "closed" || finding.status === "accepted_risk";
  const dueLabel = finding.dueDate
    ? formatDateOnly(finding.dueDate)
    : "Belum ada target";

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        <Link href="/engagements" className="font-medium hover:text-accent">
          Engagements
        </Link>
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
        {engagement && canReadEngagement ? (
          <Link
            href={`/engagements/${engagementId}`}
            className="font-mono font-medium hover:text-accent"
          >
            {finding.engagement.code}
          </Link>
        ) : (
          <span className="font-mono">{finding.engagement.code}</span>
        )}
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
        <span className="font-mono text-slate-600">{finding.reference}</span>
      </nav>

      <PageHeader
        eyebrow={`${finding.engagement.code} · ${finding.reference} · ${
          finding.workpaper
            ? finding.workpaper.reference
            : "Tanpa workpaper sumber"
        }`}
        title={finding.title}
        description={finding.condition}
        actions={<FindingTransitionActions workspaceId={auth.workspace.id} finding={finding} />}
      />

      <div className="flex flex-wrap items-center gap-2">
        <FindingBadge status={finding.status} />
        <RiskBadge level={finding.severity} />
        <Badge tone="neutral">v{finding.version}</Badge>
        <Badge tone="neutral">Progres {finding.progressPercent}%</Badge>
        <span className={`text-xs ${finding.isOverdue ? "font-semibold text-danger" : "text-muted"}`}>
          Target {dueLabel}
          {finding.isOverdue ? " · terlambat" : ""}
        </span>
        {finding.owner ? (
          <span className="text-xs text-muted">
            Penanggung jawab {finding.owner.name}
          </span>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <Card className="min-w-0">
            <CardHeader className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <CardTitle>Analisis temuan (5C)</CardTitle>
                <p className="mt-1 text-xs text-muted">
                  Kondisi, kriteria, sebab, akibat, dan rekomendasi. Perubahan
                  menaikkan versi temuan.
                </p>
              </div>
              <FindingBadge status={finding.status} />
            </CardHeader>
            <CardContent>
              <FindingContentPanel
                workspaceId={auth.workspace.id}
                finding={finding}
                owners={editorOptions.owners}
                workpapers={editorOptions.workpapers}
                rcmRows={editorOptions.rcmRows}
              />
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Respons manajemen &amp; remediasi</CardTitle>
              <p className="mt-1 text-xs text-muted">
                Process Owner mengisi respons dan rencana aksi, lalu memajukan
                validasi audit.
              </p>
            </CardHeader>
            <CardContent>
              <FindingResponsePanel
                workspaceId={auth.workspace.id}
                finding={finding}
              />
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Status &amp; alur remediasi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <FindingBadge status={finding.status} />
                {terminal ? (
                  <span className="flex items-center gap-1 text-[11px] font-medium text-slate-600">
                    <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                    {finding.status === "closed"
                      ? "Ditutup oleh audit"
                      : "Risiko diterima"}
                  </span>
                ) : null}
              </div>

              <div className="space-y-2.5">
                <TimelineRow
                  label="Dikomunikasikan ke manajemen"
                  value={
                    finding.communicatedAt
                      ? formatDateTime(finding.communicatedAt)
                      : "Draf — belum dikirim"
                  }
                  done={Boolean(finding.communicatedAt)}
                  icon={Clock}
                />
                <TimelineRow
                  label="Remediasi berjalan"
                  value={
                    finding.remediationStartedAt
                      ? `${formatDateTime(finding.remediationStartedAt)} · progres ${finding.progressPercent}%`
                      : "Menunggu respons manajemen"
                  }
                  done={Boolean(finding.remediationStartedAt)}
                  icon={Check}
                />
                <TimelineRow
                  label="Diajukan untuk validasi"
                  value={
                    finding.validationSubmittedAt
                      ? formatDateTime(finding.validationSubmittedAt)
                      : "Belum diajukan"
                  }
                  done={Boolean(finding.validationSubmittedAt)}
                  icon={UserCheck}
                />
                <TimelineRow
                  label={finding.status === "accepted_risk" ? "Risiko diterima" : "Ditutup"}
                  value={
                    finding.closedAt
                      ? `${finding.validatedBy?.name ?? "-"} · ${formatDateTime(finding.closedAt)}`
                      : finding.riskAcceptedAt
                        ? `${finding.riskAcceptedBy?.name ?? "-"} · ${formatDateTime(finding.riskAcceptedAt)}`
                        : "Masih terbuka"
                  }
                  done={Boolean(finding.closedAt ?? finding.riskAcceptedAt)}
                  icon={CheckCircle2}
                />
              </div>

              {finding.reopenedAt ? (
                <p className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50/70 px-3 py-2 text-[11px] text-red-800">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                  Dikembalikan audit {formatDateTime(finding.reopenedAt)}. Remediasi
                  harus dilengkapi ulang sebelum validasi.
                </p>
              ) : null}

              {!finding.readiness.ready && !terminal ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-800">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    Belum siap dikomunikasikan
                  </p>
                  <ul className="mt-1.5 space-y-1 text-[11px] leading-5 text-amber-800">
                    {finding.readiness.missing.map((item) => (
                      <li key={item}>· {item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <p className="text-[11px] text-muted">
                Diperbarui {relativeTime(finding.updatedAt)} ·{" "}
                {findingStatusLabels[finding.status as FindingStatus]}
              </p>
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Pihak &amp; pemisahan tugas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <PartyRow
                label="Analis"
                member={finding.createdBy}
                note="Menyusun kondisi, kriteria, dan rekomendasi"
              />
              <PartyRow
                label="Penanggung jawab"
                member={finding.owner}
                note="Process owner yang merespons dan menjalankan remediasi"
              />
              <PartyRow
                label="Validator"
                member={finding.validatedBy}
                note="Menutup temuan setelah bukti perbaikan cukup"
              />
              <p className="flex items-start gap-1.5 pt-1 text-[11px] text-muted">
                <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                Penanggung jawab remediasi tidak dapat memvalidasi atau menutup
                temuanya sendiri.
              </p>
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Sumber &amp; bukti</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              {finding.workpaper ? (
                canReadEngagement ? (
                  <Link
                    href={`/engagements/${engagementId}/workpapers/${finding.workpaper.id}`}
                    className="flex items-start gap-2 rounded-lg border border-line px-3 py-2.5 transition-colors hover:border-slate-300 hover:bg-slate-50"
                  >
                    <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block font-mono text-[11px] text-muted">
                        {finding.workpaper.reference}
                      </span>
                      <span className="block truncate font-semibold text-ink">
                        {finding.workpaper.title}
                      </span>
                    </span>
                  </Link>
                ) : (
                  <p className="rounded-lg border border-line px-3 py-2.5 text-[11px] text-muted">
                    {finding.workpaper.reference} · {finding.workpaper.title}
                  </p>
                )
              ) : (
                <p className="text-[11px] text-muted">
                  Temuan ini tidak ditautkan ke workpaper.
                </p>
              )}

              {finding.rcmRow ? (
                <div className="rounded-lg bg-slate-50 px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                    <Link2 className="h-3 w-3" aria-hidden="true" />
                    Baris RCM terkait
                  </p>
                  <p className="mt-1 leading-5 text-slate-700">
                    {finding.rcmRow.riskDescription}
                  </p>
                  <p className="mt-1 leading-5 text-slate-600">
                    {finding.rcmRow.controlDescription}
                  </p>
                </div>
              ) : null}

              <div>
                <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  <Paperclip className="h-3 w-3" aria-hidden="true" />
                  Evidence dari workpaper sumber ({finding.evidence.length})
                </p>
                {finding.evidence.length === 0 ? (
                  <p className="mt-1 text-[11px] text-muted">
                    Evidence dilampirkan pada workpaper sumber temuan.
                  </p>
                ) : (
                  <ul className="mt-1.5 space-y-1.5">
                    {finding.evidence.map((evidence) => (
                      <li
                        key={evidence.id}
                        className="rounded-lg border border-line px-3 py-2"
                      >
                        <p className="truncate text-[11px] font-semibold text-ink">
                          {evidence.label}
                        </p>
                        <p className="mt-0.5 truncate text-[10px] text-muted">
                          {evidence.fileName} · {formatBytes(evidence.sizeBytes)} · v
                          {evidence.version}
                          {evidence.uploadedBy ? ` · ${evidence.uploadedBy.name}` : ""}
                          {evidence.deletedAt ? " · dihapus" : ""}
                        </p>
                        <p className="mt-0.5 break-all font-mono text-[10px] text-slate-500">
                          {evidence.sha256.slice(0, 16)}…
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
