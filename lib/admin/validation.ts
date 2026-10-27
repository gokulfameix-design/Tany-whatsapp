import { mergeConversationContext } from "@/lib/messaging/context";
import { isTanyVertical } from "@/lib/messaging/vertical-config";
import type { ConversationContext } from "@/lib/messaging/domain-types";

export class AdminValidationError extends Error {
  constructor(public errors: Record<string, string>) { super(Object.values(errors)[0] ?? "Invalid input"); }
}
export function slugifyBusinessName(name: string) {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/g, "") || "business";
}
export function objectInput(value: unknown, allowed: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AdminValidationError({ form: "Expected an object." });
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new AdminValidationError({ form: "Unexpected fields. Business and item IDs cannot be changed." });
  return value as Record<string, unknown>;
}
export function stringInput(value: unknown, field: string, maximum: number, optional = false) {
  if (typeof value !== "string" || (!optional && !value.trim()) || value.length > maximum) throw new AdminValidationError({ [field]: `${field} must ${optional ? "be text" : "not be empty"} and fit within ${maximum} characters.` });
  return value.trim();
}
export function booleanInput(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new AdminValidationError({ [field]: "Choose a valid on/off value." });
  return value;
}
export function jsonInput(value: unknown, field: string): ConversationContext {
  try {
    const raw = typeof value === "string" ? JSON.parse(value) : value;
    if (JSON.stringify(raw).length > 32000) throw new Error("Too large");
    return mergeConversationContext({}, raw);
  } catch { throw new AdminValidationError({ [field]: "Use a valid JSON object, up to 32 KB, without unsafe keys." }); }
}
export function businessInput(value: unknown, creating: boolean) {
  const data = objectInput(value, ["name", "vertical", "whatsappPhoneNumberId", "active", "settings", ...(creating ? ["businessId"] : [])]);
  const name = stringInput(data.name, "name", 120);
  if (!isTanyVertical(data.vertical)) throw new AdminValidationError({ vertical: "Choose one of the 12 Tany verticals." });
  const phone = stringInput(data.whatsappPhoneNumberId, "whatsappPhoneNumberId", 100);
  if (!/^[A-Za-z0-9_-]+$/.test(phone)) throw new AdminValidationError({ whatsappPhoneNumberId: "Use the phone number ID, with no spaces or slashes." });
  const active = booleanInput(data.active, "active");
  const settings = jsonInput(data.settings ?? {}, "settings");
  if (settings.staff !== undefined && (!settings.staff || typeof settings.staff !== "object" || Array.isArray(settings.staff) || Object.values(settings.staff).some((name) => typeof name !== "string" || !name.trim()))) throw new AdminValidationError({ settings: "staff must map staff IDs to names." });
  if (settings.vehicleTypes !== undefined) {
    if (!Array.isArray(settings.vehicleTypes)) throw new AdminValidationError({ settings: "vehicleTypes must be an array." });
    const ids = new Set<string>();
    for (const vehicle of settings.vehicleTypes) {
      if (!vehicle || typeof vehicle !== "object" || Array.isArray(vehicle) || typeof vehicle.id !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(vehicle.id) || ids.has(vehicle.id) || typeof vehicle.name !== "string" || !vehicle.name.trim() || typeof (vehicle.baseFare ?? vehicle.price) !== "number" || Number(vehicle.baseFare ?? vehicle.price) < 0 || (vehicle.available !== undefined && typeof vehicle.available !== "boolean")) throw new AdminValidationError({ settings: "Each vehicle type needs a unique ID, a name and a non-negative baseFare." });
      ids.add(vehicle.id);
    }
  }
  if (settings.quoteSettings !== undefined) {
    const quote = settings.quoteSettings;
    if (!quote || typeof quote !== "object" || Array.isArray(quote)) throw new AdminValidationError({ settings: "quoteSettings must be an object." });
    for (const key of ["maxQuantity", "maxBudgetPerItem", "estimateMultiplier"]) if (quote[key] !== undefined && (typeof quote[key] !== "number" || quote[key] <= 0)) throw new AdminValidationError({ settings: `${key} must be positive.` });
    if (typeof quote.estimateMultiplier === "number" && quote.estimateMultiplier > 1) throw new AdminValidationError({ settings: "estimateMultiplier must be at most 1." });
    if (quote.maxQuantity !== undefined && !Number.isInteger(quote.maxQuantity)) throw new AdminValidationError({ settings: "maxQuantity must be a whole number." });
    if (quote.priceMode !== undefined && !["budget", "catalog"].includes(String(quote.priceMode))) throw new AdminValidationError({ settings: "priceMode must be budget or catalog." });
  }
  let businessId: string | undefined;
  if (creating) {
    businessId = stringInput(data.businessId, "businessId", 80);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(businessId)) throw new AdminValidationError({ businessId: "Use lowercase letters, numbers and single hyphens." });
  }
  return { businessId, name, vertical: data.vertical, whatsappPhoneNumberId: phone, active, settings };
}
export function catalogInput(value: unknown) {
  const data = objectInput(value, ["name", "type", "category", "description", "price", "available", "metadata"]);
  const name = stringInput(data.name, "name", 160);
  const type = stringInput(data.type, "type", 40);
  if (!["product", "service", "vehicle", "category"].includes(type)) throw new AdminValidationError({ type: "Choose product, service, vehicle or category." });
  const category = data.category === null ? null : stringInput(data.category ?? "", "category", 100, true) || null;
  const description = stringInput(data.description ?? "", "description", 2000, true);
  const price = typeof data.price === "string" && data.price.trim() ? Number(data.price) : data.price;
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0 || price > 1000000000 || Math.abs(price * 100 - Math.round(price * 100)) > 0.00001) throw new AdminValidationError({ price: "Enter a non-negative INR price with up to two decimals." });
  const metadata = jsonInput(data.metadata ?? {}, "metadata");
  // Preserve flexible keys while validating known operational metadata.
  for (const key of ["aliases", "variants", "staffIds"]) if (metadata[key] !== undefined && (!Array.isArray(metadata[key]) || !metadata[key].every((entry) => typeof entry === "string" && entry.trim()))) throw new AdminValidationError({ metadata: `${key} must be an array of non-empty strings.` });
  for (const key of ["stock", "preparationTime"]) if (metadata[key] !== undefined && (typeof metadata[key] !== "number" || metadata[key] < 0)) throw new AdminValidationError({ metadata: `${key} must be a non-negative number.` });
  if (metadata.durationMinutes !== undefined && (typeof metadata.durationMinutes !== "number" || !Number.isInteger(metadata.durationMinutes) || metadata.durationMinutes <= 0 || metadata.durationMinutes > 1440)) throw new AdminValidationError({ metadata: "durationMinutes must be a whole number from 1 to 1440." });
  if (metadata.year !== undefined && (typeof metadata.year !== "number" || !Number.isInteger(metadata.year) || metadata.year < 1886 || metadata.year > new Date().getFullYear() + 2)) throw new AdminValidationError({ metadata: "year must be a valid vehicle year." });
  for (const key of ["brand", "model", "transmission", "bodyType", "variant", "resourceType"]) if (metadata[key] !== undefined && typeof metadata[key] !== "string") throw new AdminValidationError({ metadata: `${key} must be text.` });
  for (const key of ["otcEligible", "prescriptionRequired", "otc", "requiresPrescription", "veg"]) if (metadata[key] !== undefined && typeof metadata[key] !== "boolean") throw new AdminValidationError({ metadata: `${key} must be true or false.` });
  // UI terminology maps to the existing Meds engine's canonical fields.
  if (metadata.otcEligible !== undefined) metadata.otc = metadata.otcEligible;
  if (metadata.prescriptionRequired !== undefined) metadata.requiresPrescription = metadata.prescriptionRequired;
  if (metadata.requiresPrescription === true) { metadata.otc = false; metadata.otcEligible = false; }
  return { name, type, category, description, price, available: booleanInput(data.available, "available"), metadata };
}
