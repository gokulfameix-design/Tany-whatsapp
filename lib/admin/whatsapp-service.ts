import { requireWhatsAppEntitlement } from "@/lib/subscriptions/entitlements";
import "server-only";
import { adminDb } from "@/lib/firebase-admin";
import { getAdminBusiness } from "@/lib/admin/services";
import { documentId } from "@/lib/messaging/services/shared";
import { AdminValidationError } from "@/lib/admin/validation";

export type WhatsAppActivity = {
  id: string;
  direction: "incoming" | "outgoing";
  type: string;
  status: "received" | "processed" | "failed" | "unknown";
  recordedAt: string | null;
};
export type WhatsAppOverview = {
  businessId: string;
  businessName: string;
  businessActive: boolean;
  phoneNumberId: string | null;
  wabaId: string | null;
  connectedNumber: string | null;
  displayName: string | null;
  connectionStatus: "connected" | "disconnected" | null;
  qualityRating: "GREEN" | "YELLOW" | "RED" | null;
  webhookSubscription: "subscribed" | "not_subscribed" | null;
  webhookVerification: "verified" | "unverified" | null;
  lastWebhookAt: string | null;
  lastOutgoing: WhatsAppActivity | null;
  counts: {
    incoming: number;
    outgoing: number;
    failed: number;
    processing: number;
  };
  activity: WhatsAppActivity[];
};
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function identifier(value: unknown): string | null {
  return typeof value === "string" && /^\d{1,40}$/.test(value) ? value : null;
}
function phone(value: unknown): string | null {
  return typeof value === "string" && /^\+?[\d ()-]{6,30}$/.test(value)
    ? value
    : null;
}
function timestamp(value: unknown): string | null {
  const data = object(value);
  if (typeof data.toDate !== "function") return null;
  const date: unknown = data.toDate();
  return date instanceof Date && Number.isFinite(date.getTime())
    ? date.toISOString()
    : null;
}

/** Read-only projection: never return raw settings, errors, tokens, message bodies, or prepared replies. */
export async function getWhatsAppOverview(
  businessId: string,
): Promise<WhatsAppOverview> {
  await requireWhatsAppEntitlement(businessId);
  return readWhatsAppOverviewForAdmin(businessId);
}

/** Internal projection for authenticated Super Admin aggregation, including locked businesses. */
export async function readWhatsAppOverviewForAdmin(businessId: string): Promise<WhatsAppOverview> {
  documentId(businessId);
  const business = await getAdminBusiness(businessId);
  if (!business)
    throw new AdminValidationError({ businessId: "Business not found." });
  const [profile, messages, accountDoc] = await Promise.all([
    adminDb.collection("businesses").doc(businessId).get(),
    adminDb.collection("messages").where("businessId", "==", businessId).get(),
    adminDb.collection("whatsapp_accounts").doc(businessId).get(),
  ]);
  const data = profile.data() ?? {};
  const settings = object(data.settings);
  const account = accountDoc.data();
  const whatsapp: Record<string, unknown> = {
    ...object(settings.whatsapp),
    ...(account?.businessId === businessId ? {
      displayName: account.displayName,
      connectedNumber: account.displayPhone,
      wabaId: account.wabaId,
      connectionStatus: account.status === "connected" ? "connected" : "disconnected",
    } : {}),
  };
  const activity: WhatsAppActivity[] = messages.docs.flatMap((doc) => {
    const message = doc.data();
    if (
      message.businessId !== businessId ||
      !["incoming", "outgoing"].includes(message.direction)
    )
      return [];
    return [
      {
        id: doc.id,
        direction: message.direction as WhatsAppActivity["direction"],
        type: [
          "text",
          "interactive",
          "image",
          "audio",
          "video",
          "document",
          "location",
          "button",
          "list",
        ].includes(message.type)
          ? message.type
          : "other",
        status: ["received", "processed", "failed"].includes(
          message.processingStatus,
        )
          ? message.processingStatus
          : "unknown",
        recordedAt: timestamp(message.createdAt),
      },
    ];
  });
  activity.sort(
    (a, b) =>
      (b.recordedAt ?? "").localeCompare(a.recordedAt ?? "") ||
      a.id.localeCompare(b.id),
  );
  return {
    businessId,
    businessName: business.name,
    businessActive: business.active,
    phoneNumberId: identifier(business.whatsappPhoneNumberId),
    wabaId: Object.prototype.hasOwnProperty.call(whatsapp, "wabaId")
      ? identifier(whatsapp.wabaId)
      : (identifier(data.whatsappBusinessAccountId) ??
        identifier(data.wabaId) ??
        identifier(settings.wabaId)),
    connectedNumber: Object.prototype.hasOwnProperty.call(
      whatsapp,
      "connectedNumber",
    )
      ? phone(whatsapp.connectedNumber)
      : (phone(data.whatsappDisplayPhoneNumber) ??
        phone(data.connectedNumber) ??
        phone(whatsapp.displayPhoneNumber)),
    displayName:
      typeof whatsapp.displayName === "string"
        ? whatsapp.displayName.slice(0, 120)
        : null,
    connectionStatus:
      whatsapp.connectionStatus === "connected" ||
      whatsapp.connectionStatus === "disconnected"
        ? whatsapp.connectionStatus
        : null,
    qualityRating:
      whatsapp.qualityRating === "GREEN" ||
      whatsapp.qualityRating === "YELLOW" ||
      whatsapp.qualityRating === "RED"
        ? whatsapp.qualityRating
        : null,
    webhookSubscription:
      whatsapp.webhookSubscription === "subscribed" ||
      whatsapp.webhookSubscription === "not_subscribed"
        ? whatsapp.webhookSubscription
        : null,
    webhookVerification:
      whatsapp.webhookVerification === "verified" ||
      whatsapp.webhookVerification === "unverified"
        ? whatsapp.webhookVerification
        : null,
    lastWebhookAt:
      activity.find(
        (message) => message.direction === "incoming" && message.recordedAt,
      )?.recordedAt ?? null,
    lastOutgoing:
      activity.find((message) => message.direction === "outgoing") ?? null,
    counts: {
      incoming: activity.filter((message) => message.direction === "incoming")
        .length,
      outgoing: activity.filter((message) => message.direction === "outgoing")
        .length,
      failed: activity.filter((message) => message.status === "failed").length,
      processing: activity.filter((message) => message.status === "received")
        .length,
    },
    activity: activity.slice(0, 25),
  };
}

/** Validate a local test only. No message write, workflow mutation, credential read, or external call. */
export async function prepareWhatsAppTest(
  businessId: string,
  recipient: unknown,
  message: unknown,
) {
  await requireWhatsAppEntitlement(businessId);
  const business = await getAdminBusiness(documentId(businessId));
  if (!business)
    throw new AdminValidationError({ businessId: "Business not found." });
  if (
    typeof recipient !== "string" ||
    !/^\+?[1-9]\d{7,14}$/.test(recipient.trim())
  )
    throw new AdminValidationError({
      recipient: "Enter a phone number with country code, using 8–15 digits.",
    });
  if (typeof message !== "string" || !message.trim() || message.length > 1000)
    throw new AdminValidationError({
      message: "Enter a message between 1 and 1,000 characters.",
    });
  return {
    businessId,
    phoneNumberId: identifier(business.whatsappPhoneNumberId),
    to: recipient.trim().replace(/^\+/, ""),
    text: message.trim(),
  };
}
