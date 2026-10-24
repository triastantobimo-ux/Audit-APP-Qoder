import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AuditFlow — Internal Audit Workspace",
  description: "Audit universe, risk assessment, dan ruang kerja audit internal.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
