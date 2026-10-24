"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, ClipboardPen, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label, Textarea } from "@/components/ui/form";
import { findingStatusLabels, type FindingStatus } from "@/lib/finding";
import { relativeTime } from "@/lib/format";
import type { FindingView } from "@/lib/finding-view";

export function FindingResponsePanel({
  workspaceId,
  finding,
}: {
  workspaceId: string;
  finding: FindingView;
}) {
  const router = useRouter();
  const base = `/api/v1/workspaces/${workspaceId}/engagements/${finding.engagementId}/findings/${finding.id}`;

  const [response, setResponse] = useState(finding.managementResponse);
  const [plannedAction, setPlannedAction] = useState(finding.plannedAction);
  const [dueDate, setDueDate] = useState(
    finding.dueDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
  );
  const [body, setBody] = useState("");
  const [progressPercent, setProgressPercent] = useState(finding.progressPercent);
  const [busy, setBusy] = useState(false);
  const [responseError, setResponseError] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const canRespond = finding.actions.canRespond;
  const canUpdate = finding.actions.canAddUpdate;

  async function submitResponse(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setResponseError(null);

    try {
      const res = await fetch(`${base}/response`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          response,
          plannedAction,
          dueDate,
          version: finding.version,
        }),
      });
      const payload = await res.json();

      if (!res.ok) {
        setResponseError(payload.detail ?? "Respons manajemen gagal disimpan.");
        return;
      }

      router.refresh();
    } catch {
      setResponseError("Tidak bisa menghubungi server.");
    } finally {
      setBusy(false);
    }
  }

  async function submitUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setUpdateError(null);

    try {
      const res = await fetch(`${base}/updates`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body, progressPercent, version: finding.version }),
      });
      const payload = await res.json();

      if (!res.ok) {
        setUpdateError(payload.detail ?? "Catatan progres gagal disimpan.");
        return;
      }

      setBody("");
      router.refresh();
    } catch {
      setUpdateError("Tidak bisa menghubungi server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-ink">
          Respons manajemen
          <span className="ml-2 text-[11px] font-normal text-muted">
            {finding.owner ? `Diisi oleh ${finding.owner.name}` : "Menunggu penanggung jawab"}
          </span>
        </p>
        <p className="mt-0.5 text-[11px] text-muted">
          Respons dan rencana aksi menjadi dasar remediasi; keduanya tercatat permanen
          pada riwayat temuan.
        </p>
      </div>

      {canRespond ? (
        <form onSubmit={submitResponse} className="space-y-3 rounded-lg border border-line bg-slate-50/60 px-3 py-3">
          <div>
            <Label htmlFor="finding-response">Respons atas temuan</Label>
            <Textarea
              id="finding-response"
              value={response}
              onChange={(event) => setResponse(event.target.value)}
              className="min-h-20"
              placeholder="Pernyataan manajemen atas kondisi dan rekomendasi audit"
              required
            />
          </div>
          <div>
            <Label htmlFor="finding-planned">Rencana aksi remediasi</Label>
            <Textarea
              id="finding-planned"
              value={plannedAction}
              onChange={(event) => setPlannedAction(event.target.value)}
              className="min-h-20"
              placeholder="Aksi konkret, penanggung jawab, dan jadwal"
              required
            />
          </div>
          <div className="sm:max-w-56">
            <Label htmlFor="finding-due">Target penyelesaian</Label>
            <Input
              id="finding-due"
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              required
            />
          </div>
          <FieldError>{responseError}</FieldError>
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? "Menyimpan..." : "Simpan & mulai remediasi"}
            </Button>
            <span className="text-[11px] text-muted">Versi {finding.version}</span>
          </div>
        </form>
      ) : (
        <div className="space-y-2 rounded-lg border border-line px-3 py-2.5 text-xs">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Respons
            </p>
            <p className="mt-0.5 whitespace-pre-line leading-5 text-slate-700">
              {finding.managementResponse || "Belum ada respons manajemen."}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Rencana aksi
            </p>
            <p className="mt-0.5 whitespace-pre-line leading-5 text-slate-700">
              {finding.plannedAction || "Belum ada rencana aksi."}
            </p>
          </div>
          {finding.riskJustification ? (
            <div className="rounded-lg bg-amber-50 px-3 py-2">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                Justifikasi penerimaan risiko
              </p>
              <p className="mt-1 whitespace-pre-line leading-5 text-amber-900">
                {finding.riskJustification}
              </p>
            </div>
          ) : null}
        </div>
      )}

      <div>
        <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <CalendarClock className="h-4 w-4 text-muted" aria-hidden="true" />
          Perkembangan remediasi
          <span className="text-[11px] font-normal text-muted">
            Progres {finding.progressPercent}%
          </span>
        </p>

        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-teal-500 transition-all"
            style={{ width: `${finding.progressPercent}%` }}
            aria-hidden="true"
          />
        </div>

        <div className="mt-3 space-y-2">
          {finding.updates.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line px-3 py-4 text-xs text-muted">
              Belum ada perkembangan tercatat.
            </p>
          ) : null}

          {finding.updates.map((update) => (
            <div key={update.id} className="rounded-lg border border-line px-3 py-2.5 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold text-ink">{update.author.name}</span>
                <span className="text-[11px] text-muted">{relativeTime(update.createdAt)}</span>
                {update.statusFrom !== update.statusTo ? (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                    {findingStatusLabels[update.statusFrom as FindingStatus]}{" "}
                    →{" "}
                    {findingStatusLabels[update.statusTo as FindingStatus]}
                  </span>
                ) : null}
                <span className="ml-auto text-[11px] text-muted">
                  {update.progressPercent}%
                </span>
              </div>
              <p className="mt-1.5 whitespace-pre-line leading-5 text-slate-700">
                {update.body}
              </p>
            </div>
          ))}
        </div>

        {canUpdate ? (
          <form onSubmit={submitUpdate} className="mt-3 space-y-3 rounded-lg border border-line px-3 py-3">
            <div>
              <Label htmlFor="finding-update-body">Catatan progres</Label>
              <Textarea
                id="finding-update-body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                className="min-h-20"
                placeholder="Contoh: bukti konfirmasi kuartal I sudah dikumpulkan."
                required
              />
              <FieldHint>Minimal 10 karakter. Status tidak berubah lewat catatan ini.</FieldHint>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-36">
                <Label htmlFor="finding-update-progress">Progres (%)</Label>
                <Input
                  id="finding-update-progress"
                  type="number"
                  min={0}
                  max={100}
                  step={5}
                  value={progressPercent}
                  onChange={(event) => setProgressPercent(Number(event.target.value))}
                />
              </div>
              <Button type="submit" size="sm" variant="secondary" disabled={busy}>
                <ClipboardPen className="h-3.5 w-3.5" aria-hidden="true" />
                {busy ? "Menyimpan..." : "Tambah catatan"}
              </Button>
            </div>
            <FieldError>{updateError}</FieldError>
          </form>
        ) : null}
      </div>
    </div>
  );
}
