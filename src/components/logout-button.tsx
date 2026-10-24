"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/cn";

export function LogoutButton({
  variant = "sidebar",
}: {
  variant?: "sidebar" | "header";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    setBusy(true);

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      router.push("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={busy}
      aria-label="Keluar"
      title="Keluar"
      className={cn(
        "transition-colors disabled:opacity-50",
        variant === "sidebar"
          ? "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-sidebar-muted hover:bg-white/5 hover:text-white"
          : "inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-slate-100 hover:text-ink",
      )}
    >
      <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
      {variant === "sidebar" ? (busy ? "Keluar..." : "Keluar") : null}
    </button>
  );
}
