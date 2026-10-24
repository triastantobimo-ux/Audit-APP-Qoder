"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, PenLine, RotateCcw, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Label, Textarea } from "@/components/ui/form";
import type { WorkpaperView } from "@/lib/workpaper-view";

type ActionKey = "canSubmit" | "canMarkReviewed" | "canReturn" | "canSignOff";

type Action = {
  key: ActionKey;
  toStatus: string;
  label: string;
  description: string;
  variant: "primary" | "secondary";
  icon: "send" | "review" | "back" | "sign";
  requiresNote?: boolean;
};

const icons = {
  send: Send,
  review: CheckCheck,
  back: RotateCcw,
  sign: PenLine,
};

export function WorkpaperTransitionActions({
  workspaceId,
  workpaper,
}: {
  workspaceId: string;
  workpaper: WorkpaperView;
}) {
  const router = useRouter();
  const [action, setAction] = useState<Action | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const definitions: Record<ActionKey, Action> = {
    canSubmit: {
      key: "canSubmit",
      toStatus: "in_review",
      label: "Kirim ke review",
      description:
        "Workpaper harus punya minimal satu evidence aktif sebelum dikirim ke reviewer.",
      variant: "primary",
      icon: "send",
    },
    canMarkReviewed: {
      key: "canMarkReviewed",
      toStatus: "reviewed",
      label: "Tandai reviewed",
      description:
        "Hanya reviewer yang ditugaskan yang dapat menandai workpaper sebagai reviewed.",
      variant: "primary",
      icon: "review",
    },
    canReturn: {
      key: "canReturn",
      toStatus: "draft",
      label: "Kembalikan ke preparer",
      description: "Catatan pengembalian wajib diisi dan tercatat di audit trail.",
      variant: "secondary",
      icon: "back",
      requiresNote: true,
    },
    canSignOff: {
      key: "canSignOff",
      toStatus: "signed_off",
      label: "Sign off",
      description:
        "Sign-off menyimpan nama reviewer, timestamp, dan hash konten. Tidak bisa dibuka kembali.",
      variant: "primary",
      icon: "sign",
    },
  };

  const actions = (Object.keys(definitions) as ActionKey[])
    .filter((key) => workpaper.actions[key])
    .map((key) => definitions[key]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action) return;

    if (action.requiresNote && !note.trim()) {
      setError("Catatan wajib diisi untuk mengembalikan workpaper.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/engagements/${workpaper.engagementId}/workpapers/${workpaper.id}/transition`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            toStatus: action.toStatus,
            note: note.trim() || undefined,
            version: workpaper.version,
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
      <p className="text-[11px] leading-5 text-muted">
        {workpaper.status === "signed_off"
          ? "Workpaper sudah ditandatangani dan terkunci permanen."
          : workpaper.status === "draft"
            ? "Preparer melengkapi konten dan evidence, lalu mengirim ke review."
            : workpaper.status === "in_review"
              ? "Menunggu reviewer yang ditugaskan."
              : "Menunggu sign-off dari reviewer."}
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {actions.map((item) => {
          const Icon = icons[item.icon];

          return (
            <Button
              key={item.key}
              size="sm"
              variant={item.variant}
              onClick={() => {
                setAction(item);
                setNote("");
                setError(null);
              }}
              disabled={Boolean(action) || busy}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {item.label}
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
            aria-labelledby="workpaper-transition-title"
            className="relative z-10 mt-16 w-full max-w-lg rounded-2xl border border-line bg-surface shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-line px-5 py-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
                  {workpaper.reference} · v{workpaper.version}
                </p>
                <h2
                  id="workpaper-transition-title"
                  className="mt-1 text-lg font-semibold text-ink"
                >
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
              {action.key === "canSignOff" ? (
                <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-[11px] leading-5 text-muted">
                  <p>
                    <span className="font-semibold text-slate-700">Kesimpulan:</span>{" "}
                    {workpaper.conclusion.slice(0, 160) || "(kosong)"}
                  </p>
                  <p className="mt-1">
                    Evidence aktif: {workpaper.evidenceCount} · catatan blocking
                    open: {workpaper.openBlockingNotes}
                  </p>
                </div>
              ) : null}

              <div>
                <Label htmlFor="wp-transition-note">
                  {action.requiresNote ? "Catatan pengembalian" : "Catatan (opsional)"}
                </Label>
                <Textarea
                  id="wp-transition-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className="min-h-24"
                  placeholder={
                    action.requiresNote
                      ? "Bagian mana yang harus diperbaiki preparer?"
                      : "Konteks transisi..."
                  }
                  required={action.requiresNote}
                />
                <FieldHint>
                  {action.key === "canSignOff"
                    ? "Catatan tersimpan di audit trail bersama hash sign-off."
                    : "Tercatat pada riwayat workpaper."}
                </FieldHint>
              </div>

              <FieldError>{error}</FieldError>

              <div className="flex justify-end gap-2 border-t border-line pt-4">
                <Button variant="secondary" onClick={() => setAction(null)} disabled={busy}>
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
