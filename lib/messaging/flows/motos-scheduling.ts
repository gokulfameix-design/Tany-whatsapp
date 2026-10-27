export const motosTimes = ["10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00"];

export function motosLocalNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)!.value;
  return { date: `${value("year")}-${value("month")}-${value("day")}`, time: `${value("hour")}:${value("minute")}` };
}

export function parseMotosDate(text: string, now = new Date()): string | null {
  const local = motosLocalNow(now);
  const input = text.trim().toLowerCase();
  if (["today", "tomorrow"].includes(input)) {
    const date = new Date(`${local.date}T00:00:00Z`);
    if (input === "tomorrow") date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  }
  const iso = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const slash = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const named = input.match(/^(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(\d{4}))?$/);
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const year = iso ? +iso[1] : slash ? +slash[3] : named?.[3] ? +named[3] : +local.date.slice(0, 4);
  const month = iso ? +iso[2] : slash ? +slash[2] : named ? months.indexOf(named[2].slice(0, 3)) + 1 : 0;
  const day = iso ? +iso[3] : slash ? +slash[1] : named ? +named[1] : 0;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  const normalized = date.toISOString().slice(0, 10);
  return normalized >= local.date ? normalized : null;
}

export function parseMotosTime(text: string): string | null {
  const input = text.trim().toLowerCase();
  const twelve = input.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  const twentyFour = input.match(/^(\d{1,2}):(\d{2})$/);
  const match = twelve ?? twentyFour;
  if (!match) return null;
  const hour = +match[1];
  const minute = +(match[2] ?? 0);
  if (minute > 59 || (twelve ? hour < 1 || hour > 12 : hour > 23)) return null;
  return `${String(twelve ? hour % 12 + (match[3] === "pm" ? 12 : 0) : hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function motosSlotAvailable(date: string, time: string, now = new Date()) {
  const local = motosLocalNow(now);
  return motosTimes.includes(time) && (date > local.date || (date === local.date && time > local.time));
}

export function motosDisplayTime(time: string) {
  const hour = +time.slice(0, 2);
  return `${hour % 12 || 12} ${hour < 12 ? "AM" : "PM"}`;
}
