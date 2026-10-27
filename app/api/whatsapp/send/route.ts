import { NextRequest } from "next/server";
import { integrationResponse, IntegrationError } from "@/lib/integration/http";
import { requireWhatsAppEntitlement } from "@/lib/subscriptions/entitlements";
import { getBusinessConfig } from "@/lib/messaging/services/business-config-service";
import { sendWhatsAppMessage } from "@/lib/messaging/whatsapp";

export async function POST(request: NextRequest) {
  let input;
  try { input = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  if (!input || typeof input.businessId !== "string" || !input.businessId || input.businessId.includes("/"))
    return Response.json({ error: "businessId is required." }, { status: 400 });
  const { businessId, to, message } = input;
  return integrationResponse(request, { kind: "business", businessId }, async () => {
    await requireWhatsAppEntitlement(businessId);
    if (typeof to !== "string" || !/^\+?[1-9]\d{7,14}$/.test(to) || typeof message !== "string" || !message.trim() || message.length > 4096)
      throw new IntegrationError(400, "A valid recipient and message are required.");
    const business = await getBusinessConfig(businessId);
    if (!business?.active) throw new IntegrationError(404, "Active business not found.");
    await sendWhatsAppMessage({ phoneNumberId: business.whatsappPhoneNumberId, to, reply: message });
    return { success: true };
  });
}
