"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/form";
import type { WorkpaperView } from "@/lib/workpaper-view";

export function WorkpaperContentPanel({
  workspaceId,
  workpaper,
  rcmRows,
}: {
  workspaceId: string;
  workpaper: WorkpaperView;
  rcmRows: { id: string; riskDescription: string }[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(workpaper.title);
  const [purpose, setPurpose] = useState(workpaper.purpose);
  const [procedure, setProcedure] = useState(workpaper.procedure);
  const [conclusion, setConclusion] = useState(workpaper.conclusion);
  const [rcmRowId, setRcmRowId] = useState(workpaper.rcmRow?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const editable = workpaper.actions.canEdit;
  const dirty =
    title !== workpaper.title ||
    purpose !== workpaper.purpose ||
    procedure !== workpaper.procedure ||
    conclusion !== workpaper.conclusion ||
    (rcmRowId || "") !== (workpaper.rcmRow?.id ?? "");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);

    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/engagements/${workpaper.engagementId}/workpapers/${workpaper.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title,
            purpose,
            procedure,
            conclusion,
            rcmRowId: rcmRowId || null,
            version: workpaper.version,
          }),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.detail ?? "Workpaper gagal disimpan.");
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
        <Label htmlFor="wp-edit-title">Judul</Label>
        <Input
          id="wp-edit-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={!editable}
          required
        />
      </div>

      <div>
        <Label htmlFor="wp-edit-purpose">Tujuan pengujian</Label>
        <Textarea
          id="wp-edit-purpose"
          value={purpose}
          onChange={(event) => setPurpose(event.target.value)}
          className="min-h-24"
          disabled={!editable}
          required
        />
      </div>

      <div>
        <Label htmlFor="wp-edit-procedure">Procedure</Label>
        <Textarea
          id="wp-edit-procedure"
          value={procedure}
          onChange={(event) => setProcedure(event.target.value)}
          className="min-h-40"
          disabled={!editable}
          required
        />
      </div>

      <div>
        <Label htmlFor="wp-edit-conclusion">Kesimpulan</Label>
        <Textarea
          id="wp-edit-conclusion"
          value={conclusion}
          onChange={(event) => setConclusion(event.target.value)}
          className="min-h-28"
          disabled={!editable}
          placeholder="Tuliskan kesimpulan hasil pengujian sebelum sign-off."
        />
      </div>

      <div>
        <Label htmlFor="wp-edit-rcm">Baris RCM terkait</Label>
        <Select
          id="wp-edit-rcm"
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

      <FieldError>{error}</FieldError>

      {editable ? (
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={busy || !dirty}>
            {busy ? "Menyimpan..." : "Simpan perubahan"}
          </Button>
          {saved ? (
            <span className="text-xs font-medium text-emerald-700">
              Perubahan tersimpan.
            </span>
          ) : null}
          <span className="text-[11px] text-muted">
            Versi {workpaper.version}
          </span>
        </div>
      ) : (
        <p className="text-xs text-muted">
          Konten workpaper terkunci pada status {workpaper.status}.
        </p>
      )}
    </form>
  );
}
