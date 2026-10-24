"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/form";
import type { PlanCapacityView } from "@/lib/plan-view";

const planRoles = ["CAE", "MANAGER", "AUDITOR", "REVIEWER"] as const;

export function CapacityEditor({
  workspaceId,
  planId,
  planVersion,
  capacities,
}: {
  workspaceId: string;
  planId: string;
  planVersion: number;
  capacities: PlanCapacityView[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      planRoles.map((role) => [
        role,
        String(
          capacities.find((capacity) => capacity.role === role)?.availableHours ??
            0,
        ),
      ]),
    ),
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/audit-plans/${planId}/capacity`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            capacity: planRoles.map((role) => ({
              role,
              availableHours: Number(values[role]) || 0,
            })),
            version: planVersion,
          }),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.detail ?? "Tidak bisa menyimpan kapasitas.");
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
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        Atur kapasitas
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
            aria-labelledby="capacity-title"
            className="relative z-10 mt-24 w-full max-w-lg rounded-2xl border border-line bg-surface shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-line px-5 py-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
                  Team capacity
                </p>
                <h2 id="capacity-title" className="mt-1 text-lg font-semibold text-ink">
                  Kapasitas tim per role
                </h2>
                <p className="mt-1 text-xs text-muted">
                  Over-allocation menghasilkan warning, bukan blokir submit.
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
              <div className="grid grid-cols-2 gap-3">
                {planRoles.map((role) => (
                  <div key={role}>
                    <Label htmlFor={`capacity-edit-${role}`}>{role}</Label>
                    <Input
                      id={`capacity-edit-${role}`}
                      type="number"
                      min={0}
                      step="1"
                      value={values[role]}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          [role]: event.target.value,
                        }))
                      }
                    />
                  </div>
                ))}
              </div>

              <FieldError>{error}</FieldError>

              <div className="flex justify-end gap-2 border-t border-line pt-4">
                <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
                  Batal
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? "Menyimpan..." : "Simpan kapasitas"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
