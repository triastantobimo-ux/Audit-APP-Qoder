"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  FieldError,
  FieldHint,
  Input,
  Label,
  Select,
  Textarea,
} from "@/components/ui/form";
import { RiskBadge } from "@/components/ui/badge";
import { formatScore, humanize } from "@/lib/format";
import type { PlanEngagementView } from "@/lib/plan-view";

export type PlanEntityOption = {
  id: string;
  code: string;
  name: string;
  type: string;
  riskScore: number;
  riskLevel: string;
  riskAssessmentId: string;
};

const planRoles = ["CAE", "MANAGER", "AUDITOR", "REVIEWER"] as const;

const engagementTypes = [
  "financial",
  "operational",
  "compliance",
  "sox",
  "it",
  "fraud",
  "other",
] as const;

function emptyAllocations(): Record<(typeof planRoles)[number], string> {
  return { CAE: "0", MANAGER: "0", AUDITOR: "0", REVIEWER: "0" };
}

export function EngagementPanel({
  workspaceId,
  planId,
  planVersion,
  entities,
  existingEntityIds,
  initial,
  triggerLabel,
  triggerVariant = "secondary",
  triggerSize = "md",
}: {
  workspaceId: string;
  planId: string;
  planVersion: number;
  entities: PlanEntityOption[];
  existingEntityIds: string[];
  initial?: PlanEngagementView;
  triggerLabel?: string;
  triggerVariant?: "primary" | "secondary" | "ghost" | "subtle";
  triggerSize?: "sm" | "md";
}) {
  const router = useRouter();
  const isEdit = Boolean(initial);
  const options = useMemo(
    () =>
      entities.filter(
        (entity) =>
          entity.id === initial?.entityId ||
          !existingEntityIds.includes(entity.id),
      ),
    [entities, existingEntityIds, initial?.entityId],
  );
  const initialAllocations = emptyAllocations();
  for (const allocation of initial?.allocations ?? []) {
    if (allocation.role in initialAllocations) {
      initialAllocations[allocation.role as keyof typeof initialAllocations] =
        String(allocation.estimatedHours);
    }
  }

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(() => ({
    entityId: initial?.entityId ?? options[0]?.id ?? "",
    title: initial?.title ?? options[0]?.name ?? "",
    engagementType: initial?.engagementType ?? "operational",
    quarter: initial?.quarter ? String(initial.quarter) : "",
    plannedStart: initial?.plannedStart?.slice(0, 10) ?? "",
    plannedEnd: initial?.plannedEnd?.slice(0, 10) ?? "",
    allocations: initialAllocations,
    overrideScore:
      initial?.overrideScore !== null && initial?.overrideScore !== undefined
        ? String(initial.overrideScore)
        : "",
    overrideReason: initial?.overrideReason ?? "",
    notes: initial?.notes ?? "",
  }));

  const selectedEntity = isEdit
    ? null
    : options.find((entity) => entity.id === form.entityId) ?? null;
  const sourceRiskScore = isEdit
    ? initial?.sourceRiskScore ?? null
    : selectedEntity?.riskScore ?? null;
  const sourceRiskLevel = isEdit
    ? initial?.sourceRiskLevel ?? null
    : selectedEntity?.riskLevel ?? null;

  function update(field: string, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateEntity(entityId: string) {
    const entity = options.find((option) => option.id === entityId);
    setForm((current) => ({
      ...current,
      entityId,
      title:
        current.title.trim() === "" || options.some((o) => o.name === current.title)
          ? entity?.name ?? current.title
          : current.title,
    }));
  }

  function updateAllocation(role: string, value: string) {
    setForm((current) => ({
      ...current,
      allocations: { ...current.allocations, [role]: value },
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const allocations = planRoles
      .map((role) => ({
        role,
        hours: Number(form.allocations[role]) || 0,
      }))
      .filter((allocation) => allocation.hours > 0);

    if (allocations.length === 0) {
      setError("Isi minimal satu alokasi role dengan jam di atas 0.");
      setBusy(false);
      return;
    }

    try {
      const body = {
        title: form.title,
        engagementType: form.engagementType,
        quarter: form.quarter ? Number(form.quarter) : null,
        plannedStart: form.plannedStart
          ? new Date(`${form.plannedStart}T00:00:00.000Z`).toISOString()
          : null,
        plannedEnd: form.plannedEnd
          ? new Date(`${form.plannedEnd}T00:00:00.000Z`).toISOString()
          : null,
        allocations,
        overrideScore: form.overrideScore === "" ? null : Number(form.overrideScore),
        overrideReason: form.overrideReason.trim() || null,
        notes: form.notes.trim() || null,
        version: planVersion,
      };

      const response = await fetch(
        isEdit
          ? `/api/v1/workspaces/${workspaceId}/audit-plans/${planId}/engagements/${initial?.id}`
          : `/api/v1/workspaces/${workspaceId}/audit-plans/${planId}/engagements`,
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            isEdit ? body : { ...body, entityId: form.entityId },
          ),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.detail ?? "Tidak bisa menyimpan engagement.");
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

  const label =
    triggerLabel ?? (isEdit ? "Edit" : "Tambah engagement");

  return (
    <>
      <Button
        variant={triggerVariant}
        size={triggerSize}
        onClick={() => setOpen(true)}
      >
        {isEdit ? null : <Plus className="h-4 w-4" aria-hidden="true" />}
        {label}
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
            aria-labelledby="engagement-title"
            className="relative z-10 mt-4 w-full max-w-3xl rounded-2xl border border-line bg-surface shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-line px-5 py-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
                  Plan engagement
                </p>
                <h2 id="engagement-title" className="mt-1 text-lg font-semibold text-ink">
                  {isEdit ? "Edit planned engagement" : "Tambah engagement ke plan"}
                </h2>
                <p className="mt-1 text-xs text-muted">
                  Risk score mengikuti approved assessment. Override hanya dengan alasan.
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

            <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="engagement-entity">Auditable entity</Label>
                  {isEdit && initial?.entity ? (
                    <div className="rounded-lg border border-line bg-slate-50 px-3 py-2 text-sm text-ink">
                      {initial.entity.code} · {initial.entity.name}
                    </div>
                  ) : (
                    <Select
                      id="engagement-entity"
                      value={form.entityId}
                      onChange={(event) => updateEntity(event.target.value)}
                      required
                    >
                      {options.length === 0 ? (
                        <option value="">Tidak ada entity yang tersedia</option>
                      ) : null}
                      {options.map((entity) => (
                        <option key={entity.id} value={entity.id}>
                          {entity.code} · {entity.name}
                        </option>
                      ))}
                    </Select>
                  )}
                  <FieldHint>
                    Hanya entity dengan approved current risk assessment.
                  </FieldHint>
                </div>
                <div>
                  <Label htmlFor="engagement-type">Tipe engagement</Label>
                  <Select
                    id="engagement-type"
                    value={form.engagementType}
                    onChange={(event) =>
                      update("engagementType", event.target.value)
                    }
                  >
                    {engagementTypes.map((type) => (
                      <option key={type} value={type}>
                        {humanize(type)}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="engagement-title-input">Judul engagement</Label>
                <Input
                  id="engagement-title-input"
                  value={form.title}
                  onChange={(event) => update("title", event.target.value)}
                  required
                />
              </div>

              {sourceRiskScore !== null && sourceRiskLevel ? (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-slate-50 px-3 py-2 text-xs">
                  <span className="font-medium text-slate-700">Risk snapshot</span>
                  <span className="font-semibold tabular-nums text-ink">
                    {formatScore(sourceRiskScore)}
                  </span>
                  <RiskBadge level={sourceRiskLevel} />
                  {isEdit && initial?.overrideScore !== null ? (
                    <span className="text-muted">
                      Override aktif: {formatScore(initial?.overrideScore)}
                    </span>
                  ) : null}
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="engagement-quarter">Quarter</Label>
                  <Select
                    id="engagement-quarter"
                    value={form.quarter}
                    onChange={(event) => update("quarter", event.target.value)}
                  >
                    <option value="">Belum ditentukan</option>
                    <option value="1">Q1</option>
                    <option value="2">Q2</option>
                    <option value="3">Q3</option>
                    <option value="4">Q4</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="engagement-start">Mulai</Label>
                  <Input
                    id="engagement-start"
                    type="date"
                    value={form.plannedStart}
                    onChange={(event) => update("plannedStart", event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="engagement-end">Selesai</Label>
                  <Input
                    id="engagement-end"
                    type="date"
                    value={form.plannedEnd}
                    onChange={(event) => update("plannedEnd", event.target.value)}
                  />
                </div>
              </div>

              <fieldset className="rounded-xl border border-line bg-slate-50/60 p-3">
                <legend className="px-1 text-xs font-semibold text-slate-700">
                  Estimasi jam per role
                </legend>
                <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {planRoles.map((role) => (
                    <div key={role}>
                      <Label htmlFor={`allocation-${role}`}>{role}</Label>
                      <Input
                        id={`allocation-${role}`}
                        type="number"
                        min={0}
                        step="0.5"
                        value={form.allocations[role]}
                        onChange={(event) =>
                          updateAllocation(role, event.target.value)
                        }
                      />
                    </div>
                  ))}
                </div>
                <FieldHint>
                  Total:{" "}
                  {planRoles.reduce(
                    (total, role) =>
                      total + (Number(form.allocations[role]) || 0),
                    0,
                  )}{" "}
                  jam
                </FieldHint>
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-[0.5fr_1.5fr]">
                <div>
                  <Label htmlFor="engagement-override">Override score</Label>
                  <Input
                    id="engagement-override"
                    type="number"
                    min={0}
                    max={10}
                    step="0.1"
                    value={form.overrideScore}
                    onChange={(event) => update("overrideScore", event.target.value)}
                    placeholder="Kosongkan jika tidak ada"
                  />
                </div>
                <div>
                  <Label htmlFor="engagement-override-reason">Alasan override</Label>
                  <Input
                    id="engagement-override-reason"
                    value={form.overrideReason}
                    onChange={(event) =>
                      update("overrideReason", event.target.value)
                    }
                    placeholder="Wajib jika score di-override"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="engagement-notes">Catatan perencanaan</Label>
                <Textarea
                  id="engagement-notes"
                  value={form.notes}
                  onChange={(event) => update("notes", event.target.value)}
                  placeholder="Konteks, dependency, atau asumsi estimasi."
                  className="min-h-20"
                />
              </div>

              <FieldError>{error}</FieldError>

              <div className="flex justify-end gap-2 border-t border-line pt-4">
                <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
                  Batal
                </Button>
                <Button
                  type="submit"
                  disabled={busy || (!isEdit && options.length === 0)}
                >
                  {busy ? "Menyimpan..." : isEdit ? "Simpan perubahan" : "Tambah engagement"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
