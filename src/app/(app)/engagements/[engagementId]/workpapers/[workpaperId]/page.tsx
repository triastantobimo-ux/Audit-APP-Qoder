import Link from "next/link";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Clock,
  FileCheck2,
  Hash,
  Link2,
  Lock,
  ShieldAlert,
} from "lucide-react";
import { EvidencePanel } from "@/components/evidence-panel";
import { WorkpaperContentPanel } from "@/components/workpaper-content-panel";
import { WorkpaperNotesPanel } from "@/components/workpaper-notes-panel";
import { WorkpaperTransitionActions } from "@/components/workpaper-transition-actions";
import { Avatar } from "@/components/ui/avatar";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { formatDateTime, humanize } from "@/lib/format";
import { can, isRole, type Role } from "@/lib/rbac";
import type { WorkpaperMemberView } from "@/lib/workpaper-view";
import { ApiError } from "@/server/api-error";
import { requirePageAuth } from "@/server/auth";
import {
  getEngagement,
  listEngagementMembers,
} from "@/server/engagement-service";
import { toWorkspaceAccess } from "@/server/page-access";
import { getWorkpaper } from "@/server/workpaper-service";

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

function MemberRow({
  label,
  member,
  note,
}: {
  label: string;
  member: WorkpaperMemberView;
  note: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar name={member.name} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-ink">{member.name}</p>
          <p className="truncate text-[10px] text-muted">{note}</p>
        </div>
      </div>
      <Badge tone="neutral">{label}</Badge>
    </div>
  );
}

export default async function WorkpaperDetailPage({
  params,
}: {
  params: Promise<{ engagementId: string; workpaperId: string }>;
}) {
  const auth = await requirePageAuth();
  const access = toWorkspaceAccess(auth);
  const { engagementId, workpaperId } = await params;

  const workpaper = await getWorkpaper(access, engagementId, workpaperId).catch(
    (error: unknown) => {
      if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
        return null;
      }
      throw error;
    },
  );

  if (!workpaper) {
    return (
      <EmptyState
        icon={<ShieldAlert className="h-5 w-5" aria-hidden="true" />}
        title="Workpaper tidak tersedia"
        description="Workpaper ini belum ada, sudah dipindahkan, atau hanya dapat diakses anggota tim engagement."
        action={
          <Link
            href={`/engagements/${engagementId}`}
            className="text-xs font-semibold text-accent hover:underline"
          >
            Kembali ke engagement
          </Link>
        }
      />
    );
  }

  const engagement = await getEngagement(access, engagementId);
  const allMembers = await listEngagementMembers(access);
  const assignable = allMembers.filter((member) => {
    const role = (member.role ?? "") as Role;
    return isRole(role) && (can(role, "workpaper:write") || can(role, "workpaper:review"));
  });

  const locked = workpaper.status === "signed_off";

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        <Link href="/engagements" className="font-medium hover:text-accent">
          Engagements
        </Link>
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
        <Link
          href={`/engagements/${engagementId}`}
          className="font-mono font-medium hover:text-accent"
        >
          {engagement.code}
        </Link>
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
        <span className="font-mono text-slate-600">{workpaper.reference}</span>
      </nav>

      <PageHeader
        eyebrow={`${engagement.code} · ${workpaper.reference} · ${
          workpaper.templateKey ? humanize(workpaper.templateKey) : "Manual"
        }`}
        title={workpaper.title}
        description={workpaper.purpose}
        actions={<WorkpaperTransitionActions workspaceId={auth.workspace.id} workpaper={workpaper} />}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <Card className="min-w-0">
            <CardHeader className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <CardTitle>Isi workpaper</CardTitle>
                <p className="mt-1 text-xs text-muted">
                  Judul, tujuan, procedure, dan kesimpulan. Perubahan menaikkan
                  versi workpaper.
                </p>
              </div>
              <StatusBadge status={workpaper.status} />
            </CardHeader>
            <CardContent>
              <WorkpaperContentPanel
                workspaceId={auth.workspace.id}
                workpaper={workpaper}
                rcmRows={engagement.rcmRows.map((row) => ({
                  id: row.id,
                  riskDescription: row.riskDescription,
                }))}
              />
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Evidence &amp; catatan review</CardTitle>
              <p className="mt-1 text-xs text-muted">
                Unduhan dan penghapusan evidence tercatat pada audit trail.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <EvidencePanel
                workspaceId={auth.workspace.id}
                engagementId={engagementId}
                workpaperId={workpaper.id}
                evidence={workpaper.evidence}
                canUpload={workpaper.actions.canUploadEvidence}
                canDelete={workpaper.actions.canDeleteEvidence}
                locked={locked}
              />
              <div className="border-t border-line pt-5">
                <WorkpaperNotesPanel
                  workspaceId={auth.workspace.id}
                  engagementId={engagementId}
                  workpaperId={workpaper.id}
                  notes={workpaper.notes}
                  members={assignable}
                  canAdd={workpaper.actions.canAddNote}
                  canResolve={workpaper.actions.canResolveNote}
                  locked={locked}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Status &amp; sign-off</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="accent" className="font-mono">
                  v{workpaper.version}
                </Badge>
                <StatusBadge status={workpaper.status} />
                {locked ? (
                  <span className="flex items-center gap-1 text-[11px] font-medium text-slate-600">
                    <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                    Terkunci permanen
                  </span>
                ) : null}
              </div>

              <div className="space-y-2.5">
                <TimelineRow
                  label="Disusun preparer"
                  value={`Diperbarui ${formatDateTime(workpaper.updatedAt)}`}
                  done
                  icon={FileCheck2}
                />
                <TimelineRow
                  label="Dikirim ke review"
                  value={
                    workpaper.submittedAt
                      ? formatDateTime(workpaper.submittedAt)
                      : "Belum dikirim"
                  }
                  done={Boolean(workpaper.submittedAt)}
                  icon={Clock}
                />
                <TimelineRow
                  label="Ditandai reviewed"
                  value={
                    workpaper.reviewedAt
                      ? formatDateTime(workpaper.reviewedAt)
                      : "Menunggu reviewer"
                  }
                  done={Boolean(workpaper.reviewedAt)}
                  icon={Check}
                />
                <TimelineRow
                  label="Sign-off"
                  value={
                    workpaper.signedOffAt
                      ? `${workpaper.signedOffByName ?? "-"} · ${formatDateTime(workpaper.signedOffAt)}`
                      : "Belum ditandatangani"
                  }
                  done={Boolean(workpaper.signedOffAt)}
                  icon={ShieldAlert}
                />
              </div>

              {workpaper.signoffHash ? (
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                    <Hash className="h-3 w-3" aria-hidden="true" />
                    Hash konten saat sign-off
                  </p>
                  <p className="mt-1 break-all font-mono text-[10px] text-slate-600">
                    {workpaper.signoffHash}
                  </p>
                </div>
              ) : null}

              {workpaper.packageMissing.length > 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-800">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    Belum siap sign-off
                  </p>
                  <ul className="mt-1.5 space-y-1 text-[11px] leading-5 text-amber-800">
                    {workpaper.packageMissing.map((item) => (
                      <li key={item}>· {item}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="flex items-center gap-1.5 text-[11px] text-emerald-700">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Paket kerja lengkap: kesimpulan, evidence, dan catatan resolved.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Tim workpaper</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <MemberRow
                label="Preparer"
                member={workpaper.preparer}
                note="Menyusun konten dan mengumpulkan evidence"
              />
              <MemberRow
                label="Reviewer"
                member={workpaper.reviewer}
                note="Membuat catatan, menandai reviewed, dan sign-off"
              />
              <p className="flex items-start gap-1.5 pt-1 text-[11px] text-muted">
                <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                Preparer tidak dapat menandatangani workpaper sendiri.
              </p>
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Baris RCM terkait</CardTitle>
            </CardHeader>
            <CardContent>
              {workpaper.rcmRow ? (
                <div className="space-y-2 text-xs">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold text-accent">
                    <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Terhubung ke risk-control matrix
                  </p>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                      Risk
                    </p>
                    <p className="mt-0.5 leading-5 text-slate-700">
                      {workpaper.rcmRow.riskDescription}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                      Procedure
                    </p>
                    <p className="mt-0.5 leading-5 text-slate-700">
                      {workpaper.rcmRow.procedureDescription}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                      Evidence yang disyaratkan
                    </p>
                    <p className="mt-0.5 leading-5 text-slate-700">
                      {workpaper.rcmRow.evidenceRequirement}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted">
                  Workpaper ini tidak ditautkan ke baris RCM tertentu.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
