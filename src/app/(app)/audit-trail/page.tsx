import { History, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime, humanize } from "@/lib/format";
import { can } from "@/lib/rbac";
import { requirePageAuth } from "@/server/auth";
import { toWorkspaceAccess } from "@/server/page-access";
import { listAuditEvents } from "@/server/risk-service";

export default async function AuditTrailPage() {
  const auth = await requirePageAuth();
  const access = toWorkspaceAccess(auth);
  const allowed = can(auth.membership.role, "auditLog:read");
  const events = allowed ? await listAuditEvents(access, { limit: 150 }) : [];

  if (!allowed) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Audit trail"
          title="Jejak aktivitas workspace"
          description="Halaman ini hanya tersedia untuk Kepala Audit Intern dan Administrator."
        />
        <EmptyState
          icon={<ShieldAlert className="h-4 w-4" />}
          title="Akses terbatas"
          description="Role kamu tidak memiliki izin melihat audit trail. Hubungi CAE atau administrator workspace."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Audit trail"
        title="Semua perubahan penting, tercatat."
        description="Audit event bersifat append-only dan mencatat actor, object, waktu, serta request ID untuk kebutuhan review."
        actions={
          <Badge tone="neutral" className="h-8 px-3">
            {events.length} event terakhir
          </Badge>
        }
      />

      <Card>
        {events.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<History className="h-4 w-4" />}
              title="Belum ada aktivitas"
              description="Event akan muncul setelah ada perubahan entity atau assessment."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line bg-slate-50/80 text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
                  <th className="px-4 py-3">Waktu</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Object</th>
                  <th className="px-4 py-3">Request ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {events.map((event) => (
                  <tr key={event.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">
                      {formatDateTime(event.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-ink">
                      {event.actorName}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium text-slate-700">
                        {humanize(event.action.replaceAll(".", " "))}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Badge tone="accent">{event.objectType}</Badge>
                        <span className="font-mono text-[10px] text-muted">
                          {event.objectId.slice(0, 12)}…
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-[10px] text-muted">
                      {event.requestId ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
