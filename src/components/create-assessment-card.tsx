"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FieldError,
  Label,
  Select,
  Textarea,
} from "@/components/ui/form";
import type { RiskModelView } from "@/lib/assessment-view";

export function CreateAssessmentCard({
  workspaceId,
  entityId,
  cycle,
  model,
  canWrite,
}: {
  workspaceId: string;
  entityId: string;
  cycle: { id: string; name: string } | null;
  model: RiskModelView | null;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [controlScore, setControlScore] = useState("3");
  const [rationale, setRationale] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canWrite) {
    return (
      <Card>
        <CardContent className="flex items-start gap-3 py-6">
          <AlertCircle className="mt-0.5 h-4 w-4 text-muted" />
          <div>
            <p className="text-sm font-semibold text-ink">Belum ada risk assessment.</p>
            <p className="mt-1 text-xs text-muted">
              Role kamu hanya bisa melihat. Minta auditor atau audit manager untuk membuat penilaian.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!cycle || !model) {
    return (
      <Card>
        <CardContent className="flex items-start gap-3 py-6">
          <AlertCircle className="mt-0.5 h-4 w-4 text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-ink">
              Belum ada cycle atau risk model aktif.
            </p>
            <p className="mt-1 text-xs text-muted">
              Aktifkan risk cycle dan risk model sebelum membuat assessment.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/audit-entities/${entityId}/risk-assessments`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            cycleId: cycle?.id,
            riskModelId: model?.id,
            controlEffectivenessScore: Number(controlScore),
            rationale,
          }),
        },
      );

      const payload = await response.json();

      if (!response.ok) {
        setError(payload.detail ?? "Tidak bisa membuat assessment.");
        return;
      }

      router.refresh();
    } catch {
      setError("Tidak bisa menghubungi server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Mulai risk assessment</CardTitle>
          <p className="mt-1 text-xs leading-5 text-muted">
            {cycle.name} · model {model.name} v{model.version}
          </p>
        </div>
        <span className="rounded-lg bg-teal-50 p-2 text-accent">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        </span>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="max-w-xs">
            <Label htmlFor="initial-control">Efektivitas kontrol saat ini</Label>
            <Select
              id="initial-control"
              value={controlScore}
              onChange={(event) => setControlScore(event.target.value)}
            >
              <option value="1">1 — Tidak efektif</option>
              <option value="2">2 — Lemah</option>
              <option value="3">3 — Cukup</option>
              <option value="4">4 — Kuat</option>
              <option value="5">5 — Sangat kuat</option>
            </Select>
          </div>

          <div>
            <Label htmlFor="initial-rationale">Rationale</Label>
            <Textarea
              id="initial-rationale"
              value={rationale}
              onChange={(event) => setRationale(event.target.value)}
              placeholder="Jelaskan dasar penilaian: volume transaksi, eksposur regulasi, hasil diskusi dengan process owner..."
              minLength={10}
              required
            />
          </div>

          <FieldError>{error}</FieldError>

          <Button type="submit" disabled={busy}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {busy ? "Membuat..." : "Buat assessment"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
