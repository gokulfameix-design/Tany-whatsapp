import { writeEntityEvent } from "@/lib/automations/events";
import { adminDb } from "@/lib/firebase-admin";
import {
  mergeConversationContext,
  clearConversationContext,
} from "@/lib/messaging/context";
import { verticalConfig } from "@/lib/messaging/vertical-config";
import type {
  Conversation,
  ConversationContext,
  ConversationStatus,
} from "@/lib/messaging/domain-types";
import type { TanyVertical } from "@/lib/messaging/types";
import {
  assertVertical,
  customerDocumentId,
  definedFields,
  mutateDocument,
  readDocument,
  serverTimestamp,
} from "@/lib/messaging/services/shared";

type ConversationKey = { businessId: string; customerPhone: string };
const reference = ({ businessId, customerPhone }: ConversationKey) =>
  adminDb
    .collection("conversations")
    .doc(customerDocumentId(businessId, customerPhone));

export function getConversation(
  key: ConversationKey,
): Promise<Conversation | null> {
  return readDocument<Conversation>(reference(key));
}

export async function getOrCreateConversation({
  businessId,
  customerPhone,
  vertical,
}: ConversationKey & { vertical: TanyVertical }): Promise<Conversation> {
  assertVertical(vertical);
  const ref = reference({ businessId, customerPhone });
  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const existing = snapshot.data();
    if (existing?.vertical && existing.vertical !== vertical)
      throw new Error("Conversation vertical does not match business");
    const now = serverTimestamp();
    // Backfill old webhook documents without resetting their state or context.
    const data: Omit<Conversation, "id"> = {
      businessId,
      customerPhone,
      vertical,
      state: existing?.state ?? verticalConfig[vertical].startState,
      status: existing?.status ?? "active",
      context: existing?.context ?? {},
      lastIncomingText: existing?.lastIncomingText ?? "",
      pendingReply: existing?.pendingReply ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: existing?.updatedAt ?? now,
    };
    if (!snapshot.exists)
      await writeEntityEvent(transaction, "conversation.started", {
        ...data,
        id: ref.id,
      });
    transaction.set(ref, data, { merge: true });
    return { ...data, id: ref.id };
  });
}

export type ConversationUpdate = ConversationKey & {
  state: string;
  status?: ConversationStatus;
  context?: ConversationContext;
  lastIncomingText?: string;
  pendingReply?: string | null;
};

export function updateConversationState({
  businessId,
  customerPhone,
  state,
  status,
  context,
  lastIncomingText,
  pendingReply,
}: ConversationUpdate): Promise<Conversation> {
  return mutateDocument<Conversation>(
    reference({ businessId, customerPhone }),
    (current) =>
      definedFields({
        state,
        status,
        lastIncomingText,
        pendingReply,
        context:
          context === undefined
            ? undefined
            : mergeConversationContext(current.context ?? {}, context),
      }),
  );
}

export function resetConversation(key: ConversationKey): Promise<Conversation> {
  return mutateDocument<Conversation>(reference(key), (current) => {
    assertVertical(current.vertical);
    return {
      state: verticalConfig[current.vertical].startState,
      status: "active",
      context: clearConversationContext(),
      lastIncomingText: "",
      pendingReply: null,
    };
  });
}
