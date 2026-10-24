"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label, Select, Textarea } from "@/components/ui/form";
import {
  engagementTemplates,
  engagementTypes,
  isEngagementType,
} from "@/lib/engagement";
import type {
  EngagementCreateOptions,
  EngagementPlanCandidate,
} from "@/lib/engagement-view";
import { can, type Capability, type Role } from "@/lib/rbac";

const typeLabels: Record<string, string> = {
  financial: "Financial audit",
  operational: "Operational audit",
  compliance: "Compliance audit",
  sox: "SOX / ICOFR",
  it: "IT audit",
};

const planTypeMap: Record<string, string> = {
  fraud: "financial",
  other: "operational",
};

function toEngagementType(type: string): string {
  if (isEngagementType(type)) return type;
  return planTypeMap[type] ?? "operational";
}

function quarterRange(year: number, quarter: number | null) {
  if (!quarter) {
    return { start: `${year}-01-01`, end: `${year}-12-31` };
  }
  const ranges: Record<number, [string, string]> = {
    1: ["01-01", "03-31"],
    2: ["04-01", "06-30"],
    3: ["07-01", "09-30"],
    4: ["10-01", "12-31"],
  };
  const [start, end] = ranges[quarter];
  return { start: `${year}-${start}`, end: `${year}-${end}` };
}

function pickMember(
  members: EngagementCreateOptions["members"],
  capability: Capability,
  preferredRoles: Role[],
): string {
  for (const role of preferredRoles) {
    const member = members.find(
      (row) => row.role === role && can(role, capability),
    );
    if (member) return member.id;
  }
  return (
    members.find(
      (row) => row.role && can(row.role as Role, capability),
    )?.id ?? ""
  );
}

export function NewEngagementPanel({
  workspaceId,
  suggestedYear,
  options,
}: {
  workspaceId: string;
  suggestedYear: number;
  options: EngagementCreateOptions;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"plan" | "adhoc">(
    options.planCandidates.length > 0 ? "plan" : "adhoc",
  );
  const [planEngagementId, setPlanEngagementId] = useState("");
  const [entityId, setEntityId] = useState("");
  const [adHocReason, setAdHocReason] = useState("");
  const [title, setTitle] = useState("");
  const [engagementType, setEngagementType] = useState("operational");
  const [objective, setObjective] = useState("");
  const [scope, setScope] = useState("");
  const [startDate, setStartDate] = useState(`${suggestedYear}-01-01`);
  const [endDate, setEndDate] = useState(`${suggestedYear}-12-31`);
  const [budgetHours, setBudgetHours] = useState("80");
  const [preparerId, setPreparerId] = useState(
    pickMember(options.members, "engagement:write", [
      "AUDITOR",
      "MANAGER",
      "CAE",
    ]),
  );
  const [reviewerId, setReviewerId] = useState(
    pickMember(options.members, "engagement:review", [
      "MANAGER",
      "CAE",
      "REVIEWER",
    ]),
  );
  const [approverId, setApproverId] = useState(
    pickMember(options.members, "engagement:issue", ["CAE", "ADMIN"]),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const planCandidates = options.planCandidates;
  const selectedPlan = planCandidates.find(
    (candidate) => candidate.id === planEngagementId,
  );
  const preparerOptions = options.members.filter(
    (member) => member.role && can(member.role as Role, "engagement:write"),
  );
  const reviewerOptions = options.members.filter(
    (member) => member.role && can(member.role as Role, "engagement:review"),
  );
  const approverOptions = options.members.filter(
    (member) => member.role && can(member.role as Role, "engagement:issue"),
  );

  function fillTemplate(type: string) {
    setEngagementType(type);
    if (isEngagementType(type)) {
      setObjective(engagementTemplates[type].objective);
      setScope(engagementTemplates[type].scope);
    }
  }

  function applyPlan(candidate: EngagementPlanCandidate | undefined) {
    if (!candidate) {
      setPlanEngagementId("");
      return;
    }

    setPlanEngagementId(candidate.id);
    setTitle(candidate.title);
    setBudgetHours(String(candidate.estimatedHours));
    fillTemplate(toEngagementType(candidate.engagementType));

    const range = quarterRange(candidate.plan.year, candidate.quarter);
    setStartDate(range.start);
    setEndDate(range.end);
  }

  function reset() {
    setBusy(false);
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (mode === "plan" && !planEngagementId) {
      setError("Pilih plan engagement sebagai sumber.");
      return;
    }
    if (mode === "adhoc" && (!entityId || adHocReason.trim().length < 10)) {
      setError("Entity dan alasan ad-hoc minimal 10 karakter wajib diisi.");
      return;
    }

    setBusy(true);

    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/engagements`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title,
            engagementType,
            planEngagementId:
              mode === "plan" ? planEngagementId : undefined,
            entityId: mode === "adhoc" ? entityId : undefined,
            adHocReason: mode === "adhoc" ? adHocReason : undefined,
            objective,
            scope,
            startDate: `${startDate}T00:00:00.000Z`,
            endDate: `${endDate}T00:00:00.000Z`,
            budgetHours: Number(budgetHours),
            preparerId,
            reviewerId,
            approverId,
          }),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.detail ?? "Engagement gagal dibuat.");
        return;
      }

      setOpen(false);
      reset();
      router.push(`/engagements/${payload.data.id}`);
      router.refresh();
    } catch {
      setError("Tidak bisa menghubungi server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <ClipboardPlus className="h-4 w-4" aria-hidden="true" />
        Buat engagement
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
            aria-labelledby="new-engagement-title"
            className="relative z-10 mt-10 w-full max-w-3xl rounded-2xl border border-line bg-surface shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-line px-5 py-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
                  Engagement workspace
                </p>
                <h2 id="new-engagement-title" className="mt-1 text-lg font-semibold text-ink">
                  Buat engagement baru
                </h2>
                <p className="mt-1 text-xs text-muted">
                  ID unik dan struktur awal dari template dibuat otomatis.
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

            <form onSubmit={handleSubmit} className="space-y-5 px-5 py-5">
              <div className="flex rounded-lg border border-line bg-slate-50 p-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setMode("plan")}
                  className={`flex-1 rounded-md px-3 py-2 ${
                    mode === "plan" ? "bg-surface text-ink shadow-sm" : "text-muted"
                  }`}
                >
                  Dari approved plan ({planCandidates.length})
                </button>
                <button
                  type="button"
                  onClick={() => setMode("adhoc")}
                  className={`flex-1 rounded-md px-3 py-2 ${
                    mode === "adhoc" ? "bg-surface text-ink shadow-sm" : "text-muted"
                  }`}
                >
                  Ad-hoc
                </button>
              </div>

              {mode === "plan" ? (
                <div>
                  <Label htmlFor="engagement-plan-source">Plan engagement</Label>
                  <Select
                    id="engagement-plan-source"
                    value={planEngagementId}
                    onChange={(event) =>
                      applyPlan(
                        planCandidates.find(
                          (candidate) => candidate.id === event.target.value,
                        ),
                      )
                    }
                    required
                  >
                    <option value="">Pilih engagement dari plan approved…</option>
                    {planCandidates.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.plan.year} · {candidate.title} —{" "}
                        {candidate.entity.code} ({candidate.estimatedHours} jam)
                      </option>
                    ))}
                  </Select>
                  {selectedPlan ? (
                    <FieldHint>
                      {selectedPlan.plan.name} · {selectedPlan.entity.code} ·{" "}
                      {selectedPlan.riskLevel} {selectedPlan.riskScore}
                    </FieldHint>
                  ) : null}
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="engagement-entity">Entity</Label>
                    <Select
                      id="engagement-entity"
                      value={entityId}
                      onChange={(event) => setEntityId(event.target.value)}
                      required
                    >
                      <option value="">Pilih entity…</option>
                      {options.entities.map((entity) => (
                        <option key={entity.id} value={entity.id}>
                          {entity.code} — {entity.name}
                          {entity.riskLevel ? ` (${entity.riskLevel})` : ""}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="engagement-adhoc-reason">Alasan ad-hoc</Label>
                    <Input
                      id="engagement-adhoc-reason"
                      value={adHocReason}
                      onChange={(event) => setAdHocReason(event.target.value)}
                      placeholder="Permintaan audit committee / indikasi fraud"
                      required
                    />
                  </div>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="engagement-title">Judul engagement</Label>
                  <Input
                    id="engagement-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Vendor Master Audit"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="engagement-type">Tipe & template</Label>
                  <Select
                    id="engagement-type"
                    value={engagementType}
                    onChange={(event) => fillTemplate(event.target.value)}
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
                  <Label htmlFor="engagement-objective">Objective</Label>
                  <Textarea
                    id="engagement-objective"
                    value={objective}
                    onChange={(event) => setObjective(event.target.value)}
                    className="min-h-24"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="engagement-scope">Scope</Label>
                  <Textarea
                    id="engagement-scope"
                    value={scope}
                    onChange={(event) => setScope(event.target.value)}
                    className="min-h-24"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="engagement-start">Mulai</Label>
                  <Input
                    id="engagement-start"
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="engagement-end">Selesai</Label>
                  <Input
                    id="engagement-end"
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="engagement-budget">Budget jam</Label>
                  <Input
                    id="engagement-budget"
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
                  <Label htmlFor="engagement-preparer">Preparer</Label>
                  <Select
                    id="engagement-preparer"
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
                  <Label htmlFor="engagement-reviewer">Reviewer</Label>
                  <Select
                    id="engagement-reviewer"
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
                  <Label htmlFor="engagement-approver">Approver</Label>
                  <Select
                    id="engagement-approver"
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

              <FieldHint>
                Reviewer tidak boleh sama dengan preparer. Approver harus memiliki
                kewenangan issuance (CAE/Admin).
              </FieldHint>

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
                  {busy ? "Membuat..." : "Buat engagement"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
