"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileUp, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label, Select } from "@/components/ui/form";
import { formatBytes } from "@/lib/format";
import { evidenceSources } from "@/lib/workpaper";
import type { WorkpaperEvidenceView } from "@/lib/workpaper-view";

const sourceLabels: Record<string, string> = {
  client_system: "Sistem klien",
  document_request: "Permintaan dokumen",
  interview: "Wawancara",
  reperformance: "Reperformance",
  external_confirmation: "Konfirmasi eksternal",
  observation: "Observasi",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function EvidencePanel({
  workspaceId,
  engagementId,
  workpaperId,
  evidence,
  canUpload,
  canDelete,
  locked,
}: {
  workspaceId: string;
  engagementId: string;
  workpaperId: string;
  evidence: WorkpaperEvidenceView[];
  canUpload: boolean;
  canDelete: boolean;
  locked: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [source, setSource] = useState<string>(evidenceSources[0] ?? "client_system");
  const [periodLabel, setPeriodLabel] = useState("");
  const [capturedAt, setCapturedAt] = useState(today());
  const [supersedesId, setSupersedesId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<WorkpaperEvidenceView | null>(null);
  const [reason, setReason] = useState("");

  const base = `/api/v1/workspaces/${workspaceId}/engagements/${engagementId}/workpapers/${workpaperId}/evidence`;
  const active = evidence.filter((item) => !item.deletedAt);

  function resetForm() {
    setLabel("");
    setSource(evidenceSources[0] ?? "client_system");
    setPeriodLabel("");
    setCapturedAt(today());
    setSupersedesId("");
    setFile(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setError("Pilih file evidence terlebih dahulu.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const form = new FormData();
      form.set("file", file);
      form.set("label", label);
      form.set("source", source);
      form.set("periodLabel", periodLabel);
      form.set("capturedAt", capturedAt);
      if (supersedesId) form.set("supersedesId", supersedesId);

      const response = await fetch(base, { method: "POST", body: form });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.detail ?? "Evidence gagal diunggah.");
        return;
      }

      resetForm();
      setOpen(false);
      router.refresh();
    } catch {
      setError("Tidak bisa menghubungi server.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`${base}/${pendingDelete.id}/delete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.detail ?? "Evidence gagal dihapus.");
        return;
      }

      setPendingDelete(null);
      setReason("");
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
            Evidence
            <span className="ml-2 text-xs font-normal text-muted">
              {active.length} aktif · {evidence.length - active.length} terhapus
            </span>
          </p>
          <p className="mt-0.5 text-[11px] text-muted">
            Setiap unggahan menyimpan SHA-256 dan versi baru; versi lama tidak
            pernah tertimpa.
          </p>
        </div>
        {canUpload && !locked ? (
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
            <FileUp className="h-4 w-4" aria-hidden="true" />
            Unggah evidence
          </Button>
        ) : null}
      </div>

      {locked ? (
        <FieldHint>
          Workpaper sudah sign-off — evidence terkunci dan tidak bisa ditambah
          atau dihapus.
        </FieldHint>
      ) : null}

      <div className="mt-3 space-y-2">
        {evidence.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-3 py-4 text-xs text-muted">
            Belum ada evidence. Kirim ke review membutuhkan minimal satu file.
          </p>
        ) : null}

        {evidence.map((item) => (
          <div
            key={item.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-surface px-3 py-2 text-xs"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-ink" title={item.label}>
                {item.label}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-muted">
                {item.fileName} · {formatBytes(item.sizeBytes)} ·{" "}
                {sourceLabels[item.source] ?? item.source}
                {item.periodLabel ? ` · periode ${item.periodLabel}` : ""} ·{" "}
                {item.capturedAt.slice(0, 10)}
              </p>
              <p className="mt-0.5 truncate font-mono text-[10px] text-slate-400">
                sha256 {item.sha256.slice(0, 16)}… · diunggah{" "}
                {item.uploadedBy?.name ?? "sistem"}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <Badge tone={item.deletedAt ? "danger" : "accent"}>
                {item.deletedAt ? "Terhapus" : `v${item.version}`}
              </Badge>
              {!item.deletedAt ? (
                <a
                  href={`${base}/${item.id}/download`}
                  className="rounded-md p-1.5 text-muted hover:bg-slate-100 hover:text-ink"
                  aria-label={`Unduh ${item.fileName}`}
                  title="Unduh evidence"
                >
                  <Download className="h-3.5 w-3.5" />
                </a>
              ) : null}
              {canDelete && !item.deletedAt && !locked ? (
                <button
                  type="button"
                  onClick={() => {
                    setPendingDelete(item);
                    setReason("");
                    setError(null);
                  }}
                  className="rounded-md p-1.5 text-muted hover:bg-red-50 hover:text-danger"
                  aria-label={`Hapus ${item.fileName}`}
                  title="Hapus soft (retensi tetap tersimpan)"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>

            {item.deletedAt ? (
              <p className="w-full border-t border-line pt-1.5 text-[11px] text-muted">
                Dihapus {item.deletedAt.slice(0, 10)} oleh{" "}
                {item.deletedBy?.name ?? "-"} · alasan: {item.deleteReason ?? "-"}
              </p>
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
            aria-labelledby="evidence-title"
            className="relative z-10 mt-10 w-full max-w-xl rounded-2xl border border-line bg-surface shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-line px-5 py-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
                  Evidence
                </p>
                <h2 id="evidence-title" className="mt-1 text-lg font-semibold text-ink">
                  Unggah evidence
                </h2>
                <p className="mt-1 text-xs text-muted">
                  Maksimal 25 MB. Label yang sama akan membuat versi baru, bukan
                  menimpa file lama.
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
              <div>
                <Label htmlFor="ev-label">Label evidence</Label>
                <Input
                  id="ev-label"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="Contoh: Matriks approval master vendor"
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="ev-source">Sumber</Label>
                  <Select
                    id="ev-source"
                    value={source}
                    onChange={(event) => setSource(event.target.value)}
                  >
                    {evidenceSources.map((value) => (
                      <option key={value} value={value}>
                        {sourceLabels[value] ?? value}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="ev-captured">Tanggal perolehan</Label>
                  <Input
                    id="ev-captured"
                    type="date"
                    value={capturedAt}
                    onChange={(event) => setCapturedAt(event.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="ev-period">Periode data</Label>
                  <Input
                    id="ev-period"
                    value={periodLabel}
                    onChange={(event) => setPeriodLabel(event.target.value)}
                    placeholder="Jan–Des 2025"
                  />
                </div>
                <div>
                  <Label htmlFor="ev-supersedes">Menggantikan versi</Label>
                  <Select
                    id="ev-supersedes"
                    value={supersedesId}
                    onChange={(event) => setSupersedesId(event.target.value)}
                  >
                    <option value="">Versi pertama untuk label ini</option>
                    {active.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label} · v{item.version}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="ev-file">File</Label>
                <input
                  id="ev-file"
                  type="file"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-ink"
                  required
                />
                <FieldHint>
                  Nama file dibersihkan otomatis dan hash dihitung di server.
                </FieldHint>
              </div>

              <FieldError>{error}</FieldError>

              <div className="flex justify-end gap-2 border-t border-line pt-4">
                <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
                  Batal
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? "Mengunggah..." : "Unggah"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {pendingDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-950/45 backdrop-blur-sm"
            onClick={() => setPendingDelete(null)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="evidence-delete-title"
            className="relative z-10 w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-2xl"
          >
            <h2 id="evidence-delete-title" className="text-sm font-semibold text-ink">
              Hapus {pendingDelete.fileName}?
            </h2>
            <p className="mt-2 text-xs leading-5 text-muted">
              Penghapusan bersifat soft delete: berkas tetap disimpan untuk
              retensi dan tercatat di audit trail.
            </p>
            <div className="mt-3">
              <Label htmlFor="ev-delete-reason">Alasan</Label>
              <Input
                id="ev-delete-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Mis. file duplikat dengan versi lebih baru"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setPendingDelete(null)}
                disabled={busy}
              >
                Batal
              </Button>
              <Button variant="danger" onClick={handleDelete} disabled={busy}>
                {busy ? "Menghapus..." : "Hapus"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
