import { buttonReply, listReply, textReply } from "@/lib/messaging/replies";
import type { ConversationContext } from "@/lib/messaging/domain-types";
import type { MessagingReply, IncomingMessageInput } from "@/lib/messaging/types";
import type { SalonService } from "@/lib/messaging/flows/salon-config";
import { formatSalonTime, isPastSalonSlot, salonAvailability } from "@/lib/messaging/flows/salon-scheduling";

const mockTimes = ["10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];

export function salonStepReply(state: string, body: string, context: ConversationContext, now: Date, salonServices: Record<string, SalonService>, salonStylists: Record<string, string>): MessagingReply {
  if (state === "salon_start" || state === "salon_awaiting_service") return listReply({
    body, buttonText: "Choose service", sections: [{ title: "Salon services", rows: Object.entries(salonServices).slice(0, 10).map(([id, service]) => ({
      id: `salon_service_${id}`, title: Array.from(service.name).slice(0, 24).join(""), description: `₹${service.price} · ${service.durationMinutes} minutes`,
    })) }],
  });
  if (state === "salon_awaiting_date") return buttonReply({ body, buttons: [
    { id: "salon_date_today", title: "Today" }, { id: "salon_date_tomorrow", title: "Tomorrow" }, { id: "salon_date_custom", title: "Choose Date" },
  ] });
  if (state === "salon_awaiting_time") {
    const duration = typeof context.durationMinutes === "number" ? context.durationMinutes : 60;
    const rows = mockTimes.filter((time) => salonAvailability(time, duration).available &&
      (typeof context.bookingDate !== "string" || !isPastSalonSlot(context.bookingDate, time, now)))
      .map((time) => ({ id: `salon_time_${time.replace(":", "")}`, title: formatSalonTime(time) }));
    return rows.length ? listReply({ body, buttonText: "Choose time", sections: [{ title: "Available times", rows }] })
      : textReply(`${body}\nNo mock slots remain for this date. Reply tomorrow or enter another date.`);
  }
  if (state === "salon_awaiting_stylist") return buttonReply({ body, buttons: Object.entries(salonStylists).map(([id, title]) => ({ id: `salon_stylist_${id}`, title })) });
  if (state === "salon_awaiting_confirmation") return buttonReply({ body, buttons: [
    { id: "salon_confirm", title: "Confirm" }, { id: "salon_cancel", title: "Cancel" },
  ] });
  return textReply(body);
}

/** IDs are authoritative; arbitrary selection titles cannot execute commands. */
export function salonSelectionText(input: IncomingMessageInput, state: string, salonServices: Record<string, SalonService>, salonStylists: Record<string, string>): string | null {
  if (!input.selectionId) return input.type === "button" || input.type === "list" || input.type === "unsupported" ? null : input.text;
  const id = input.selectionId;
  if (id === "salon_cancel") return "CANCEL";
  if (id === "salon_confirm" && ["salon_awaiting_confirmation", "salon_awaiting_payment"].includes(state)) return "CONFIRM";
  if (state === "salon_start" || state === "salon_awaiting_service") {
    const entry = Object.entries(salonServices).find(([key]) => id === `salon_service_${key}`);
    if (entry) return entry[1].name;
  }
  if (state === "salon_awaiting_date") {
    if (id === "salon_date_today") return "today";
    if (id === "salon_date_tomorrow") return "tomorrow";
    if (id === "salon_date_custom") return "CUSTOM_DATE";
  }
  if (state === "salon_awaiting_time") return mockTimes.find((time) => id === `salon_time_${time.replace(":", "")}`) ?? null;
  if (state === "salon_awaiting_stylist") return Object.entries(salonStylists).find(([key]) => id === `salon_stylist_${key}`)?.[1] ?? null;
  return null;
}
