"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  FieldError,
  FieldHint,
  Input,
  Label,
  Select,
  Textarea,
} from "@/components/ui/form";
import { findingSeverities, findingSeverityLabels } from "@/lib/finding";

const createFields = [
  {
    key: "condition",
    label: "Kondisi",
    hint: "Fakta hasil pengujian di lapangan.",
    required: true,
  },
  {
    key: "criteria",
    label: "Kriteria",
    hint: "Kebijakan, standar, atau kontrol yang seharusnya.",
    required: true,
  },
  {
    key: "cause",
    label: "Sebab",
    hint: "Akar masalah mengapa kondisi menyimpang.",
    required: false,
  },
  {
    key: "effect",
    label: "Akibat",
    hint: "Dampak risiko bagi entitas auditee.",
    required: false,
  },
  {
    key: "recommendation",
    label: "Rekomendasi",
    hint: "Aksi perbaikan yang diminta auditor.",
    required: false,
  },
] as const;

export function NewFindingPanel({
  workspaceId,
  engagementId,
  owners,
  workpapers,
  rcmRows,
}: {
  workspaceId: string;
  engagementId: string;
  owners: { id: string; name: string }[];
  workpapers: { id: string; reference: string; title: string }[];
  rcmRows: { id: string; riskDescription: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [severity, setSeverity] = useState("medium");
  const [ownerUserId, setOwnerUserId] = useState(owners[0]?.id ?? "");
  const [dueDate, setDueDate] = useState("");
  const [workpaperId, setWorkpaperId] = useState("");
  const [rcmRowId, setRcmRowId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setOpen(false);
    setTitle("");
    setFields({});
    setSeverity("medium");
    setOwnerUserId(owners[0]?.id ?? "");
    setDueDate("");
    setWorkpaperId("");
    setRcmRowId("");
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/engagements/${engagementId}/findings`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title,
            condition: fields.condition ?? "",
            criteria: fields.criteria ?? "",
            cause: fields.cause || undefined,
            effect: fields.effect || undefined,
            recommendation: fields.recommendation || undefined,
            severity,
            ownerUserId: ownerUserId || null,
            dueDate: dueDate || null,
            workpaperId: workpaperId || null,
            rcmRowId: rcmRowId || null,
          }),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.detail ?? "Temuan gagal dibuat.");
        return;
      }

      reset();
      router.push(
        `/engagements/${engagementId}/findings/${payload.data.id}`,
      );
      router.refresh();
    } catch {
      setError("Tidak bisa menghubungi server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <FilePlus2 className="h-4 w-4" aria-hidden="true" />
        Temuan baru
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
          <div
            className="fixed inset-0 bg-slate-950/45 backdrop-blur-sm"
            onClick={reset}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-finding-title"
            className="relative z-10 mt-10 w-full max-w-3xl rounded-2xl border border-line bg-surface shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-line px-5 py-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
                  Temuan
                </p>
                <h2 id="new-finding-title" className="mt-1 text-lg font-semibold text-ink">
                  Buat draf temuan
                </h2>
                <p className="mt-1 text-xs text-muted">
                  Kondisi dan kriteria wajib diisi; referensi temuan dibuat
                  otomatis per engagement.
                </p>
              </div>
              <button
                type="button"
                onClick={reset}
                className="rounded-lg p-1.5 text-muted hover:bg-slate-100 hover:text-ink"
                aria-label="Tutup"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
              <div>
                <Label htmlFor="nf-title">Judul temuan</Label>
                <Input
                  id="nf-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Mis. Approval override tidak terdokumentasi"
                  required
                />
              </div>

              <div className="space-y-4">
                {createFields.map((field) => (
                  <div key={field.key}>
                    <Label htmlFor={`nf-${field.key}`}>{field.label}</Label>
                    <Textarea
                      id={`nf-${field.key}`}
                      value={fields[field.key] ?? ""}
                      onChange={(event) =>
                        setFields((current) => ({
                          ...current,
                          [field.key]: event.target.value,
                        }))
                      }
                      className="min-h-20"
                      placeholder={field.hint}
                      required={field.required}
                    />
                    <FieldHint>{field.hint}</FieldHint>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="nf-severity">Severity</Label>
                  <Select
                    id="nf-severity"
                    value={severity}
                    onChange={(event) => setSeverity(event.target.value)}
                  >
                    {findingSeverities.map((value) => (
                      <option key={value} value={value}>
                        {findingSeverityLabels[value]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="nf-owner">Penanggung jawab remediasi</Label>
                  <Select
                    id="nf-owner"
                    value={ownerUserId}
                    onChange={(event) => setOwnerUserId(event.target.value)}
                  >
                    <option value="">Belum ditetapkan</option>
                    {owners.map((owner) => (
                      <option key={owner.id} value={owner.id}>
                        {owner.name}
                      </option>
                    ))}
                  </Select>
                  <FieldHint>
                    Hanya process owner yang dapat merespons dan memajukan
                    remediasi.
                  </FieldHint>
                </div>
                <div>
                  <Label htmlFor="nf-due">Target penyelesaian</Label>
                  <Input
                    id="nf-due"
                    type="date"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="nf-workpaper">Workpaper sumber</Label>
                  <Select
                    id="nf-workpaper"
                    value={workpaperId}
                    onChange={(event) => setWorkpaperId(event.target.value)}
                  >
                    <option value="">Tidak ditautkan</option>
                    {workpapers.map((workpaper) => (
                      <option key={workpaper.id} value={workpaper.id}>
                        {workpaper.reference} · {workpaper.title.slice(0, 40)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="nf-rcm">Baris RCM terkait</Label>
                  <Select
                    id="nf-rcm"
                    value={rcmRowId}
                    onChange={(event) => setRcmRowId(event.target.value)}
                  >
                    <option value="">Tidak terkait baris tertentu</option>
                    {rcmRows.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.riskDescription.slice(0, 70)}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <FieldError>{error}</FieldError>

              <div className="flex justify-end gap-2 border-t border-line pt-4">
                <Button variant="secondary" onClick={reset} disabled={busy}>
                  Batal
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? "Menyimpan..." : "Simpan draf temuan"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
