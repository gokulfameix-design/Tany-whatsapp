import { requireWhatsAppEntitlement } from "@/lib/subscriptions/entitlements";
import "server-only";
import { demoAuthEnabled } from "@/lib/messaging/auth-mode";
import { randomBytes } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import {
  customerDocumentId,
  documentId,
  serverTimestamp,
} from "@/lib/messaging/services/shared";
import { getBusinessConfig } from "@/lib/messaging/services/business-config-service";
import { sendWhatsAppMessage } from "@/lib/messaging/whatsapp";
import { identityMenu } from "@/lib/messaging/identity-menu";
import type { MessagingReply } from "@/lib/messaging/types";

export class LinkingError extends Error {
  constructor(
    public code: "invalid" | "expired" | "used" | "conflict" | "unavailable",
  ) {
    super(code);
  }
}
export function whatsappPhone(value: string) {
  if (typeof value !== "string" || !/^\+?[1-9]\d{7,14}$/.test(value))
    throw new LinkingError("invalid");
  return value.replace(/^\+/, "");
}
function sessionRef(token: string) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
    throw new LinkingError("invalid");
  return adminDb.collection("whatsapp_link_sessions").doc(token);
}
function validateSession(
  data: FirebaseFirestore.DocumentData | undefined,
  now = Date.now(),
) {
  if (!data) throw new LinkingError("invalid");
  if (data.used !== false) throw new LinkingError("used");
  if (
    !(data.expiresAt instanceof Timestamp) ||
    data.expiresAt.toMillis() <= now
  )
    throw new LinkingError("expired");
  return {
    whatsappPhone: whatsappPhone(data.whatsappPhone),
    businessId: documentId(data.businessId),
  };
}
export async function resolveWhatsAppIdentity(
  phone: string,
): Promise<{ phone: string; uid: string } | null> {
  phone = whatsappPhone(phone);
  const data = (
    await adminDb.collection("whatsapp_identities").doc(phone).get()
  ).data();
  return data?.linked === true &&
    data.phone === phone &&
    typeof data.uid === "string" &&
    data.uid
    ? { phone, uid: data.uid }
    : null;
}
export async function createOrReuseLinkSession(
  phone: string,
  businessId: string,
  originalText?: string,
) {
  phone = whatsappPhone(phone);
  await requireWhatsAppEntitlement(businessId);
  documentId(businessId);
  const token = randomBytes(32).toString("hex");
  return adminDb.runTransaction(async (tx) => {
    const existing = await tx.get(
      adminDb
        .collection("whatsapp_link_sessions")
        .where("whatsappPhone", "==", phone)
        .where("businessId", "==", businessId)
        .where("used", "==", false),
    );
    const reusable = existing.docs.find(
      (doc) =>
        doc.data().expiresAt instanceof Timestamp &&
        doc.data().expiresAt.toMillis() > Date.now() &&
        /^[a-f0-9]{64}$/.test(doc.id),
    );
    if (reusable) return reusable.id;
    const pendingIntent =
      typeof originalText === "string" &&
      originalText.trim() &&
      originalText.length <= 1000 &&
      !/^(hi|hello|start|reset|cancel|confirm|paid|yes|no|new order|start new order|start a new order)$/i.test(
        originalText.trim(),
      )
        ? originalText
        : null;
    tx.create(sessionRef(token), {
      token,
      whatsappPhone: phone,
      businessId,
      expiresAt: Timestamp.fromMillis(Date.now() + 15 * 60 * 1000),
      used: false,
      createdAt: serverTimestamp(),
      ...(pendingIntent ? { pendingIntent } : {}),
    });
    return token;
  });
}
export function linkingReply(token: string): MessagingReply {
  sessionRef(token);
  return {
    type: "cta_url",
    body: "Welcome to Tany 👋 Connect your Tany account to continue.",
    title: "Login / Create Account",
    url: `https://tany-messaging-185656276893.asia-south1.run.app/connect/whatsapp?token=${token}`,
  };
}
/** Caller must possess the random link capability; real mode also requires authentication. */
export async function inspectLinkSession(token: string) {
  const data = (await sessionRef(token).get()).data();
  const scope = validateSession(data);
  await requireWhatsAppEntitlement(scope.businessId);
  return scope;
}
/** Demo identity is derived exclusively from the validated server-side session. */
export async function completeDemoLinkSession(token: string) {
  if (!demoAuthEnabled()) throw new LinkingError("invalid");
  const session = await inspectLinkSession(token);
  // completeLinkSession revalidates expiry/use and conflicts in its atomic transaction.
  return completeLinkSession(token, `demo_${session.whatsappPhone}`);
}
export async function completeLinkSession(token: string, uid: string) {
  if (typeof uid !== "string" || !uid || uid.length > 128)
    throw new LinkingError("invalid");
  const checked = await inspectLinkSession(token);
  await requireWhatsAppEntitlement(checked.businessId);
  const ref = sessionRef(token);
  const linked = await adminDb.runTransaction(async (tx) => {
    const session = (await tx.get(ref)).data();
    const scope = validateSession(session);
    const identityRef = adminDb
      .collection("whatsapp_identities")
      .doc(scope.whatsappPhone);
    const customerRef = adminDb
      .collection("customers")
      .doc(customerDocumentId(scope.businessId, scope.whatsappPhone));
    const [identitySnapshot, customerSnapshot, businessSnapshot] =
      await Promise.all([
        tx.get(identityRef),
        tx.get(customerRef),
        tx.get(adminDb.collection("businesses").doc(scope.businessId)),
      ]);
    const identity = identitySnapshot.data();
    const customer = customerSnapshot.data();
    if (!businessSnapshot.exists || businessSnapshot.data()?.active !== true)
      throw new LinkingError("unavailable");
    if (
      (identity?.uid && identity.uid !== uid) ||
      (customer?.uid && customer.uid !== uid)
    )
      throw new LinkingError("conflict");
    const now = serverTimestamp();
    tx.set(
      identityRef,
      {
        phone: scope.whatsappPhone,
        uid,
        linked: true,
        linkedAt: identity?.linkedAt ?? now,
        lastSeenAt: now,
      },
      { merge: true },
    );
    tx.set(
      customerRef,
      {
        businessId: scope.businessId,
        phone: scope.whatsappPhone,
        uid,
        linkedToTany: true,
        ...(!customer ? { name: null, metadata: {}, createdAt: now } : {}),
        ...(typeof session?.pendingIntent === "string"
          ? { pendingWhatsAppIntent: session.pendingIntent.slice(0, 1000) }
          : {}),
        updatedAt: now,
        lastInteractionAt: now,
      },
      { merge: true },
    );
    tx.update(ref, { used: true, usedAt: now, notificationStatus: "pending" });
    return scope;
  });
  return linked;
}
export async function touchLinkedCustomer(
  businessId: string,
  identity: { phone: string; uid: string },
) {
  const ref = adminDb
    .collection("customers")
    .doc(customerDocumentId(businessId, identity.phone));
  await adminDb.runTransaction(async (tx) => {
    const current = (await tx.get(ref)).data();
    if (current?.uid && current.uid !== identity.uid)
      throw new LinkingError("conflict");
    const now = serverTimestamp();
    tx.set(
      ref,
      {
        businessId,
        phone: identity.phone,
        uid: identity.uid,
        linkedToTany: true,
        ...(!current ? { name: null, metadata: {}, createdAt: now } : {}),
        updatedAt: now,
        lastInteractionAt: now,
      },
      { merge: true },
    );
    tx.update(adminDb.collection("whatsapp_identities").doc(identity.phone), {
      lastSeenAt: now,
    });
  });
}
export async function readPendingWhatsAppIntent(
  businessId: string,
  phone: string,
) {
  const data = (
    await adminDb
      .collection("customers")
      .doc(customerDocumentId(businessId, phone))
      .get()
  ).data();
  return data?.linkedToTany === true &&
    typeof data.pendingWhatsAppIntent === "string"
    ? data.pendingWhatsAppIntent
    : null;
}
export async function clearPendingWhatsAppIntent(
  businessId: string,
  phone: string,
  expected: string,
) {
  const ref = adminDb
    .collection("customers")
    .doc(customerDocumentId(businessId, phone));
  await adminDb.runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data();
    if (data?.pendingWhatsAppIntent === expected)
      tx.update(ref, { pendingWhatsAppIntent: FieldValue.delete() });
  });
}
/** After the atomic link commit; failures never undo a successful account link. */
export async function notifyAccountLinked(
  token: string,
  scope: { businessId: string; whatsappPhone: string },
) {
  await requireWhatsAppEntitlement(scope.businessId);
  const ref = sessionRef(token);
  const claimed = await adminDb.runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data();
    if (
      !data?.used ||
      data.notificationStatus !== "pending" ||
      data.businessId !== scope.businessId ||
      data.whatsappPhone !== scope.whatsappPhone
    )
      return false;
    tx.update(ref, { notificationStatus: "sending" });
    return true;
  });
  if (!claimed) return false;
  try {
    const business = await getBusinessConfig(scope.businessId);
    if (!business?.active) throw new LinkingError("unavailable");
    await sendWhatsAppMessage({
      phoneNumberId: business.whatsappPhoneNumberId,
      to: scope.whatsappPhone,
      reply: "✅ Your Tany account is connected.",
    });
    await sendWhatsAppMessage({
      phoneNumberId: business.whatsappPhoneNumberId,
      to: scope.whatsappPhone,
      reply: identityMenu(business.vertical),
    });
    await ref.update({ notificationStatus: "sent" });
    return true;
  } catch {
    await ref.update({ notificationStatus: "failed" });
    return false;
  }
}
