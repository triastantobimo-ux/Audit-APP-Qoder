import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { entityTypeLabel } from "@/lib/universe-table";
import { findingStatusLabels, type FindingStatus } from "@/lib/finding";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

const tones: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-700",
  info: "bg-blue-50 text-blue-700",
  accent: "bg-teal-50 text-teal-700",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function RiskBadge({
  level,
}: {
  level: string | null | undefined;
}) {
  if (!level) {
    return <Badge tone="neutral">Belum dinilai</Badge>;
  }

  const tone =
    level === "critical"
      ? "danger"
      : level === "high"
        ? "warning"
        : level === "medium"
          ? "info"
          : "success";

  const label =
    level === "critical"
      ? "Critical"
      : level === "high"
        ? "High"
        : level === "medium"
          ? "Medium"
          : "Low";

  return <Badge tone={tone}>{label}</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const tone =
    normalized === "approved" ||
    normalized === "active" ||
    normalized === "completed" ||
    normalized === "issued" ||
    normalized === "signed_off"
      ? "success"
      : normalized === "submitted" ||
          normalized === "in_progress" ||
          normalized === "planning" ||
          normalized === "in_review" ||
          normalized === "reviewed"
        ? "info"
        : normalized === "fieldwork"
          ? "accent"
          : normalized === "returned" ||
              normalized === "draft" ||
              normalized === "deferred" ||
              normalized === "review"
            ? "warning"
            : normalized === "superseded" ||
                normalized === "archived" ||
                normalized === "planned" ||
                normalized === "closed"
              ? "neutral"
              : "neutral";

  const labels: Record<string, string> = {
    active: "Active",
    archived: "Archived",
    draft: "Draft",
    submitted: "Submitted",
    approved: "Approved",
    returned: "Returned",
    superseded: "Superseded",
    inactive: "Inactive",
    planned: "Planned",
    in_progress: "In progress",
    completed: "Completed",
    deferred: "Deferred",
    planning: "Planning",
    fieldwork: "Fieldwork",
    review: "Review",
    issued: "Issued",
    closed: "Closed",
    in_review: "In review",
    reviewed: "Reviewed",
    signed_off: "Signed off",
  };

  return <Badge tone={tone}>{labels[normalized] ?? status}</Badge>;
}

const findingTones: Record<FindingStatus, Tone> = {
  draft: "warning",
  communicated: "info",
  in_remediation: "accent",
  pending_validation: "warning",
  closed: "success",
  reopened: "danger",
  accepted_risk: "neutral",
};

export function FindingBadge({ status }: { status: string }) {
  const key = status as FindingStatus;

  return (
    <Badge tone={findingTones[key] ?? "neutral"}>
      {findingStatusLabels[key] ?? status}
    </Badge>
  );
}

export function TypeBadge({ type }: { type: string }) {
  return <Badge tone="accent">{entityTypeLabel(type)}</Badge>;
}
