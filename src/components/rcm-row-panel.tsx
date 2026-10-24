"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button, type buttonClasses } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { auditAssertions } from "@/lib/engagement";
import type { EngagementRcmRowView } from "@/lib/engagement-view";

const assertionLabels: Record<string, string> = {
  existence: "Existence",
  completeness: "Completeness",
  accuracy: "Accuracy",
  cutoff: "Cut-off",
  classification: "Classification",
  occurrence: "Occurrence",
  authorization: "Authorization",
  valuation: "Valuation",
  rights_obligations: "Rights & obligations",
  presentation: "Presentation",
};

type TriggerVariant = Parameters<typeof buttonClasses>[0];

export function RcmRowPanel({
  workspaceId,
  engagementId,
  version,
  initial,
  triggerLabel,
  triggerVariant = "primary",
  triggerSize = "md",
}: {
  workspaceId: string;
  engagementId: string;
  version: number;
  initial?: EngagementRcmRowView;
  triggerLabel: string;
  triggerVariant?: TriggerVariant;
  triggerSize?: "sm" | "md";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [riskDescription, setRiskDescription] = useState(
    initial?.riskDescription ?? "",
  );
  const [controlDescription, setControlDescription] = useState(
    initial?.controlDescription ?? "",
  );
  const [assertion, setAssertion] = useState(initial?.assertion ?? "authorization");
  const [procedureDescription, setProcedureDescription] = useState(
    initial?.procedureDescription ?? "",
  );
  const [evidenceRequirement, setEvidenceRequirement] = useState(
    initial?.evidenceRequirement ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const endpoint = initial
        ? `/api/v1/workspaces/${workspaceId}/engagements/${engagementId}/rcm/${initial.id}`
        : `/api/v1/workspaces/${workspaceId}/engagements/${engagementId}/rcm`;
      const response = await fetch(endpoint, {
        method: initial ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          riskDescription,
          controlDescription,
          assertion,
          procedureDescription,
          evidenceRequirement,
          version,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.detail ?? "Baris RCM gagal disimpan.");
        return;
      }

      setOpen(false);
      router.refresh();
    } catch {
      setError("Tidak bisa menghubungi server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant={triggerVariant}
        size={triggerSize}
        onClick={() => setOpen(true)}
      >
        {initial ? null : <Plus className="h-4 w-4" aria-hidden="true" />}
        {triggerLabel}
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
            aria-labelledby="rcm-row-title"
            className="relative z-10 mt-10 w-full max-w-3xl rounded-2xl border border-line bg-surface shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-line px-5 py-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
                  Risk-control matrix
                </p>
                <h2 id="rcm-row-title" className="mt-1 text-lg font-semibold text-ink">
                  {initial ? "Edit baris RCM" : "Tambah baris RCM"}
                </h2>
                <p className="mt-1 text-xs text-muted">
                  Setiap risiko harus memiliki procedure dan evidence yang lengkap.
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
                <Label htmlFor="rcm-risk">Risk</Label>
                <Textarea
                  id="rcm-risk"
                  value={riskDescription}
                  onChange={(event) => setRiskDescription(event.target.value)}
                  className="min-h-20"
                  required
                />
              </div>
              <div>
                <Label htmlFor="rcm-control">Control</Label>
                <Textarea
                  id="rcm-control"
                  value={controlDescription}
                  onChange={(event) => setControlDescription(event.target.value)}
                  className="min-h-20"
                  required
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
                <div>
                  <Label htmlFor="rcm-assertion">Assertion</Label>
                  <Select
                    id="rcm-assertion"
                    value={assertion}
                    onChange={(event) => setAssertion(event.target.value)}
                  >
                    {auditAssertions.map((value) => (
                      <option key={value} value={value}>
                        {assertionLabels[value] ?? value}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="rcm-evidence">Evidence requirement</Label>
                  <Input
                    id="rcm-evidence"
                    value={evidenceRequirement}
                    onChange={(event) =>
                      setEvidenceRequirement(event.target.value)
                    }
                    placeholder="Dokumen, log, atau bukti yang harus diperoleh"
                    required
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="rcm-procedure">Procedure</Label>
                <Textarea
                  id="rcm-procedure"
                  value={procedureDescription}
                  onChange={(event) =>
                    setProcedureDescription(event.target.value)
                  }
                  className="min-h-20"
                  required
                />
              </div>

              <FieldError>{error}</FieldError>

              <div className="flex justify-end gap-2 border-t border-line pt-4">
                <Button
                  variant="secondary"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                >
                  Batal
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? "Menyimpan..." : "Simpan baris"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
