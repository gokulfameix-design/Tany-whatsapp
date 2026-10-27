"use server";
import { requireWhatsAppEntitlement, EntitlementError } from "@/lib/subscriptions/entitlements";

import { prepareWhatsAppTest } from "@/lib/admin/whatsapp-service";
import { AdminValidationError } from "@/lib/admin/validation";
import { buildWhatsAppPayload } from "@/lib/messaging/whatsapp";
import { requireDashboardAccess } from "@/lib/admin/dashboard-session";

export type WhatsAppTestState = {
  ok: boolean;
  message: string;
  errors?: Record<string, string>;
  preview?: { to: string; text: string; phoneNumberId: string | null };
};

export async function previewWhatsAppTest(
  businessId: string,
  _previous: WhatsAppTestState,
  form: FormData,
): Promise<WhatsAppTestState> {
  try {
    await requireDashboardAccess(businessId);
    const test = await prepareWhatsAppTest(
      businessId,
      form.get("recipient"),
      form.get("message"),
    );
    const payload = buildWhatsAppPayload(test.to, test.text);
    return {
      ok: true,
      message: "Test payload validated locally. No WhatsApp message was sent.",
      preview: {
        to: payload.to,
        text: test.text,
        phoneNumberId: test.phoneNumberId,
      },
    };
  } catch (error) {
    if (error instanceof EntitlementError) return { ok: false, ...error.details };
    if (error instanceof AdminValidationError)
      return { ok: false, message: error.message, errors: error.errors };
    return {
      ok: false,
      message:
        "Could not validate the test. Check the server connection and try again.",
    };
  }
}

export async function requestWhatsAppSetup(businessId: string) {
  try {
    await requireDashboardAccess(businessId);
    await requireWhatsAppEntitlement(businessId);
    return { ok: true, message: "Continue to WhatsApp setup.", url: `/business/${encodeURIComponent(businessId)}/whatsapp/setup` };
  } catch (error) {
    if (error instanceof EntitlementError) return { ok: false, ...error.details };
    return { ok: false, message: "You do not have access to this business." };
  }
}
