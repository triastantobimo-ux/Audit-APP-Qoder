"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  FileSearch,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/form";
import { can, isRole, type Role } from "@/lib/rbac";

const demoUsers = [
  {
    email: "cae@demo.local",
    name: "Ratna Wijaya, AK, CA",
    role: "Kepala Audit Intern",
  },
  {
    email: "manager@demo.local",
    name: "Bima Pratama, SKM, M.Kes",
    role: "Manajer Audit Internal",
  },
  { email: "auditor@demo.local", name: "Sinta Maharani, AMK", role: "Auditor" },
  {
    email: "reviewer@demo.local",
    name: "Dimas Saputra, S.Farm, Apt",
    role: "Reviewer / QA",
  },
  {
    email: "farmasi@demo.local",
    name: "Farla Octaviana, S.Farm, Apt",
    role: "Process Owner Farmasi",
  },
];

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("cae@demo.local");
  const [password, setPassword] = useState("Password123!");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(payload.detail ?? "Tidak bisa masuk. Cek email dan password.");
        return;
      }

      const role = (payload.data?.role ?? "") as Role;
      const landing =
        isRole(role) && can(role, "engagement:read") ? "/dashboard" : "/remediation";

      router.push(landing);
      router.refresh();
    } catch {
      setError("Tidak bisa menghubungi server. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-sidebar px-10 py-12 lg:flex lg:flex-col lg:justify-between xl:px-16">
        <div className="absolute -right-32 top-16 h-80 w-80 rounded-full bg-teal-500/10 blur-3xl" />
        <div className="absolute -left-24 bottom-0 h-72 w-72 rounded-full bg-amber-400/10 blur-3xl" />

        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-500/15 text-teal-300">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-base font-bold tracking-tight text-white">AuditFlow</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-muted">
                Internal audit workspace
              </p>
            </div>
          </div>

          <p className="mt-16 max-w-xl text-[11px] font-bold uppercase tracking-[0.18em] text-teal-300">
            Audit universe · risk assessment · evidence
          </p>
          <h1 className="mt-4 max-w-xl text-4xl font-semibold leading-tight tracking-tight text-white xl:text-5xl">
            Audit yang bisa dipertanggungjawabkan, dari universe sampai evidence.
          </h1>
          <p className="mt-5 max-w-lg text-sm leading-7 text-sidebar-muted">
            Satu tempat untuk memetakan auditable entity, menilai risiko,
            mengelola skor, dan menjaga jejak approval sesuai IIA GIAS.
          </p>

          <div className="mt-10 grid max-w-lg gap-3">
            {[
              {
                icon: FileSearch,
                title: "Risk-based audit universe",
                text: "Hierarki entity, inherent & residual risk, dan ranking yang menjelaskan prioritas.",
              },
              {
                icon: CheckCircle2,
                title: "Review yang terkontrol",
                text: "Submit, approve, return, dan versioning dengan segregation of duties.",
              },
              {
                icon: Users,
                title: "Siap untuk tim audit",
                text: "RBAC per role, audit trail, dan workflow yang bisa diuji.",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-4"
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-teal-300" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <p className="mt-0.5 text-xs leading-5 text-sidebar-muted">{item.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="relative z-10 mt-12 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-muted">
          <span className="rounded-full border border-white/10 px-3 py-1">IIA GIAS 2024</span>
          <span className="rounded-full border border-white/10 px-3 py-1">SA 240 / SA 530</span>
          <span className="rounded-full border border-white/10 px-3 py-1">COSO / SOX-ready</span>
        </div>
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sidebar text-teal-300">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-bold tracking-tight">AuditFlow</p>
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted">
                Internal audit workspace
              </p>
            </div>
          </div>

          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent">
            Masuk ke workspace
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
            Selamat datang kembali.
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted">
            Gunakan akun demo untuk melihat alur audit universe dan risk assessment.
          </p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nama@perusahaan.com"
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <FieldError>{error}</FieldError>

            <Button type="submit" className="h-11 w-full" disabled={busy}>
              {busy ? "Memeriksa akses..." : "Masuk ke AuditFlow"}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </form>

          <div className="mt-7 rounded-xl border border-line bg-surface p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
              Akun demo
            </p>
            <p className="mt-1 text-[11px] text-muted">
              Password semua akun: <span className="font-semibold text-ink">Password123!</span>
            </p>
            <div className="mt-3 grid gap-1.5">
              {demoUsers.map((user) => (
                <button
                  key={user.email}
                  type="button"
                  onClick={() => {
                    setEmail(user.email);
                    setPassword("Password123!");
                    setError(null);
                  }}
                  className="flex items-center justify-between rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-slate-50"
                >
                  <span>
                    <span className="block text-xs font-semibold text-ink">{user.name}</span>
                    <span className="block text-[10px] text-muted">{user.email}</span>
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                    {user.role}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <p className="mt-6 text-center text-[10px] leading-5 text-muted">
            Mode demo lokal. Data disimpan di SQLite workspace ini dan bukan untuk produksi.
          </p>
        </div>
      </section>
    </div>
  );
}
