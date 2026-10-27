export type SalonService = { name: string; price: number; durationMinutes: number; aliases: string[]; staffIds: string[] };
export type SalonServiceId = string;
export type SalonStylistId = string;
export function salonWelcomeFor(services: Record<string, SalonService>): string {
  const names = Object.values(services).map((service) => service.name);
  return `Sure. Which service would you like?\n${names.length > 1 ? `${names.slice(0, -1).join(", ")}, or ${names.at(-1)}` : names[0] ?? ""}.`;
}
export const salonHoursReply = "That time is outside our available hours. Please choose a time between 9:00 AM and 8:00 PM.";
