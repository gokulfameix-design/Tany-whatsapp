import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import { WorkspaceSwitcher } from "@/app/admin/components/workspace-switcher";
import { WorkspaceSwitcherLoading } from "@/app/admin/components/workspace-menu";
import { AdminShell } from "@/app/admin/components/admin-shell";
import { LoadingPanel } from "@/app/admin/components/shared";
import { loadBusiness } from "@/app/business/_components/load-business";
import "@/app/admin/admin.css";

export const metadata: Metadata = { title: "Tany WhatsApp Operations" };

function workspaceLog(marker: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV === "development") console.info(marker, details);
}

async function WorkspaceLayout({
  params,
  children,
}: {
  params: Promise<{ businessId: string }>;
  children: React.ReactNode;
}) {
  await connection();
  const { businessId } = await params;
  workspaceLog("[WORKSPACE_LOAD_START]", { businessId });
  const business = await loadBusiness(businessId);
  workspaceLog("[WORKSPACE_BUSINESS_LOADED]", {
    businessId,
    vertical: business.vertical,
    active: business.active,
  });
  const shellBusiness = { ...business, settings: {}, whatsappPhoneNumberId: "" };
  workspaceLog("[WORKSPACE_SWITCHER_START]", { businessId });
  workspaceLog("[WORKSPACE_LAYOUT_COMPLETE]", { businessId });
  return (
    <AdminShell
      key={business.id}
      business={shellBusiness}
      workspaceSwitcher={
        <Suspense
          fallback={<WorkspaceSwitcherLoading business={shellBusiness} />}
        >
          <WorkspaceSwitcher business={shellBusiness} />
        </Suspense>
      }
    >
      {children}
    </AdminShell>
  );
}
export default function BusinessLayout(props: {
  params: Promise<{ businessId: string }>;
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="tany-admin p-6">
          <LoadingPanel />
        </div>
      }
    >
      <WorkspaceLayout {...props} />
    </Suspense>
  );
}
