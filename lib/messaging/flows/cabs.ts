import type { FlowContext, FlowResult, IncomingMessageInput } from "@/lib/messaging/types";
import type { Booking, JsonValue } from "@/lib/messaging/domain-types";
import { batchScope, greeting } from "@/lib/messaging/flows/batch-common";
import { loadBusinessData, missingCatalogReply } from "@/lib/messaging/flows/business-data";
import { createDraftBooking, setBookingStatus, updateBooking } from "@/lib/messaging/services/booking-service";

export async function handleCabsMessage(input: string | IncomingMessageInput, flow?: FlowContext): Promise<FlowResult> {
  const s = await batchScope("cabs", input, flow), c = s.context;
  const data = await loadBusinessData(flow, "cabs");
  const configured = data.config?.settings.vehicleTypes;
  const cabVehicles: { id: string; name: string; price: number }[] = Array.isArray(configured) ? configured.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || entry.available === false) return [];
    const price = entry.baseFare ?? entry.price;
    return typeof entry.id === "string" && typeof entry.name === "string" && typeof price === "number" && Number.isFinite(price) && price >= 0 ? [{ id: entry.id, name: entry.name, price }] : [];
  }) : data.items.filter((item) => item.type === "vehicle").map((item) => ({ id: item.id, name: item.name, price: item.price }));
  const welcome = { type: "text" as const, body: cabVehicles.length ? "Where should we pick you up? Type a place/address or share your location." : missingCatalogReply };
  const common = await s.common("booking", welcome);
  if (common) return common;
  if (s.state === "cabs_awaiting_confirmation") {
    if (!cabVehicles.length) return s.result("pickup", missingCatalogReply);
    const booking = await s.owned("booking") as Booking | null;
    if (!booking || typeof c.fareEstimate !== "number") throw new Error("Cab booking is not ready");
    if (s.command !== "CONFIRM") return s.result("confirmation", s.confirm(`Cab fare estimate: ₹${c.fareEstimate}. Base fare only; distance and final fare are not calculated.`));
    await setBookingStatus({ bookingId: booking.id, status: "confirmed" });
    return s.result("completed", "Your cab booking is confirmed. The fare remains an estimate; no driver has been assigned.", "completed");
  }
  if (!cabVehicles.length) return s.result("pickup", missingCatalogReply);
  if (greeting(s.text) && ["cabs_start", "cabs_awaiting_pickup"].includes(s.state)) return s.result("pickup", welcome);
  const place: JsonValue | null = s.input.location ? { latitude: s.input.location.latitude, longitude: s.input.location.longitude, label: s.input.location.label, address: s.input.location.address } : s.text && !greeting(s.text) && s.text.length <= 300 ? s.text : null;
  if (c.pickup === undefined) {
    if (!place) return s.result("pickup", welcome);
    c.pickup = place; return s.result("destination", "Where are you going? Type your destination or share its location.");
  }
  if (c.destination === undefined) {
    if (!place || JSON.stringify(place) === JSON.stringify(c.pickup)) return s.result("destination", "Please enter a destination different from the pickup.");
    c.destination = place;
    return s.result("vehicle", s.menu("vehicle", "Choose a vehicle. These are base-fare estimates only, without distance charges.", cabVehicles));
  }
  const selected = s.choose("vehicle", cabVehicles);
  const vehicle = cabVehicles.find((entry) => entry.id === selected?.id);
  if (!vehicle) return s.result("vehicle", s.menu("vehicle", `Choose ${cabVehicles.map((vehicle) => vehicle.name).join(", ")}.`, cabVehicles));
  c.vehicleType = vehicle.id; c.fareEstimate = vehicle.price;
  const owner = s.requireKey();
  let booking = await s.owned("booking") as Booking | null ?? await createDraftBooking({ ...owner, vertical: "cabs", reuseConversationDraft: true });
  if (!["draft", "pending_confirmation"].includes(booking.status)) throw new Error("Cab booking is no longer editable");
  booking = await updateBooking({ bookingId: booking.id, data: { serviceId: vehicle.id, serviceName: "Cab Ride", resourceId: vehicle.id, resourceName: vehicle.name, amount: vehicle.price, status: "draft", metadata: { pickup: c.pickup, destination: c.destination, estimateOnly: true, distanceCalculated: false } } });
  c.bookingId = booking.id;
  return s.result("confirmation", s.confirm(`${vehicle.name}\nPickup: ${typeof c.pickup === "string" ? c.pickup : "Shared location"}\nDestination: ${typeof c.destination === "string" ? c.destination : "Shared location"}\nFare estimate: ₹${vehicle.price} (base only; final fare may differ).\nNo live dispatch or distance calculation.`));
}
