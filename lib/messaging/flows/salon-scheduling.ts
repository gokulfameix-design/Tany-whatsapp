import type { SalonService, SalonStylistId } from "@/lib/messaging/flows/salon-config";

/** All business date/time calculations are independent of the server timezone. */
export function salonLocalNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => parts.find((entry) => entry.type === type)!.value;
  return { date: `${part("year")}-${part("month")}-${part("day")}`, time: `${part("hour")}:${part("minute")}` };
}

function calendarDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date.toISOString().slice(0, 10) : null;
}

export function parseSalonInput(text: string, now = new Date(), services: Record<string, SalonService> = {}, stylists: Record<string, string> = { any: "Any Stylist" }) {
  const local = salonLocalNow(now);
  let remainder = text.toLowerCase().trim();
  let bookingDate: string | undefined;
  let dateError = false;
  let startTime: string | undefined;
  let timeError = false;
  let stylistId: SalonStylistId | undefined;
  let stylistError = false;
  const consumeDate = (token: string, value: string | null) => {
    remainder = remainder.replace(token, " ");
    if (!value || value < local.date) dateError = true;
    else bookingDate = value;
  };
  const relative = remainder.match(/\b(today|tomorrow)\b/);
  const slash = remainder.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  const iso = remainder.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  const named = remainder.match(/\b(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(\d{4}))?\b/);
  if (relative) {
    const date = new Date(`${local.date}T00:00:00Z`);
    if (relative[1] === "tomorrow") date.setUTCDate(date.getUTCDate() + 1);
    consumeDate(relative[0], date.toISOString().slice(0, 10));
  } else if (slash) consumeDate(slash[0], calendarDate(+slash[3], +slash[2], +slash[1]));
  else if (iso) consumeDate(iso[0], calendarDate(+iso[1], +iso[2], +iso[3]));
  else if (named) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    consumeDate(named[0], calendarDate(named[3] ? +named[3] : +local.date.slice(0, 4), months.indexOf(named[2].slice(0, 3)) + 1, +named[1]));
  }

  const twelveHour = remainder.match(/\b(\d{1,2})(?::(\d{1,2}))?\s*(am|pm)\b/);
  const twentyFourHour = remainder.match(/\b(\d{1,2}):(\d{2})\b/);
  const time = twelveHour ?? twentyFourHour;
  if (time) {
    const hour = +time[1];
    const minute = +(time[2] ?? 0);
    if (minute > 59 || (twelveHour ? hour < 1 || hour > 12 : hour > 23)) timeError = true;
    else {
      const normalizedHour = twelveHour ? hour % 12 + (time[3] === "pm" ? 12 : 0) : hour;
      startTime = `${String(normalizedHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
    remainder = remainder.replace(time[0], " ");
  }
  const stylist = remainder.match(/\bwith\s+(.+)$/);
  const standaloneStylist = Object.entries(stylists).find(([, name]) => name.toLowerCase() === remainder.trim());
  if (stylist || standaloneStylist) {
    stylistId = stylist ? Object.entries(stylists).find(([, name]) => name.toLowerCase() === stylist[1].trim())?.[0] : standaloneStylist?.[0];
    stylistError = !stylistId;
    remainder = stylist ? remainder.replace(stylist[0], " ") : "";
  }
  const normalized = ` ${remainder.replace(/\s+/g, " ").trim()} `;
  const serviceId = Object.entries(services).flatMap(([id, service]) => [service.name, ...service.aliases].map((alias) => ({ id, alias: alias.toLowerCase() })))
    .sort((a, b) => b.alias.length - a.alias.length).find(({ alias }) => normalized.includes(` ${alias} `))?.id;
  return { serviceId, bookingDate, startTime, stylistId, dateError, timeError, stylistError };
}

export function isPastSalonSlot(date: string, time: string, now = new Date()): boolean {
  const local = salonLocalNow(now);
  return date < local.date || (date === local.date && time <= local.time);
}

/** Placeholder slot policy: the entire service must fit before closing. */
export function salonAvailability(startTime: string, durationMinutes: number): { available: boolean; endTime: string } {
  const [hour, minute] = startTime.split(":").map(Number);
  const start = hour * 60 + minute;
  const end = start + durationMinutes;
  return {
    available: /^\d{2}:\d{2}$/.test(startTime) && Number.isInteger(start) && minute < 60 && hour < 24 && durationMinutes > 0 && start >= 9 * 60 && end <= 20 * 60,
    endTime: `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`,
  };
}

export function formatSalonTime(time: string): string {
  const [hour, minute] = time.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}
