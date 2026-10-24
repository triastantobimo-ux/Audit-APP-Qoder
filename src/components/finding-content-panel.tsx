"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label, Select, Textarea } from "@/components/ui/form";
import { findingSeverities, findingSeverityLabels } from "@/lib/finding";
import type { FindingMemberView, FindingView } from "@/lib/finding-view";

const cFields = [
  { key: "condition", label: "Kondisi", hint: "Fakta hasil pengujian di lapangan." },
  { key: "criteria", label: "Kriteria", hint: "Kebijakan, standar, atau kontrol yang seharusnya." },
  { key: "cause", label: "Sebab", hint: "Akar masalah mengapa kondisi menyimpang." },
  { key: "effect", label: "Akibat", hint: "Dampak risiko bagi entitas auditee." },
  { key: "recommendation", label: "Rekomendasi", hint: "Aksi perbaikan yang diminta auditor." },
] as const;

export function FindingContentPanel({
  workspaceId,
  finding,
  owners,
  workpapers,
  rcmRows,
}: {
  workspaceId: string;
  finding: FindingView;
  owners: FindingMemberView[];
  workpapers: { id: string; reference: string; title: string }[];
  rcmRows: { id: string; riskDescription: string }[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(finding.title);
  const [fields, setFields] = useState<Record<string, string>>(() =>
    Object.fromEntries(cFields.map((field) => [field.key, finding[field.key]])),
  );
  const [severity, setSeverity] = useState(finding.severity);
  const [ownerUserId, setOwnerUserId] = useState(finding.owner?.id ?? "");
  const [dueDate, setDueDate] = useState(finding.dueDate?.slice(0, 10) ?? "");
  const [workpaperId, setWorkpaperId] = useState(finding.workpaper?.id ?? "");
  const [rcmRowId, setRcmRowId] = useState(finding.rcmRow?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const editable = finding.actions.canEdit;
  const dirty =
    title !== finding.title ||
    severity !== finding.severity ||
    (ownerUserId || null) !== (finding.owner?.id ?? null) ||
    (dueDate || null) !== (finding.dueDate?.slice(0, 10) ?? null) ||
    (workpaperId || null) !== (finding.workpaper?.id ?? null) ||
    (rcmRowId || null) !== (finding.rcmRow?.id ?? null) ||
    cFields.some((field) => fields[field.key] !== finding[field.key]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);

    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/engagements/${finding.engagementId}/findings/${finding.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title,
            ...fields,
            severity,
            ownerUserId: ownerUserId || null,
            dueDate: dueDate || null,
            workpaperId: workpaperId || null,
            rcmRowId: rcmRowId || null,
            version: finding.version,
          }),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.detail ?? "Temuan gagal disimpan.");
        return;
      }

      setSaved(true);
      router.refresh();
    } catch {
      setError("Tidak bisa menghubungi server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="finding-title">Judul temuan</Label>
        <Input
          id="finding-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={!editable}
          required
        />
      </div>

      <div className="space-y-4">
        {cFields.map((field) => (
          <div key={field.key}>
            <Label htmlFor={`finding-${field.key}`}>{field.label}</Label>
            <Textarea
              id={`finding-${field.key}`}
              value={fields[field.key]}
              onChange={(event) =>
                setFields((current) => ({ ...current, [field.key]: event.target.value }))
              }
              className="min-h-24"
              disabled={!editable}
              placeholder={field.hint}
              required={field.key === "condition" || field.key === "criteria"}
            />
            <FieldHint>{field.hint}</FieldHint>
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="finding-severity">Severity</Label>
          <Select
            id="finding-severity"
            value={severity}
            onChange={(event) => setSeverity(event.target.value)}
            disabled={!editable}
          >
            {findingSeverities.map((value) => (
              <option key={value} value={value}>
                {findingSeverityLabels[value]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="finding-owner">Penanggung jawab remediasi</Label>
          <Select
            id="finding-owner"
            value={ownerUserId}
            onChange={(event) => setOwnerUserId(event.target.value)}
            disabled={!editable}
          >
            <option value="">Belum ditetapkan</option>
            {owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="finding-due">Target penyelesaian</Label>
          <Input
            id="finding-due"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            disabled={!editable}
          />
        </div>
        <div>
          <Label htmlFor="finding-workpaper">Workpaper sumber</Label>
          <Select
            id="finding-workpaper"
            value={workpaperId}
            onChange={(event) => setWorkpaperId(event.target.value)}
            disabled={!editable}
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
          <Label htmlFor="finding-rcm">Baris RCM terkait</Label>
          <Select
            id="finding-rcm"
            value={rcmRowId}
            onChange={(event) => setRcmRowId(event.target.value)}
            disabled={!editable}
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

      {editable ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" disabled={busy || !dirty}>
            {busy ? "Menyimpan..." : "Simpan analisis"}
          </Button>
          {saved ? (
            <span className="text-xs font-medium text-emerald-700">
              Perubahan tersimpan.
            </span>
          ) : null}
          <span className="text-[11px] text-muted">Versi {finding.version}</span>
        </div>
      ) : (
        <p className="text-xs text-muted">
          Analisis temuan terkunci pada status {finding.status}.
        </p>
      )}
    </form>
  );
}
