import { CheckCircle2, SlidersHorizontal } from "lucide-react";
import { ActivateRiskModelButton } from "@/components/activate-risk-model-button";
import { NewRiskModelButton } from "@/components/new-risk-model-button";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatScore } from "@/lib/format";
import { can } from "@/lib/rbac";
import { requirePageAuth } from "@/server/auth";
import { toWorkspaceAccess } from "@/server/page-access";
import { listRiskModels } from "@/server/risk-service";

export default async function RiskModelPage() {
  const auth = await requirePageAuth();
  const access = toWorkspaceAccess(auth);
  const models = await listRiskModels(access);
  const activeModel =
    models.find((model) => model.isDefault && model.status === "active") ??
    models.find((model) => model.status === "active") ??
    null;
  const canWrite = can(auth.membership.role, "riskModel:write");
  const canActivate = can(auth.membership.role, "riskModel:activate");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Risk methodology"
        title="Model yang membuat risiko bisa dibandingkan."
        description="Bobot faktor, skala, dan threshold menentukan inherent, residual, dan level risiko. Model aktif tidak bisa diedit; buat draft baru untuk perubahan."
        actions={
          canWrite ? (
            <NewRiskModelButton workspaceId={auth.workspace.id} template={activeModel} />
          ) : null
        }
      />

      {activeModel ? (
        <div className="grid gap-4 xl:grid-cols-[1.35fr_0.85fr]">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{activeModel.name}</CardTitle>
                  <Badge tone="success">Active</Badge>
                  <Badge tone="neutral">v{activeModel.version}</Badge>
                </div>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">
                  {activeModel.description ??
                    "Model ini dipakai untuk menghitung inherent dan residual risk pada audit universe."}
                </p>
              </div>
              <span className="rounded-lg bg-teal-50 p-2 text-accent">
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
                    Scale
                  </p>
                  <p className="mt-1 text-sm font-semibold text-ink">
                    {activeModel.scale.min}–{activeModel.scale.max}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
                    Factors
                  </p>
                  <p className="mt-1 text-sm font-semibold text-ink">
                    {activeModel.factors.length}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
                    Max control reduction
                  </p>
                  <p className="mt-1 text-sm font-semibold text-ink">
                    {Math.round(activeModel.controlReductionMax * 100)}%
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
                    Methodology
                  </p>
                  <p className="mt-1 text-sm font-semibold text-ink">
                    {activeModel.methodologyVersion}
                  </p>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-line">
                <div className="grid grid-cols-[1.4fr_0.5fr_1.2fr] gap-3 border-b border-line bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
                  <span>Factor</span>
                  <span>Weight</span>
                  <span>Share</span>
                </div>
                <div className="divide-y divide-line">
                  {activeModel.factors.map((factor) => (
                    <div
                      key={factor.id}
                      className="grid grid-cols-[1.4fr_0.5fr_1.2fr] items-center gap-3 px-3 py-2.5"
                    >
                      <div>
                        <p className="text-xs font-semibold text-ink">{factor.name}</p>
                        <p className="text-[10px] text-muted">{factor.code}</p>
                      </div>
                      <p className="text-xs font-medium tabular-nums text-slate-700">
                        {Math.round(factor.weight * 100)}%
                      </p>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${Math.max(factor.weight * 100, 2)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Risk level thresholds</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(
                  [
                    ["Critical", activeModel.levelThresholds.critical, "bg-red-500"],
                    ["High", activeModel.levelThresholds.high, "bg-amber-500"],
                    ["Medium", activeModel.levelThresholds.medium, "bg-blue-500"],
                    ["Low", activeModel.levelThresholds.low, "bg-emerald-500"],
                  ] as const
                ).map(([label, threshold, color]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between rounded-lg border border-line px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${color}`} />
                      <span className="text-xs font-medium text-slate-700">{label}</span>
                    </div>
                    <span className="text-xs font-semibold tabular-nums text-ink">
                      ≥ {formatScore(threshold)}
                    </span>
                  </div>
                ))}
                <p className="pt-1 text-[11px] leading-5 text-muted">
                  Residual risk dihitung dari inherent score dan efektivitas kontrol, lalu
                  dipetakan ke level di atas.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Model status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted">Approved</span>
                  <span className="font-medium text-ink">{formatDate(activeModel.approvedAt)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted">Created</span>
                  <span className="font-medium text-ink">{formatDate(activeModel.createdAt)}</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium">
                    Model aktif dipakai untuk assessment baru.
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <EmptyState
          icon={<SlidersHorizontal className="h-4 w-4" />}
          title="Belum ada risk model aktif"
          description="Buat model draft terlebih dahulu, lalu aktifkan untuk mulai menilai entity."
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Semua model</CardTitle>
          <p className="mt-1 text-xs text-muted">
            Draft bisa diaktifkan. Model retired tetap tersimpan untuk histori.
          </p>
        </CardHeader>
        <div className="divide-y divide-line">
          {models.map((model) => (
            <div key={model.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-ink">{model.name}</p>
                  <StatusBadge status={model.status} />
                  <Badge tone="neutral">v{model.version}</Badge>
                  {model.isDefault ? <Badge tone="success">Default</Badge> : null}
                </div>
                <p className="mt-1 text-[11px] text-muted">
                  {model.factors.length} faktor · metodologi {model.methodologyVersion} · dibuat{" "}
                  {formatDate(model.createdAt)}
                </p>
              </div>
              {model.status === "draft" && canActivate ? (
                <ActivateRiskModelButton
                  workspaceId={auth.workspace.id}
                  modelId={model.id}
                />
              ) : null}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
