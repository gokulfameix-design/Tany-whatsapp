import { loadBusinessData, missingCatalogReply } from "@/lib/messaging/flows/business-data";
import type { Booking, ConversationContext } from "@/lib/messaging/domain-types";
import type { FlowContext, FlowResult, IncomingMessageInput, MessagingReply } from "@/lib/messaging/types";
import { clearConversationContext, mergeConversationContext } from "@/lib/messaging/context";
import { buttonReply, listReply, textReply } from "@/lib/messaging/replies";
import { getOrCreateConversation, resetConversation } from "@/lib/messaging/services/conversation-service";
import { createDraftBooking, getBooking, setBookingStatus, updateBooking } from "@/lib/messaging/services/booking-service";
import { searchMotosInventory, vehicleName, vehiclePrice, type MotosVehicle } from "@/lib/messaging/flows/motos-inventory";
import { motosTimes, motosDisplayTime, motosSlotAvailable, parseMotosDate, parseMotosTime } from "@/lib/messaging/flows/motos-scheduling";

export type MotosState = "motos_start" | "motos_awaiting_query" | "motos_showing_results" | "motos_vehicle_selected" |
  "motos_awaiting_testdrive_date" | "motos_awaiting_testdrive_time" | "motos_awaiting_confirmation" | "motos_completed";
export const motosWelcome = "What car are you looking for? You can type model, automatic/manual, or budget.";
const vehicleButtons = [
  { id: "motos_testdrive", title: "Test Drive" }, { id: "motos_call", title: "Call Dealer" }, { id: "motos_details", title: "More Details" },
];
const confirmationButtons = [{ id: "motos_confirm", title: "Confirm" }, { id: "motos_cancel", title: "Cancel" }];
const dateReply = (body = "What date would you like to take a test drive?") => buttonReply({ body, buttons: [
  { id: "motos_date_today", title: "Today" }, { id: "motos_date_tomorrow", title: "Tomorrow" }, { id: "motos_date_custom", title: "Choose Date" },
] });
const vehicleDetails = (vehicle: MotosVehicle) => buttonReply({
  body: `${vehicle.brand} ${vehicle.model}\nYear: ${vehicle.year}\nVariant: ${vehicle.variant}\nTransmission: ${vehicle.transmission}\nPrice: ${vehiclePrice(vehicle)}`,
  buttons: vehicleButtons,
});
function timeReply(date: string, now: Date, body = "What time would you prefer for your test drive?") {
  const rows = motosTimes.filter((time) => motosSlotAvailable(date, time, now)).map((time) => ({ id: `motos_time_${time.replace(":", "")}`, title: motosDisplayTime(time) }));
  return rows.length ? listReply({ body, buttonText: "Choose time", sections: [{ title: "Test drive times", rows }] })
    : textReply("No mock slots remain for this date. Please type tomorrow or another date.");
}
function bookingSummary(booking: Booking) {
  return buttonReply({ body: `Test drive summary:\n${booking.resourceName}\nDate: ${booking.bookingDate}\nTime: ${motosDisplayTime(booking.startTime!)}\n\nReply CONFIRM or CANCEL.`, buttons: confirmationButtons });
}

export async function handleMotosMessage(input: string | IncomingMessageInput, flowContext?: FlowContext, now = new Date()): Promise<FlowResult> {
  const data = await loadBusinessData(flowContext, "motos");
  const motosInventory: MotosVehicle[] = data.items.filter((item) => item.type === "vehicle" && typeof item.metadata.brand === "string" && typeof item.metadata.model === "string" && typeof item.metadata.year === "number" && typeof item.metadata.transmission === "string").map((item) => ({
    id: item.id, name: item.name, brand: item.metadata.brand as string, model: item.metadata.model as string, year: item.metadata.year as number,
    transmission: item.metadata.transmission as string, variant: String(item.metadata.variant ?? ""), bodyType: String(item.metadata.bodyType ?? ""), price: item.price,
  }));
  const incoming = typeof input === "string" ? { type: "text" as const, text: input } : input;
  const business = flowContext?.business;
  let conversation = flowContext?.conversation;
  const phone = flowContext?.customerPhone ?? conversation?.customerPhone;
  const key = business && phone ? { businessId: business.id, customerPhone: phone } : null;
  if (business && business.vertical !== "motos") throw new Error("Motos flow requires a Motos business");
  if (conversation && key && (conversation.businessId !== key.businessId || conversation.customerPhone !== phone || conversation.vertical !== "motos")) throw new Error("Motos conversation does not match customer and business");
  if (!conversation && key) conversation = await getOrCreateConversation({ ...key, vertical: "motos" });
  const state = conversation?.state ?? "motos_start";
  const context: ConversationContext = mergeConversationContext({}, conversation?.context ?? {});
  const result = (next: MotosState, reply: MessagingReply | string, status: FlowResult["status"] = "waiting_customer", data = context): FlowResult => ({
    state: next, reply: typeof reply === "string" ? textReply(reply) : reply, status, context: data, vertical: "motos", originalText: incoming.text,
  });
  const requireKey = () => { if (!key) throw new Error("Motos test drive requires business and customer context"); return key; };
  const existingBooking = async (): Promise<Booking | null> => {
    if (typeof context.bookingId !== "string") return null;
    const owner = requireKey();
    const booking = await getBooking(context.bookingId);
    if (!booking || booking.businessId !== owner.businessId || booking.customerPhone !== owner.customerPhone || booking.vertical !== "motos") throw new Error("Motos booking does not match customer and business");
    return booking;
  };
  const text = incoming.text.trim();
  let command = text.toUpperCase();
  const selection = incoming.selectionId;
  // Never interpret a selection's display title as a command.
  if (selection || incoming.type === "button" || incoming.type === "list" || incoming.type === "unsupported") {
    command = "";
    if (selection === "motos_cancel") command = "CANCEL";
    else if (selection === "motos_confirm" && state === "motos_awaiting_confirmation") command = "CONFIRM";
    else if (state === "motos_vehicle_selected") command = ({ motos_testdrive: "TEST DRIVE", motos_call: "CALL DEALER", motos_details: "MORE DETAILS" } as Record<string, string>)[selection ?? ""] ?? "";
  }
  if (command === "RESET") {
    const booking = await existingBooking();
    if (booking && ["draft", "pending_confirmation", "awaiting_payment"].includes(booking.status)) await setBookingStatus({ bookingId: booking.id, status: "cancelled" });
    if (key) await resetConversation(key);
    return result("motos_start", motosInventory.length ? motosWelcome : missingCatalogReply, "active", clearConversationContext());
  }
  if (conversation?.status === "cancelled") return result("motos_completed", "Your test drive has been cancelled. Reply RESET to start again.", "cancelled");
  if (state === "motos_completed" || conversation?.status === "completed") return result("motos_completed", "Your test drive is confirmed.", "completed");
  if (command === "CANCEL") {
    const booking = await existingBooking();
    if (booking && ["confirmed", "paid", "completed"].includes(booking.status)) return result("motos_completed", "Your test drive is confirmed.", "completed");
    if (booking) await setBookingStatus({ bookingId: booking.id, status: "cancelled" });
    return result("motos_completed", "Your test drive has been cancelled.", "cancelled");
  }
  const vehicle = motosInventory.find((car) => car.id === context.selectedVehicleId);
  if (!motosInventory.length) return result("motos_awaiting_query", missingCatalogReply);
  if (context.selectedVehicleId && !vehicle) return result("motos_awaiting_query", "That vehicle is no longer available. Reply RESET to search again.");
  if (state === "motos_awaiting_confirmation") {
    const booking = await existingBooking();
    if (!booking?.bookingDate || !booking.startTime || !vehicle || booking.resourceId !== vehicle.id) throw new Error("Motos booking is not ready for confirmation");
    if (!motosSlotAvailable(booking.bookingDate, booking.startTime, now)) {
      context.bookingDate = null; context.startTime = null;
      return result("motos_awaiting_testdrive_date", dateReply("That slot has passed. Please choose another date."));
    }
    if (command !== "CONFIRM") return result("motos_awaiting_confirmation", bookingSummary(booking));
    if (!["draft", "pending_confirmation", "confirmed"].includes(booking.status)) throw new Error("Motos booking cannot be confirmed");
    await setBookingStatus({ bookingId: booking.id, status: "confirmed" });
    return result("motos_completed", "Your test drive is confirmed.", "completed");
  }
  if (state === "motos_awaiting_testdrive_date" || state === "motos_awaiting_testdrive_time") {
    if (!vehicle) throw new Error("Motos vehicle is missing");
    if ((selection === "motos_date_custom" && state === "motos_awaiting_testdrive_date") || command === "CHOOSE DATE") return result("motos_awaiting_testdrive_date", "Please enter your preferred date, for example 25 Oct.");
    const dateText = selection === "motos_date_today" ? "today" : selection === "motos_date_tomorrow" ? "tomorrow" : selection ? "" : text;
    const parsedDate = parseMotosDate(dateText, now);
    if (state === "motos_awaiting_testdrive_date" || parsedDate) {
      if (selection && !["motos_date_today", "motos_date_tomorrow"].includes(selection)) return result("motos_awaiting_testdrive_date", dateReply("Please use the current date options or type a date."));
      if (!parsedDate) return result("motos_awaiting_testdrive_date", dateReply("Please choose a valid date today or later."));
      context.bookingDate = parsedDate; context.startTime = null;
      return result("motos_awaiting_testdrive_time", timeReply(parsedDate, now));
    }
    const selectedTime = selection ? motosTimes.find((time) => selection === `motos_time_${time.replace(":", "")}`) : parseMotosTime(text);
    if (typeof context.bookingDate !== "string") return result("motos_awaiting_testdrive_date", dateReply());
    if (!selectedTime || !motosSlotAvailable(context.bookingDate, selectedTime, now)) return result("motos_awaiting_testdrive_time", timeReply(context.bookingDate, now, "Please choose an available time from the list or type it, for example 2 PM."));
    const owner = requireKey();
    let booking = await existingBooking() ?? await createDraftBooking({ ...owner, vertical: "motos", reuseConversationDraft: true });
    if (!["draft", "pending_confirmation"].includes(booking.status)) throw new Error("Motos booking is no longer editable");
    booking = await updateBooking({ bookingId: booking.id, data: {
      serviceId: "test_drive", serviceName: "Test Drive", resourceId: vehicle.id, resourceName: vehicleName(vehicle),
      bookingDate: context.bookingDate, startTime: selectedTime, endTime: `${selectedTime.slice(0, 2)}:30`,
      amount: 0, status: "draft", metadata: { durationMinutes: 30 },
    } });
    context.bookingId = booking.id; context.startTime = selectedTime;
    return result("motos_awaiting_confirmation", bookingSummary(booking));
  }
  if (state === "motos_vehicle_selected" && vehicle) {
    if (command === "TEST DRIVE" || command === "TESTDRIVE") return result("motos_awaiting_testdrive_date", dateReply());
    if (command === "MORE DETAILS" || command === "DETAILS") return result("motos_vehicle_selected", vehicleDetails(vehicle));
    if (command === "CALL DEALER" || command === "CALL") {
      context.dealerContactRequested = true;
      return result("motos_vehicle_selected", buttonReply({ body: "Your interest in speaking with the dealer has been noted. Dealer contact details are not configured yet.", buttons: vehicleButtons }));
    }
  }
  if (state === "motos_showing_results") {
    const matched = motosInventory.filter((car) => Array.isArray(context.matchedVehicleIds) && context.matchedVehicleIds.includes(car.id));
    const selected = matched.find((car, index) => selection ? selection === `motos_car_${car.id}` :
      text.toLowerCase() === car.model.toLowerCase() || text.toLowerCase() === vehicleName(car).toLowerCase() || text === String(index + 1));
    if (selected) {
      context.selectedVehicleId = selected.id;
      return result("motos_vehicle_selected", vehicleDetails(selected));
    }
  }
  if (selection || ["button", "list", "unsupported"].includes(incoming.type)) return result(state as MotosState, "That selection is no longer available. Please use the current options or type your response.");
  if (!motosInventory.length) return result("motos_awaiting_query", missingCatalogReply);
  if (/^(HI|HELLO|HEY|START|MENU)$/.test(command) || !text) return result("motos_awaiting_query", motosWelcome);
  const matches = searchMotosInventory(text, motosInventory);
  Object.assign(context, { query: text, matchedVehicleIds: matches.map((car) => car.id), selectedVehicleId: null });
  if (!matches.length) return result("motos_awaiting_query", "Sorry, no cars match that query. Please try another model, transmission, or budget.");
  return result("motos_showing_results", listReply({
    body: "Here are the matching cars. Choose a car for details, or type its model or list number.", buttonText: "Choose car",
    sections: [{ title: "Matching cars", rows: matches.slice(0, 10).map((car) => ({ id: `motos_car_${car.id}`, title: Array.from(vehicleName(car)).slice(0, 24).join(""), description: Array.from(`${car.variant} · ${car.transmission} · ${vehiclePrice(car)}`).slice(0, 72).join("") })) }],
  }));
}
