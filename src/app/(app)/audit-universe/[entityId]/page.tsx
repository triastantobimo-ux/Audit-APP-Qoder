import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  ChevronRight,
  Layers,
  Network,
  Tags,
  UserRound,
} from "lucide-react";
import { AssessmentPanel } from "@/components/assessment-panel";
import { ArchiveEntityButton } from "@/components/archive-entity-button";
import { CreateAssessmentCard } from "@/components/create-assessment-card";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, RiskBadge, StatusBadge, TypeBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatScore, humanize } from "@/lib/format";
import { can } from "@/lib/rbac";
import type { AssessmentView } from "@/lib/assessment-view";
import { requirePageAuth } from "@/server/auth";
import { getEntity } from "@/server/entity-service";
import { toWorkspaceAccess } from "@/server/page-access";
import {
  getActiveCycle,
  getDefaultRiskModel,
  listAssessmentsForEntity,
} from "@/server/risk-service";

type Params = { params: Promise<{ entityId: string }> };

export default async function EntityDetailPage({ params }: Params) {
  const auth = await requirePageAuth();
  const access = toWorkspaceAccess(auth);
  const { entityId } = await params;

  let entity;

  try {
    entity = await getEntity(access, entityId);
  } catch {
    notFound();
  }

  const [assessments, cycle, model] = await Promise.all([
    listAssessmentsForEntity(access, entityId),
    getActiveCycle(access),
    getDefaultRiskModel(access),
  ]);

  const currentAssessment =
    assessments.find((assessment) => assessment.cycleId === cycle?.id) ??
    assessments[0] ??
    null;

  const canWrite = can(auth.membership.role, "assessment:write");
  const canApprove = can(auth.membership.role, "assessment:approve");
  const canArchive = can(auth.membership.role, "entity:archive");
  const hasChildren = entity.children.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs text-muted">
        <Link href="/audit-universe" className="inline-flex items-center gap-1 hover:text-accent">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Audit universe
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-slate-300" aria-hidden="true" />
        <span>{entity.parent?.name ?? "Root"}</span>
        <ChevronRight className="h-3.5 w-3.5 text-slate-300" aria-hidden="true" />
        <span className="font-medium text-ink">{entity.name}</span>
      </div>

      <PageHeader
        eyebrow={`${entity.code} · ${humanize(entity.type)}`}
        title={entity.name}
        description={entity.description ?? "Belum ada deskripsi entity."}
        actions={
          <>
            <TypeBadge type={entity.type} />
            <StatusBadge status={entity.status} />
            {canArchive ? (
              <ArchiveEntityButton
                workspaceId={auth.workspace.id}
                entityId={entity.id}
                version={entity.version}
                disabled={hasChildren}
                disabledReason="Archive atau pindahkan child entity terlebih dahulu."
              />
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.75fr)]">
        <div className="min-w-0">
          {currentAssessment ? (
            <AssessmentPanel
              key={`${currentAssessment.id}-${currentAssessment.version}`}
              workspaceId={auth.workspace.id}
              assessment={currentAssessment as AssessmentView}
              currentUserId={auth.user.id}
              canWrite={canWrite}
              canApprove={canApprove}
            />
          ) : (
            <CreateAssessmentCard
              workspaceId={auth.workspace.id}
              entityId={entity.id}
              cycle={cycle ? { id: cycle.id, name: cycle.name } : null}
              model={model}
              canWrite={canWrite}
            />
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Entity profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <span className="rounded-lg bg-teal-50 p-2 text-accent">
                  <Building2 className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
                    Kode entity
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-ink">{entity.code}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="rounded-lg bg-slate-100 p-2 text-slate-600">
                  <UserRound className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
                    Owner
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-ink">
                    {entity.owner?.name ?? "Belum ditentukan"}
                  </p>
                  {entity.owner?.email ? (
                    <p className="text-[11px] text-muted">{entity.owner.email}</p>
                  ) : null}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="rounded-lg bg-slate-100 p-2 text-slate-600">
                  <Layers className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
                    Hierarchy
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-ink">
                    Level {entity.depth} · {entity.children.length} child
                  </p>
                  <p className="text-[11px] text-muted">
                    Parent: {entity.parent?.name ?? "Root"}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="rounded-lg bg-slate-100 p-2 text-slate-600">
                  <CalendarDays className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
                    Dibuat
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-ink">
                    {formatDate(entity.createdAt)}
                  </p>
                </div>
              </div>

              {entity.tags.length > 0 ? (
                <div className="flex items-start gap-3">
                  <span className="rounded-lg bg-slate-100 p-2 text-slate-600">
                    <Tags className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
                      Tags
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {entity.tags.map((tag) => (
                        <Badge key={tag} tone="neutral">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Child entities</CardTitle>
              <Network className="h-4 w-4 text-muted" aria-hidden="true" />
            </CardHeader>
            <div className="divide-y divide-line">
              {entity.children.length === 0 ? (
                <div className="px-5 py-5">
                  <p className="text-xs text-muted">Belum ada child entity.</p>
                </div>
              ) : (
                entity.children.map((child) => (
                  <Link
                    key={child.id}
                    href={`/audit-universe/${child.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-ink">{child.name}</p>
                      <p className="mt-0.5 text-[10px] text-muted">
                        {child.code} · {humanize(child.type)}
                      </p>
                    </div>
                    <div className="text-right">
                      <RiskBadge level={child.currentAssessment?.riskLevel} />
                      <p className="mt-1 text-[10px] tabular-nums text-muted">
                        {formatScore(child.currentAssessment?.residualScore)}
                      </p>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Assessment versions</CardTitle>
            </CardHeader>
            <div className="divide-y divide-line">
              {assessments.length === 0 ? (
                <div className="px-5 py-5">
                  <EmptyState
                    title="Belum ada versi"
                    description="Assessment pertama akan muncul di sini."
                    className="border-0 bg-transparent py-2"
                  />
                </div>
              ) : (
                assessments.map((assessment) => (
                  <div key={assessment.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <p className="text-xs font-semibold text-ink">
                        Versi {assessment.version}
                        {assessment.isCurrent ? " · current" : ""}
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted">
                        {assessment.cycle?.name ?? "—"}
                      </p>
                    </div>
                    <div className="text-right">
                      <StatusBadge status={assessment.status} />
                      <p className="mt-1 text-[10px] font-semibold tabular-nums text-ink">
                        {formatScore(assessment.residualScore)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
