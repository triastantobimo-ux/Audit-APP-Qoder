"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  FieldError,
  FieldHint,
  Input,
  Label,
  Select,
  Textarea,
} from "@/components/ui/form";

type MemberOption = {
  id: string;
  name: string;
  role: string;
};

const planRoles = ["CAE", "MANAGER", "AUDITOR", "REVIEWER"] as const;

export function NewPlanPanel({
  workspaceId,
  members,
  currentUserId,
  suggestedYear,
}: {
  workspaceId: string;
  members: MemberOption[];
  currentUserId: string;
  suggestedYear: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(() => ({
    year: String(suggestedYear),
    name: `Audit Plan ${suggestedYear}`,
    objective: "",
    scope: "",
    ownerUserId: currentUserId,
    periodStart: `${suggestedYear}-01-01`,
    periodEnd: `${suggestedYear}-12-31`,
    capacity: {
      CAE: "120",
      MANAGER: "320",
      AUDITOR: "640",
      REVIEWER: "160",
    } as Record<(typeof planRoles)[number], string>,
  }));

  function update(field: string, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateYear(value: string) {
    setForm((current) => ({
      ...current,
      year: value,
      name:
        /^Audit Plan \d+$/.test(current.name) || current.name === ""
          ? `Audit Plan ${value}`
          : current.name,
      periodStart: `${value}-01-01`,
      periodEnd: `${value}-12-31`,
    }));
  }

  function updateCapacity(role: string, value: string) {
    setForm((current) => ({
      ...current,
      capacity: { ...current.capacity, [role]: value },
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/audit-plans`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            year: Number(form.year),
            name: form.name,
            objective: form.objective,
            scope: form.scope,
            periodStart: `${form.periodStart}T00:00:00.000Z`,
            periodEnd: `${form.periodEnd}T23:59:59.000Z`,
            ownerUserId: form.ownerUserId,
            capacity: planRoles.map((role) => ({
              role,
              availableHours: Number(form.capacity[role]) || 0,
            })),
          }),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.detail ?? "Tidak bisa membuat audit plan.");
        return;
      }

      setOpen(false);
      router.push(`/audit-plan/${payload.data.id}`);
      router.refresh();
    } catch {
      setError("Tidak bisa menghubungi server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <CalendarRange className="h-4 w-4" aria-hidden="true" />
        Buat plan tahunan
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
            aria-labelledby="new-plan-title"
            className="relative z-10 mt-6 w-full max-w-2xl rounded-2xl border border-line bg-surface shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-line px-5 py-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
                  Annual plan
                </p>
                <h2 id="new-plan-title" className="mt-1 text-lg font-semibold text-ink">
                  Buat audit plan tahunan
                </h2>
                <p className="mt-1 text-xs text-muted">
                  Satu plan aktif per tahun. Plan disusun dari entity yang sudah memiliki
                  approved risk assessment.
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
                  <Label htmlFor="plan-year">Tahun plan</Label>
                  <Input
                    id="plan-year"
                    type="number"
                    min={2000}
                    max={2100}
                    value={form.year}
                    onChange={(event) => updateYear(event.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="plan-owner">Plan owner</Label>
                  <Select
                    id="plan-owner"
                    value={form.ownerUserId}
                    onChange={(event) => update("ownerUserId", event.target.value)}
                  >
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name} · {member.role}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="plan-name">Nama plan</Label>
                <Input
                  id="plan-name"
                  value={form.name}
                  onChange={(event) => update("name", event.target.value)}
                  required
                />
              </div>

              <div>
                <Label htmlFor="plan-objective">Objective</Label>
                <Textarea
                  id="plan-objective"
                  value={form.objective}
                  onChange={(event) => update("objective", event.target.value)}
                  placeholder="Assurance apa yang ingin diberikan tahun ini?"
                  required
                />
              </div>

              <div>
                <Label htmlFor="plan-scope">Scope</Label>
                <Textarea
                  id="plan-scope"
                  value={form.scope}
                  onChange={(event) => update("scope", event.target.value)}
                  placeholder="Proses, unit, dan batasan cakupan audit."
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="plan-start">Periode mulai</Label>
                  <Input
                    id="plan-start"
                    type="date"
                    value={form.periodStart}
                    onChange={(event) => update("periodStart", event.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="plan-end">Periode selesai</Label>
                  <Input
                    id="plan-end"
                    type="date"
                    value={form.periodEnd}
                    onChange={(event) => update("periodEnd", event.target.value)}
                    required
                  />
                </div>
              </div>

              <fieldset className="rounded-xl border border-line bg-slate-50/60 p-3">
                <legend className="px-1 text-xs font-semibold text-slate-700">
                  Kapasitas tim per role (jam)
                </legend>
                <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {planRoles.map((role) => (
                    <div key={role}>
                      <Label htmlFor={`capacity-${role}`}>{role}</Label>
                      <Input
                        id={`capacity-${role}`}
                        type="number"
                        min={0}
                        step="1"
                        value={form.capacity[role]}
                        onChange={(event) =>
                          updateCapacity(role, event.target.value)
                        }
                      />
                    </div>
                  ))}
                </div>
                <FieldHint>
                  Kapasitas dipakai untuk warning over-allocation, bukan hard block.
                </FieldHint>
              </fieldset>

              <FieldError>{error}</FieldError>

              <div className="flex justify-end gap-2 border-t border-line pt-4">
                <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
                  Batal
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? "Menyimpan..." : "Simpan plan"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
