"use server";
import { OperationsAccessError } from "@/lib/admin/client-access";
import { mutateClientOperations } from "@/lib/admin/client-operations";
import { getDashboardSession } from "@/lib/admin/dashboard-session";
import { EntitlementError } from "@/lib/subscriptions/entitlements";
import { revalidatePath } from "next/cache";
import {
  createCampaignDraft,
  saveOperationsConfiguration,
  setConversationHandoff,
} from "@/lib/admin/operations-service";
import { requireDashboardAccess } from "@/lib/admin/dashboard-session";

export async function updateOperations(
  businessId: string,
  kind: "configuration" | "campaign" | "handoff",
  input: unknown,
) {
  try {
    await requireDashboardAccess(businessId);
    const session = await getDashboardSession();
    if (session.role === "business") await mutateClientOperations(session, businessId, kind, input);
    else if (kind === "configuration")
      await saveOperationsConfiguration(businessId, input, true);
    else if (kind === "campaign") await createCampaignDraft(businessId, input, true);
    else if (kind === "handoff") {
      if (
        !input ||
        typeof input !== "object" ||
        !("id" in input) ||
        typeof input.id !== "string" ||
        !("human" in input) ||
        typeof input.human !== "boolean"
      )
        return { ok: false, message: "Invalid handoff request." };
      await setConversationHandoff(businessId, input.id, input.human, true);
    } else return { ok: false, message: "Unsupported action." };
    revalidatePath(`/business/${encodeURIComponent(businessId)}`, "layout");
    revalidatePath("/admin", "layout");
    return {
      ok: true,
      message:
        kind === "campaign"
          ? "Draft saved. No messages sent."
          : "Changes saved.",
    };
  } catch (error) {
    if (error instanceof OperationsAccessError) return { ok: false, code: error.code, message: error.message };
    if (error instanceof EntitlementError) return { ok: false, ...error.details };
    return {
      ok: false,
      message:
        "Could not save. Check the business, required fields and server connection.",
    };
  }
}
