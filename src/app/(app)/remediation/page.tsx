import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Filter,
  Inbox,
  ShieldAlert,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge, FindingBadge, RiskBadge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { formatDateOnly, relativeTime } from "@/lib/format";
import {
  findingStatusLabels,
  findingStatuses,
  type FindingStatus,
} from "@/lib/finding";
import { can } from "@/lib/rbac";
import { ApiError } from "@/server/api-error";
import { requirePageAuth } from "@/server/auth";
import { listRemediationRegister } from "@/server/finding-service";
import { toWorkspaceAccess } from "@/server/page-access";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

const agingBuckets = [
  { key: "notDue", label: "Belum jatuh tempo", tone: "bg-slate-300" },
  { key: "late1to30", label: "Terlambat 1–30 hari", tone: "bg-amber-400" },
  { key: "late31to60", label: "31–60 hari", tone: "bg-orange-500" },
  { key: "late61to90", label: "61–90 hari", tone: "bg-red-500" },
  { key: "lateOver90", label: ">90 hari", tone: "bg-red-700" },
] as const;

export default async function RemediationPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const auth = await requirePageAuth();
  const access = toWorkspaceAccess(auth);
  const params = await searchParams;

  const canSeeAll = can(auth.membership.role, "engagement:read");
  const scope = readParam(params, "scope") === "all" && canSeeAll ? "all" : "mine";
  const statusParam = readParam(params, "status");
  const status = findingStatuses.includes(statusParam as FindingStatus)
    ? (statusParam as FindingStatus)
    : undefined;

  const register = await listRemediationRegister(access, { scope, status }).catch(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 403) {
        return null;
      }
      throw error;
    },
  );

  if (!register) {
    return (
      <EmptyState
        icon={<ShieldAlert className="h-5 w-5" aria-hidden="true" />}
        title="Register remediasi tidak tersedia"
        description="Anda tidak berwenang melihat register remediasi untuk lingkup ini."
        action={
          <Link
            href="/dashboard"
            className="text-xs font-semibold text-accent hover:underline"
          >
            Kembali ke dashboard
          </Link>
        }
      />
    );
  }

  const totals = register.totals;
  const maxAging = Math.max(1, totals.open);
  const hrefFor = (next: { scope?: string; status?: FindingStatus | "all" }) => {
    const query = new URLSearchParams();
    const nextScope = next.scope ?? scope;
    const nextStatus = next.status ?? status;
    if (nextScope !== "mine") query.set("scope", nextScope);
    if (nextStatus && nextStatus !== "all") query.set("status", nextStatus);
    const suffix = query.toString();
    return `/remediation${suffix ? `?${suffix}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Remediation tracking"
        title="Register remediasi"
        description="Tindak lanjut temuan audit: respons manajemen, progres remediasi, dan validasi penutupan."
      />

      <div className="flex flex-wrap items-center gap-2">
        {canSeeAll ? (
          <div className="flex rounded-lg border border-line bg-surface p-0.5">
            {(["mine", "all"] as const).map((option) => (
              <Link
                key={option}
                href={hrefFor({ scope: option })}
                className={
                  option === scope
                    ? "rounded-md bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent-strong"
                    : "rounded-md px-3 py-1.5 text-xs font-medium text-muted hover:text-ink"
                }
              >
                {option === "mine"
                  ? "Tanggung jawab saya"
                  : "Seluruh workspace"}
              </Link>
            ))}
          </div>
        ) : (
          <Badge tone="accent">Hanya temuan yang menjadi tanggung jawab Anda</Badge>
        )}

        {status ? (
          <Link
            href={hrefFor({ status: undefined })}
            className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-700"
          >
            <Filter className="h-3 w-3" aria-hidden="true" />
            {findingStatusLabels[status]} · hapus filter
          </Link>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              Temuan
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-ink tabular-nums">
              {totals.total}
            </p>
            <p className="mt-1 text-xs text-muted">
              {totals.open} open · {totals.pendingValidation} menunggu validasi
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              Terlambat
            </p>
            <p
              className={`mt-2 text-2xl font-semibold tracking-tight tabular-nums ${
                totals.overdue > 0 ? "text-red-700" : "text-ink"
              }`}
            >
              {totals.overdue}
            </p>
            <p className="mt-1 text-xs text-muted">
              {totals.closed} ditutup · {totals.acceptedRisk} risiko diterima
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              Closure rate
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-ink tabular-nums">
              {totals.closureRatePercent}%
            </p>
            <p className="mt-1 text-xs text-muted">
              dari {totals.total} temuan register
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              Rata-rata hari tutup
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-ink tabular-nums">
              {totals.averageDaysToClose ?? "—"}
            </p>
            <p className="mt-1 text-xs text-muted">
              sejak temuan dibuat hingga ditutup
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-muted" aria-hidden="true" />
              Aging temuan open
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {agingBuckets.map((bucket) => {
              const value = totals.aging[bucket.key];

              return (
                <div key={bucket.key}>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-slate-700">
                      {bucket.label}
                    </span>
                    <span className="font-semibold tabular-nums text-ink">
                      {value}
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${bucket.tone}`}
                      style={{ width: `${(value / maxAging) * 100}%` }}
                      aria-hidden="true"
                    />
                  </div>
                </div>
              );
            })}
            <p className="pt-1 text-[11px] leading-5 text-muted">
              Aging dihitung dari target penyelesaian terhadap hari ini untuk
              temuan yang belum ditutup atau belum diterima risikonya.
            </p>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Filter status</CardTitle>
            <p className="mt-1 text-xs text-muted">
              Menampilkan {register.items.length} temuan pada lingkup{" "}
              {scope === "mine" ? "respons saya" : "seluruh workspace"}.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {findingStatuses.map((value) => (
                <Link
                  key={value}
                  href={hrefFor({ status: value })}
                  className={
                    value === status
                      ? "rounded-full px-3 py-1.5 text-[11px] font-semibold bg-accent text-white"
                      : "rounded-full px-3 py-1.5 text-[11px] font-medium border border-line text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  }
                >
                  {findingStatusLabels[value]}
                </Link>
              ))}
            </div>
            {totals.open > 0 ? (
              <p className="mt-4 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11px] text-amber-800">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                {totals.overdue} temuan melewati target penyelesaian. Auditor
                dapat mengembalikan temuan ke remediasi bila bukti perbaikan belum
                cukup.
              </p>
            ) : (
              <p className="mt-4 flex items-center gap-1.5 text-[11px] text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                Tidak ada temuan yang masih open pada lingkup ini.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="min-w-0">
        <CardHeader className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>Daftar temuan</CardTitle>
            <CardDescription>
              Klik satu temuan untuk membuka analisis 5C, respons manajemen, dan
              riwayat remediasi.
            </CardDescription>
          </div>
          <Badge tone="neutral">{register.items.length} temuan</Badge>
        </CardHeader>

        <CardContent className="space-y-2">
          {register.items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line px-4 py-8 text-center">
              <Inbox className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold text-ink">
                Tidak ada temuan pada lingkup ini
              </p>
              <p className="mt-1 text-xs text-muted">
                {scope === "mine"
                  ? "Temuan yang penetapan penanggung jawabnya ada pada akun Anda akan tampil di sini."
                  : "Susun temuan dari halaman engagement setelah workpaper disign-off."}
              </p>
            </div>
          ) : null}

          {register.items.map((item) => (
            <Link
              key={item.id}
              href={`/engagements/${item.engagement.id}/findings/${item.id}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line px-3 py-2.5 transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              <Badge tone="accent" className="shrink-0 font-mono">
                {item.reference}
              </Badge>

              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-ink">
                  {item.title}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-muted">
                  {item.engagement.code} · {item.engagement.title}
                </p>
              </div>

              <div className="flex min-w-0 items-center gap-2">
                {item.owner ? (
                  <span className="hidden items-center gap-1.5 sm:flex">
                    <Avatar name={item.owner.name} size="sm" />
                    <span className="max-w-28 truncate text-[11px] text-muted">
                      {item.owner.name}
                    </span>
                  </span>
                ) : (
                  <span className="hidden text-[11px] text-muted sm:inline">
                    Tanpa penanggung jawab
                  </span>
                )}
                <span className="text-[11px] text-muted tabular-nums">
                  {item.dueDate ? formatDateOnly(item.dueDate) : "—"}
                </span>
                {item.isOverdue ? (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-danger">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    Terlambat
                  </span>
                ) : null}
                <RiskBadge level={item.severity} />
                <FindingBadge status={item.status} />
                <ChevronRight className="h-4 w-4 text-muted" aria-hidden="true" />
              </div>

              <div className="flex w-full items-center gap-2 border-t border-line pt-1.5">
                <div className="h-1 w-full max-w-52 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-teal-500"
                    style={{ width: `${item.progressPercent}%` }}
                    aria-hidden="true"
                  />
                </div>
                <span className="text-[11px] text-muted">
                  Progres {item.progressPercent}% · diperbarui{" "}
                  {relativeTime(item.updatedAt)}
                </span>
                {item.status === "closed" && item.closedAt ? (
                  <span className="ml-auto flex items-center gap-1 text-[11px] text-emerald-700">
                    <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                    Ditutup {formatDateOnly(item.closedAt)}
                  </span>
                ) : null}
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
