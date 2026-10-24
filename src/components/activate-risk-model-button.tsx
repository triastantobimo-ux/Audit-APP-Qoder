"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ActivateRiskModelButton({
  workspaceId,
  modelId,
}: {
  workspaceId: string;
  modelId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleActivate() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/risk-models/${modelId}/activate`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ makeDefault: true }),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.detail ?? "Tidak bisa mengaktifkan model.");
        return;
      }

      router.refresh();
    } catch {
      setError("Tidak bisa menghubungi server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={handleActivate} disabled={busy}>
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        {busy ? "Mengaktifkan..." : "Aktifkan"}
      </Button>
      {error ? <p className="text-[11px] text-danger">{error}</p> : null}
    </div>
  );
}
