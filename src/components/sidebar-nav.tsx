"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarRange,
  ClipboardList,
  History,
  LayoutDashboard,
  Network,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { can, type Capability, type Role } from "@/lib/rbac";

const items: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  capability: Capability | null;
}[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, capability: null },
  { href: "/audit-universe", label: "Audit Universe", icon: Network, capability: "entity:read" },
  { href: "/audit-plan", label: "Audit Plan", icon: CalendarRange, capability: "plan:read" },
  { href: "/engagements", label: "Engagements", icon: ClipboardList, capability: "engagement:read" },
  { href: "/remediation", label: "Remediasi", icon: ShieldCheck, capability: "finding:read" },
  { href: "/risk-model", label: "Risk Model", icon: SlidersHorizontal, capability: "riskModel:read" },
  { href: "/audit-trail", label: "Audit Trail", icon: History, capability: "auditLog:read" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({
  variant = "desktop",
  role,
}: {
  variant?: "desktop" | "mobile";
  role: Role;
}) {
  const pathname = usePathname();
  const visibleItems = items.filter(
    (item) => item.capability === null || can(role, item.capability),
  );

  return (
    <nav
      className={cn(
        variant === "desktop"
          ? "space-y-1"
          : "flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
      )}
      aria-label="Navigasi utama"
    >
      {visibleItems.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2.5 rounded-lg text-sm font-medium transition-colors",
              variant === "desktop" ? "px-3 py-2.5" : "shrink-0 px-3 py-2",
              variant === "desktop"
                ? active
                  ? "bg-white/10 text-white"
                  : "text-sidebar-muted hover:bg-white/5 hover:text-white"
                : active
                  ? "bg-accent-soft text-accent-strong"
                  : "text-slate-600 hover:bg-slate-100",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
