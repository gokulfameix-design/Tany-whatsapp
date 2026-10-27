import "server-only";
import type { DashboardSession } from "@/lib/admin/dashboard-access";

/** This standalone app is the internal console, not the Tany client portal.
 * Signed client capabilities continue to be verified independently by integration APIs.
 */
export async function getDashboardSession(): Promise<DashboardSession> {
  return { role: "admin" };
}

export async function dashboardBusinessId(requested?: string) {
  const session = await getDashboardSession();
  if (session.role === "business") {
    if (requested && requested !== session.businessId) throw new Error("Business access denied");
    return session.businessId;
  }
  if (!requested) throw new Error("Select a business");
  return requested;
}

export async function requireDashboardAccess(businessId?: string) {
  const session = await getDashboardSession();
  if (session.role === "admin") return "admin" as const;
  if (businessId !== session.businessId) throw new Error("Dashboard authorization required");
  return "business" as const;
}
