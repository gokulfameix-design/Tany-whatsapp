import { listBusinessProfiles } from "@/lib/admin/services";
import { automationDashboard } from "@/lib/automations/service";
import { AutomationBuilder } from "./automation-builder";
export async function AutomationPage({ businessId }: { businessId?: string }) {
  if (process.env.NODE_ENV === "development")
    console.info("[AUTOMATION_PAGE_START]", { businessId: businessId ?? null });
  let businesses: Awaited<ReturnType<typeof listBusinessProfiles>> = [];
  let data: Awaited<ReturnType<typeof automationDashboard>> | null = null;
  try {
    if (!businessId) {
      if (process.env.NODE_ENV === "development")
        console.info("[AUTOMATION_PAGE_BUSINESSES_START]", {});
      businesses = await listBusinessProfiles();
      if (process.env.NODE_ENV === "development")
        console.info("[AUTOMATION_PAGE_BUSINESSES_DONE]", {
          count: businesses.length,
        });
    }
    if (businessId) {
      if (process.env.NODE_ENV === "development")
        console.info("[AUTOMATION_PAGE_DASHBOARD_START]", { businessId });
      data = await automationDashboard(businessId);
      if (process.env.NODE_ENV === "development")
        console.info("[AUTOMATION_PAGE_DASHBOARD_DONE]", { businessId });
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      const details = error as Error & { code?: unknown };
      console.error("[AUTOMATION_PAGE_FAILED]", {
        businessId: businessId ?? null,
        name: details.name,
        code: details.code,
        message: details.message,
        stack: details.stack,
      });
    }
    throw error;
  }
  return (
    <AutomationBuilder
      key={businessId ?? "all"}
      businessId={businessId}
      businesses={businesses.map((b) => ({ id: b.id, name: b.name }))}
      data={data}
    />
  );
}
