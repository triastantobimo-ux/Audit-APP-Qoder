"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCheck,
  RotateCcw,
  Send,
  ShieldAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Label, Textarea } from "@/components/ui/form";
import type { FindingStatus } from "@/lib/finding";
import type { FindingView } from "@/lib/finding-view";

type ActionKey =
  | "canCommunicate"
  | "canSubmitForValidation"
  | "canValidate"
  | "canReopen"
  | "canAcceptRisk";

type Action = {
  key: ActionKey;
  toStatus: FindingStatus;
  label: string;
  description: string;
  variant: "primary" | "secondary";
  icon: typeof Send;
  requiresNote?: boolean;
  noteLabel?: string;
  notePlaceholder?: string;
};

const definitions: Record<ActionKey, Action> = {
  canCommunicate: {
    key: "canCommunicate",
    toStatus: "communicated",
    label: "Komunikasikan temuan",
    description:
      "Analisis lima C, penanggung jawab, dan target penyelesaian harus lengkap sebelum temuan dikirim ke manajemen.",
    variant: "primary",
    icon: Send,
  },
  canSubmitForValidation: {
    key: "canSubmitForValidation",
    toStatus: "pending_validation",
    label: "Ajukan validasi",
    description:
      "Remediasi dinyatakan selesai dan menunggu validasi tim audit sebelum temuan dapat ditutup.",
    variant: "primary",
    icon: CheckCheck,
  },
  canValidate: {
    key: "canValidate",
    toStatus: "closed",
    label: "Validasi & tutup",
    description:
      "Penanggung jawab remediasi tidak dapat memvalidasi temuannya sendiri. Riwayat penutupan tersimpan permanen.",
    variant: "primary",
    icon: CheckCheck,
  },
  canReopen: {
    key: "canReopen",
    toStatus: "reopened",
    label: "Buka kembali",
    description: "Alasan pembukaan kembali wajib ditulis dan tercatat di audit trail.",
    variant: "secondary",
    icon: RotateCcw,
    requiresNote: true,
    noteLabel: "Alasan buka kembali",
    notePlaceholder: "Bagian remediasi yang belum memadai?",
  },
  canAcceptRisk: {
    key: "canAcceptRisk",
    toStatus: "accepted_risk",
    label: "Terima risiko",
    description:
      "Residual risiko diterima oleh pihak berwenang. Status ini final dan tidak dapat dibuka kembali.",
    variant: "secondary",
    icon: ShieldAlert,
    requiresNote: true,
    noteLabel: "Justifikasi penerimaan risiko",
    notePlaceholder: "Mengapa residual risiko diterima manajemen?",
  },
};

export function FindingTransitionActions({
  workspaceId,
  finding,
}: {
  workspaceId: string;
  finding: FindingView;
}) {
  const router = useRouter();
  const [action, setAction] = useState<Action | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actions = (Object.keys(definitions) as ActionKey[])
    .filter((key) => finding.actions[key])
    .map((key) => definitions[key]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action) return;

    if (action.requiresNote && note.trim().length < 10) {
      setError(`${action.noteLabel} wajib diisi minimal 10 karakter.`);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/engagements/${finding.engagementId}/findings/${finding.id}/transition`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            toStatus: action.toStatus,
            note: note.trim() || undefined,
            version: finding.version,
          }),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.detail ?? "Transisi temuan gagal.");
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
        {finding.status === "accepted_risk"
          ? "Residual risiko telah diterima. Temuan ditutup tanpa remediasi lanjut."
          : finding.status === "closed"
            ? "Temuan telah tervalidasi dan ditutup. Hanya sisi audit yang dapat membuka kembali."
            : finding.status === "draft"
              ? `${finding.readiness.missing.length > 0 ? `Lengkapi: ${finding.readiness.missing.join(", ")}.` : "Temuan siap dikomunikasikan ke manajemen."}`
              : "Menunggu aksi penanggung jawab remediasi atau validasi audit."}
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {actions.map((item) => {
          const Icon = item.icon;

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
            aria-labelledby="finding-transition-title"
            className="relative z-10 mt-16 w-full max-w-lg rounded-2xl border border-line bg-surface shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-line px-5 py-4">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
                  {finding.reference} · v{finding.version}
                </p>
                <h2
                  id="finding-transition-title"
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
              {action.key === "canCommunicate" && finding.readiness.missing.length > 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-800">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    Belum siap dikomunikasikan
                  </p>
                  <ul className="mt-1.5 space-y-1 text-[11px] leading-5 text-amber-800">
                    {finding.readiness.missing.map((item) => (
                      <li key={item}>· {item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {action.key === "canAcceptRisk" ? (
                <p className="flex items-start gap-1.5 rounded-lg bg-slate-50 px-3 py-2.5 text-[11px] leading-5 text-slate-600">
                  <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />
                  Penerimaan risiko adalah keputusan manajemen. Justifikasi tertulis
                  menjadi bukti untuk quality assurance dan review eksternal.
                </p>
              ) : null}

              <div>
                <Label htmlFor="finding-transition-note">
                  {action.requiresNote
                    ? action.noteLabel
                    : "Catatan (opsional)"}
                </Label>
                <Textarea
                  id="finding-transition-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className="min-h-24"
                  placeholder={
                    action.notePlaceholder ?? "Konteks transisi status..."
                  }
                  required={action.requiresNote}
                />
                <FieldHint>
                  Catatan tersimpan pada riwayat temuan dan audit trail.
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
