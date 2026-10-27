import type { ConversationContext, LocationData, Order } from "@/lib/messaging/domain-types";
import type { FlowContext, FlowResult } from "@/lib/messaging/types";
import { aliasesFor, loadBusinessData, missingCatalogReply } from "@/lib/messaging/flows/business-data";
import { textReply } from "@/lib/messaging/replies";
import { getOrCreateConversation, resetConversation } from "@/lib/messaging/services/conversation-service";
import { createDraftOrder, getOrder, setOrderStatus, updateOrder } from "@/lib/messaging/services/order-service";
import { getCustomerLocation, saveCustomerLocation, type LocationInput } from "@/lib/messaging/services/location-service";
import { createPendingPayment, getPayment } from "@/lib/messaging/services/payment-service";

export type EatsState = "eats_start" | "eats_awaiting_item" | "eats_awaiting_quantity" |
  "eats_awaiting_location" | "eats_awaiting_confirmation" | "eats_awaiting_payment" | "eats_completed";

const paymentReply = "Your order is confirmed. Payment link will be sent shortly.";
const unknownItemReply = "Sorry, I couldn't find that item. Please try another item.";
const quantityReply = "Please enter a positive whole number.";

function locationInput(value: ConversationContext[string] | undefined): LocationInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { latitude, longitude, source, address, label } = value;
  if (typeof latitude !== "number" || !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
      typeof longitude !== "number" || !Number.isFinite(longitude) || Math.abs(longitude) > 180) return null;
  return {
    latitude, longitude,
    source: source === "whatsapp" || source === "stored" ? source : "manual",
    address: typeof address === "string" ? address : null,
    label: typeof label === "string" ? label : null,
  };
}

function jsonLocation(location: LocationData): ConversationContext {
  return { latitude: location.latitude, longitude: location.longitude, address: location.address, label: location.label, source: location.source };
}

function orderSummary(order: Order): string {
  return `Order summary:\n${order.items.map((item) => `${item.quantity} × ${item.name}`).join("\n")}\nTotal: ₹${order.total}\n\nReply CONFIRM to continue.`;
}

export async function handleEatsMessage(text: string, flowContext?: FlowContext): Promise<FlowResult> {
  const data = await loadBusinessData(flowContext, "eats");
  const menu = Object.fromEntries(data.items.filter((item) => item.type === "product" && item.price > 0).map((item) => [item.id, item]));
  const itemName = (value: string): string | null => {
    const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
    return Object.values(menu).find((item) => item.id === value || aliasesFor(item).includes(normalized))?.id ?? null;
  };
  const welcome = Object.keys(menu).length ? `Welcome to Tany Eats! What would you like to order?\n${Object.values(menu).map((item) => `${item.name} ₹${item.price}`).join("\n")}` : missingCatalogReply;
  const command = text.trim().replace(/\s+/g, " ").toUpperCase();
  let conversation = flowContext?.conversation;
  const business = flowContext?.business;
  const customerPhone = flowContext?.customerPhone ?? conversation?.customerPhone;
  const session = business && customerPhone ? { businessId: business.id, customerPhone } : null;
  if (business && business.vertical !== "eats") throw new Error("Eats flow requires an Eats business");
  if (conversation && session && (conversation.businessId !== session.businessId || conversation.customerPhone !== customerPhone || conversation.vertical !== "eats")) {
    throw new Error("Eats conversation does not match customer and business");
  }
  if (!conversation && session) conversation = await getOrCreateConversation({ ...session, vertical: "eats" });
  let state = conversation?.state ?? "eats_start";
  let context: ConversationContext = { ...conversation?.context };
  const result = (nextState: EatsState, reply: string, status: FlowResult["status"] = "active", data = context): FlowResult => ({
    state: nextState, reply: textReply(reply), status, context: data, vertical: "eats", originalText: text,
  });
  const requireSession = () => {
    if (!session) throw new Error("Eats ordering requires business and customer context");
    return session;
  };
  const existingOrder = async (): Promise<Order | null> => {
    if (typeof context.orderId !== "string") return null;
    const key = requireSession();
    const order = await getOrder(context.orderId);
    if (!order) throw new Error("Eats order not found");
    if (order.businessId !== key.businessId || order.customerPhone !== key.customerPhone || order.vertical !== "eats") {
      throw new Error("Eats order does not match customer and business");
    }
    return order;
  };
  const orderIsPaid = async (order: Order | null): Promise<boolean> => {
    if (!order) return false;
    if (order.status === "paid") return true;
    if (!order.paymentId) return false;
    const payment = await getPayment(order.paymentId);
    if (!payment || payment.referenceType !== "order" || payment.referenceId !== order.id ||
        payment.businessId !== order.businessId || payment.customerPhone !== order.customerPhone || payment.amount !== order.total) {
      throw new Error("Eats payment does not match order");
    }
    if (payment.status !== "paid") return false;
    await setOrderStatus({ orderId: order.id, status: "paid" });
    return true;
  };

  // Commands take precedence over state-specific input parsing.
  const unfinishedStatuses = ["draft", "pending_confirmation", "awaiting_payment"];
  if (["RESET", "START", "NEW ORDER", "START NEW ORDER", "START A NEW ORDER", "HI", "HELLO"].includes(command)) {
    const order = await existingOrder();
    if (order && unfinishedStatuses.includes(order.status) && !await orderIsPaid(order)) {
      await setOrderStatus({ orderId: order.id, status: "cancelled" });
    }
    if (session) await resetConversation(session);
    return result("eats_start", welcome, "active", {});
  }
  if (conversation?.status === "cancelled" && command !== "CANCEL") {
    if (session) conversation = await resetConversation(session);
    else conversation = undefined;
    state = "eats_start";
    context = {};
  }
  if ((state === "eats_completed" && conversation?.status !== "cancelled") || conversation?.status === "completed") {
    return result("eats_completed", "Your order is complete. Reply RESET to start a new order.", "completed");
  }
  if (command === "CANCEL") {
    const order = await existingOrder();
    if ((order && !unfinishedStatuses.includes(order.status) && order.status !== "cancelled") || await orderIsPaid(order)) {
      return result("eats_completed", "Your order is complete. Reply RESET to start a new order.", "completed");
    }
    if (order && unfinishedStatuses.includes(order.status)) await setOrderStatus({ orderId: order.id, status: "cancelled" });
    if (session) await resetConversation(session);
    return result("eats_completed", "Your order has been cancelled.", "cancelled", {});
  }

  if (state === "eats_awaiting_payment") {
    const order = await existingOrder();
    if (await orderIsPaid(order)) {
      return result("eats_completed", "Payment received. Thank you for your order!", "completed");
    }
    return result("eats_awaiting_payment", paymentReply, "waiting_payment");
  }

  if (state === "eats_awaiting_confirmation") {
    const order = await existingOrder();
    if (!order || !order.location || order.items.length === 0 || order.total <= 0) throw new Error("Eats order is not ready for confirmation");
    if (!Object.keys(menu).length) return result("eats_awaiting_item", missingCatalogReply, "waiting_customer");
    if (!itemName(String(context.itemName ?? ""))) return result("eats_awaiting_item", "That item is no longer available. Reply RESET to start again.", "waiting_customer");
    if (command !== "CONFIRM") return result("eats_awaiting_confirmation", orderSummary(order), "waiting_customer");
    // Reuse the linked placeholder on repeated confirmation/retry.
    const payment = order.paymentId ? await getPayment(order.paymentId) : await createPendingPayment({
      ...requireSession(), amount: order.total, referenceType: "order", referenceId: order.id,
      idempotencyKey: `eats-order:${order.id}`,
    });
    if (!payment || payment.businessId !== order.businessId || payment.customerPhone !== order.customerPhone ||
        payment.referenceType !== "order" || payment.referenceId !== order.id || payment.amount !== order.total) {
      throw new Error("Eats payment does not match order");
    }
    await updateOrder({ orderId: order.id, data: { paymentId: payment.id, status: "awaiting_payment" } });
    return result("eats_awaiting_payment", paymentReply, "waiting_payment");
  }

  if (!Object.keys(menu).length) return result("eats_awaiting_item", missingCatalogReply, "waiting_customer");

  let selectedItem = typeof context.itemName === "string" ? itemName(context.itemName) : null;
  let quantity = typeof context.quantity === "number" ? context.quantity : null;
  if (state !== "eats_awaiting_location") {
    if (/^(HI|HELLO|HEY|START|MENU)$/.test(command) || command === "") return result("eats_awaiting_item", welcome, "waiting_customer");
    if (state === "eats_awaiting_quantity" && /^[-+]?\d+(?:\.\d+)?$/.test(text.trim())) {
      quantity = Number(text.trim());
    } else {
      const match = text.trim().match(/^([-+]?\d+(?:\.\d+)?)\s+(.+)$/);
      selectedItem = itemName(match ? match[2] : text);
      quantity = match ? Number(match[1]) : null;
    }
    if (!selectedItem) {
      return result("eats_awaiting_item", unknownItemReply, "waiting_customer", { ...context, itemName: null, quantity: null });
    }
    context.itemName = selectedItem;
    context.quantity = quantity;
    if (quantity === null) return result("eats_awaiting_quantity", "How many would you like?", "waiting_customer");
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity * menu[selectedItem].price > Number.MAX_SAFE_INTEGER / 100) {
      context.quantity = null;
      return result("eats_awaiting_quantity", quantityReply, "waiting_customer");
    }
  }

  if (!selectedItem || quantity === null || !Number.isSafeInteger(quantity) || quantity <= 0) {
    return result("eats_awaiting_item", welcome, "waiting_customer");
  }
  const key = requireSession();
  let order = await existingOrder() ?? await createDraftOrder({ ...key, vertical: "eats" });
  if (!["draft", "pending_confirmation"].includes(order.status)) throw new Error("Eats order is no longer editable");
  // Replacement rather than addition makes reprocessing an item selection safe.
  order = await updateOrder({ orderId: order.id, data: {
    items: [{ id: selectedItem, name: menu[selectedItem].name, quantity, unitPrice: menu[selectedItem].price }],
    deliveryFee: 0, discount: 0,
  } });
  context.orderId = order.id;
  context.total = order.total;
  const providedLocation = locationInput(context.location);
  const location = providedLocation
    ? await saveCustomerLocation({ ...key, location: providedLocation })
    : await getCustomerLocation(key);
  if (!location) {
    context.location = null;
    return result("eats_awaiting_location", "Please share your delivery location.", "waiting_customer");
  }
  order = await updateOrder({ orderId: order.id, data: { location, deliveryFee: 0, status: "pending_confirmation" } });
  context.location = jsonLocation(location);
  context.total = order.total;
  return result("eats_awaiting_confirmation", orderSummary(order), "waiting_customer");
}
