import { adminDb } from "@/lib/firebase-admin";
import { cache } from "react";
import type { Business } from "@/lib/messaging/types";
import type { ConversationContext } from "@/lib/messaging/domain-types";
import { mergeConversationContext } from "@/lib/messaging/context";
import { isTanyVertical } from "@/lib/messaging/vertical-config";
import { documentId } from "@/lib/messaging/services/shared";

export type BusinessConfig = Business & { settings: ConversationContext };
export const getBusinessConfig = cache(async (businessId: string): Promise<BusinessConfig | null> => {
  try {
    const snapshot = await adminDb.collection("businesses").doc(documentId(businessId)).get();
    const data = snapshot.data();
    if (!data || typeof data.name !== "string" || !isTanyVertical(data.vertical) || typeof data.active !== "boolean" || typeof data.whatsappPhoneNumberId !== "string") return null;
    return {
      id: snapshot.id, name: data.name, vertical: data.vertical, active: data.active,
      whatsappPhoneNumberId: data.whatsappPhoneNumberId,
      settings: mergeConversationContext({}, data.settings ?? {}),
    };
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      const details = error as { code?: unknown; message?: unknown };
      console.error("[BUSINESS_CONFIG_READ_FAILED]", {
        businessId,
        code: typeof details?.code === "string" || typeof details?.code === "number" ? details.code : undefined,
        message: typeof details?.message === "string" ? details.message : "Unknown Firestore error",
      });
    }
    throw error;
  }
});
