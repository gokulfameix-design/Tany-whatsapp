import type { Booking, ConversationContext, Order } from "@/lib/messaging/domain-types";
import type { FlowContext, FlowResult, IncomingMessageInput, MessagingReply } from "@/lib/messaging/types";
import { clearConversationContext, mergeConversationContext } from "@/lib/messaging/context";
import { buttonReply, listReply, textReply } from "@/lib/messaging/replies";
import { getOrCreateConversation, resetConversation } from "@/lib/messaging/services/conversation-service";
import { getOrder, setOrderStatus } from "@/lib/messaging/services/order-service";
import { getBooking, setBookingStatus } from "@/lib/messaging/services/booking-service";
import { createPendingPayment, getPayment } from "@/lib/messaging/services/payment-service";
import type { BatchVertical, CatalogItem } from "@/lib/messaging/flows/batch-config";

export type Choice = { id: string; name: string; price?: number };
export async function batchScope(vertical: BatchVertical, value: string | IncomingMessageInput, flow?: FlowContext) {
  const input = typeof value === "string" ? { type: "text" as const, text: value } : value;
  const phone = flow?.customerPhone ?? flow?.conversation?.customerPhone;
  const business = flow?.business;
  const key = business && phone ? { businessId: business.id, customerPhone: phone } : null;
  if (business && business.vertical !== vertical) throw new Error("Flow vertical does not match business");
  let conversation = flow?.conversation;
  if (conversation && key && (conversation.businessId !== key.businessId || conversation.customerPhone !== phone || conversation.vertical !== vertical)) throw new Error("Conversation does not match customer and business");
  if (!conversation && key) conversation = await getOrCreateConversation({ ...key, vertical });
  const context: ConversationContext = mergeConversationContext({}, conversation?.context ?? {});
  const state = conversation?.state ?? `${vertical}_start`;
  const text = input.selectionId || ["button", "list", "unsupported"].includes(input.type) ? "" : input.text.trim();
  const selectionId = input.selectionId;
  const command = selectionId === `${vertical}_cancel` ? "CANCEL" : selectionId === `${vertical}_confirm` && state === `${vertical}_awaiting_confirmation` ? "CONFIRM" : text.toUpperCase();
  const result = (step: string, reply: MessagingReply | string, status: FlowResult["status"] = "waiting_customer", data = context): FlowResult => ({
    state: step === "start" || step === "completed" ? `${vertical}_${step}` : `${vertical}_awaiting_${step}`,
    reply: typeof reply === "string" ? textReply(reply) : reply, vertical, originalText: input.text, status, context: data,
  });
  const requireKey = () => { if (!key) throw new Error("Business and customer context is required"); return key; };
  const owned = async (kind: "order" | "booking") => {
    const id = context[`${kind}Id`];
    if (typeof id !== "string") return null;
    const owner = requireKey();
    const record = kind === "order" ? await getOrder(id) : await getBooking(id);
    if (!record || record.businessId !== owner.businessId || record.customerPhone !== owner.customerPhone || record.vertical !== vertical) throw new Error("Record does not match customer and business");
    return record;
  };
  const isPaid = async (record: Order | Booking) => {
    if (record.status === "paid" || record.status === "confirmed" || record.status === "completed" || record.status === "delivered") return true;
    if (!record.paymentId) return false;
    const payment = await getPayment(record.paymentId);
    const referenceType = "items" in record ? "order" : "booking";
    const amount = "items" in record ? record.total : record.amount;
    if (!payment || payment.businessId !== record.businessId || payment.customerPhone !== record.customerPhone || payment.referenceType !== referenceType || payment.referenceId !== record.id || payment.amount !== amount) throw new Error("Payment does not match record");
    return payment.status === "paid";
  };
  const menu = (step: string, body: string, choices: Choice[]) => listReply({ body, buttonText: "Choose option", sections: [{ rows: choices.slice(0, 10).map((choice) => ({
    id: `${vertical}_${step}_${choice.id}`, title: Array.from(choice.name).slice(0, 24).join(""), ...(choice.price === undefined ? {} : { description: `Price: ₹${choice.price}` }),
  })) }] });
  const choose = (step: string, choices: Choice[]) => choices.find((choice) => selectionId ? selectionId === `${vertical}_${step}_${choice.id}` : text.toLowerCase() === choice.name.toLowerCase());
  const confirm = (body: string) => buttonReply({ body: `${body}\n\nReply CONFIRM or CANCEL.`, buttons: [{ id: `${vertical}_confirm`, title: "Confirm" }, { id: `${vertical}_cancel`, title: "Cancel" }] });
  const common = async (kind: "order" | "booking", welcome: MessagingReply): Promise<FlowResult | null> => {
    if (command === "RESET" || command === "CANCEL") {
      const record = await owned(kind);
      const settled = record && await isPaid(record);
      if (record && !settled && record.status !== "cancelled") {
        if (kind === "order") await setOrderStatus({ orderId: record.id, status: "cancelled" });
        else await setBookingStatus({ bookingId: record.id, status: "cancelled" });
      }
      if (command === "RESET") {
        if (key) await resetConversation(key);
        return result("start", welcome, "active", clearConversationContext());
      }
      return settled ? result("completed", "This transaction is already confirmed. Reply RESET to start again.", "completed")
        : result("completed", "Your request has been cancelled.", "cancelled");
    }
    if (conversation?.status === "cancelled") return result("completed", "Your request has been cancelled. Reply RESET to start again.", "cancelled");
    if (state === `${vertical}_completed` || conversation?.status === "completed") return result("completed", "Your request is complete. Reply RESET to start again.", "completed");
    return null;
  };
  const paymentFor = async (record: Order | Booking) => {
    const payment = record.paymentId ? await getPayment(record.paymentId) : await createPendingPayment({
      ...requireKey(), amount: "items" in record ? record.total : record.amount,
      referenceType: "items" in record ? "order" : "booking", referenceId: record.id, idempotencyKey: `${vertical}:${record.id}`,
    });
    if (!payment || payment.businessId !== record.businessId || payment.customerPhone !== record.customerPhone || payment.referenceId !== record.id ||
        payment.referenceType !== ("items" in record ? "order" : "booking") || payment.amount !== ("items" in record ? record.total : record.amount)) throw new Error("Payment does not match record");
    context.paymentId = payment.id;
    return payment;
  };
  return { vertical, input, context, state, text, command, selectionId, result, requireKey, owned, isPaid, menu, choose, confirm, common, paymentFor };
}
export function matchCatalog(text: string, catalog: CatalogItem[]) {
  const normalized = ` ${text.toLowerCase().replaceAll(/\s+/g, " ")} `;
  return catalog.find((item) => item.aliases.some((alias) => normalized.includes(` ${alias} `)));
}
export const greeting = (text: string) => /^(hi|hello|hey|start|menu)$/i.test(text);
