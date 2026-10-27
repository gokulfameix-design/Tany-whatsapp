export function businessNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}
export function parseDate(text: string, now: Date): string | null {
  const local = businessNow(now);
  const input = text.trim().toLowerCase();
  if (input === "today" || input === "tomorrow") {
    const date = new Date(`${local.date}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + (input === "tomorrow" ? 1 : 0));
    return date.toISOString().slice(0, 10);
  }
  const iso = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const slash = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const named = input.match(/^(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?$/);
  const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const monthIndex = named ? months.findIndex((month) => named[2] === month || named[2] === month.slice(0, 3)) : -1;
  const year = iso ? +iso[1] : slash ? +slash[3] : named?.[3] ? +named[3] : +local.date.slice(0, 4);
  const month = iso ? +iso[2] : slash ? +slash[2] : monthIndex + 1;
  const day = iso ? +iso[3] : slash ? +slash[1] : named ? +named[1] : 0;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  const value = date.toISOString().slice(0, 10);
  return value >= local.date ? value : null;
}
export function parseTime(text: string): string | null {
  const ampm = text.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  const match = ampm ?? text.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = +match[1], minute = +(match[2] ?? 0);
  if (minute > 59 || (ampm ? hour < 1 || hour > 12 : hour > 23)) return null;
  return `${String(ampm ? hour % 12 + (match[3].toLowerCase() === "pm" ? 12 : 0) : hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
export const mockSlots = ["10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];
export function slotAvailable(date: string, time: string, minutes: number, now: Date) {
  const local = businessNow(now);
  const [hour, minute] = time.split(":").map(Number);
  return mockSlots.includes(time) && Number.isFinite(minutes) && minutes > 0 && hour * 60 + minute + minutes <= 20 * 60 &&
    (date > local.date || (date === local.date && time > local.time));
}
export function endTime(time: string, minutes: number) {
  const total = +time.slice(0, 2) * 60 + +time.slice(3) + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
