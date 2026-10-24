"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { workpaperTemplates, type WorkpaperTemplateKey } from "@/lib/workpaper";

const templateKeys = Object.keys(workpaperTemplates) as WorkpaperTemplateKey[];

const templateLabels: Record<WorkpaperTemplateKey, string> = {
  test_of_control: "Uji pengendalian",
  substantive_test: "Uji substantif",
  analytical_review: "Review analitis",
};

export function NewWorkpaperPanel({
  workspaceId,
  engagementId,
  rcmRows,
}: {
  workspaceId: string;
  engagementId: string;
  rcmRows: { id: string; riskDescription: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [templateKey, setTemplateKey] = useState<WorkpaperTemplateKey>("test_of_control");
  const [title, setTitle] = useState(workpaperTemplates.test_of_control.title);
  const [purpose, setPurpose] = useState(workpaperTemplates.test_of_control.purpose);
  const [procedure, setProcedure] = useState(workpaperTemplates.test_of_control.procedure);
  const [rcmRowId, setRcmRowId] = useState(rcmRows[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function applyTemplate(key: WorkpaperTemplateKey) {
    const template = workpaperTemplates[key];
    setTemplateKey(key);
    setTitle(template.title);
    setPurpose(template.purpose);
    setProcedure(template.procedure);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/engagements/${engagementId}/workpapers`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title,
            purpose,
            procedure,
            templateKey,
            rcmRowId: rcmRowId || null,
          }),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.detail ?? "Workpaper gagal dibuat.");
        return;
      }

      router.push(
        `/engagements/${engagementId}/workpapers/${payload.data.id}`,
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
        Workpaper baru
      </Button>

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
            aria-labelledby="new-workpaper-title"
            className="relative z-10 mt-10 w-full max-w-3xl rounded-2xl border border-line bg-surface shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-line px-5 py-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
                  Workpaper
                </p>
                <h2 id="new-workpaper-title" className="mt-1 text-lg font-semibold text-ink">
                  Buat workpaper
                </h2>
                <p className="mt-1 text-xs text-muted">
                  Mulai dari template atau tulis prosedur manual; referensi
                  dibuat otomatis per engagement.
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
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="wp-template">Template</Label>
                  <Select
                    id="wp-template"
                    value={templateKey}
                    onChange={(event) =>
                      applyTemplate(event.target.value as WorkpaperTemplateKey)
                    }
                  >
                    {templateKeys.map((key) => (
                      <option key={key} value={key}>
                        {templateLabels[key]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="wp-rcm">Baris RCM terkait</Label>
                  <Select
                    id="wp-rcm"
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

              <div>
                <Label htmlFor="wp-title">Judul</Label>
                <Input
                  id="wp-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                />
              </div>

              <div>
                <Label htmlFor="wp-purpose">Tujuan pengujian</Label>
                <Textarea
                  id="wp-purpose"
                  value={purpose}
                  onChange={(event) => setPurpose(event.target.value)}
                  className="min-h-20"
                  required
                />
              </div>

              <div>
                <Label htmlFor="wp-procedure">Procedure</Label>
                <Textarea
                  id="wp-procedure"
                  value={procedure}
                  onChange={(event) => setProcedure(event.target.value)}
                  className="min-h-32"
                  required
                />
              </div>

              <FieldError>{error}</FieldError>

              <div className="flex justify-end gap-2 border-t border-line pt-4">
                <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
                  Batal
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? "Menyimpan..." : "Simpan workpaper"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
