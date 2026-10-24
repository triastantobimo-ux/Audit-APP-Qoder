"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, MessageSquarePlus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Label, Select, Textarea } from "@/components/ui/form";
import { relativeTime } from "@/lib/format";
import { noteSeverities } from "@/lib/workpaper";
import type { WorkpaperMemberView, WorkpaperNoteView } from "@/lib/workpaper-view";

const severityLabels: Record<string, string> = {
  minor: "Minor",
  major: "Major",
  blocking: "Blocking",
};

const severityTones = {
  minor: "info",
  major: "warning",
  blocking: "danger",
} as const;

export function WorkpaperNotesPanel({
  workspaceId,
  engagementId,
  workpaperId,
  notes,
  members,
  canAdd,
  canResolve,
  locked,
}: {
  workspaceId: string;
  engagementId: string;
  workpaperId: string;
  notes: WorkpaperNoteView[];
  members: WorkpaperMemberView[];
  canAdd: boolean;
  canResolve: boolean;
  locked: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<string>("minor");
  const [assigneeId, setAssigneeId] = useState("");
  const [resolving, setResolving] = useState<WorkpaperNoteView | null>(null);
  const [resolution, setResolution] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = `/api/v1/workspaces/${workspaceId}/engagements/${engagementId}/workpapers/${workpaperId}/notes`;
  const openNotes = notes.filter((note) => note.status === "open");

  async function addNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(base, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body,
          severity,
          assigneeId: assigneeId || null,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.detail ?? "Catatan gagal disimpan.");
        return;
      }

      setBody("");
      setSeverity("minor");
      setAssigneeId("");
      setOpen(false);
      router.refresh();
    } catch {
      setError("Tidak bisa menghubungi server.");
    } finally {
      setBusy(false);
    }
  }

  async function resolveNote() {
    if (!resolving) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`${base}/${resolving.id}/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resolution }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.detail ?? "Catatan gagal diselesaikan.");
        return;
      }

      setResolving(null);
      setResolution("");
      router.refresh();
    } catch {
      setError("Tidak bisa menghubungi server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">
            Catatan review
            <span className="ml-2 text-xs font-normal text-muted">
              {openNotes.length} open dari {notes.length}
            </span>
          </p>
          <p className="mt-0.5 text-[11px] text-muted">
            Catatan blocking harus diselesaikan sebelum workpaper bisa
            ditandatangani.
          </p>
        </div>
        {canAdd && !locked ? (
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
            <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
            Tambah catatan
          </Button>
        ) : null}
      </div>

      <div className="mt-3 space-y-2">
        {notes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-3 py-4 text-xs text-muted">
            Belum ada catatan review.
          </p>
        ) : null}

        {notes.map((note) => (
          <div
            key={note.id}
            className="rounded-lg border border-line bg-surface px-3 py-2.5 text-xs"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={severityTones[note.severity as keyof typeof severityTones] ?? "neutral"}>
                {severityLabels[note.severity] ?? note.severity}
              </Badge>
              <Badge tone={note.status === "open" ? "warning" : "success"}>
                {note.status === "open" ? "Open" : "Resolved"}
              </Badge>
              <p className="ml-auto truncate text-[11px] text-muted">
                {note.author.name} · {relativeTime(note.createdAt)}
                {note.assignee ? ` → ${note.assignee.name}` : ""}
              </p>
            </div>

            <p className="mt-1.5 whitespace-pre-line leading-5 text-slate-700">
              {note.body}
            </p>

            {note.status === "resolved" ? (
              <div className="mt-2 border-t border-line pt-2 text-[11px] text-muted">
                <p className="whitespace-pre-line leading-5 text-slate-600">
                  {note.resolution}
                </p>
                <p className="mt-1">
                  Diselesaikan oleh {note.resolvedBy?.name ?? "-"}
                  {note.resolvedAt ? ` · ${relativeTime(note.resolvedAt)}` : ""}
                </p>
              </div>
            ) : null}

            {note.status === "open" && canResolve && !locked ? (
              <Button
                size="sm"
                variant="secondary"
                className="mt-2"
                onClick={() => {
                  setResolving(note);
                  setResolution("");
                  setError(null);
                }}
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Selesaikan
              </Button>
            ) : null}
          </div>
        ))}
      </div>

      <FieldError>{error}</FieldError>

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
            aria-labelledby="note-new-title"
            className="relative z-10 mt-16 w-full max-w-lg rounded-2xl border border-line bg-surface shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-line px-5 py-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
                  Review note
                </p>
                <h2 id="note-new-title" className="mt-1 text-lg font-semibold text-ink">
                  Tambah catatan
                </h2>
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

            <form onSubmit={addNote} className="space-y-4 px-5 py-5">
              <div>
                <Label htmlFor="note-body">Catatan</Label>
                <Textarea
                  id="note-body"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  className="min-h-24"
                  placeholder="Temuan, pertanyaan, atau perbaikan yang diminta"
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="note-severity">Severity</Label>
                  <Select
                    id="note-severity"
                    value={severity}
                    onChange={(event) => setSeverity(event.target.value)}
                  >
                    {noteSeverities.map((value) => (
                      <option key={value} value={value}>
                        {severityLabels[value] ?? value}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="note-assignee">Ditugaskan ke</Label>
                  <Select
                    id="note-assignee"
                    value={assigneeId}
                    onChange={(event) => setAssigneeId(event.target.value)}
                  >
                    <option value="">Tanpa assignee</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <FieldError>{error}</FieldError>

              <div className="flex justify-end gap-2 border-t border-line pt-4">
                <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
                  Batal
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? "Menyimpan..." : "Simpan catatan"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {resolving ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
          <div
            className="fixed inset-0 bg-slate-950/45 backdrop-blur-sm"
            onClick={() => setResolving(null)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="note-resolve-title"
            className="relative z-10 mt-16 w-full max-w-lg rounded-2xl border border-line bg-surface shadow-2xl"
          >
            <div className="border-b border-line px-5 py-4">
              <h2 id="note-resolve-title" className="text-lg font-semibold text-ink">
                Selesaikan catatan
              </h2>
              <p className="mt-1 text-xs leading-5 text-muted">
                {resolving.body.slice(0, 180)}
                {resolving.body.length > 180 ? "…" : ""}
              </p>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void resolveNote();
              }}
              className="space-y-4 px-5 py-5"
            >
              <div>
                <Label htmlFor="note-resolution">Komentar resolusi</Label>
                <Textarea
                  id="note-resolution"
                  value={resolution}
                  onChange={(event) => setResolution(event.target.value)}
                  className="min-h-24"
                  placeholder="Jelaskan bagaimana catatan ditindaklanjuti"
                  required
                />
                <FieldHint>Minimal 10 karakter dan tersimpan permanen.</FieldHint>
              </div>

              <FieldError>{error}</FieldError>

              <div className="flex justify-end gap-2 border-t border-line pt-4">
                <Button variant="secondary" onClick={() => setResolving(null)} disabled={busy}>
                  Batal
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? "Menyimpan..." : "Tandai resolved"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
