import "server-only";
import { createHash } from "node:crypto";
import { adminDb } from "@/lib/firebase-admin";
import { documentId, serverTimestamp } from "@/lib/messaging/services/shared";
const rank: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 0 };
export function receiptStatus(current: string, next: string) {
  if (current === "failed" && next === "sent") return current;
  if (next === "failed") return ["delivered", "read"].includes(current) ? current : next;
  return (rank[next] ?? -1) >= (rank[current] ?? -1) ? next : current;
}
/** Provider receipt metadata only. Does not route messages or mutate conversation/order state. */
export async function recordDeliveryReceipts(businessId: string, statuses: unknown) {
  documentId(businessId);
  if (!Array.isArray(statuses)) return;
  for (const event of statuses.slice(0, 100)) {
    if (!event || typeof event.id !== "string" || event.id.length > 300 || !Object.hasOwn(rank, event.status) || !/^\d{10}$/.test(event.timestamp ?? "")) continue;
    const ref = adminDb.collection("message_delivery_events").doc(createHash("sha256").update(`${businessId}:${event.id}:${event.status}:${event.timestamp}`).digest("hex"));
    await adminDb.runTransaction(async tx => {
      if ((await tx.get(ref)).exists) return;
      const messages = await tx.get(adminDb.collection("messages").where("businessId", "==", businessId).where("messageId", "==", event.id).where("direction", "==", "outgoing"));
      tx.create(ref, { businessId, messageId: event.id, status: event.status, at: new Date(Number(event.timestamp) * 1000).toISOString(), createdAt: serverTimestamp() });
      for (const message of messages.docs) tx.update(adminDb.collection("messages").doc(message.id), { deliveryStatus: receiptStatus(message.data().deliveryStatus ?? "unknown", event.status), updatedAt: serverTimestamp() });
    });
  }
}
