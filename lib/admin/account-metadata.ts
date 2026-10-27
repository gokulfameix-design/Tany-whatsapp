import "server-only";
import { adminDb } from "@/lib/firebase-admin";
import { documentId, serverTimestamp } from "@/lib/messaging/services/shared";
import { AdminValidationError, objectInput, stringInput } from "@/lib/admin/validation";
import { assertWhatsAppPhoneMapping } from "@/lib/whatsapp/setup-service";

/** Internal operations only: billing gates belong to the separate client APIs. */
export async function updateAccountMetadata(businessId: string, accountId: string, input: unknown, activateForTesting = false) {
  const value = objectInput(input, ["displayName", "displayPhone", "phoneNumberId", "wabaId", "status"]);
  const displayName = stringInput(value.displayName, "displayName", 120);
  const displayPhone = stringInput(value.displayPhone, "displayPhone", 30).replace(/[\s()+-]/g, "");
  if (!/^[1-9]\d{7,14}$/.test(displayPhone)) throw new AdminValidationError({ displayPhone: "Enter a phone number including country code." });
  const phoneNumberId = stringInput(value.phoneNumberId, "phoneNumberId", 40);
  const wabaId = stringInput(value.wabaId, "wabaId", 40);
  for (const [field, id] of Object.entries({ phoneNumberId, wabaId })) {
    if (!/^[1-9]\d{0,39}$/.test(id)) throw new AdminValidationError({ [field]: "Enter a numeric Meta ID." });
  }
  const requestedStatus = stringInput(value.status, "status", 30);
  if (!["pending", "configured", "connected", "disconnected", "error"].includes(requestedStatus)) throw new AdminValidationError({ status: "Choose a valid status." });
  const businessRef = adminDb.collection("businesses").doc(documentId(businessId));
  const accountRef = adminDb.collection("whatsapp_accounts").doc(documentId(accountId));
  return adminDb.runTransaction(async tx => {
    const [business, account] = await Promise.all([tx.get(businessRef), tx.get(accountRef)]);
    const businessData = business.data();
    const previous = account.data();
    // Older workspaces keep their account configuration on the business profile.
    // Only that business's canonical record may be created from this legacy state.
    if (!businessData || (previous && previous.businessId !== businessId)) throw new AdminValidationError({ form: "Account unavailable for this business." });
    if (!previous) {
      const existing = await tx.get(adminDb.collection("whatsapp_accounts").where("businessId", "==", businessId));
      if (accountId !== businessId || typeof businessData.whatsappPhoneNumberId !== "string" || !businessData.whatsappPhoneNumberId.trim() || !existing.empty) throw new AdminValidationError({ form: "Account unavailable for this business." });
    }
    const prior = previous ?? { phoneNumberId: businessData.whatsappPhoneNumberId };
    await assertWhatsAppPhoneMapping(tx, businessId, phoneNumberId);
    const mappingRef = adminDb.collection("whatsapp_phone_mappings").doc(phoneNumberId);
    const [duplicates, mapping] = await Promise.all([
      tx.get(adminDb.collection("whatsapp_accounts").where("phoneNumberId", "==", phoneNumberId)), tx.get(mappingRef),
    ]);
    if (duplicates.docs.some(doc => doc.id !== accountId) || (mapping.data()?.accountId && mapping.data()?.accountId !== accountId)) throw new AdminValidationError({ phoneNumberId: "This Phone Number ID is already assigned to another account." });
    const oldRef = typeof prior.phoneNumberId === "string" && prior.phoneNumberId !== phoneNumberId
      ? adminDb.collection("whatsapp_phone_mappings").doc(documentId(prior.phoneNumberId)) : null;
    const oldMapping = oldRef ? await tx.get(oldRef) : null;
    const changed = prior.phoneNumberId !== phoneNumberId || prior.wabaId !== wabaId || String(prior.displayPhone ?? "").replace(/[\s()+-]/g, "") !== displayPhone;
    const verified = !changed && prior.testPassed === true && prior.validationMode === "live" && !!prior.testedAt;
    if (activateForTesting && businessData.active !== true) throw new AdminValidationError({ form: "Activate the business before testing WhatsApp." });
    const status = activateForTesting ? "connected" : requestedStatus === "connected" && !verified ? "pending" : requestedStatus;
    const keepVerification = verified && status === "connected";
    const metadata = {
      displayName, displayPhone: `+${displayPhone}`, phoneNumberId, wabaId, status,
      revision: (Number(prior.revision) || 0) + 1, updatedAt: serverTimestamp(),
      internalTestingActive: activateForTesting,
      ...(!keepVerification ? { testPassed: false, validationMode: null, testedAt: null, testMessage: "", setupStep: 3 } : {}),
      ...(activateForTesting ? { setupStep: 5, activatedAt: serverTimestamp(), testStatus: "internal_manual" } : { activatedAt: null, testStatus: keepVerification ? "success" : "unverified" }),
    };
    if (previous) tx.update(accountRef, metadata);
    else tx.create(accountRef, { ...metadata, businessId, vertical: businessData.vertical, setupType: "existing", createdAt: serverTimestamp() });
    tx.update(businessRef, { whatsappPhoneNumberId: phoneNumberId, updatedAt: serverTimestamp() });
    tx.set(mappingRef, { businessId, accountId, updatedAt: serverTimestamp() });
    if (oldRef && oldMapping?.data()?.businessId === businessId && (!oldMapping.data()?.accountId || oldMapping.data()?.accountId === accountId)) tx.delete(oldRef);
    return { status, message: activateForTesting ? "Activated for internal testing. Live Meta connectivity remains unverified." : status === "pending" ? "Account saved. Configured / unverified; no live verification was performed." : "Account metadata saved." };
  });
}
