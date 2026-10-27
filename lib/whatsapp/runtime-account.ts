import "server-only";
import { adminDb } from "@/lib/firebase-admin";
import { requireWhatsAppEntitlement } from "@/lib/subscriptions/entitlements";
import { accountAccessToken } from "@/lib/whatsapp/credentials";
import { documentId } from "@/lib/messaging/services/shared";

function activeStatus(status: unknown) {
  return status === "connected" || status === "configured";
}

/** Existing businesses without wizard records keep their current integration. */
export async function automationAccountReady(businessId: string, phoneNumberId: string) {
  const [canonical, matches, owned] = await Promise.all([
    adminDb.collection("whatsapp_accounts").doc(documentId(businessId)).get(),
    adminDb.collection("whatsapp_accounts").where("phoneNumberId", "==", phoneNumberId).get(),
    adminDb.collection("whatsapp_accounts").where("businessId", "==", businessId).get(),
  ]);
  // Preserve legacy businesses that have not created any setup/account record.
  if (!canonical.exists && matches.empty && owned.empty) return true;
  if (canonical.exists && (canonical.data()?.businessId !== businessId || !activeStatus(canonical.data()?.status) || canonical.data()?.phoneNumberId !== phoneNumberId)) return false;
  if (matches.docs.length !== 1) return false;
  const data = matches.docs[0].data();
  // Connected manual records need no wizard proof. Incomplete and inactive
  // records never qualify; client activation still uses the wizard service.
  return data.businessId === businessId && activeStatus(data.status) &&
    data.phoneNumberId === phoneNumberId && !!phoneNumberId.trim() &&
    typeof data.wabaId === "string" && /^\d{1,40}$/.test(data.wabaId) &&
    typeof data.displayPhone === "string" && /^\+?[1-9]\d{7,14}$/.test(data.displayPhone.replace(/[\s()-]/g, ""));
}
export async function sendingAccessToken(phoneNumberId: string) {
  const accounts = await adminDb.collection("whatsapp_accounts").where("phoneNumberId", "==", phoneNumberId).get();
  if (accounts.empty) {
    // A paused/reconfigured wizard account must not fall back to global credentials
    // through the business profile's previous phone mapping.
    const businesses = await adminDb.collection("businesses").where("whatsappPhoneNumberId", "==", phoneNumberId).get();
    for (const business of businesses.docs) {
      if ((await adminDb.collection("whatsapp_accounts").doc(business.id).get()).exists)
        throw new Error("WhatsApp account is not active.");
    }
    return process.env.META_ACCESS_TOKEN || null;
  }
  if (accounts.docs.length !== 1) throw new Error("WhatsApp account mapping is unavailable.");
  const account = accounts.docs[0].data();
  await requireWhatsAppEntitlement(account.businessId);
  const business = (await adminDb.collection("businesses").doc(account.businessId).get()).data();
  if (!activeStatus(account.status) || business?.active !== true || business.whatsappPhoneNumberId !== phoneNumberId || !(await automationAccountReady(account.businessId, phoneNumberId)))
    throw new Error("WhatsApp account is not active.");
  return accountAccessToken(account.tokenSecretName, account.businessId);
}
