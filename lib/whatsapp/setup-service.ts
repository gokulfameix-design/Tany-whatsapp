import "server-only";
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { documentId, serverTimestamp } from "@/lib/messaging/services/shared";
import {
  EntitlementError,
  requireWhatsAppEntitlement,
} from "@/lib/subscriptions/entitlements";
import { accountAccessToken } from "@/lib/whatsapp/credentials";
import type { WhatsAppSetup } from "@/lib/whatsapp/setup-types";

export class SetupError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const refFor = (id: string) =>
  adminDb.collection("whatsapp_accounts").doc(documentId(id));
const cleanPhone = (value: string) => value.replace(/[\s()+-]/g, "");
function inputObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new SetupError("INVALID_INPUT", "Check the account details.");
  return input as Record<string, unknown>;
}
function text(input: Record<string, unknown>, field: string, max = 120) {
  const value = input[field];
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new SetupError(
      "INVALID_INPUT",
      `Check ${field.replace(/([A-Z])/g, " $1").toLowerCase()}.`,
    );
  return value.trim();
}
function project(
  id: string,
  data: FirebaseFirestore.DocumentData,
): WhatsAppSetup {
  return {
    catalogId: typeof data.catalogId === "string" ? data.catalogId : "",
    catalogEnabled: data.catalogEnabled === true,
    accountId: id,
    businessId: data.businessId,
    vertical: data.vertical,
    setupType: data.setupType,
    displayName: data.displayName,
    displayPhone: data.displayPhone,
    businessName: data.businessName ?? "",
    phoneNumberId: data.setupType === "existing" ? data.phoneNumberId : "",
    wabaId: data.setupType === "existing" ? data.wabaId : "",
    tokenSecretName: data.setupType === "existing" ? data.tokenSecretName : "",
    status: data.status,
    setupStep: data.setupStep,
    validationMode: data.validationMode ?? null,
    testPassed: data.testPassed === true,
    testMessage: data.testMessage ?? "",
  };
}
async function checkedBusiness(businessId: string) {
  await requireWhatsAppEntitlement(businessId);
  const business = (
    await adminDb.collection("businesses").doc(documentId(businessId)).get()
  ).data();
  if (!business || business.active !== true)
    throw new SetupError(
      "BUSINESS_UNAVAILABLE",
      "This business is unavailable.",
      404,
    );
  return business;
}
export async function getWhatsAppSetup(
  businessId: string,
): Promise<WhatsAppSetup | null> {
  await checkedBusiness(businessId);
  const doc = await refFor(businessId).get();
  const data = doc.data();
  if (!data) return null;
  if (data.businessId !== businessId)
    throw new SetupError("TENANT_MISMATCH", "Account unavailable.", 403);
  return project(doc.id, data);
}
export async function assertWhatsAppPhoneMapping(
  tx: FirebaseFirestore.Transaction,
  businessId: string,
  phoneNumberId: string,
) {
  const [mapping, accounts, businesses] = await Promise.all([
    tx.get(adminDb.collection("whatsapp_phone_mappings").doc(phoneNumberId)),
    tx.get(
      adminDb
        .collection("whatsapp_accounts")
        .where("phoneNumberId", "==", phoneNumberId),
    ),
    tx.get(
      adminDb
        .collection("businesses")
        .where("whatsappPhoneNumberId", "==", phoneNumberId),
    ),
  ]);
  if (
    (mapping.exists && mapping.data()?.businessId !== businessId) ||
    accounts.docs.some((doc) => doc.data().businessId !== businessId) ||
    businesses.docs.some((doc) => doc.id !== businessId)
  )
    throw new SetupError(
      "PHONE_ALREADY_CONNECTED",
      "This WhatsApp account is already assigned to another business.",
      409,
    );
}
export async function saveWhatsAppSetup(businessId: string, input: unknown) {
  const business = await checkedBusiness(businessId);
  const value = inputObject(input);
  const setupType = value.setupType;
  if (setupType !== "existing" && setupType !== "new")
    throw new SetupError("INVALID_INPUT", "Choose a setup type.");
  const displayName = text(value, "displayName");
  const displayPhone = cleanPhone(text(value, "displayPhone", 30));
  if (!/^[1-9]\d{7,14}$/.test(displayPhone))
    throw new SetupError(
      "INVALID_INPUT",
      "Enter a phone number with country code.",
    );
  const phoneNumberId =
    setupType === "existing" ? text(value, "phoneNumberId", 40) : "";
  const wabaId = setupType === "existing" ? text(value, "wabaId", 40) : "";
  const tokenSecretName =
    setupType === "existing" ? text(value, "tokenSecretName", 101) : "";
  if (
    setupType === "existing" &&
    (!/^[1-9]\d{0,39}$/.test(phoneNumberId) ||
      !/^[1-9]\d{0,39}$/.test(wabaId) ||
      !/^[A-Z][A-Z0-9_]{2,100}$/.test(tokenSecretName))
  )
    throw new SetupError(
      "INVALID_INPUT",
      "Check the account IDs and secret reference. Do not paste an access token.",
    );
  const businessName =
    setupType === "new" ? text(value, "businessName") : business.name;
  await adminDb.runTransaction(async (tx) => {
    const ref = refFor(businessId);
    const old = (await tx.get(ref)).data();
    if (old && old.businessId !== businessId)
      throw new SetupError("TENANT_MISMATCH", "Account unavailable.", 403);
    if (old?.status === "connected" || old?.status === "testing")
      throw new SetupError(
        "ACCOUNT_BUSY",
        "Disconnect the account or finish its test before changing details.",
        409,
      );
    if (phoneNumberId)
      await assertWhatsAppPhoneMapping(tx, businessId, phoneNumberId);
    // All uniqueness reads occur before writes. Reservations serialize concurrent claims.
    if (old?.phoneNumberId && old.phoneNumberId !== phoneNumberId) {
      const oldMapping = (
        await tx.get(
          adminDb.collection("whatsapp_phone_mappings").doc(old.phoneNumberId),
        )
      ).data();
      if (oldMapping?.businessId === businessId)
        tx.delete(
          adminDb.collection("whatsapp_phone_mappings").doc(old.phoneNumberId),
        );
    }
    if (phoneNumberId)
      tx.set(adminDb.collection("whatsapp_phone_mappings").doc(phoneNumberId), {
        businessId,
        accountId: businessId,
        updatedAt: serverTimestamp(),
      });
    tx.set(ref, {
      businessId,
      vertical: business.vertical,
      setupType,
      displayName,
      displayPhone: `+${displayPhone}`,
      businessName,
      phoneNumberId,
      wabaId,
      tokenSecretName,
      status: "pending",
      setupStep: 3,
      catalogId: old?.catalogId ?? "",
      catalogEnabled: old?.catalogEnabled === true,
      revision: (old?.revision ?? 0) + 1,
      testPassed: false,
      testMessage: "",
      validationMode: null,
      testedAt: null,
      createdAt: old?.createdAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  return getWhatsAppSetup(businessId);
}

async function validateWithProvider(
  data: FirebaseFirestore.DocumentData,
  input: Record<string, unknown>,
) {
  if (input.mode === "manual_test") {
    if (process.env.WHATSAPP_SETUP_ALLOW_MANUAL_TEST !== "true")
      throw new SetupError(
        "MANUAL_TEST_DISABLED",
        "Manual/test validation requires Tany approval.",
      );
    if (input.sendTest === true)
      throw new SetupError(
        "LIVE_REQUIRED",
        "Manual validation does not send messages.",
      );
    return {
      mode: "manual_test",
      message:
        "Manual/test validation passed. No Meta connection was verified and no message was sent.",
    } as const;
  }
  const token = accountAccessToken(data.tokenSecretName, data.businessId);
  if (process.env.WHATSAPP_SETUP_LIVE_TESTS !== "true" || !token)
    throw new SetupError(
      "LIVE_UNAVAILABLE",
      "Live validation is not configured. Ask Tany to enable connection testing.",
    );
  const response = await fetch(
    `https://graph.facebook.com/v26.0/${data.wabaId}/phone_numbers?fields=id,display_phone_number&limit=100`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    },
  );
  const result = await response.json();
  const mapped =
    Array.isArray(result.data) &&
    result.data.find(
      (item: { id?: string; display_phone_number?: string }) =>
        item.id === data.phoneNumberId,
    );
  if (
    !response.ok ||
    !mapped ||
    typeof mapped.display_phone_number !== "string" ||
    cleanPhone(mapped.display_phone_number) !== cleanPhone(data.displayPhone)
  )
    throw new SetupError(
      "VALIDATION_FAILED",
      "The WhatsApp account details could not be verified. Check the account mapping and try again.",
    );
  if (input.sendTest === true) {
    await requireWhatsAppEntitlement(data.businessId);
    const recipient =
      typeof input.recipient === "string" ? cleanPhone(input.recipient) : "";
    const allowed = (process.env.WHATSAPP_SETUP_TEST_RECIPIENTS ?? "")
      .split(",")
      .map(cleanPhone);
    if (!/^[1-9]\d{7,14}$/.test(recipient) || !allowed.includes(recipient))
      throw new SetupError(
        "UNSAFE_RECIPIENT",
        "This recipient is not enabled for test messages.",
      );
    const sent = await fetch(
      `https://graph.facebook.com/v26.0/${data.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: recipient,
          type: "text",
          text: { body: "Tany WhatsApp connection test." },
        }),
      },
    );
    const receipt = await sent.json();
    if (!sent.ok || !receipt.messages?.[0]?.id)
      throw new SetupError(
        "TEST_SEND_FAILED",
        "The test message could not be sent. Check your test recipient and try again.",
      );
  }
  return {
    mode: "live",
    message:
      input.sendTest === true
        ? "Connection verified. Test message accepted by WhatsApp."
        : "Connection verified. No test message was sent.",
  } as const;
}

export async function testWhatsAppSetup(businessId: string, input: unknown) {
  await checkedBusiness(businessId);
  const options = inputObject(input);
  const ref = refFor(businessId);
  const claimed = await adminDb.runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data();
    if (!data || data.businessId !== businessId)
      throw new SetupError(
        "NOT_FOUND",
        "Save your WhatsApp details first.",
        404,
      );
    if (data.setupType !== "existing")
      throw new SetupError(
        "ASSISTANCE_REQUIRED",
        "Tany will help complete your WhatsApp Business setup.",
      );
    if (data.status === "testing" || data.status === "connected")
      throw new SetupError(
        "ACCOUNT_BUSY",
        "This account is already connected or being tested.",
        409,
      );
    await assertWhatsAppPhoneMapping(tx, businessId, data.phoneNumberId);
    tx.update(ref, {
      status: "testing",
      setupStep: 4,
      testPassed: false,
      updatedAt: serverTimestamp(),
    });
    return data;
  });
  try {
    const result = await validateWithProvider(claimed, options);
    await requireWhatsAppEntitlement(businessId);
    await adminDb.runTransaction(async (tx) => {
      const latest = (await tx.get(ref)).data();
      if (latest?.revision !== claimed.revision || latest?.status !== "testing")
        throw new SetupError(
          "STALE_TEST",
          "Account details changed. Test again.",
          409,
        );
      tx.update(ref, {
        status: "pending",
        setupStep: 5,
        testPassed: true,
        validationMode: result.mode,
        testMessage: result.message,
        testedAt: Timestamp.now(),
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    await adminDb.runTransaction(async (tx) => {
      const latest = (await tx.get(ref)).data();
      if (latest?.revision === claimed.revision && latest?.status === "testing")
        tx.update(ref, {
          status: "error",
          setupStep: 4,
          testPassed: false,
          testMessage:
            error instanceof SetupError
              ? error.message
              : "Connection check failed. Please try again.",
          updatedAt: serverTimestamp(),
        });
    });
    if (error instanceof EntitlementError) throw error;
    if (!(error instanceof SetupError))
      throw new SetupError(
        "VALIDATION_FAILED",
        "Connection check failed. Please try again.",
      );
    throw error;
  }
  return getWhatsAppSetup(businessId);
}
export async function activateWhatsAppSetup(businessId: string) {
  await checkedBusiness(businessId);
  await adminDb.runTransaction(async (tx) => {
    const ref = refFor(businessId);
    const data = (await tx.get(ref)).data();
    if (!data || data.businessId !== businessId)
      throw new SetupError("NOT_FOUND", "Account unavailable.", 404);
    if (data.status === "connected") return;
    if (
      data.setupType !== "existing" ||
      data.status !== "pending" ||
      data.testPassed !== true ||
      !["live", "manual_test"].includes(data.validationMode) ||
      !(data.testedAt instanceof Timestamp) ||
      data.testedAt.toMillis() < Date.now() - 15 * 60000
    )
      throw new SetupError(
        "TEST_REQUIRED",
        "Run a successful connection test before activating.",
      );
    if (
      data.validationMode === "manual_test" &&
      process.env.WHATSAPP_SETUP_ALLOW_MANUAL_TEST !== "true"
    )
      throw new SetupError(
        "TEST_REQUIRED",
        "Run a live connection test before activating.",
      );
    if (
      data.validationMode === "live" &&
      !accountAccessToken(data.tokenSecretName, data.businessId)
    )
      throw new SetupError(
        "LIVE_UNAVAILABLE",
        "The account credential is unavailable.",
      );
    await assertWhatsAppPhoneMapping(tx, businessId, data.phoneNumberId);
    tx.update(ref, {
      status: "connected",
      setupStep: 5,
      updatedAt: serverTimestamp(),
    });
    tx.update(adminDb.collection("businesses").doc(businessId), {
      whatsappPhoneNumberId: data.phoneNumberId,
      updatedAt: serverTimestamp(),
    });
  });
  return getWhatsAppSetup(businessId);
}
export async function disconnectWhatsAppSetup(businessId: string) {
  await checkedBusiness(businessId);
  await adminDb.runTransaction(async (tx) => {
    const ref = refFor(businessId);
    const data = (await tx.get(ref)).data();
    if (!data || data.businessId !== businessId)
      throw new SetupError("NOT_FOUND", "Account unavailable.", 404);
    tx.update(ref, {
      status: "disconnected",
      testPassed: false,
      setupStep: 2,
      revision: (data.revision ?? 0) + 1,
      updatedAt: serverTimestamp(),
    });
  });
  return getWhatsAppSetup(businessId);
}

