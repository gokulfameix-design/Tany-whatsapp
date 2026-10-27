import { Suspense } from "react";
import { WorkspaceSwitcher } from "./components/workspace-switcher";
import { WorkspaceSwitcherLoading } from "./components/workspace-menu";
import type { Metadata } from "next";
import { AdminShell } from "./components/admin-shell";
import "./admin.css";
export const metadata: Metadata = {
  title: "Tany WhatsApp Operations",
  description: "WhatsApp messaging operations",
};
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminShell
      workspaceSwitcher={
        <Suspense fallback={<WorkspaceSwitcherLoading />}>
          <WorkspaceSwitcher />
        </Suspense>
      }
    >
      {children}
    </AdminShell>
  );
}
