import "server-only";
import { listRecentCustomerRequests } from "@/lib/messaging/services/customer-history-service";
import { adminDb } from "@/lib/firebase-admin";
import { resolveWhatsAppIdentity } from "@/lib/messaging/services/identity-service";
import {
  customerDocumentId,
  serverTimestamp,
} from "@/lib/messaging/services/shared";
import type {
  ConversationContext,
  LocationData,
} from "@/lib/messaging/domain-types";

export type SavedAddress = {
  id: string;
  label: string;
  location: LocationData;
};
export type SavedCustomer = {
  name: string;
  addresses: SavedAddress[];
  recent: ConversationContext;
  vehicles: string[];
  menu: ConversationContext | null;
  recentRequests: {
    kind: "order" | "booking";
    title: string;
    status: string;
  }[];
};
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
function address(
  value: unknown,
  id: string,
  label: string,
): SavedAddress | null {
  const item = object(value);
  if (
    typeof item.latitude !== "number" ||
    typeof item.longitude !== "number" ||
    !Number.isFinite(item.latitude) ||
    !Number.isFinite(item.longitude) ||
    Math.abs(item.latitude) > 90 ||
    Math.abs(item.longitude) > 180
  )
    return null;
  return {
    id,
    label,
    location: {
      latitude: item.latitude,
      longitude: item.longitude,
      address:
        typeof item.address === "string" ? item.address.slice(0, 300) : null,
      label,
      source: "stored",
      updatedAt: serverTimestamp(),
    },
  };
}
export async function loadSavedCustomer(
  businessId: string,
  phone: string,
  options: { includeHistory?: boolean } = {},
): Promise<SavedCustomer> {
  const empty: SavedCustomer = {
    name: "",
    addresses: [],
    recent: {},
    vehicles: [],
    menu: null,
    recentRequests: [],
  };
  const identity = await resolveWhatsAppIdentity(phone);
  if (!identity) return empty;
  const data = (
    await adminDb
      .collection("customers")
      .doc(customerDocumentId(businessId, phone))
      .get()
  ).data();
  if (
    !data ||
    data.uid !== identity.uid ||
    data.linkedToTany !== true ||
    data.businessId !== businessId ||
    data.phone !== phone
  )
    return empty;
  const saved: Record<string, unknown> = {};
  // Merge old schemas as well as the current saved slots; adding Home must not hide Work.
  for (const rawAddresses of [
    object(data.metadata).addresses,
    data.addresses,
    data.savedAddresses,
  ]) {
    if (Array.isArray(rawAddresses)) {
      for (const value of rawAddresses) {
        const row = object(value);
        const label =
          typeof row.label === "string"
            ? row.label.trim().toLowerCase()
            : typeof row.name === "string"
              ? row.name.trim().toLowerCase()
              : "";
        if (label === "home" || label === "work")
          saved[label] = row.location ?? row;
      }
    } else {
      const map = object(rawAddresses);
      if (map.home ?? map.Home) saved.home = map.home ?? map.Home;
      if (map.work ?? map.Work) saved.work = map.work ?? map.Work;
    }
  }
  const addresses = [
    address(saved.home ?? saved.Home, "home", "Home"),
    address(saved.work ?? saved.Work, "work", "Work"),
  ].filter((item): item is SavedAddress => !!item);
  const recent = address(
    data.location,
    "recent",
    typeof data.location?.label === "string"
      ? data.location.label.slice(0, 20)
      : "Recent location",
  );
  if (
    recent &&
    !addresses.some(
      (item) =>
        item.location.latitude === recent.location.latitude &&
        item.location.longitude === recent.location.longitude,
    )
  )
    addresses.push(recent);
  const history = options.includeHistory
    ? await listRecentCustomerRequests(businessId, phone)
    : [];
  const choices = object(data.recentSelections);
  const recentChoices: ConversationContext = {};
  for (const key of [
    "itemName",
    "productId",
    "serviceId",
    "vehicle",
    "selectedVehicleId",
    "quantity",
    "variant",
    "durationHours",
    "venueId",
    "stylistId",
  ]) {
    const value = choices[key];
    if (
      typeof value === "string" ||
      (typeof value === "number" && Number.isFinite(value))
    )
      recentChoices[key] = value;
  }
  const vehicles = Array.isArray(data.vehicles)
    ? data.vehicles
        .filter(
          (v: unknown): v is string => typeof v === "string" && !!v.trim(),
        )
        .slice(0, 8)
    : [];
  if (
    typeof recentChoices.vehicle === "string" &&
    !vehicles.includes(recentChoices.vehicle)
  )
    vehicles.unshift(recentChoices.vehicle);
  return {
    name: typeof data.name === "string" ? data.name.slice(0, 80) : "",
    addresses,
    recent: recentChoices,
    vehicles,
    menu: data.whatsappMenu ?? null,
    recentRequests: history,
  };
}
export async function saveCustomerMenu(
  businessId: string,
  phone: string,
  menu: JsonMenu,
) {
  const identity = await resolveWhatsAppIdentity(phone);
  if (!identity) return;
  const ref = adminDb
    .collection("customers")
    .doc(customerDocumentId(businessId, phone));
  await adminDb.runTransaction(async (tx) => {
    const customer = (await tx.get(ref)).data();
    if (
      customer?.uid !== identity.uid ||
      customer.businessId !== businessId ||
      customer.phone !== phone
    )
      return;
    tx.update(ref, { whatsappMenu: menu });
  });
}
type JsonMenu = import("@/lib/messaging/domain-types").JsonValue;
export async function rememberCustomerChoices(
  businessId: string,
  phone: string,
  context: ConversationContext,
) {
  const identity = await resolveWhatsAppIdentity(phone);
  if (!identity) return;
  const recent: ConversationContext = {};
  for (const key of [
    "itemName",
    "productId",
    "serviceId",
    "vehicle",
    "selectedVehicleId",
    "quantity",
    "variant",
    "durationHours",
    "venueId",
    "stylistId",
  ]) {
    const value = context[key];
    if (
      typeof value === "string" ||
      (typeof value === "number" && Number.isFinite(value))
    )
      recent[key] = value;
  }
  if (!Object.keys(recent).length) return;
  const ref = adminDb
    .collection("customers")
    .doc(customerDocumentId(businessId, phone));
  await adminDb.runTransaction(async (tx) => {
    const customer = (await tx.get(ref)).data();
    if (
      customer?.uid !== identity.uid ||
      customer.businessId !== businessId ||
      customer.phone !== phone
    )
      return;
    tx.update(ref, {
      recentSelections: { ...object(customer.recentSelections), ...recent },
      updatedAt: serverTimestamp(),
    });
  });
}
