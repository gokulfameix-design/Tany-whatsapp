import { sendingAccessToken } from "@/lib/whatsapp/runtime-account";
import { buildWhatsAppPayload } from "@/lib/messaging/payload";
import { safeWhatsAppDebugText, safeWhatsAppError } from "@/lib/messaging/debug-log";
import { normalizeReply, replyTextFallback } from "@/lib/messaging/replies";
import type { MessagingReply } from "@/lib/messaging/types";
import { findBusinessByPhoneNumberId } from "@/lib/messaging/business";
import { deliverProductSequence } from "@/lib/whatsapp/product-sequence";
import { resolveProductSequenceForSend } from "@/lib/whatsapp/catalog";

type WhatsAppSendResult = { messages?: { id: string }[]; [key: string]: unknown };
export class WhatsAppSendError extends Error {
  constructor(message: string, public code?: number) { super(message); }
}

type SendWhatsAppTextParams = {
  phoneNumberId: string;
  to: string;
  message: string;
};

export { buildWhatsAppPayload } from "@/lib/messaging/payload";

export async function sendWhatsAppMessage({
  phoneNumberId,
  to,
  reply,
  textOnly = false,
  sequenceIndex,
}: {
  phoneNumberId: string;
  to: string;
  reply: MessagingReply | string;
  textOnly?: boolean;
  sequenceIndex?: number;
}): Promise<WhatsAppSendResult> {
  const normalized = normalizeReply(reply);
  if (normalized.type === "product_sequence") {
    if (textOnly) return sendWhatsAppMessage({ phoneNumberId, to, reply: replyTextFallback(normalized) });
    const business = await findBusinessByPhoneNumberId(phoneNumberId);
    if (!business) throw new Error("The sequence business account is unavailable.");
    const sequence = await resolveProductSequenceForSend(business.id, normalized);
    return deliverProductSequence(sequence, (part, _key, index) => sendWhatsAppMessage({ phoneNumberId, to, reply: part, ...(part.type === "product" ? { sequenceIndex: index } : {}) }));
  }
  const accessToken = await sendingAccessToken(phoneNumberId);

  if (!accessToken) {
    throw new Error("WhatsApp account credential is unavailable");
  }

  const payload = buildWhatsAppPayload(to, reply, textOnly);
  if (sequenceIndex !== undefined && "interactive" in payload && payload.interactive.type === "product") {
    try {
      console.info("[WA_PRODUCT_SEQUENCE_SEND]", {
        catalogId: payload.interactive.action.catalog_id,
        retailerProductId: payload.interactive.action.product_retailer_id,
        index: sequenceIndex,
      });
    } catch { /* Temporary diagnostics must not change delivery. */ }
  }

  if (
  typeof reply !== "string" &&
  reply.type === "product_list" &&
  "interactive" in payload
) {
  console.info(
    "[WA_PRODUCT_LIST_PAYLOAD]",
    JSON.stringify(payload.interactive, null, 2),
  );
}

  const response = await fetch(
    `https://graph.facebook.com/v26.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  const data = await response.json();

  if (!response.ok) {
    if (
      typeof reply !== "string" &&
      reply.type === "product" &&
      reply.allowFallback !== false &&
      [400, 404].includes(response.status) &&
      [100, 131009, 131051, 131052, 131053].includes(
        Number(data?.error?.code),
      )
    ) {
      console.info("[WA_PRODUCT_FALLBACK]", {
        code: Number(data?.error?.code),
        catalogId: reply.catalogId,
        retailerProductId: reply.retailerProductId,
      });
      return sendWhatsAppMessage({
        phoneNumberId,
        to,
        reply: reply.fallback,
      });
    }

    console.error("WhatsApp send failed:", {
  status: response.status,
  error: safeWhatsAppError(data?.error?.message),
  code: typeof data?.error?.code === "number" ? data.error.code : null,
  subcode: typeof data?.error?.error_subcode === "number" ? data.error.error_subcode : null,
  details: safeWhatsAppDebugText(data?.error?.error_data?.details, true),
  fbtraceId: safeWhatsAppDebugText(data?.error?.fbtrace_id),
});

    throw new WhatsAppSendError(
      data?.error?.message || "Failed to send WhatsApp message", Number(data?.error?.code),
    );
  }

  return data;
}

export async function sendWhatsAppText({
  phoneNumberId,
  to,
  message,
}: SendWhatsAppTextParams) {
  return sendWhatsAppMessage({
    phoneNumberId,
    to,
    reply: message,
  });
}

export async function sendWhatsAppProduct(params: {
  phoneNumberId: string;
  to: string;
  reply: import("@/lib/messaging/types").ProductReply;
}) {
  return sendWhatsAppMessage(params);
}

export async function sendWhatsAppProducts(params: {
  phoneNumberId: string;
  to: string;
  reply: import("@/lib/messaging/types").ProductListReply;
}) {
  return sendWhatsAppMessage(params);
}
