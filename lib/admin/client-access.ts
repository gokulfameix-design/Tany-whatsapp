import "server-only";
import { requireWhatsAppEntitlement } from "@/lib/subscriptions/entitlements";
import { getWhatsAppSetup } from "@/lib/whatsapp/setup-service";
import { adminDb } from "@/lib/firebase-admin";
import { documentId } from "@/lib/messaging/services/shared";

export class OperationsAccessError extends Error {
  constructor(public code: string, message: string, public status = 403) { super(message); }
}
export async function clientConnectionReady(businessId: string) {
  await requireWhatsAppEntitlement(businessId);
  const account = await getWhatsAppSetup(businessId);
  if (account) return account.status === "connected";
  const business = (await adminDb.collection("businesses").doc(documentId(businessId)).get()).data();
  return business?.active === true && business?.settings?.whatsapp?.connectionStatus === "connected";
}
export async function requireClientConnection(businessId: string) {
  if (!await clientConnectionReady(businessId)) throw new OperationsAccessError("SETUP_REQUIRED", "Connect WhatsApp to open your dashboard.");
}
