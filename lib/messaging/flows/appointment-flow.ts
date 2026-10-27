import { aliasesFor, loadBusinessData, missingCatalogReply } from "@/lib/messaging/flows/business-data";
import type { FlowContext, FlowResult, IncomingMessageInput } from "@/lib/messaging/types";
import type { Booking } from "@/lib/messaging/domain-types";
import { batchScope, greeting, matchCatalog } from "@/lib/messaging/flows/batch-common";
import { appointmentConfigs, type AppointmentVertical } from "@/lib/messaging/flows/batch-config";
import { businessNow, endTime, mockSlots, parseDate, parseTime, slotAvailable } from "@/lib/messaging/flows/batch-scheduling";
import { buttonReply } from "@/lib/messaging/replies";
import { createDraftBooking, setBookingStatus, updateBooking } from "@/lib/messaging/services/booking-service";

export async function handleAppointmentMessage(v: AppointmentVertical, input: string | IncomingMessageInput, flow?: FlowContext, now = new Date()): Promise<FlowResult> {
  const s = await batchScope(v, input, flow), c = s.context;
  const businessData = await loadBusinessData(flow, v);
  const catalog = businessData.items.filter((item) => item.type === "service" && (v === "garage" || item.price > 0) && typeof item.metadata.durationMinutes === "number" && item.metadata.durationMinutes > 0 && Number.isInteger(item.metadata.durationMinutes)).map((item) => ({
    id: item.id, name: item.name, price: item.price, aliases: aliasesFor(item), metadata: item.metadata,
  }));
  const config = { ...appointmentConfigs[v], catalog };
  const first = v === "garage" ? "vehicle" : config.firstStep;
  const serviceMenu = s.menu(config.firstStep, "Choose a service or type its name. Availability will follow the booking policy.", config.catalog);
  const welcome = !catalog.length ? { type: "text" as const, body: missingCatalogReply } : v === "garage" ? { type: "text" as const, body: "Which vehicle needs service? Please type its make/model." } : serviceMenu;
  const common = await s.common("booking", welcome);
  if (common) return common;
  const summary = (booking: Booking) => s.confirm(`${v === "garage" ? "Service estimate" : "Booking summary"}\n${booking.serviceName}\n${v === "garage" ? `Vehicle: ${booking.resourceName}\n` : ""}${v === "sport" ? `Venue/class: ${booking.resourceName}\n` : ""}Date: ${booking.bookingDate}\nTime: ${booking.startTime} – ${booking.endTime}\nAmount: ₹${booking.amount}`);
  if (s.state === `${v}_awaiting_payment`) {
    const booking = await s.owned("booking") as Booking | null;
    if (!booking) throw new Error("Booking not found");
    if (await s.isPaid(booking)) { await setBookingStatus({ bookingId: booking.id, status: "confirmed" }); return s.result("completed", "Payment received. Your booking is confirmed.", "completed"); }
    return s.result("payment", "Payment is pending. A payment link will be sent shortly.", "waiting_payment");
  }
  if (s.state === `${v}_awaiting_confirmation`) {
    const booking = await s.owned("booking") as Booking | null;
    if (!booking?.bookingDate || !booking.startTime || !booking.endTime) throw new Error("Booking is not ready for confirmation");
    if (!catalog.some((item) => item.id === booking.serviceId)) return s.result(first, missingCatalogReply);
    if (!slotAvailable(booking.bookingDate, booking.startTime, Number(booking.metadata.durationMinutes), now)) { c.bookingDate = null; c.startTime = null; return s.result("date", "That slot has passed. Please enter a new date, such as tomorrow."); }
    if (s.command !== "CONFIRM") return s.result("confirmation", summary(booking));
    if (config.payment) {
      const payment = await s.paymentFor(booking);
      await updateBooking({ bookingId: booking.id, data: { status: "awaiting_payment", paymentId: payment.id } });
      return s.result("payment", "Your booking is reserved. Payment link will be sent shortly.", "waiting_payment");
    }
    await setBookingStatus({ bookingId: booking.id, status: "confirmed" });
    return s.result("completed", "Your service booking is confirmed. The amount is an estimate.", "completed");
  }
  if (!catalog.length) return s.result(first, missingCatalogReply);
  if (greeting(s.text) && [ `${v}_start`, `${v}_awaiting_${first}` ].includes(s.state)) return s.result(first, welcome);
  if (v === "garage" && typeof c.vehicle !== "string") {
    if (!s.text || greeting(s.text) || s.text.length > 120) return s.result("vehicle", welcome);
    c.vehicle = s.text; return s.result("service", serviceMenu);
  }
  let item = config.catalog.find((entry) => entry.id === c.serviceId);
  if (!item) {
    const chosen = s.choose(config.firstStep, config.catalog) ?? (!s.selectionId ? matchCatalog(s.text, config.catalog) : undefined);
    item = config.catalog.find((entry) => entry.id === chosen?.id);
    if (!item) return s.result(config.firstStep, serviceMenu);
    c.serviceId = item.id; c.serviceName = item.name;
    if (v === "sport") { c.venueId = String(item.metadata.resourceId ?? item.id); c.venueName = String(item.metadata.resourceName ?? item.name); }
  }
  if (v === "gaming" && typeof c.durationHours !== "number") {
    const choices = [1, 2, 3, 4].map((hour) => ({ id: String(hour), name: `${hour} hour${hour > 1 ? "s" : ""}` }));
    const choice = s.choose("duration", choices);
    const hours = choice ? +choice.id : s.state === "gaming_awaiting_duration" && !s.selectionId ? Number(s.text.replace(/\s*(hours?|hrs?)$/i, "")) : NaN;
    if (!Number.isInteger(hours) || hours < 1 || hours > 4) return s.result("duration", s.menu("duration", "How many hours? Choose 1–4 hours, or type the duration.", choices));
    c.durationHours = hours;
  }
  const minutes = Number(item.metadata.durationMinutes) * (v === "gaming" ? Number(c.durationHours) : 1);
  if (typeof c.bookingDate !== "string" || c.bookingDate < businessNow(now).date) {
    const dateText = s.selectionId === `${v}_date_today` ? "today" : s.selectionId === `${v}_date_tomorrow` ? "tomorrow" : s.text;
    if (s.selectionId === `${v}_date_custom` || s.command === "CHOOSE DATE") return s.result("date", "Please enter your preferred date, for example 25 Oct or 2026-10-25.");
    const date = s.state === `${v}_awaiting_date` ? parseDate(dateText, now) : null;
    if (!date) return s.result("date", buttonReply({ body: "What date would you like? Past or invalid dates are not accepted.", buttons: [{ id: `${v}_date_today`, title: "Today" }, { id: `${v}_date_tomorrow`, title: "Tomorrow" }, { id: `${v}_date_custom`, title: "Choose Date" }] }));
    c.bookingDate = date;
  }
  const validTimes = mockSlots.filter((time) => slotAvailable(c.bookingDate as string, time, minutes, now));
  if (typeof c.startTime !== "string" || !slotAvailable(c.bookingDate, c.startTime, minutes, now)) {
    const alternateDate = s.state === `${v}_awaiting_time` && !s.selectionId ? parseDate(s.text, now) : null;
    if (alternateDate) { c.bookingDate = alternateDate; c.startTime = null; return s.result("time", "Date updated. Please enter a time such as 10:00 or 2 PM."); }
    const selected = s.choose("time", validTimes.map((time) => ({ id: time.replace(":", ""), name: time })));
    const time = selected?.name ?? (s.state === `${v}_awaiting_time` && !s.selectionId ? parseTime(s.text) : null);
    if (!time || !slotAvailable(c.bookingDate, time, minutes, now)) return s.result("time", validTimes.length ? s.menu("time", "What time would you prefer? Mock hours are 10:00–20:00 and the whole session must fit.", validTimes.map((time) => ({ id: time.replace(":", ""), name: time }))) : "No slots remain on this date. Type tomorrow or another date.");
    c.startTime = time;
  }
  const owner = s.requireKey();
  let booking = await s.owned("booking") as Booking | null ?? await createDraftBooking({ ...owner, vertical: v, reuseConversationDraft: true });
  if (!["draft", "pending_confirmation"].includes(booking.status)) throw new Error("Booking is no longer editable");
  booking = await updateBooking({ bookingId: booking.id, data: {
    serviceId: item.id, serviceName: item.name, bookingDate: c.bookingDate, startTime: c.startTime, endTime: endTime(c.startTime, minutes),
    resourceId: v === "garage" ? "customer_vehicle" : v === "sport" ? c.venueId as string : String(item.metadata.resourceId ?? item.id),
    resourceName: v === "garage" ? c.vehicle as string : v === "sport" ? c.venueName as string : String(item.metadata.resourceName ?? item.name),
    amount: item.price * (v === "gaming" ? Number(c.durationHours) : 1), status: "draft", metadata: { durationMinutes: minutes, estimate: v === "garage", resourceType: item.metadata.resourceType ?? null, catalogItemId: item.id },
  } });
  c.bookingId = booking.id; c.amount = booking.amount;
  return s.result("confirmation", summary(booking));
}
