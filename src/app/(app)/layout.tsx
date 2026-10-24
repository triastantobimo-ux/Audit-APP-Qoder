import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { SidebarNav } from "@/components/sidebar-nav";
import { LogoutButton } from "@/components/logout-button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { roleLabels } from "@/lib/rbac";
import { requirePageAuth } from "@/server/auth";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const auth = await requirePageAuth();
  const roleLabel = roleLabels[auth.membership.role] ?? auth.membership.role;

  return (
    <div className="min-h-screen bg-canvas lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="hidden border-r border-sidebar-line bg-sidebar lg:flex lg:h-screen lg:flex-col lg:sticky lg:top-0">
        <div className="flex items-center gap-3 border-b border-sidebar-line px-5 py-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/15 text-teal-300">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-bold tracking-tight text-white">AuditFlow</p>
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-sidebar-muted">
              Internal audit workspace
            </p>
          </div>
        </div>

        <div className="flex-1 px-3 py-5">
          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-sidebar-muted">
            Workspace
          </p>
          <SidebarNav role={auth.membership.role} />
        </div>

        <div className="border-t border-sidebar-line p-3">
          <div className="rounded-xl bg-sidebar-soft p-3">
            <div className="flex items-center gap-2.5">
              <Avatar name={auth.user.name} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-white">{auth.user.name}</p>
                <p className="truncate text-[10px] text-sidebar-muted">{roleLabel}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <Badge tone="accent" className="bg-white/10 text-teal-200">
                {auth.workspace.name}
              </Badge>
            </div>
            <div className="mt-2">
              <LogoutButton />
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-line bg-canvas/90 backdrop-blur lg:bg-surface/80">
          <div className="flex items-center justify-between gap-4 px-4 py-3 lg:px-8">
            <div className="flex items-center gap-2 lg:hidden">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar text-teal-300">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              </span>
              <Link href="/dashboard" className="text-sm font-bold tracking-tight">
                AuditFlow
              </Link>
            </div>
            <div className="hidden items-center gap-2 text-xs text-muted lg:flex">
              <span className="font-semibold text-ink">{auth.workspace.name}</span>
              <span className="text-slate-300">/</span>
              <span>Audit planning & risk assessment</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Badge tone="neutral" className="hidden sm:inline-flex">
                {roleLabel}
              </Badge>
              <Avatar name={auth.user.name} size="sm" />
              <span className="hidden text-xs font-semibold text-ink sm:block">
                {auth.user.name}
              </span>
              <div className="lg:hidden">
                <LogoutButton variant="header" />
              </div>
            </div>
          </div>
          <div className="border-t border-line px-3 py-2 lg:hidden">
            <SidebarNav variant="mobile" role={auth.membership.role} />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
