import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { documentId, serverTimestamp } from "@/lib/messaging/services/shared";
import { requireWhatsAppEntitlement } from "@/lib/subscriptions/entitlements";
import { OperationsAccessError } from "@/lib/admin/client-access";
const handoffRef = (token: string) => adminDb.collection("dashboard_handoffs").doc(createHash("sha256").update(token).digest("hex"));
/** Called only inside the authenticated business-scoped integration boundary. */
export async function createWorkspaceHandoff(businessId: string) {
  documentId(businessId);
  await requireWhatsAppEntitlement(businessId);
  if (!(await adminDb.collection("businesses").doc(businessId).get()).exists) throw new OperationsAccessError("NOT_FOUND", "Business unavailable.", 404);
  const token = randomBytes(32).toString("hex");
  await handoffRef(token).create({ businessId, used: false, expiresAt: Timestamp.fromMillis(Date.now()+60000), createdAt: serverTimestamp() });
  return { path: `/api/dashboard/connect?token=${token}` };
}
export async function consumeWorkspaceHandoff(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new OperationsAccessError("INVALID_HANDOFF", "Open WhatsApp again from your Product Dashboard.", 400);
  const ref = handoffRef(token);
  const initial = (await ref.get()).data();
  if (!initial || initial.used || !(initial.expiresAt instanceof Timestamp) || initial.expiresAt.toMillis() <= Date.now()) throw new OperationsAccessError("INVALID_HANDOFF", "This workspace link has expired. Open WhatsApp again from Tany.", 400);
  const businessId = documentId(initial.businessId);
  await requireWhatsAppEntitlement(businessId);
  await adminDb.runTransaction(async tx => {
    const current = (await tx.get(ref)).data();
    if (!current || current.businessId !== businessId || current.used || !(current.expiresAt instanceof Timestamp) || current.expiresAt.toMillis() <= Date.now()) throw new OperationsAccessError("INVALID_HANDOFF", "This workspace link was already used or expired.", 400);
    tx.update(ref, { used: true, usedAt: serverTimestamp() });
  });
  return businessId;
}
