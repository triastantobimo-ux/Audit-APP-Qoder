"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  GitBranch,
  History,
  RotateCcw,
  Save,
  Send,
} from "lucide-react";
import { Badge, RiskBadge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FieldError,
  Label,
  Select,
  Textarea,
} from "@/components/ui/form";
import {
  calculateInherentScore,
  calculateResidualScore,
  riskLevelFor,
} from "@/lib/scoring";
import { formatDateTime, formatScore, humanize } from "@/lib/format";
import type { AssessmentView } from "@/lib/assessment-view";

type FactorState = Record<
  string,
  { score: number; rationale: string; evidenceNote: string }
>;

function buildFactorState(assessment: AssessmentView): FactorState {
  const existing = new Map(
    assessment.factorScores.map((score) => [score.code, score]),
  );

  return Object.fromEntries(
    (assessment.riskModel?.factors ?? []).map((factor) => [
      factor.code,
      {
        score: existing.get(factor.code)?.score ?? 3,
        rationale: existing.get(factor.code)?.rationale ?? "",
        evidenceNote: existing.get(factor.code)?.evidenceNote ?? "",
      },
    ]),
  );
}

const controlLabels: Record<number, string> = {
  1: "1 — Tidak efektif",
  2: "2 — Lemah",
  3: "3 — Cukup",
  4: "4 — Kuat",
  5: "5 — Sangat kuat",
};

const factorLabels: Record<number, string> = {
  1: "1 — Sangat rendah",
  2: "2 — Rendah",
  3: "3 — Sedang",
  4: "4 — Tinggi",
  5: "5 — Sangat tinggi",
};

export function AssessmentPanel({
  workspaceId,
  assessment,
  currentUserId,
  canWrite,
  canApprove,
}: {
  workspaceId: string;
  assessment: AssessmentView;
  currentUserId: string;
  canWrite: boolean;
  canApprove: boolean;
}) {
  const router = useRouter();
  const model = assessment.riskModel;
  const [factors, setFactors] = useState<FactorState>(() =>
    buildFactorState(assessment),
  );
  const [controlScore, setControlScore] = useState(
    String(assessment.controlEffectivenessScore ?? 3),
  );
  const [rationale, setRationale] = useState(assessment.rationale ?? "");
  const [reviewComment, setReviewComment] = useState("");
  const [version, setVersion] = useState(assessment.version);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const preview = useMemo(() => {
    if (!model) return null;

    try {
      const inherentScore = calculateInherentScore(
        model.factors.map((factor) => ({
          code: factor.code,
          weight: factor.weight,
          score: factors[factor.code]?.score ?? 3,
        })),
      );
      const residualScore = calculateResidualScore({
        inherentScore,
        controlEffectivenessScore: Number(controlScore),
        scaleMin: model.scale.min,
        scaleMax: model.scale.max,
        controlReductionMax: model.controlReductionMax,
      });
      const riskLevel = riskLevelFor(residualScore, model.levelThresholds);

      return { inherentScore, residualScore, riskLevel };
    } catch {
      return null;
    }
  }, [model, factors, controlScore]);

  const isEditable = ["draft", "returned"].includes(assessment.status) && canWrite;
  const isSubmitted = assessment.status === "submitted";
  const isApproved = assessment.status === "approved";
  const isSelfAssessment = assessment.assessedById === currentUserId;
  const displayedInherent = isEditable
    ? preview?.inherentScore
    : assessment.inherentScore;
  const displayedResidual = isEditable
    ? preview?.residualScore
    : assessment.residualScore;
  const displayedLevel = isEditable ? preview?.riskLevel : assessment.riskLevel;

  function updateFactor(
    code: string,
    field: "score" | "rationale" | "evidenceNote",
    value: string | number,
  ) {
    setFactors((current) => ({
      ...current,
      [code]: {
        ...(current[code] ?? { score: 3, rationale: "", evidenceNote: "" }),
        [field]: value,
      },
    }));
  }

  async function saveDraft(): Promise<AssessmentView | null> {
    if (!model) {
      setError("Risk model tidak tersedia.");
      return null;
    }

    const patchResponse = await fetch(
      `/api/v1/workspaces/${workspaceId}/risk-assessments/${assessment.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          controlEffectivenessScore: Number(controlScore),
          rationale,
          version,
        }),
      },
    );
    const patchPayload = await patchResponse.json();

    if (!patchResponse.ok) {
      setError(patchPayload.detail ?? "Tidak bisa menyimpan assessment.");
      return null;
    }

    const scores = model.factors.map((factor) => ({
      factorCode: factor.code,
      score: factors[factor.code]?.score ?? 3,
      rationale: factors[factor.code]?.rationale ?? "",
      evidenceNote: factors[factor.code]?.evidenceNote ?? "",
    }));

    const response = await fetch(
      `/api/v1/workspaces/${workspaceId}/risk-assessments/${assessment.id}/factor-scores`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scores,
          version: patchPayload.data.version,
        }),
      },
    );
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.detail ?? "Tidak bisa menyimpan skor risiko.");
      return null;
    }

    setVersion(payload.data.version);
    return payload.data as AssessmentView;
  }

  async function handleSave() {
    setBusy("save");
    setError(null);
    setNotice(null);

    try {
      const saved = await saveDraft();

      if (saved) {
        setNotice("Draft tersimpan. Skor dan rationale sudah diperbarui.");
        router.refresh();
      }
    } catch {
      setError("Tidak bisa menghubungi server.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSubmit() {
    setBusy("submit");
    setError(null);
    setNotice(null);

    try {
      const saved = await saveDraft();

      if (!saved) return;

      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/risk-assessments/${assessment.id}/submit`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            version: saved.version,
            comment: reviewComment || undefined,
          }),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.detail ?? "Tidak bisa submit assessment.");
        return;
      }

      router.refresh();
    } catch {
      setError("Tidak bisa menghubungi server.");
    } finally {
      setBusy(null);
    }
  }

  async function handleApprove() {
    setBusy("approve");
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/risk-assessments/${assessment.id}/approve`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            version,
            comment: reviewComment || undefined,
          }),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.detail ?? "Tidak bisa approve assessment.");
        return;
      }

      router.refresh();
    } catch {
      setError("Tidak bisa menghubungi server.");
    } finally {
      setBusy(null);
    }
  }

  async function handleReturn() {
    if (!reviewComment.trim()) {
      setError("Isi catatan review sebelum mengembalikan assessment.");
      return;
    }

    setBusy("return");
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/risk-assessments/${assessment.id}/return`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ version, comment: reviewComment }),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.detail ?? "Tidak bisa mengembalikan assessment.");
        return;
      }

      router.refresh();
    } catch {
      setError("Tidak bisa menghubungi server.");
    } finally {
      setBusy(null);
    }
  }

  async function handleNewVersion() {
    setBusy("version");
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/risk-assessments/${assessment.id}/new-version`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.detail ?? "Tidak bisa membuat versi baru.");
        return;
      }

      router.refresh();
    } catch {
      setError("Tidak bisa menghubungi server.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Risk assessment</CardTitle>
              <StatusBadge status={assessment.status} />
              <Badge tone="neutral">v{version}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted">
              {assessment.cycle?.name ?? "Tanpa cycle"} ·{" "}
              {model ? `${model.name} v${model.version}` : "Model tidak tersedia"}
            </p>
          </div>
          <RiskBadge level={displayedLevel} />
        </CardHeader>

        <CardContent>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-line bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
                Inherent risk
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-ink">
                {formatScore(displayedInherent)}
              </p>
            </div>
            <div className="rounded-lg border border-line bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
                Kontrol
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-ink">
                {controlScore ?? "—"}/5
              </p>
            </div>
            <div className="rounded-lg border border-line bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
                Residual risk
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-ink">
                {formatScore(displayedResidual)}
              </p>
            </div>
            <div className="rounded-lg border border-line bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
                Level
              </p>
              <div className="mt-1.5">
                <RiskBadge level={displayedLevel} />
              </div>
            </div>
          </div>

          {assessment.rationale ? (
            <div className="mt-4 rounded-lg border border-line px-3.5 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
                Rationale
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-700">{assessment.rationale}</p>
            </div>
          ) : null}

          {isEditable ? (
            <form
              className="mt-5 space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSubmit();
              }}
            >
              <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
                <div>
                  <Label htmlFor="control-score">Efektivitas kontrol</Label>
                  <Select
                    id="control-score"
                    value={controlScore}
                    onChange={(event) => setControlScore(event.target.value)}
                  >
                    {[1, 2, 3, 4, 5].map((score) => (
                      <option key={score} value={score}>
                        {controlLabels[score]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="assessment-rationale">Rationale keseluruhan</Label>
                  <Textarea
                    id="assessment-rationale"
                    value={rationale}
                    onChange={(event) => setRationale(event.target.value)}
                    minLength={10}
                    required
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">Faktor risiko</p>
                    <p className="mt-0.5 text-xs text-muted">
                      Nilai tiap faktor sesuai skala model. Rationale wajib untuk faktor required.
                    </p>
                  </div>
                  <Badge tone="neutral">
                    Total bobot{" "}
                    {Math.round(
                      (model?.factors.reduce((sum, factor) => sum + factor.weight, 0) ?? 0) *
                        100,
                    )}
                    %
                  </Badge>
                </div>

                <div className="overflow-hidden rounded-xl border border-line">
                  <div className="hidden grid-cols-[1.2fr_0.5fr_0.6fr_1.6fr] gap-3 border-b border-line bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-muted md:grid">
                    <span>Faktor</span>
                    <span>Bobot</span>
                    <span>Skor</span>
                    <span>Rationale</span>
                  </div>
                  <div className="divide-y divide-line">
                    {model?.factors.map((factor) => (
                      <div
                        key={factor.code}
                        className="grid gap-3 px-3 py-3 md:grid-cols-[1.2fr_0.5fr_0.6fr_1.6fr] md:items-start"
                      >
                        <div>
                          <p className="text-xs font-semibold text-ink">{factor.name}</p>
                          <p className="mt-0.5 text-[10px] text-muted">{factor.code}</p>
                        </div>
                        <p className="text-xs font-medium tabular-nums text-slate-600">
                          {Math.round(factor.weight * 100)}%
                        </p>
                        <Select
                          value={factors[factor.code]?.score ?? 3}
                          onChange={(event) =>
                            updateFactor(factor.code, "score", Number(event.target.value))
                          }
                          aria-label={`Skor ${factor.name}`}
                        >
                          {[1, 2, 3, 4, 5].map((score) => (
                            <option key={score} value={score}>
                              {factorLabels[score]}
                            </option>
                          ))}
                        </Select>
                        <Textarea
                          value={factors[factor.code]?.rationale ?? ""}
                          onChange={(event) =>
                            updateFactor(factor.code, "rationale", event.target.value)
                          }
                          placeholder={`Alasan penilaian ${factor.name.toLowerCase()}...`}
                          className="min-h-16"
                          required={factor.isRequired}
                          aria-label={`Rationale ${factor.name}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <FieldError>{error}</FieldError>
              {notice ? (
                <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                  {notice}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleSave}
                  disabled={Boolean(busy)}
                >
                  <Save className="h-4 w-4" aria-hidden="true" />
                  {busy === "save" ? "Menyimpan..." : "Simpan draft"}
                </Button>
                <Button type="submit" disabled={Boolean(busy)}>
                  <Send className="h-4 w-4" aria-hidden="true" />
                  {busy === "submit" ? "Mengirim..." : "Submit untuk review"}
                </Button>
                <p className="text-[11px] text-muted">
                  Submit akan mengunci skor sampai reviewer approve atau return.
                </p>
              </div>
            </form>
          ) : (
            <div className="mt-5">
              <div className="overflow-hidden rounded-xl border border-line">
                <div className="grid grid-cols-[1.4fr_0.5fr_0.5fr_1.6fr] gap-3 border-b border-line bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
                  <span>Faktor</span>
                  <span>Bobot</span>
                  <span>Skor</span>
                  <span>Rationale</span>
                </div>
                <div className="divide-y divide-line">
                  {assessment.factorScores.map((factor) => (
                    <div
                      key={factor.factorId}
                      className="grid grid-cols-[1.4fr_0.5fr_0.5fr_1.6fr] gap-3 px-3 py-2.5 text-xs"
                    >
                      <span className="font-medium text-ink">{factor.name}</span>
                      <span className="tabular-nums text-muted">
                        {Math.round(factor.weight * 100)}%
                      </span>
                      <span className="font-semibold tabular-nums text-ink">
                        {factor.score ?? "—"}
                      </span>
                      <span className="leading-5 text-slate-600">
                        {factor.rationale || "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {isSubmitted ? (
            <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-blue-700" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">
                    Assessment sudah disubmit dan menunggu review.
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {canApprove && isSelfAssessment
                      ? "Kamu adalah assessor. Approval harus dilakukan oleh auditor lain."
                      : canApprove
                        ? "Periksa skor dan rationale, lalu approve atau kembalikan."
                        : "Reviewer akan memeriksa assessment ini."}
                  </p>
                  {canApprove && !isSelfAssessment ? (
                    <div className="mt-4 space-y-3">
                      <Textarea
                        value={reviewComment}
                        onChange={(event) => setReviewComment(event.target.value)}
                        placeholder="Catatan review (wajib untuk return)..."
                        className="min-h-20 bg-white"
                      />
                      <FieldError>{error}</FieldError>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="primary"
                          onClick={handleApprove}
                          disabled={Boolean(busy)}
                        >
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                          {busy === "approve" ? "Menyetujui..." : "Approve"}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={handleReturn}
                          disabled={Boolean(busy)}
                        >
                          <RotateCcw className="h-4 w-4" aria-hidden="true" />
                          {busy === "return" ? "Mengembalikan..." : "Return"}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {isApproved ? (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
              <div>
                <p className="text-sm font-semibold text-ink">Assessment approved.</p>
                <p className="mt-1 text-xs text-muted">
                  Disetujui oleh {assessment.approvedByName ?? "reviewer"} ·{" "}
                  {formatDateTime(assessment.approvedAt)}. Skor ini masuk ke ranking.
                </p>
              </div>
              {canWrite ? (
                <Button variant="secondary" onClick={handleNewVersion} disabled={Boolean(busy)}>
                  <GitBranch className="h-4 w-4" aria-hidden="true" />
                  {busy === "version" ? "Membuat..." : "Buat versi baru"}
                </Button>
              ) : null}
            </div>
          ) : null}

          {assessment.status === "returned" ? (
            <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
              Assessment dikembalikan. Perbarui skor/rationale lalu submit ulang.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Review history</CardTitle>
          <History className="h-4 w-4 text-muted" aria-hidden="true" />
        </CardHeader>
        <CardContent>
          {assessment.reviews.length === 0 ? (
            <p className="text-xs text-muted">Belum ada review.</p>
          ) : (
            <div className="space-y-4">
              {assessment.reviews.map((review) => (
                <div key={review.id} className="flex gap-3">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-teal-400" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-ink">
                      {humanize(review.action)} · {review.fromStatus} → {review.toStatus}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {review.actorName} · {formatDateTime(review.createdAt)}
                    </p>
                    {review.comment ? (
                      <p className="mt-1 text-xs leading-5 text-slate-600">{review.comment}</p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
