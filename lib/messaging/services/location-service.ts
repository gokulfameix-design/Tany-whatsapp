import { adminDb } from "@/lib/firebase-admin";
import type {
  ConversationContext,
  Customer,
  LocationData,
} from "@/lib/messaging/domain-types";
import { mergeConversationContext } from "@/lib/messaging/context";
import { getOrCreateCustomer } from "@/lib/messaging/services/customer-service";
import {
  customerDocumentId,
  readDocument,
  serverTimestamp,
} from "@/lib/messaging/services/shared";

export type LocationInput = Pick<
  LocationData,
  "latitude" | "longitude" | "source"
> &
  Partial<Pick<LocationData, "address" | "label">>;

export async function saveCustomerLocation({
  businessId,
  customerPhone,
  location,
}: {
  businessId: string;
  customerPhone: string;
  location: LocationInput;
}): Promise<LocationData> {
  if (
    !Number.isFinite(location.latitude) ||
    Math.abs(location.latitude) > 90 ||
    !Number.isFinite(location.longitude) ||
    Math.abs(location.longitude) > 180 ||
    !["whatsapp", "manual", "stored"].includes(location.source)
  ) {
    throw new Error("Invalid customer location");
  }
  await getOrCreateCustomer({ businessId, phone: customerPhone });
  const id = customerDocumentId(businessId, customerPhone);
  const customer = adminDb.collection("customers").doc(id);
  const conversation = adminDb.collection("conversations").doc(id);
  return adminDb.runTransaction(async (transaction) => {
    const customerSnapshot = await transaction.get(customer);
    const snapshot = await transaction.get(conversation);
    const saved: LocationData = {
      latitude: location.latitude,
      longitude: location.longitude,
      address: location.address ?? null,
      label: location.label ?? null,
      source: location.source,
      updatedAt: serverTimestamp(),
    };
    const addressKey = location.label?.trim().toLowerCase();
    const currentAddresses = customerSnapshot.data()?.savedAddresses;
    transaction.update(customer, {
      location: saved,
      updatedAt: serverTimestamp(),
      ...(addressKey === "home" || addressKey === "work"
        ? {
            savedAddresses: Array.isArray(currentAddresses)
              ? [
                  ...currentAddresses.filter((value) => {
                    const label =
                      value && typeof value === "object"
                        ? (value.label ?? value.name)
                        : null;
                    return (
                      typeof label !== "string" ||
                      label.trim().toLowerCase() !== addressKey
                    );
                  }),
                  saved,
                ]
              : {
                  ...(currentAddresses && typeof currentAddresses === "object"
                    ? currentAddresses
                    : {}),
                  [addressKey]: saved,
                },
          }
        : {}),
    });
    if (snapshot.exists) {
      // Store a JSON-compatible reference, not a Firestore Timestamp in context.
      const locationContext: ConversationContext = {
        customerLocationId: id,
        location: {
          latitude: saved.latitude,
          longitude: saved.longitude,
          address: saved.address,
          label: saved.label,
          source: saved.source,
        },
      };
      transaction.update(conversation, {
        context: mergeConversationContext(
          snapshot.data()?.context ?? {},
          locationContext,
        ),
        updatedAt: serverTimestamp(),
      });
    }
    return saved;
  });
}

export async function getCustomerLocation({
  businessId,
  customerPhone,
}: {
  businessId: string;
  customerPhone: string;
}): Promise<LocationData | null> {
  const customer = await readDocument<Customer>(
    adminDb
      .collection("customers")
      .doc(customerDocumentId(businessId, customerPhone)),
  );
  return customer?.location ?? null;
}
