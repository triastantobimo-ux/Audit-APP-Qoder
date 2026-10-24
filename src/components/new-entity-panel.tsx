"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  FieldError,
  Input,
  Label,
  Select,
  Textarea,
} from "@/components/ui/form";
import { entityTypeLabels } from "@/lib/universe-table";

type EntityOption = {
  id: string;
  code: string;
  name: string;
  depth: number;
};

type MemberOption = {
  id: string;
  name: string;
  role: string;
};

const entityTypes = Object.entries(entityTypeLabels).map(([value, label]) => ({
  value,
  label,
}));

export function NewEntityPanel({
  workspaceId,
  entities,
  members,
}: {
  workspaceId: string;
  entities: EntityOption[];
  members: MemberOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: "",
    name: "",
    type: "business_process",
    parentId: "",
    ownerUserId: "",
    description: "",
    tags: "",
  });

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/audit-entities`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            code: form.code,
            name: form.name,
            type: form.type,
            parentId: form.parentId || null,
            ownerUserId: form.ownerUserId || null,
            description: form.description || null,
            tags: form.tags
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
          }),
        },
      );

      const payload = await response.json();

      if (!response.ok) {
        setError(payload.detail ?? "Tidak bisa membuat entity.");
        return;
      }

      setOpen(false);
      setForm({
        code: "",
        name: "",
        type: "business_process",
        parentId: "",
        ownerUserId: "",
        description: "",
        tags: "",
      });
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
        <Plus className="h-4 w-4" aria-hidden="true" />
        Tambah entity
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
            aria-labelledby="new-entity-title"
            className="relative z-10 mt-6 w-full max-w-xl rounded-2xl border border-line bg-surface shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-line px-5 py-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
                  Audit universe
                </p>
                <h2 id="new-entity-title" className="mt-1 text-lg font-semibold text-ink">
                  Tambah auditable entity
                </h2>
                <p className="mt-1 text-xs text-muted">
                  Entity bisa berupa unit organisasi, proses bisnis, sistem, atau risk domain.
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

            <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="entity-code">Kode entity</Label>
                  <Input
                    id="entity-code"
                    value={form.code}
                    onChange={(event) => update("code", event.target.value)}
                    placeholder="P2P"
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <Label htmlFor="entity-type">Tipe</Label>
                  <Select
                    id="entity-type"
                    value={form.type}
                    onChange={(event) => update("type", event.target.value)}
                  >
                    {entityTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="entity-name">Nama entity</Label>
                <Input
                  id="entity-name"
                  value={form.name}
                  onChange={(event) => update("name", event.target.value)}
                  placeholder="Procure to Pay"
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="entity-parent">Parent</Label>
                  <Select
                    id="entity-parent"
                    value={form.parentId}
                    onChange={(event) => update("parentId", event.target.value)}
                  >
                    <option value="">Root / tanpa parent</option>
                    {entities.map((entity) => (
                      <option key={entity.id} value={entity.id}>
                        {"— ".repeat(entity.depth)}
                        {entity.code} · {entity.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="entity-owner">Owner</Label>
                  <Select
                    id="entity-owner"
                    value={form.ownerUserId}
                    onChange={(event) => update("ownerUserId", event.target.value)}
                  >
                    <option value="">Belum ditentukan</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name} · {member.role}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="entity-description">Deskripsi</Label>
                <Textarea
                  id="entity-description"
                  value={form.description}
                  onChange={(event) => update("description", event.target.value)}
                  placeholder="Ruang lingkup, proses utama, dan konteks risiko."
                />
              </div>

              <div>
                <Label htmlFor="entity-tags">Tags</Label>
                <Input
                  id="entity-tags"
                  value={form.tags}
                  onChange={(event) => update("tags", event.target.value)}
                  placeholder="finance, shared-services, sox"
                />
                <p className="mt-1 text-[11px] text-muted">Pisahkan dengan koma.</p>
              </div>

              <FieldError>{error}</FieldError>

              <div className="flex justify-end gap-2 border-t border-line pt-4">
                <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
                  Batal
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? "Menyimpan..." : "Simpan entity"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
