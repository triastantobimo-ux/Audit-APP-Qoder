"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCheck, RotateCcw, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, Label, Textarea } from "@/components/ui/form";
import type { EngagementView } from "@/lib/engagement-view";
import { can, type Role } from "@/lib/rbac";

type Action = {
  to: string;
  label: string;
  description: string;
  variant?: "primary" | "secondary";
  icon: "send" | "issue" | "back" | "close";
  requiresNote?: boolean;
};

const icons = {
  send: Send,
  issue: CheckCheck,
  back: RotateCcw,
  close: CheckCheck,
};

export function TransitionActions({
  workspaceId,
  engagement,
  role,
  currentUserId,
}: {
  workspaceId: string;
  engagement: EngagementView;
  role: Role;
  currentUserId: string;
}) {
  const router = useRouter();
  const [action, setAction] = useState<Action | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canWrite = can(role, "engagement:write");
  const canIssue = can(role, "engagement:issue");
  const isManager = role === "MANAGER" || role === "CAE";
  const isPreparer = engagement.preparer?.id === currentUserId;
  const isReviewer = engagement.reviewer?.id === currentUserId;
  const isApprover = engagement.approver?.id === currentUserId;

  const actions: Action[] = [];

  if (engagement.status === "draft" && canWrite && (isPreparer || isManager)) {
    actions.push({
      to: "planning",
      label: "Mulai planning",
      description: "Objective, scope, jadwal, dan tim harus sudah lengkap.",
      icon: "send",
    });
  }
  if (engagement.status === "planning" && isPreparer) {
    actions.push({
      to: "fieldwork",
      label: "Mulai fieldwork",
      description: "Seluruh baris RCM harus memiliki procedure dan evidence.",
      icon: "send",
    });
  }
  if (engagement.status === "fieldwork" && isPreparer) {
    actions.push({
      to: "review",
      label: "Ajukan review",
      description: "Reviewer akan menerima engagement dengan RCM terkunci.",
      icon: "send",
    });
  }
  if (engagement.status === "review" && canIssue && isApprover) {
    actions.push({
      to: "issued",
      label: "Issue engagement",
      description: "Issuance menandai hasil audit final dan mengunci konten.",
      icon: "issue",
    });
  }
  if (engagement.status === "review" && (isReviewer || isManager)) {
    actions.push({
      to: "fieldwork",
      label: "Kembalikan ke fieldwork",
      description: "Tuliskan catatan review yang harus ditindaklanjuti.",
      variant: "secondary",
      icon: "back",
      requiresNote: true,
    });
  }
  if (engagement.status === "issued" && canIssue && (isApprover || isManager)) {
    actions.push({
      to: "closed",
      label: "Tutup engagement",
      description: "Closure menandai engagement selesai sepenuhnya.",
      variant: "secondary",
      icon: "close",
    });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action) return;

    if (action.requiresNote && !note.trim()) {
      setError("Catatan wajib diisi untuk mengembalikan ke fieldwork.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/engagements/${engagement.id}/transition`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            toStatus: action.to,
            note: note.trim() || undefined,
            version: engagement.version,
          }),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.detail ?? "Transisi gagal.");
        return;
      }

      setAction(null);
      setNote("");
      router.refresh();
    } catch {
      setError("Tidak bisa menghubungi server.");
    } finally {
      setBusy(false);
    }
  }

  if (actions.length === 0) {
    return (
      <p className="max-w-xs text-right text-[11px] leading-5 text-muted">
        {engagement.status === "review"
          ? "Menunggu reviewer atau approver menindaklanjuti review."
          : engagement.status === "issued"
            ? "Engagement issued; hanya approver/CAE yang dapat menutup."
            : engagement.status === "closed"
              ? "Engagement sudah ditutup."
              : "Transisi berikutnya dilakukan oleh preparer atau manager yang ditetapkan."}
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {actions.map((item) => {
          const Icon = icons[item.icon];

          return (
            <Button
              key={`${item.to}-${item.label}`}
              variant={item.variant ?? "primary"}
              onClick={() => {
                setAction(item);
                setNote("");
                setError(null);
              }}
              disabled={Boolean(action) || busy}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
              {item.to === "issued" || item.to === "fieldwork" ? null : (
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </Button>
          );
        })}
      </div>

      {action ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
          <div
            className="fixed inset-0 bg-slate-950/45 backdrop-blur-sm"
            onClick={() => setAction(null)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="transition-title"
            className="relative z-10 mt-24 w-full max-w-lg rounded-2xl border border-line bg-surface shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-line px-5 py-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
                  Workflow · {engagement.code}
                </p>
                <h2 id="transition-title" className="mt-1 text-lg font-semibold text-ink">
                  {action.label}
                </h2>
                <p className="mt-1 text-xs leading-5 text-muted">
                  {action.description}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAction(null)}
                className="rounded-lg p-1.5 text-muted hover:bg-slate-100 hover:text-ink"
                aria-label="Tutup"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={submit} className="space-y-4 px-5 py-5">
              <div>
                <Label htmlFor="transition-note">
                  {action.requiresNote ? "Catatan review" : "Catatan (opsional)"}
                </Label>
                <Textarea
                  id="transition-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={
                    action.requiresNote
                      ? "Bagian mana yang harus diperbaiki?"
                      : "Konteks transisi..."
                  }
                  className="min-h-24"
                  required={action.requiresNote}
                />
              </div>

              <FieldError>{error}</FieldError>

              <div className="flex justify-end gap-2 border-t border-line pt-4">
                <Button
                  variant="secondary"
                  onClick={() => setAction(null)}
                  disabled={busy}
                >
                  Batal
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? "Memproses..." : action.label}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
