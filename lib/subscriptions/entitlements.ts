import "server-only";
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { documentId, serverTimestamp } from "@/lib/messaging/services/shared";

export type Plan = "basic" | "standard" | "pro";
export type SubscriptionStatus = "active" | "trialing" | "past_due" | "cancelled" | "expired";
export type Feature = "whatsappAutomation" | "campaigns" | "advancedAnalytics" | "aiAssistant";
const disabled = { whatsappAutomation: false, campaigns: false, advancedAnalytics: false, aiAssistant: false };
// The sole plan-to-feature policy. Unspecified features remain disabled.
export const planEntitlements: Record<Plan, Record<Feature, boolean>> = {
  basic: { ...disabled }, standard: { ...disabled }, pro: { ...disabled, whatsappAutomation: true },
};
export const upgradeRequired = {
  success: false, code: "UPGRADE_REQUIRED", feature: "whatsappAutomation",
  requiredPlan: "pro", message: "WhatsApp Automation requires an active Pro subscription.",
} as const;
export class EntitlementError extends Error {
  readonly details = upgradeRequired;
  constructor() { super(upgradeRequired.message); }
}
export async function resolveEntitlements(businessId: string, now = Date.now()) {
  documentId(businessId);
  const [subscriptionDoc, entitlementDoc] = await Promise.all([
    adminDb.collection("subscriptions").doc(businessId).get(),
    adminDb.collection("entitlements").doc(businessId).get(),
  ]);
  const subscription = subscriptionDoc.data();
  const stored = entitlementDoc.data();
  const plan = subscription?.plan;
  const policy = typeof plan === "string" && Object.hasOwn(planEntitlements, plan)
    ? planEntitlements[plan as Plan] : disabled;
  const active = subscription?.businessId === businessId && stored?.businessId === businessId &&
    subscription.status === "active" &&
    subscription.startedAt instanceof Timestamp && subscription.startedAt.toMillis() <= now &&
    subscription.expiresAt instanceof Timestamp && subscription.expiresAt.toMillis() > now;
  return Object.fromEntries(Object.keys(disabled).map(feature => [feature,
    Boolean(active && policy[feature as Feature] && stored?.[feature] === true),
  ])) as Record<Feature, boolean>;
}
export async function hasEntitlement(businessId: string, feature: Feature) {
  return (await resolveEntitlements(businessId))[feature] === true;
}
export async function requireWhatsAppEntitlement(businessId: string) {
  if (!await hasEntitlement(businessId, "whatsappAutomation")) throw new EntitlementError();
}

/** Internal Admin-SDK method only; never export through a customer-facing action/API. */
export async function assignDemoSubscription(businessId: string, plan: Plan,
  status: SubscriptionStatus = "active", days = 30) {
  documentId(businessId);
  if (!Object.hasOwn(planEntitlements, plan) || !["active", "trialing", "past_due", "cancelled", "expired"].includes(status) ||
    !Number.isInteger(days) || days < 1 || days > 365) throw new Error("Invalid demo subscription.");
  const now = Date.now();
  await adminDb.runTransaction(async tx => {
    if (!(await tx.get(adminDb.collection("businesses").doc(businessId))).exists) throw new Error("Business not found.");
    tx.set(adminDb.collection("subscriptions").doc(businessId), {
      businessId, product: "whatsappAutomation", plan, status,
      startedAt: Timestamp.fromMillis(now), expiresAt: Timestamp.fromMillis(now + days * 86400000), updatedAt: serverTimestamp(),
    });
    tx.set(adminDb.collection("entitlements").doc(businessId), {
      businessId, ...planEntitlements[plan], updatedAt: serverTimestamp(),
    });
  });
}
