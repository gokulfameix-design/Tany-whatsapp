import { createHash, randomUUID } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import type { StoredMessage } from "@/lib/messaging/domain-types";
import type { FlowResult } from "@/lib/messaging/types";
import type { ProductSkip } from "@/lib/whatsapp/product-sequence";
import { definedFields, documentId, serverTimestamp } from "@/lib/messaging/services/shared";

type IncomingMessage = Omit<StoredMessage, "createdAt" | "processingStatus" | "direction">;
type MessageClaim = { id: string; token: string };

export function messageDocumentId(messageId: string): string {
  if (!messageId?.trim()) throw new Error("Message ID is required");
  try { return documentId(messageId); }
  catch { return `meta_${createHash("sha256").update(messageId).digest("hex")}`; }
}

/** Atomic reservation prevents two simultaneous Meta deliveries being routed. */
export async function claimIncomingMessage(message: IncomingMessage): Promise<MessageClaim | null> {
  const ref = adminDb.collection("messages").doc(messageDocumentId(message.messageId));
  const token = randomUUID();
  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const existing = snapshot.data();
    if (existing) {
      if (existing.businessId !== message.businessId) throw new Error("Message business does not match");
      if (existing.processingStatus === "processed" ||
          (existing.processingStatus === "received" && existing.leaseUntil?.toMillis() > Date.now())) return null;
    } else {
      // Recognize messages saved by the previous auto-ID webhook too.
      const legacy = await transaction.get(adminDb.collection("messages").where("messageId", "==", message.messageId).limit(1));
      if (!legacy.empty) return null;
    }
    transaction.set(ref, {
      ...message, from: message.customerPhone, direction: "incoming",
      createdAt: existing?.createdAt ?? serverTimestamp(), updatedAt: serverTimestamp(),
      processingStatus: "received", processingToken: token,
      leaseUntil: Timestamp.fromMillis(Date.now() + 5 * 60 * 1000),
      error: null,
    }, { merge: true });
    return { id: ref.id, token };
  });
}

async function finishClaim(claim: MessageClaim, status: "processed" | "failed", error: string | null) {
  const ref = adminDb.collection("messages").doc(claim.id);
  await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (snapshot.data()?.processingToken !== claim.token) throw new Error("Message processing lease was replaced");
    transaction.update(ref, {
      processingStatus: status, error, updatedAt: serverTimestamp(),
      leaseUntil: FieldValue.delete(), processingToken: FieldValue.delete(),
    });
  });
}

export const markMessageProcessed = (claim: MessageClaim) => finishClaim(claim, "processed", null);
export const markMessageFailed = (claim: MessageClaim, error: unknown) => finishClaim(claim, "failed", String(error));

export async function getPreparedMessageResult(claim: MessageClaim): Promise<FlowResult | null> {
  const snapshot = await adminDb.collection("messages").doc(claim.id).get();
  return snapshot.data()?.preparedResult ?? null;
}

export async function getProductSequenceSkips(claim: MessageClaim): Promise<Record<string, ProductSkip>> {
  return (await adminDb.collection("messages").doc(claim.id).get()).data()?.catalogSequenceSkips ?? {};
}
export async function storeProductSequenceSkip(claim: MessageClaim, index: number, skip: ProductSkip) {
  const ref = adminDb.collection("messages").doc(claim.id);
  await adminDb.runTransaction(async tx => {
    const data = (await tx.get(ref)).data();
    if (data?.processingToken !== claim.token) throw new Error("Message processing lease was replaced");
    tx.update(ref, { catalogSequenceSkips: { ...(data.catalogSequenceSkips ?? {}), [String(index)]: skip } });
  });
}

/** Replaying a failed send must not reinterpret an old button in a newer state. */
export async function storePreparedMessageResult(claim: MessageClaim, result: FlowResult) {
  const ref = adminDb.collection("messages").doc(claim.id);
  await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (snapshot.data()?.processingToken !== claim.token) throw new Error("Message processing lease was replaced");
    transaction.update(ref, { preparedResult: definedFields(result) });
  });
}

const outgoingReference = (incomingMessageId: string) => adminDb.collection("messages").doc(
  `reply_${createHash("sha256").update(incomingMessageId).digest("hex")}`
);

export async function hasStoredReply(incomingMessageId: string): Promise<boolean> {
  return (await outgoingReference(incomingMessageId).get()).exists;
}

/** Called after the sender succeeds; the linked record prevents routine resends. */
export async function storeOutgoingMessage({ incomingMessageId, ...message }: Omit<StoredMessage, "createdAt" | "direction" | "processingStatus"> & { incomingMessageId: string }) {
  await outgoingReference(incomingMessageId).set({
    ...message, incomingMessageId, direction: "outgoing", processingStatus: "processed", createdAt: serverTimestamp(),
  } satisfies StoredMessage & { incomingMessageId: string });
}
