import { adminDb } from "@/lib/firebase-admin";
import type { Customer } from "@/lib/messaging/domain-types";
import { customerDocumentId, serverTimestamp } from "@/lib/messaging/services/shared";

export async function getOrCreateCustomer({ businessId, phone }: { businessId: string; phone: string }): Promise<Customer> {
  const ref = adminDb.collection("customers").doc(customerDocumentId(businessId, phone));
  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const now = serverTimestamp();
    if (snapshot.exists) {
      const changes = { lastInteractionAt: now, updatedAt: now };
      transaction.update(ref, changes);
      return { ...snapshot.data(), ...changes, id: ref.id } as Customer;
    }
    const data: Omit<Customer, "id"> = {
      businessId, phone, name: null, metadata: {},
      createdAt: now, updatedAt: now, lastInteractionAt: now,
    };
    transaction.create(ref, data);
    return { ...data, id: ref.id };
  });
}
