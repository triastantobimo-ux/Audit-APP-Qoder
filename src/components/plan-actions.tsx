"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Download,
  GitBranch,
  RotateCcw,
  Send,
  X,
} from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { FieldError, Label, Textarea } from "@/components/ui/form";
import type { PlanView } from "@/lib/plan-view";

type DialogMode = "approve" | "return" | "version";

export function PlanActions({
  workspaceId,
  plan,
  canWrite,
  canApprove,
  currentUserId,
}: {
  workspaceId: string;
  plan: PlanView;
  canWrite: boolean;
  canApprove: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<DialogMode | null>(null);
  const [comment, setComment] = useState("");

  const isCreator = plan.createdById === currentUserId;
  const isEditable = ["draft", "returned"].includes(plan.status);
  const canReview =
    plan.status === "submitted" && canApprove && !isCreator;
  const exportHref = `/api/v1/workspaces/${workspaceId}/audit-plans/${plan.id}/export`;

  async function submitPlan() {
    setBusy("submit");
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/audit-plans/${plan.id}/submit`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            version: plan.version,
            comment: "Diajukan untuk approval.",
          }),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.detail ?? "Tidak bisa submit plan.");
        return;
      }

      router.refresh();
    } catch {
      setError("Tidak bisa menghubungi server.");
    } finally {
      setBusy(null);
    }
  }

  function openDialog(nextMode: DialogMode) {
    setMode(nextMode);
    setComment("");
    setError(null);
  }

  async function handleDialogSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mode) return;

    if (mode !== "approve" && !comment.trim()) {
      setError(
        mode === "return"
          ? "Catatan review wajib diisi."
          : "Alasan versi baru wajib diisi.",
      );
      return;
    }

    setBusy(mode);
    setError(null);

    try {
      const endpoint =
        mode === "version"
          ? `/api/v1/workspaces/${workspaceId}/audit-plans/${plan.id}/new-version`
          : `/api/v1/workspaces/${workspaceId}/audit-plans/${plan.id}/${mode}`;
      const body =
        mode === "version"
          ? { version: plan.version, reason: comment }
          : { version: plan.version, comment: comment || undefined };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.detail ?? "Aksi plan gagal.");
        return;
      }

      setMode(null);
      if (mode === "version") {
        router.push(`/audit-plan/${payload.data.id}`);
      }
      router.refresh();
    } catch {
      setError("Tidak bisa menghubungi server.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <a href={exportHref} className={buttonClasses("secondary", "md")}>
          <Download className="h-4 w-4" aria-hidden="true" />
          Export CSV
        </a>

        {isEditable && canWrite && plan.status === "returned" ? (
          <Button onClick={submitPlan} disabled={Boolean(busy)}>
            <Send className="h-4 w-4" aria-hidden="true" />
            {busy === "submit" ? "Mengirim..." : "Submit ulang"}
          </Button>
        ) : null}

        {isEditable && canWrite && plan.status === "draft" ? (
          <Button onClick={submitPlan} disabled={Boolean(busy)}>
            <Send className="h-4 w-4" aria-hidden="true" />
            {busy === "submit" ? "Mengirim..." : "Submit untuk approval"}
          </Button>
        ) : null}

        {canReview ? (
          <>
            <Button
              variant="primary"
              onClick={() => openDialog("approve")}
              disabled={Boolean(busy)}
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Approve
            </Button>
            <Button
              variant="secondary"
              onClick={() => openDialog("return")}
              disabled={Boolean(busy)}
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Return
            </Button>
          </>
        ) : null}

        {plan.status === "approved" && canWrite ? (
          <Button
            variant="secondary"
            onClick={() => openDialog("version")}
            disabled={Boolean(busy)}
          >
            <GitBranch className="h-4 w-4" aria-hidden="true" />
            Buat versi baru
          </Button>
        ) : null}
      </div>

      {plan.status === "submitted" && isCreator ? (
        <p className="text-[11px] text-muted">
          Kamu pembuat plan ini. Approval harus dilakukan oleh CAE atau administrator.
        </p>
      ) : null}

      {error && !mode ? (
        <FieldError>{error}</FieldError>
      ) : null}

      {mode ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
          <div
            className="fixed inset-0 bg-slate-950/45 backdrop-blur-sm"
            onClick={() => setMode(null)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="plan-dialog-title"
            className="relative z-10 mt-24 w-full max-w-lg rounded-2xl border border-line bg-surface shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-line px-5 py-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
                  Plan review
                </p>
                <h2 id="plan-dialog-title" className="mt-1 text-lg font-semibold text-ink">
                  {mode === "approve"
                    ? "Approve audit plan"
                    : mode === "return"
                      ? "Kembalikan audit plan"
                      : "Buat versi plan baru"}
                </h2>
                <p className="mt-1 text-xs text-muted">
                  {mode === "version"
                    ? "Plan approved akan dikunci dan ditandai superseded. Versi baru dibuat sebagai draft."
                    : "Aksi ini tercatat di audit trail."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMode(null)}
                className="rounded-lg p-1.5 text-muted hover:bg-slate-100 hover:text-ink"
                aria-label="Tutup"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleDialogSubmit} className="space-y-4 px-5 py-5">
              <div>
                <Label htmlFor="plan-comment">
                  {mode === "approve"
                    ? "Catatan (opsional)"
                    : mode === "return"
                      ? "Catatan review"
                      : "Alasan perubahan"}
                </Label>
                <Textarea
                  id="plan-comment"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder={
                    mode === "approve"
                      ? "Catatan approval..."
                      : mode === "return"
                        ? "Apa yang harus diperbaiki?"
                        : "Mengapa plan perlu direvisi?"
                  }
                  className="min-h-24"
                  required={mode !== "approve"}
                />
              </div>

              <FieldError>{error}</FieldError>

              <div className="flex justify-end gap-2 border-t border-line pt-4">
                <Button variant="secondary" onClick={() => setMode(null)} disabled={Boolean(busy)}>
                  Batal
                </Button>
                <Button type="submit" disabled={Boolean(busy)}>
                  {busy
                    ? "Memproses..."
                    : mode === "approve"
                      ? "Approve plan"
                      : mode === "return"
                        ? "Return plan"
                        : "Buat versi baru"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
