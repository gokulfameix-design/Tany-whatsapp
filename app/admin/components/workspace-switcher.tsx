import "server-only";
import { connection } from "next/server";
import { listBusinessProfiles } from "@/lib/admin/services";
import { requireDashboardAccess } from "@/lib/admin/dashboard-session";
import type { AdminBusiness, WorkspaceOption } from "@/lib/admin/types";
import { WorkspaceMenu } from "./workspace-menu";

export async function WorkspaceSwitcher({
  business,
}: {
  business?: AdminBusiness;
}) {
  await connection();
  if (process.env.NODE_ENV === "development")
    console.info("[WORKSPACE_SWITCHER_RENDER_START]", {
      businessId: business?.id ?? null,
    });
  const access = await requireDashboardAccess(business?.id);
  if (process.env.NODE_ENV === "development")
    console.info("[WORKSPACE_SWITCHER_ACCESS_DONE]", {
      businessId: business?.id ?? null,
      access,
    });
  let options: WorkspaceOption[] = [];
  let failed = false;
  try {
    if (process.env.NODE_ENV === "development")
      console.info("[WORKSPACE_SWITCHER_PROFILES_START]", {
        businessId: business?.id ?? null,
      });
    const profiles = await listBusinessProfiles();
    options = profiles
      // Active workspaces remain accessible while their Meta connection is being set up.
      .filter((profile) => profile.active)
      .map(({ id, name, vertical, active }) => ({
        id,
        name,
        vertical,
        active,
      }));
    if (process.env.NODE_ENV === "development")
      console.info("[WORKSPACE_SWITCHER_PROFILES_DONE]", {
        businessId: business?.id ?? null,
        optionCount: options.length,
      });
  } catch (error) {
    failed = true;
    if (process.env.NODE_ENV === "development") {
      const details = error as Error & { code?: unknown };
      console.error("[WORKSPACE_SWITCHER_PROFILES_FAILED]", {
        businessId: business?.id ?? null,
        name: details.name,
        code: details.code,
        message: details.message,
        stack: details.stack,
      });
    }
  }

  return (
    <WorkspaceMenu
      business={business ? { ...business, settings: {} } : undefined}
      options={options}
      failed={failed}
      canSeeAdmin={access === "admin"}
    />
  );
}
