import { aliasesFor, loadBusinessData, missingCatalogReply, stringList } from "@/lib/messaging/flows/business-data";
import type { Booking, ConversationContext } from "@/lib/messaging/domain-types";
import type { FlowContext, FlowResult, IncomingMessageInput } from "@/lib/messaging/types";
import { textReply } from "@/lib/messaging/replies";
import { salonSelectionText, salonStepReply } from "@/lib/messaging/flows/salon-replies";
import { clearConversationContext, mergeConversationContext } from "@/lib/messaging/context";
import { getOrCreateConversation, resetConversation } from "@/lib/messaging/services/conversation-service";
import { createDraftBooking, getBooking, setBookingStatus, updateBooking } from "@/lib/messaging/services/booking-service";
import { createPendingPayment, getPayment } from "@/lib/messaging/services/payment-service";
import { salonWelcomeFor, salonHoursReply, type SalonService, type SalonServiceId, type SalonStylistId } from "@/lib/messaging/flows/salon-config";
import { formatSalonTime, isPastSalonSlot, parseSalonInput, salonAvailability, salonLocalNow } from "@/lib/messaging/flows/salon-scheduling";

export type SalonState = "salon_start" | "salon_awaiting_service" | "salon_awaiting_date" | "salon_awaiting_time" |
  "salon_awaiting_stylist" | "salon_awaiting_confirmation" | "salon_awaiting_payment" | "salon_completed";
const paymentReply = "Your appointment is reserved. Payment link will be sent shortly.";

function summary(booking: Booking): string {
  return `Booking summary:\n${booking.serviceName}\nDate: ${booking.bookingDate}\nTime: ${formatSalonTime(booking.startTime!)}\nStylist: ${booking.staffName}\nAmount: ₹${booking.amount}\n\nReply CONFIRM to continue.`;
}

export async function handleSalonMessage(input: string | IncomingMessageInput, flowContext?: FlowContext, now = new Date()): Promise<FlowResult> {
  const data = await loadBusinessData(flowContext, "salon");
  const salonServices: Record<string, SalonService> = Object.fromEntries(data.items.filter((item) => item.type === "service" && item.price > 0 && typeof item.metadata.durationMinutes === "number" && Number.isInteger(item.metadata.durationMinutes) && item.metadata.durationMinutes > 0).map((item) => [item.id, {
    name: item.name, price: item.price, durationMinutes: item.metadata.durationMinutes as number, aliases: aliasesFor(item), staffIds: stringList(item.metadata.staffIds),
  }]));
  const staff = data.config?.settings.staff;
  const salonStylists: Record<string, string> = { any: "Any Stylist", ...(staff && typeof staff === "object" && !Array.isArray(staff) ? Object.fromEntries(Object.entries(staff).filter((entry): entry is [string, string] => typeof entry[1] === "string")) : {}) };
  const staffForService = (id: unknown) => {
    const allowed = typeof id === "string" ? salonServices[id]?.staffIds : undefined;
    return Object.fromEntries(Object.entries(salonStylists).filter(([key]) => key === "any" || !allowed?.length || allowed.includes(key)));
  };
  const salonWelcome = Object.keys(salonServices).length ? salonWelcomeFor(salonServices) : missingCatalogReply;
  const business = flowContext?.business;
  let conversation = flowContext?.conversation;
  const customerPhone = flowContext?.customerPhone ?? conversation?.customerPhone;
  const key = business && customerPhone ? { businessId: business.id, customerPhone } : null;
  if (business && business.vertical !== "salon") throw new Error("Salon flow requires a Salon business");
  if (conversation && key && (conversation.businessId !== key.businessId || conversation.customerPhone !== key.customerPhone || conversation.vertical !== "salon")) {
    throw new Error("Salon conversation does not match customer and business");
  }
  if (!conversation && key) conversation = await getOrCreateConversation({ ...key, vertical: "salon" });
  const state = conversation?.state ?? "salon_start";
  const incoming = typeof input === "string" ? { type: "text" as const, text: input } : input;
  const selectedText = salonSelectionText(incoming, state, salonServices, staffForService(conversation?.context?.serviceId));
  const text = selectedText ?? "";
  const command = text.trim().toUpperCase();
  const context: ConversationContext = mergeConversationContext({}, conversation?.context ?? {});
  const result = (next: SalonState, reply: string, status: FlowResult["status"] = "waiting_customer", data = context): FlowResult => ({
    state: next, reply: salonStepReply(next, reply, data, now, salonServices, staffForService(data.serviceId)), status, context: data, vertical: "salon", originalText: incoming.text,
  });
  const requireKey = () => {
    if (!key) throw new Error("Salon booking requires business and customer context");
    return key;
  };
  const existingBooking = async (): Promise<Booking | null> => {
    if (typeof context.bookingId !== "string") return null;
    const owner = requireKey();
    const booking = await getBooking(context.bookingId);
    if (!booking) throw new Error("Salon booking not found");
    if (booking.businessId !== owner.businessId || booking.customerPhone !== owner.customerPhone || booking.vertical !== "salon") throw new Error("Salon booking does not match customer and business");
    return booking;
  };
  const isSettled = async (booking: Booking | null): Promise<boolean> => {
    if (!booking) return false;
    if (["paid", "confirmed", "completed"].includes(booking.status)) return true;
    if (!booking.paymentId) return false;
    const payment = await getPayment(booking.paymentId);
    if (!payment || payment.referenceType !== "booking" || payment.referenceId !== booking.id || payment.businessId !== booking.businessId ||
        payment.customerPhone !== booking.customerPhone || payment.amount !== booking.amount) throw new Error("Salon payment does not match booking");
    if (payment.status !== "paid") return false;
    await setBookingStatus({ bookingId: booking.id, status: "confirmed" });
    return true;
  };
  if (command === "RESET") {
    const booking = await existingBooking();
    if (booking && !await isSettled(booking) && ["draft", "pending_confirmation", "awaiting_payment"].includes(booking.status)) await setBookingStatus({ bookingId: booking.id, status: "cancelled" });
    if (key) await resetConversation(key);
    return result("salon_start", salonWelcome, "active", clearConversationContext());
  }
  if (conversation?.status === "cancelled") return result("salon_completed", "Your appointment has been cancelled.", "cancelled");
  if (state === "salon_completed" || conversation?.status === "completed") return result("salon_completed", "Your appointment is confirmed. Reply RESET to book again.", "completed");
  if (selectedText === null) {
    return result(state as SalonState, "That selection is no longer available. Please use the current options or type your response.");
  }
  if ((command === "CUSTOM_DATE" && incoming.selectionId === "salon_date_custom") || (command === "CHOOSE DATE" && state === "salon_awaiting_date")) {
    return { ...result("salon_awaiting_date", "Please enter your preferred date, for example 25 Oct."), reply: textReply("Please enter your preferred date, for example 25 Oct.") };
  }
  if (command === "CANCEL") {
    const booking = await existingBooking();
    if (await isSettled(booking)) return result("salon_completed", "Your appointment is confirmed. Reply RESET to book again.", "completed");
    if (booking && booking.status !== "cancelled") await setBookingStatus({ bookingId: booking.id, status: "cancelled" });
    return result("salon_completed", "Your appointment has been cancelled.", "cancelled");
  }
  if (state === "salon_awaiting_payment") {
    const booking = await existingBooking();
    if (await isSettled(booking)) {
      if (booking?.status === "paid") await setBookingStatus({ bookingId: booking.id, status: "confirmed" });
      return result("salon_completed", "Payment received. Your appointment is confirmed.", "completed");
    }
    return result("salon_awaiting_payment", paymentReply, "waiting_payment");
  }
  if (state === "salon_awaiting_confirmation") {
    const booking = await existingBooking();
    if (!booking?.bookingDate || !booking.startTime || !booking.serviceId || booking.amount <= 0) throw new Error("Salon booking is not ready for confirmation");
    if (!salonServices[booking.serviceId]) return { ...result("salon_awaiting_service", missingCatalogReply), reply: textReply(missingCatalogReply) };
    if (isPastSalonSlot(booking.bookingDate, booking.startTime, now)) {
      context.bookingDate = null; context.startTime = null;
      return result("salon_awaiting_date", "That date or time has already passed. What date would you like to book?");
    }
    if (command !== "CONFIRM") return result("salon_awaiting_confirmation", summary(booking));
    const payment = booking.paymentId ? await getPayment(booking.paymentId) : await createPendingPayment({
      ...requireKey(), amount: booking.amount, referenceType: "booking", referenceId: booking.id, idempotencyKey: `salon-booking:${booking.id}`,
    });
    if (!payment || payment.referenceType !== "booking" || payment.referenceId !== booking.id || payment.amount !== booking.amount ||
        payment.businessId !== booking.businessId || payment.customerPhone !== booking.customerPhone) throw new Error("Salon payment does not match booking");
    await updateBooking({ bookingId: booking.id, data: { status: "awaiting_payment", paymentId: payment.id } });
    context.paymentId = payment.id;
    return result("salon_awaiting_payment", paymentReply, "waiting_payment");
  }
  if (!Object.keys(salonServices).length) return { ...result("salon_awaiting_service", missingCatalogReply), reply: textReply(missingCatalogReply) };
  if (/^(HI|HELLO|HEY|START|MENU|BOOK APPOINTMENT)$/.test(command) || !command) return result("salon_awaiting_service", salonWelcome);
  const parsed = parseSalonInput(text, now, salonServices, salonStylists);
  if (parsed.serviceId) {
    const service = salonServices[parsed.serviceId];
    Object.assign(context, { serviceId: parsed.serviceId, serviceName: service.name, price: service.price, durationMinutes: service.durationMinutes });
  }
  if (parsed.bookingDate) context.bookingDate = parsed.bookingDate;
  if (parsed.startTime) context.startTime = parsed.startTime;
  if (parsed.stylistId) { context.stylistId = parsed.stylistId; context.stylistName = salonStylists[parsed.stylistId]; }
  if (parsed.stylistError) { context.stylistId = null; context.stylistName = null; context.stylistRequested = true; }
  if (parsed.dateError) {
    context.bookingDate = null;
    return result("salon_awaiting_date", "Please choose a valid date today or later. What date would you like to book?");
  }
  const serviceId = context.serviceId as SalonServiceId | undefined;
  if (!serviceId || !Object.prototype.hasOwnProperty.call(salonServices, serviceId)) return result("salon_awaiting_service", salonWelcome);
  Object.assign(context, { serviceName: salonServices[serviceId].name, price: salonServices[serviceId].price, durationMinutes: salonServices[serviceId].durationMinutes });
  if (typeof context.bookingDate !== "string" || context.bookingDate < salonLocalNow(now).date) {
    context.bookingDate = null;
    return result("salon_awaiting_date", "What date would you like to book?");
  }
  if (parsed.timeError) { context.startTime = null; return result("salon_awaiting_time", "Please enter a valid time, such as 5pm or 17:00."); }
  if (typeof context.startTime !== "string") return result("salon_awaiting_time", "What time would you prefer?");
  const slot = salonAvailability(context.startTime, salonServices[serviceId].durationMinutes);
  if (!slot.available) { context.startTime = null; return result("salon_awaiting_time", salonHoursReply); }
  if (isPastSalonSlot(context.bookingDate, context.startTime, now)) { context.startTime = null; return result("salon_awaiting_time", "That time has already passed. What time would you prefer?"); }
  if (context.stylistRequested && !context.stylistId) return result("salon_awaiting_stylist", `Please choose ${Object.values(salonStylists).join(", ")}.`);
  const stylistId = (context.stylistId ?? "any") as SalonStylistId;
  if (!Object.prototype.hasOwnProperty.call(salonStylists, stylistId)) throw new Error("Unknown Salon stylist");
  if (stylistId !== "any" && salonServices[serviceId].staffIds.length && !salonServices[serviceId].staffIds.includes(stylistId)) {
    context.stylistId = null; context.stylistRequested = true;
    return result("salon_awaiting_stylist", "That stylist is not configured for this service. Please choose another stylist.");
  }
  context.stylistId = stylistId; context.stylistName = salonStylists[stylistId];
  const owner = requireKey();
  let booking = await existingBooking();
  if (!booking) {
    booking = await createDraftBooking({ ...owner, vertical: "salon", reuseConversationDraft: true });
    context.bookingId = booking.id;
  }
  if (!["draft", "pending_confirmation"].includes(booking.status)) throw new Error("Salon booking is no longer editable");
  booking = await updateBooking({ bookingId: booking.id, data: {
    serviceId, serviceName: salonServices[serviceId].name, staffId: stylistId, staffName: salonStylists[stylistId],
    bookingDate: context.bookingDate, startTime: context.startTime, endTime: slot.endTime,
    amount: salonServices[serviceId].price, status: "draft", metadata: { durationMinutes: salonServices[serviceId].durationMinutes },
  } });
  context.paymentId = booking.paymentId;
  return result("salon_awaiting_confirmation", summary(booking));
}
