export type MotosVehicle = { id: string; name?: string; brand: string; model: string; year: number; variant: string; transmission: string; price: number; bodyType: string };
export const motosInventory: MotosVehicle[] = [];
export const vehicleName = (vehicle: MotosVehicle) => vehicle.name ?? `${vehicle.brand} ${vehicle.model} ${vehicle.year}`;
export const vehiclePrice = (vehicle: MotosVehicle) => `₹${vehicle.price.toLocaleString("en-IN")}`;

export function searchMotosInventory(query: string, inventory: MotosVehicle[] = []): MotosVehicle[] {
  const text = query.toLowerCase().replaceAll(",", "");
  const words = new Set(text.split(/[^a-z0-9]+/));
  const searchable = ` ${text.replace(/[^a-z0-9]+/g, " ").trim()} `;
  const containsName = (name: string) => searchable.includes(` ${name.replace(/[^a-z0-9]+/g, " ").trim()} `);
  const brands = [...new Set(inventory.map((vehicle) => vehicle.brand.toLowerCase()))].filter(containsName);
  const models = inventory.map((vehicle) => vehicle.model.toLowerCase()).filter(containsName);
  const automatic = words.has("automatic");
  const manual = words.has("manual");
  const bodyType = words.has("suv") ? "suv" : words.has("hatchback") ? "hatchback" : words.has("sedan") ? "sedan" : null;
  const budget = text.match(/\b(?:under|below|up\s*to|max(?:imum)?|budget(?:\s+of)?)\s*(?:rs\.?|inr|₹)?\s*(\d+(?:\.\d+)?)\s*(lakhs?|lacs?|l|crores?|cr|k)?\b/);
  const unit = budget?.[2] ?? "";
  const maxPrice = budget ? Number(budget[1]) * (/^(l|lac|lakh)/.test(unit) ? 100000 : /^(cr)/.test(unit) ? 10000000 : unit === "k" ? 1000 : 1) : null;
  if (maxPrice !== null && (!Number.isFinite(maxPrice) || maxPrice <= 0)) return [];
  if (/\b(under|below|budget|maximum|max)\b/.test(text) && !budget) return [];
  const recognized = brands.length || models.length || automatic || manual || bodyType || budget;
  if (!recognized && !/^(?:(?:show|all|available|me)\s+)*(?:cars|vehicles)(?:\s+(?:please|available))?\??$/.test(text.trim())) return [];
  return inventory.filter((vehicle) =>
    (!brands.length || brands.includes(vehicle.brand.toLowerCase())) &&
    (!models.length || models.includes(vehicle.model.toLowerCase())) &&
    (automatic === manual || vehicle.transmission.toLowerCase() === (automatic ? "automatic" : "manual")) &&
    (!bodyType || vehicle.bodyType === bodyType) &&
    (maxPrice === null || vehicle.price <= maxPrice));
}
