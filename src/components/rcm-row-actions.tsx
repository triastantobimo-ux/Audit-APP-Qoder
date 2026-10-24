"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/form";

export function RcmRowActions({
  workspaceId,
  engagementId,
  version,
  orderedIds,
  rowId,
  index,
  label,
}: {
  workspaceId: string;
  engagementId: string;
  version: number;
  orderedIds: string[];
  rowId: string;
  index: number;
  label: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function move(direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= orderedIds.length) return;

    const next = [...orderedIds];
    [next[index], next[target]] = [next[target], next[index]];

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/engagements/${engagementId}/rcm/reorder`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ orderedIds: next, version }),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.detail ?? "Urutan gagal disimpan.");
        return;
      }

      router.refresh();
    } catch {
      setError("Tidak bisa menghubungi server.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/engagements/${engagementId}/rcm/${rowId}`,
        {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ version }),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.detail ?? "Baris gagal dihapus.");
        return;
      }

      setConfirmOpen(false);
      router.refresh();
    } catch {
      setError("Tidak bisa menghubungi server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center justify-end gap-0.5">
        <button
          type="button"
          onClick={() => move(-1)}
          disabled={busy || index === 0}
          className="rounded-md p-1.5 text-muted hover:bg-slate-100 hover:text-ink disabled:opacity-30"
          aria-label="Naikkan baris"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => move(1)}
          disabled={busy || index === orderedIds.length - 1}
          className="rounded-md p-1.5 text-muted hover:bg-slate-100 hover:text-ink disabled:opacity-30"
          aria-label="Turunkan baris"
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={busy}
          className="rounded-md p-1.5 text-muted hover:bg-red-50 hover:text-danger"
          aria-label="Hapus baris"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <FieldError>{error}</FieldError>

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-950/45 backdrop-blur-sm"
            onClick={() => setConfirmOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="rcm-delete-title"
            className="relative z-10 w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-2xl"
          >
            <h2 id="rcm-delete-title" className="text-sm font-semibold text-ink">
              Hapus baris RCM?
            </h2>
            <p className="mt-2 text-xs leading-5 text-muted">
              {label} akan dihapus dari risk-control matrix. Tindakan ini tercatat
              di audit trail.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setConfirmOpen(false)}
                disabled={busy}
              >
                Batal
              </Button>
              <Button variant="danger" onClick={remove} disabled={busy}>
                {busy ? "Menghapus..." : "Hapus"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
