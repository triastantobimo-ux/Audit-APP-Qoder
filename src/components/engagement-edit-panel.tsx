"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { engagementTemplates, engagementTypes, isEngagementType } from "@/lib/engagement";
import type { EngagementMemberView, EngagementView } from "@/lib/engagement-view";
import { can, type Role } from "@/lib/rbac";

const typeLabels: Record<string, string> = {
  financial: "Financial audit",
  operational: "Operational audit",
  compliance: "Compliance audit",
  sox: "SOX / ICOFR",
  it: "IT audit",
};

function dateOnly(value: string): string {
  return value.slice(0, 10);
}

export function EngagementEditPanel({
  workspaceId,
  engagement,
  members,
}: {
  workspaceId: string;
  engagement: EngagementView;
  members: EngagementMemberView[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(engagement.title);
  const [engagementType, setEngagementType] = useState(engagement.engagementType);
  const [objective, setObjective] = useState(engagement.objective);
  const [scope, setScope] = useState(engagement.scope);
  const [startDate, setStartDate] = useState(dateOnly(engagement.startDate));
  const [endDate, setEndDate] = useState(dateOnly(engagement.endDate));
  const [budgetHours, setBudgetHours] = useState(String(engagement.budgetHours));
  const [preparerId, setPreparerId] = useState(engagement.preparer?.id ?? "");
  const [reviewerId, setReviewerId] = useState(engagement.reviewer?.id ?? "");
  const [approverId, setApproverId] = useState(engagement.approver?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preparerOptions = members.filter(
    (member) => member.role && can(member.role as Role, "engagement:write"),
  );
  const reviewerOptions = members.filter(
    (member) => member.role && can(member.role as Role, "engagement:review"),
  );
  const approverOptions = members.filter(
    (member) => member.role && can(member.role as Role, "engagement:issue"),
  );

  function changeType(type: string) {
    setEngagementType(type);
    if (isEngagementType(type)) {
      setObjective(engagementTemplates[type].objective);
      setScope(engagementTemplates[type].scope);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/engagements/${engagement.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title,
            engagementType,
            objective,
            scope,
            startDate: `${startDate}T00:00:00.000Z`,
            endDate: `${endDate}T00:00:00.000Z`,
            budgetHours: Number(budgetHours),
            preparerId,
            reviewerId,
            approverId,
            version: engagement.version,
          }),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.detail ?? "Engagement gagal diperbarui.");
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
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4" aria-hidden="true" />
        Edit
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
            aria-labelledby="edit-engagement-title"
            className="relative z-10 mt-10 w-full max-w-3xl rounded-2xl border border-line bg-surface shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-line px-5 py-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
                  {engagement.code} · versi {engagement.version}
                </p>
                <h2 id="edit-engagement-title" className="mt-1 text-lg font-semibold text-ink">
                  Edit engagement
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

            <form onSubmit={handleSubmit} className="space-y-5 px-5 py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="edit-engagement-title">Judul</Label>
                  <Input
                    id="edit-engagement-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="edit-engagement-type">Tipe</Label>
                  <Select
                    id="edit-engagement-type"
                    value={engagementType}
                    onChange={(event) => changeType(event.target.value)}
                  >
                    {engagementTypes.map((type) => (
                      <option key={type} value={type}>
                        {typeLabels[type]}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="edit-engagement-objective">Objective</Label>
                  <Textarea
                    id="edit-engagement-objective"
                    value={objective}
                    onChange={(event) => setObjective(event.target.value)}
                    className="min-h-24"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="edit-engagement-scope">Scope</Label>
                  <Textarea
                    id="edit-engagement-scope"
                    value={scope}
                    onChange={(event) => setScope(event.target.value)}
                    className="min-h-24"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="edit-engagement-start">Mulai</Label>
                  <Input
                    id="edit-engagement-start"
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="edit-engagement-end">Selesai</Label>
                  <Input
                    id="edit-engagement-end"
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="edit-engagement-budget">Budget jam</Label>
                  <Input
                    id="edit-engagement-budget"
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={budgetHours}
                    onChange={(event) => setBudgetHours(event.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="edit-engagement-preparer">Preparer</Label>
                  <Select
                    id="edit-engagement-preparer"
                    value={preparerId}
                    onChange={(event) => setPreparerId(event.target.value)}
                    required
                  >
                    {preparerOptions.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name} · {member.role}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="edit-engagement-reviewer">Reviewer</Label>
                  <Select
                    id="edit-engagement-reviewer"
                    value={reviewerId}
                    onChange={(event) => setReviewerId(event.target.value)}
                    required
                  >
                    {reviewerOptions.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name} · {member.role}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="edit-engagement-approver">Approver</Label>
                  <Select
                    id="edit-engagement-approver"
                    value={approverId}
                    onChange={(event) => setApproverId(event.target.value)}
                    required
                  >
                    {approverOptions.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name} · {member.role}
                      </option>
                    ))}
                  </Select>
                </div>
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
                  {busy ? "Menyimpan..." : "Simpan perubahan"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
