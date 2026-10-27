import type { MessagingReply } from "@/lib/messaging/types";
import { normalizeReply, replyTextFallback, productRetailerIds } from "@/lib/messaging/replies";

export function buildWhatsAppPayload(
  to: string,
  value: MessagingReply | string,
  textOnly = false,
) {
  const reply = textOnly ? replyTextFallback(value) : normalizeReply(value);
  if (reply.type === "product_sequence") throw new Error("Product sequences must be sent as separate WhatsApp messages.");
  const base = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
  };
  if (reply.type === "product")
    return {
      ...base,
      type: "interactive",
      interactive: {
        type: "product",
        body: { text: reply.body },
        action: {
          catalog_id: reply.catalogId,
          product_retailer_id: reply.retailerProductId,
        },
      },
    };
  if (reply.type === "product_list")
    return {
      ...base,
      type: "interactive",
      interactive: {
        type: "product_list",
        header: { type: "text", text: reply.header },
        ...(reply.footer ? { footer: { text: reply.footer } } : {}),
        body: { text: reply.body },
        action: {
          catalog_id: reply.catalogId,
          sections: reply.sections.map((s) => ({
            title: s.title,
            product_items: productRetailerIds(s).map((id) => ({
              product_retailer_id: id,
            })),
          })),
        },
      },
    };
  if (reply.type === "location_request")
    return {
      ...base,
      type: "interactive",
      interactive: {
        type: "location_request_message",
        body: { text: reply.body },
        action: { name: "send_location" },
      },
    };
  if (reply.type === "text")
    return {
      ...base,
      type: "text",
      text: { preview_url: false, body: reply.body },
    };
  if (reply.type === "cta_url")
    return {
      ...base,
      type: "interactive",
      interactive: {
        type: "cta_url",
        body: { text: reply.body },
        action: {
          name: "cta_url",
          parameters: { display_text: reply.title, url: reply.url },
        },
      },
    };
  if (reply.type === "buttons")
    return {
      ...base,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: reply.body },
        action: {
          buttons: reply.buttons.map((button) => ({
            type: "reply",
            reply: button,
          })),
        },
      },
    };
  return {
    ...base,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: reply.body },
      action: { button: reply.buttonText, sections: reply.sections },
    },
  };
}
