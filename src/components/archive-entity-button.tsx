"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ArchiveEntityButton({
  workspaceId,
  entityId,
  version,
  disabled,
  disabledReason,
}: {
  workspaceId: string;
  entityId: string;
  version: number;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleArchive() {
    if (!window.confirm("Archive entity ini? Entity tidak akan muncul di universe aktif.")) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/audit-entities/${entityId}/archive`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ version }),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.detail ?? "Tidak bisa archive entity.");
        return;
      }

      router.push("/audit-universe");
      router.refresh();
    } catch {
      setError("Tidak bisa menghubungi server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        onClick={handleArchive}
        disabled={disabled || busy}
        title={disabled ? disabledReason : undefined}
      >
        <Archive className="h-4 w-4" aria-hidden="true" />
        {busy ? "Mengarsipkan..." : "Archive"}
      </Button>
      {error ? <p className="text-[11px] text-danger">{error}</p> : null}
    </div>
  );
}
