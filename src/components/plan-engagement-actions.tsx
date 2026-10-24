"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select } from "@/components/ui/form";
import type { PlanEngagementView } from "@/lib/plan-view";

const statuses = ["planned", "in_progress", "completed", "deferred"] as const;

export function PlanEngagementActions({
  workspaceId,
  planId,
  planVersion,
  engagement,
  planStatus,
  canWrite,
}: {
  workspaceId: string;
  planId: string;
  planVersion: number;
  engagement: PlanEngagementView;
  planStatus: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"actuals" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actualHours, setActualHours] = useState(String(engagement.actualHours));
  const [status, setStatus] = useState(engagement.status);

  const isEditable = ["draft", "returned"].includes(planStatus);
  const isApproved = planStatus === "approved";

  async function handleDelete() {
    if (
      !window.confirm(
        `Hapus engagement "${engagement.title}" dari plan? Tindakan ini masuk audit trail.`,
      )
    ) {
      return;
    }

    setBusy("delete");
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/audit-plans/${planId}/engagements/${engagement.id}`,
        {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ version: planVersion }),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.detail ?? "Tidak bisa menghapus engagement.");
        return;
      }

      router.refresh();
    } catch {
      setError("Tidak bisa menghubungi server.");
    } finally {
      setBusy(null);
    }
  }

  async function handleActuals(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("actuals");
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/audit-plans/${planId}/engagements/${engagement.id}/actuals`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            actualHours: Number(actualHours) || 0,
            status,
            version: planVersion,
          }),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.detail ?? "Tidak bisa menyimpan actual hours.");
        return;
      }

      setDialog(null);
      router.refresh();
    } catch {
      setError("Tidak bisa menghubungi server.");
    } finally {
      setBusy(null);
    }
  }

  if (!canWrite || (!isEditable && !isApproved)) {
    return null;
  }

  return (
    <div className="flex items-center justify-end gap-1">
      {isApproved ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setDialog("actuals");
            setError(null);
          }}
          title="Update actual hours"
        >
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          Actual
        </Button>
      ) : null}

      {isEditable ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          disabled={Boolean(busy)}
          title="Hapus engagement"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      ) : null}

      {error && !dialog ? (
        <span className="text-[11px] text-danger">{error}</span>
      ) : null}

      {dialog === "actuals" ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
          <div
            className="fixed inset-0 bg-slate-950/45 backdrop-blur-sm"
            onClick={() => setDialog(null)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="actuals-title"
            className="relative z-10 mt-24 w-full max-w-md rounded-2xl border border-line bg-surface shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-line px-5 py-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
                  Plan vs actual
                </p>
                <h2 id="actuals-title" className="mt-1 text-lg font-semibold text-ink">
                  Update actual hours
                </h2>
                <p className="mt-1 text-xs text-muted">{engagement.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setDialog(null)}
                className="rounded-lg p-1.5 text-muted hover:bg-slate-100 hover:text-ink"
                aria-label="Tutup"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleActuals} className="space-y-4 px-5 py-5">
              <div>
                <Label htmlFor="actual-hours">Actual hours</Label>
                <Input
                  id="actual-hours"
                  type="number"
                  min={0}
                  step="0.5"
                  value={actualHours}
                  onChange={(event) => setActualHours(event.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="actual-status">Status eksekusi</Label>
                <Select
                  id="actual-status"
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  {statuses.map((value) => (
                    <option key={value} value={value}>
                      {value.replaceAll("_", " ")}
                    </option>
                  ))}
                </Select>
              </div>

              <FieldError>{error}</FieldError>

              <div className="flex justify-end gap-2 border-t border-line pt-4">
                <Button variant="secondary" onClick={() => setDialog(null)} disabled={Boolean(busy)}>
                  Batal
                </Button>
                <Button type="submit" disabled={Boolean(busy)}>
                  {busy === "actuals" ? "Menyimpan..." : "Simpan actual"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
