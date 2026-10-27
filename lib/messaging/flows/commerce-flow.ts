import { aliasesFor, loadBusinessData, missingCatalogReply, stringList } from "@/lib/messaging/flows/business-data";
import type { FlowContext, FlowResult, IncomingMessageInput } from "@/lib/messaging/types";
import type { Order, LocationData } from "@/lib/messaging/domain-types";
import { batchScope, greeting, matchCatalog } from "@/lib/messaging/flows/batch-common";
import { commerceConfigs, type CommerceVertical } from "@/lib/messaging/flows/batch-config";
import { createDraftOrder, updateOrder, setOrderStatus } from "@/lib/messaging/services/order-service";
import { getCustomerLocation, saveCustomerLocation } from "@/lib/messaging/services/location-service";

const medicineSafety = "Please upload a valid prescription or consult a licensed doctor/pharmacist.";
function quantityInput(text: string, weight: boolean): number | null {
  const match = text.match(weight ? /^(\d+(?:\.\d+)?)\s*(kg|g)?(?:\s|$)/i : /^(\d+)(?:\s|$)/);
  if (!match) return null;
  return +match[1] / (weight && match[2]?.toLowerCase() === "g" ? 1000 : 1);
}
const locationJson = (location: LocationData) => ({ latitude: location.latitude, longitude: location.longitude, address: location.address, label: location.label, source: location.source });

export async function handleCommerceMessage(v: CommerceVertical, input: string | IncomingMessageInput, flow?: FlowContext): Promise<FlowResult> {
  const s = await batchScope(v, input, flow);
  const businessData = await loadBusinessData(flow, v);
  const catalog = businessData.items.filter((item) => item.type === (v === "ecom" ? "category" : "product") && (v === "ecom" || item.price > 0) && (v !== "meds" || (item.metadata.otc === true && item.metadata.requiresPrescription !== true))).map((item) => ({
    id: item.id, name: item.name, price: item.price, aliases: aliasesFor(item), variants: stringList(item.metadata.variants).length ? stringList(item.metadata.variants) : undefined, metadata: item.metadata,
  }));
  const config = { ...commerceConfigs[v], catalog };
  const quoteSettings = businessData.config?.settings.quoteSettings;
  const quote = quoteSettings && typeof quoteSettings === "object" && !Array.isArray(quoteSettings) ? quoteSettings : {};
  const maxBudget = typeof quote.maxBudgetPerItem === "number" && quote.maxBudgetPerItem > 0 ? Math.min(quote.maxBudgetPerItem, 1000000) : 1000000;
  const quantityLimit = v === "meat" ? 1000 : v === "ecom" && typeof quote.maxQuantity === "number" && Number.isInteger(quote.maxQuantity) && quote.maxQuantity > 0 ? Math.min(quote.maxQuantity, 10000) : 10000;
  const c = s.context;
  const first = config.firstStep;
  const welcome = catalog.length ? s.menu(first, v === "ecom" ? "Choose a category or describe your quantity and per-item budget for a quotation estimate." : "Which product would you like? Choose an item or type its name.", config.catalog) : { type: "text" as const, body: missingCatalogReply };
  const common = await s.common("order", welcome);
  if (common) return common;
  if (v === "meds" && !catalog.length && businessData.items.some((item) => item.metadata.requiresPrescription === true)) return s.result("prescription", medicineSafety);
  if (!catalog.length && ![`${v}_awaiting_payment`, `${v}_awaiting_confirmation`].includes(s.state)) return s.result(first, missingCatalogReply);
  if (v === "meds" && s.state === "meds_awaiting_prescription" && !s.text && !s.selectionId) return s.result("prescription", medicineSafety);
  if (v === "meds" && s.text && !["CONFIRM"].includes(s.command) && !greeting(s.text)) {
    const clinical = /\b(dose|dosage|diagnos\w*|recommend\w*|prescri\w*|antibiotic\w*|symptom\w*|fever|headache|pain|pregnan\w*|baby|child|treat\w*|should|cure|mg|insulin|amoxicillin|how|take)\b/i.test(s.text);
    const productStage = ["meds_start", "meds_awaiting_product", "meds_awaiting_prescription"].includes(s.state);
    const exactOTC = catalog.some((item) => item.aliases.includes(s.text.replace(/^\d+\s+/, "").toLowerCase()));
    const neutral = exactOTC || /^[-+]?\d+(?:\.\d+)?$/.test(s.text) || /^(status|paid|pending|repeat)$/i.test(s.text);
    if (clinical || (productStage && !exactOTC) || !neutral) return s.result(s.state === "meds_awaiting_payment" ? "payment" : s.state === "meds_awaiting_confirmation" ? "confirmation" : "prescription", medicineSafety, s.state === "meds_awaiting_payment" ? "waiting_payment" : "waiting_customer");
  }
  if (s.state === `${v}_awaiting_payment`) {
    const order = await s.owned("order") as Order | null;
    if (!order) throw new Error("Order not found");
    if (await s.isPaid(order)) { await setOrderStatus({ orderId: order.id, status: "paid" }); return s.result("completed", "Payment received. Your order is confirmed.", "completed"); }
    return s.result("payment", "Payment is pending. A payment link will be sent shortly.", "waiting_payment");
  }
  if (s.state === `${v}_awaiting_confirmation`) {
    const order = await s.owned("order") as Order | null;
    if (!order || !order.items.length || order.total <= 0 || (config.location && !order.location)) throw new Error("Order is not ready for confirmation");
    if (!catalog.length) return s.result(first, missingCatalogReply);
    if (!catalog.some((item) => item.id === c.productId)) return s.result(first, "That item is no longer available. Reply RESET to start again.");
    const currentItem = catalog.find((item) => item.id === c.productId)!;
    if (typeof currentItem.metadata.stock === "number" && order.items[0].quantity > currentItem.metadata.stock) {
      c.quantity = null;
      return s.result("quantity", "Stock has changed. Please choose a lower quantity.");
    }
    if (s.command !== "CONFIRM") return s.result("confirmation", s.confirm(`${v === "ecom" ? "Quotation estimate" : "Order summary"}: ${order.items[0].quantity} × ${order.items[0].name}\nTotal: ₹${order.total}`));
    const payment = await s.paymentFor(order);
    await updateOrder({ orderId: order.id, data: { status: "awaiting_payment", paymentId: payment.id } });
    return s.result("payment", "Your request is confirmed. Payment link will be sent shortly.", "waiting_payment");
  }
  if (greeting(s.text) && [ `${v}_start`, `${v}_awaiting_${first}` ].includes(s.state)) return s.result(first, welcome);
  let item = config.catalog.find((entry) => entry.id === c.productId);
  if (!item || s.state === `${v}_awaiting_prescription`) {
    const selected = s.choose(first, config.catalog) ?? (!s.selectionId ? matchCatalog(s.text, config.catalog) : undefined);
    item = config.catalog.find((entry) => entry.id === selected?.id);
    if (!item) return v === "meds" && s.text ? s.result("prescription", medicineSafety) : s.result(first, welcome);
    if (c.productId !== undefined && c.productId !== item.id) { c.quantity = null; c.variant = null; c.cutType = null; }
    c.productId = item.id; c.itemName = item.name;
    if (v === "ecom") c.category = item.id;
    const leading = quantityInput(s.text, v === "meat");
    if (leading !== null) c.quantity = leading;
    const budget = s.text.match(/(?:under|below|budget(?:\s+of)?)\s*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)/i);
    if (v === "ecom" && budget) c.budgetPerItem = +budget[1];
    const variant = item.variants?.find((entry) => s.text.toLowerCase().includes(entry.toLowerCase()));
    if (variant) c.variant = variant;
  }
  const variantStep = v === "meat" ? "cut" : "variant";
  if (item.variants && typeof c.variant !== "string") {
    const choices = item.variants.map((name, i) => ({ id: String(i + 1), name }));
    const selected = s.choose(variantStep, choices);
    if (!selected) return s.result(variantStep, s.menu(variantStep, `Choose ${v === "meat" ? "a cut type" : "size/color"}. You can also type the option.`, choices));
    c.variant = selected.name;
    if (v === "meat") c.cutType = selected.name;
  }
  if (typeof c.quantity !== "number") {
    const quantity = s.state === `${v}_awaiting_quantity` && !s.selectionId ? quantityInput(s.text, v === "meat") : null;
    if (quantity === null || !Number.isFinite(quantity) || quantity <= 0 || quantity > (v === "meat" ? 1000 : 10000) || (v !== "meat" && !Number.isSafeInteger(quantity))) {
      return s.result("quantity", v === "meat" ? "What weight would you like? Type a positive weight, for example 1 kg or 500g." : v === "meds" ? `Catalog availability: ${item.name} is listed as available. How many units would you like? This is not dosage advice.` : "How many would you like? Enter a positive whole number.");
    }
    c.quantity = quantity;
  }
  if (!Number.isFinite(c.quantity) || c.quantity <= 0 || c.quantity > (v === "meat" ? 1000 : 10000) || (v !== "meat" && !Number.isSafeInteger(c.quantity))) {
    c.quantity = null; return s.result("quantity", "Please enter a valid positive quantity.");
  }
  if (v === "ecom" && (typeof c.budgetPerItem !== "number" || !Number.isFinite(c.budgetPerItem) || c.budgetPerItem <= 0 || c.budgetPerItem > maxBudget)) {
    const budget = s.state === "ecom_awaiting_budget" && !s.selectionId ? Number(s.text.replace(/^(?:₹|rs\.?|inr)\s*/i, "")) : NaN;
    if (!Number.isFinite(budget) || budget <= 0 || budget > maxBudget) return s.result("budget", "What is your budget per item in INR? This will be an estimate, subject to supplier approval.");
    c.budgetPerItem = budget;
  }
  const owner = s.requireKey();
  if (c.quantity > quantityLimit || (typeof item.metadata.stock === "number" && c.quantity > item.metadata.stock)) {
    c.quantity = null;
    return s.result("quantity", "That quantity exceeds this business's configured limit or stock. Please choose a lower quantity.");
  }
  let order = await s.owned("order") as Order | null ?? await createDraftOrder({ ...owner, vertical: v, reuseConversationDraft: true });
  if (!["draft", "pending_confirmation"].includes(order.status)) throw new Error("Order is no longer editable");
  const multiplier = typeof quote.estimateMultiplier === "number" && quote.estimateMultiplier > 0 && quote.estimateMultiplier <= 1 ? quote.estimateMultiplier : 1;
  const unitPrice = v === "ecom" ? (quote.priceMode === "catalog" ? item.price : (c.budgetPerItem as number) * multiplier) : item.price;
  const name = `${item.name}${typeof c.variant === "string" ? ` (${c.variant})` : ""}${v === "meat" ? " per kg" : ""}`;
  order = await updateOrder({ orderId: order.id, data: { items: [{ id: item.id, name, quantity: c.quantity, unitPrice, metadata: { variant: c.variant ?? null, quotation: v === "ecom", category: c.category ?? null } }], deliveryFee: 0, discount: 0 } });
  c.orderId = order.id; c.total = order.total;
  if (v === "ecom") { c.quoteId = order.id; c.estimatedTotal = order.total; }
  if (config.location) {
    const location = s.input.location ? await saveCustomerLocation({ ...owner, location: s.input.location }) : await getCustomerLocation(owner);
    if (!location) return s.result("location", "Please share your delivery location.");
    c.location = locationJson(location);
    order = await updateOrder({ orderId: order.id, data: { location } });
  }
  await updateOrder({ orderId: order.id, data: { status: "pending_confirmation" } });
  return s.result("confirmation", s.confirm(`${v === "ecom" ? "Quotation estimate (budget-based, subject to supplier approval)" : "Order summary"}\n${order.items[0].quantity} × ${name}\nTotal: ₹${order.total}${v === "meds" ? "\nOTC availability only; pharmacist verification required." : ""}`));
}
