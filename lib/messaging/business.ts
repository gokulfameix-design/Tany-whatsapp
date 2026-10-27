import { adminDb } from "@/lib/firebase-admin";

import { isTanyVertical } from "@/lib/messaging/vertical-config";
import type { Business } from "@/lib/messaging/types";

export type { Business } from "@/lib/messaging/types";

export async function findBusinessByPhoneNumberId(
  phoneNumberId: string
): Promise<Business | null> {
  const snapshot = await adminDb
    .collection("businesses")
    .where("whatsappPhoneNumberId", "==", phoneNumberId)
    .where("active", "==", true)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  const data = doc.data();

  if (!isTanyVertical(data.vertical)) {
    throw new Error(`Unsupported Tany vertical for business ${doc.id}`);
  }
  if (
    typeof data.name !== "string" ||
    typeof data.whatsappPhoneNumberId !== "string" ||
    typeof data.active !== "boolean"
  ) {
    throw new Error(`Invalid business data for ${doc.id}`);
  }

  return {
    id: doc.id,
    name: data.name,
    vertical: data.vertical,
    whatsappPhoneNumberId: data.whatsappPhoneNumberId,
    active: data.active,
  };
}