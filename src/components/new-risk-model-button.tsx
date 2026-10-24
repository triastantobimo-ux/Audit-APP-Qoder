"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  FieldError,
  Input,
  Label,
  Textarea,
} from "@/components/ui/form";

type Template = {
  scale: { min: number; max: number };
  controlReductionMax: number;
  levelThresholds: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  factors: Array<{ code: string; name: string; weight: number }>;
} | null;

const fallbackFactors = [
  { code: "impact", name: "Impact", weight: 25 },
  { code: "likelihood", name: "Likelihood", weight: 25 },
  { code: "fraud", name: "Fraud", weight: 15 },
  { code: "regulatory", name: "Regulatory", weight: 15 },
  { code: "complexity", name: "Complexity", weight: 10 },
  { code: "change", name: "Change", weight: 5 },
  { code: "third_party", name: "Third party", weight: 5 },
];

export function NewRiskModelButton({
  workspaceId,
  template,
}: {
  workspaceId: string;
  template: Template;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(`IA Risk Model ${new Date().getFullYear()} (draft)`);
  const [description, setDescription] = useState("");
  const [scaleMin, setScaleMin] = useState(String(template?.scale.min ?? 1));
  const [scaleMax, setScaleMax] = useState(String(template?.scale.max ?? 5));
  const [controlReduction, setControlReduction] = useState(
    String(template?.controlReductionMax ?? 0.5),
  );
  const [thresholds, setThresholds] = useState({
    low: String(template?.levelThresholds.low ?? 0),
    medium: String(template?.levelThresholds.medium ?? 1.5),
    high: String(template?.levelThresholds.high ?? 2.5),
    critical: String(template?.levelThresholds.critical ?? 3.5),
  });
  const [factors, setFactors] = useState(
    template?.factors.length
      ? template.factors.map((factor) => ({
          code: factor.code,
          name: factor.name,
          weight: String(Math.round(factor.weight * 100)),
        }))
      : fallbackFactors.map((factor) => ({ ...factor, weight: String(factor.weight) })),
  );

  const weightTotal = factors.reduce(
    (sum, factor) => sum + (Number(factor.weight) || 0),
    0,
  );

  function updateFactor(index: number, field: "name" | "weight", value: string) {
    setFactors((current) =>
      current.map((factor, factorIndex) =>
        factorIndex === index ? { ...factor, [field]: value } : factor,
      ),
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (Math.abs(weightTotal - 100) > 0.01) {
      setError("Total bobot faktor harus 100%.");
      return;
    }

    setBusy(true);

    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/risk-models`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name,
            description: description || null,
            scale: { min: Number(scaleMin), max: Number(scaleMax) },
            controlReductionMax: Number(controlReduction),
            levelThresholds: {
              low: Number(thresholds.low),
              medium: Number(thresholds.medium),
              high: Number(thresholds.high),
              critical: Number(thresholds.critical),
            },
            isDefault: false,
            factors: factors.map((factor) => ({
              code: factor.code,
              name: factor.name,
              weight: Number(factor.weight) / 100,
              isRequired: true,
            })),
          }),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.detail ?? "Tidak bisa membuat risk model.");
        return;
      }

      setOpen(false);
      router.refresh();
    } catch {
      setError("Tidak bisa menghubungi server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Buat model draft
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
          <div
            className="fixed inset-0 bg-slate-950/45 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-model-title"
            className="relative z-10 mt-4 w-full max-w-2xl rounded-2xl border border-line bg-surface shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-line px-5 py-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
                  Risk methodology
                </p>
                <h2 id="new-model-title" className="mt-1 text-lg font-semibold text-ink">
                  Buat risk model draft
                </h2>
                <p className="mt-1 text-xs text-muted">
                  Model aktif immutable. Buat draft baru, lalu aktifkan setelah bobot valid.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-muted hover:bg-slate-100 hover:text-ink"
                aria-label="Tutup"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 px-5 py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="model-name">Nama model</Label>
                  <Input
                    id="model-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="model-description">Deskripsi</Label>
                  <Textarea
                    id="model-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Tujuan model dan konteks penggunaannya."
                    className="min-h-16"
                  />
                </div>
                <div>
                  <Label htmlFor="scale-min">Skala minimum</Label>
                  <Input
                    id="scale-min"
                    type="number"
                    min="0"
                    max="9"
                    value={scaleMin}
                    onChange={(event) => setScaleMin(event.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="scale-max">Skala maksimum</Label>
                  <Input
                    id="scale-max"
                    type="number"
                    min="1"
                    max="10"
                    value={scaleMax}
                    onChange={(event) => setScaleMax(event.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="control-reduction">Max control reduction</Label>
                  <Input
                    id="control-reduction"
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={controlReduction}
                    onChange={(event) => setControlReduction(event.target.value)}
                    required
                  />
                  <p className="mt-1 text-[11px] text-muted">
                    0.5 berarti kontrol terkuat menurunkan residual maksimal 50%.
                  </p>
                </div>
              </div>

              <div>
                <Label>Threshold level risiko</Label>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {(["low", "medium", "high", "critical"] as const).map((level) => (
                    <div key={level}>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                        {level}
                      </p>
                      <Input
                        type="number"
                        step="0.1"
                        value={thresholds[level]}
                        onChange={(event) =>
                          setThresholds((current) => ({
                            ...current,
                            [level]: event.target.value,
                          }))
                        }
                        required
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label className="mb-0">Bobot faktor</Label>
                  <span
                    className={`text-[11px] font-semibold ${
                      Math.abs(weightTotal - 100) > 0.01 ? "text-danger" : "text-emerald-700"
                    }`}
                  >
                    Total {weightTotal}%
                  </span>
                </div>
                <div className="space-y-2">
                  {factors.map((factor, index) => (
                    <div key={factor.code} className="flex items-center gap-2">
                      <Input
                        value={factor.name}
                        onChange={(event) => updateFactor(index, "name", event.target.value)}
                        aria-label={`Nama faktor ${factor.code}`}
                      />
                      <div className="relative w-28 shrink-0">
                        <Input
                          type="number"
                          min="1"
                          max="100"
                          value={factor.weight}
                          onChange={(event) =>
                            updateFactor(index, "weight", event.target.value)
                          }
                          className="pr-7"
                          aria-label={`Bobot ${factor.code}`}
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">
                          %
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <FieldError>{error}</FieldError>

              <div className="flex justify-end gap-2 border-t border-line pt-4">
                <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
                  Batal
                </Button>
                <Button type="submit" disabled={busy || Math.abs(weightTotal - 100) > 0.01}>
                  {busy ? "Menyimpan..." : "Simpan draft model"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
