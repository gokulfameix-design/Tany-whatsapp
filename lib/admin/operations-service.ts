import { receiptStatus } from "@/lib/admin/delivery-receipts";
import { requireWhatsAppEntitlement } from "@/lib/subscriptions/entitlements";
import "server-only";
import { adminDb } from "@/lib/firebase-admin";
import { getAdminBusiness, listBusinessProfiles } from "@/lib/admin/services";
import { getWhatsAppOverview, readWhatsAppOverviewForAdmin } from "@/lib/admin/whatsapp-service";
import { firestoreTemplateProvider } from "@/lib/admin/template-provider";
import { documentId, serverTimestamp } from "@/lib/messaging/services/shared";
import type { AdminBusiness } from "@/lib/admin/types";
import type {
  AutomationRule,
  OperationRecord,
  OperationsData,
  OperationSettings,
} from "./operations-types";

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
// Free-form provider errors and raw configuration must never cross the server boundary.
const str = (v: unknown, max = 500) =>
  typeof v === "string" ? v.slice(0, max) : "";
function at(v: unknown): string | null {
  const value = obj(v);
  const date =
    typeof value.toDate === "function"
      ? value.toDate()
      : typeof v === "string"
        ? new Date(v)
        : null;
  return date instanceof Date && Number.isFinite(date.getTime())
    ? date.toISOString()
    : null;
}
const choose = (v: unknown, choices: string[], fallback: string) =>
  typeof v === "string" && choices.includes(v) ? v : fallback;
const count = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;
export const defaultOperationSettings: OperationSettings = {
  defaultBehavior: "bot",
  handoffEnabled: true,
  timeoutMinutes: 1440,
  templateLanguage: "en",
  retryAttempts: 0,
  logging: "standard",
};
export const defaultAutomationRules: AutomationRule[] = [
  [
    "welcome",
    "Welcome message",
    "First incoming message",
    "Route to existing vertical welcome flow",
  ],
  [
    "order",
    "Order confirmation",
    "Order confirmed",
    "Existing commerce flow confirmation",
  ],
  [
    "booking",
    "Booking confirmation",
    "Booking confirmed",
    "Existing appointment flow confirmation",
  ],
  [
    "payment",
    "Payment reminder",
    "Payment pending",
    "Template reminder (not connected)",
  ],
  [
    "abandoned",
    "Abandoned conversation",
    "Conversation timeout",
    "Template follow-up (not connected)",
  ],
  [
    "handoff",
    "Human handoff",
    "Agent takes over",
    "Pause bot replies for this conversation",
  ],
].map(([id, name, trigger, action]) => ({
  id,
  name,
  trigger,
  action,
  enabled: false,
}));

async function requireBusiness(id: string) {
  const business = await getAdminBusiness(documentId(id));
  if (!business) throw new Error("Business not found");
  return business;
}
async function rows(collection: string, businessId: string) {
  const result = await adminDb
    .collection(collection)
    .where("businessId", "==", businessId)
    .get();
  return result.docs
    .filter((doc) => doc.data().businessId === businessId)
    .map((doc) => ({ id: doc.id, data: doc.data() }));
}
function settingsProjection(raw: unknown): OperationSettings {
  const data = obj(raw);
  return {
    defaultBehavior: data.defaultBehavior === "human" ? "human" : "bot",
    handoffEnabled: data.handoffEnabled !== false,
    timeoutMinutes: Math.min(
      10080,
      Math.max(1, count(data.timeoutMinutes) ?? 1440),
    ),
    templateLanguage: /^[a-z]{2,3}(_[A-Z]{2})?$/.test(
      str(data.templateLanguage),
    )
      ? str(data.templateLanguage)
      : "en",
    retryAttempts: Math.min(5, count(data.retryAttempts) ?? 0),
    logging: data.logging === "minimal" ? "minimal" : "standard",
  };
}
async function businessOperations(
  business: AdminBusiness,
  adminRead = false,
): Promise<OperationsData> {
  const businessId = business.id;
  const [
    messages,
    conversations,
    customers,
    templates,
    campaigns,
    overview,
    config,
    setup,
    receipts,
    accountRows,
  ] = await Promise.all([
    rows("messages", businessId),
    rows("conversations", businessId),
    rows("customers", businessId),
    firestoreTemplateProvider.list({ businessId, businessName: business.name }),
    rows("campaigns", businessId),
    adminRead ? readWhatsAppOverviewForAdmin(businessId) : getWhatsAppOverview(businessId),
    adminDb
      .collection("businesses")
      .doc(businessId)
      .collection("whatsappOperations")
      .doc("config")
      .get(),
    adminDb.collection("whatsapp_accounts").doc(businessId).get(),
    rows("message_delivery_events", businessId),
    rows("whatsapp_accounts", businessId),
  ]);
  const meta = {
    businessId,
    business: business.name,
    vertical: business.vertical,
  };
  const projectedMessages = messages
    .filter(({ data }) => ["incoming", "outgoing"].includes(data.direction))
    .map(({ id, data }) => ({
      id,
      ...meta,
      messageId: str(data.messageId, 200) || id,
      phone: str(data.customerPhone || data.from, 30),
      direction: data.direction as "incoming" | "outgoing",
      type: choose(
        data.replyType ?? data.type,
        [
          "text",
          "interactive",
          "buttons",
          "button",
          "list",
          "location",
          "image",
          "audio",
          "video",
          "document",
          "template",
          "cta_url",
          "location_request",
        ],
        "other",
      ),
      text: str(data.text || data.body, 10000),
      status: choose(
        data.deliveryStatus,
        ["sending", "sent", "delivered", "read", "failed"],
        data.processingStatus === "failed"
          ? "failed"
          : data.direction === "incoming"
            ? "received"
            : "unknown",
      ),
      at: at(data.createdAt),
      failure:
        data.processingStatus === "failed" || data.deliveryStatus === "failed"
          ? "Processing or delivery failed. Check restricted server logs for details."
          : "",
    }))
    .sort(
      (a, b) =>
        (a.at ?? "").localeCompare(b.at ?? "") || a.id.localeCompare(b.id),
    );
  for (const message of projectedMessages) {
    for (const receipt of receipts.filter(r => r.data.messageId === message.messageId).sort((a,b) => str(a.data.at).localeCompare(str(b.data.at))))
      message.status = receiptStatus(message.status, str(receipt.data.status));
  }
  const projectedConversations = conversations
    .map(({ id, data }) => {
      const phone = str(data.customerPhone, 30);
      const history = projectedMessages.filter(
        (message) => message.phone === phone,
      );
      const customer = customers.find(
        (customer) => customer.data.phone === phone,
      )?.data;
      return {
        id,
        ...meta,
        phone,
        name: str(customer?.name, 120) || phone || "Unknown customer",
        lastMessage: history.at(-1)?.text || str(data.lastIncomingText),
        at: history.at(-1)?.at ?? at(data.updatedAt),
        status: choose(
          data.status,
          [
            "active",
            "waiting_customer",
            "waiting_payment",
            "completed",
            "cancelled",
            "handed_off",
          ],
          "unknown",
        ),
        unread: history.filter(message => message.direction === "incoming" && (!at(data.dashboardReadAt) || (message.at ?? "") > at(data.dashboardReadAt)!)).length,
        total: history.length,
      };
    })
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  const records = (items: typeof campaigns): OperationRecord[] =>
    items.map(({ id, data }) => ({
      id,
      businessId,
      business: business.name,
      name: str(data.name, 120),
      status: choose(
        data.status,
        ["draft", "scheduled", "running", "completed", "failed"],
        "draft",
      ),
      language: str(data.language, 20),
      category: choose(
        data.category,
        ["marketing", "utility", "authentication"],
        "unknown",
      ),
      at: at(data.updatedAt),
      template: str(data.template, 120),
      audience: str(data.audience, 240),
      schedule: at(data.schedule),
    }));
  const configuration = obj(config.data());
  return {
    businessId,
    businessName: business.name,
    setupRequests: setup.data()?.businessId === businessId && setup.data()?.setupType === "new" ? [{ businessId, business: business.name, displayName: str(setup.data()?.displayName, 120), phone: str(setup.data()?.displayPhone, 30), status: str(setup.data()?.status, 30), at: at(setup.data()?.createdAt) }] : [],
    messages: projectedMessages,
    conversations: projectedConversations,
    contacts: customers
      .filter(
        ({ data }) =>
          projectedMessages.some(
            (message) =>
              message.phone === data.phone && message.direction === "incoming",
          ) ||
          projectedConversations.some(
            (conversation) => conversation.phone === data.phone,
          ),
      )
      .map(({ id, data }) => {
        const conversation = projectedConversations.find(
          (conversation) => conversation.phone === data.phone,
        );
        return {
          id,
          ...meta,
          phone: str(data.phone, 30),
          name: str(data.name, 120) || "Unnamed customer",
          lastMessage: "",
          at: at(data.lastInteractionAt),
          status: conversation?.status ?? "unknown",
          unread: null,
          total: projectedMessages.filter(
            (message) => message.phone === data.phone,
          ).length,
        };
      }),
    templates,
    campaigns: records(campaigns),
    accounts: accountRows.length ? accountRows.map(({ id, data }) => ({
      ...meta,
      accountId: id,
      internalTestingActive: data.status === "connected" && data.internalTestingActive === true,
      metadataStatus: str(data.status, 30),
      phone: str(data.displayPhone, 30) || null,
      displayName: str(data.displayName, 120) || business.name,
      phoneNumberId: str(data.phoneNumberId, 40) || null,
      wabaId: str(data.wabaId, 40) || null,
      status: data.status === "connected" && data.testPassed === true && data.validationMode === "live" && data.testedAt
        ? "Connected" : data.status === "disconnected" ? "Disconnected" : data.status === "error" ? "Error" : "Configured · unverified",
      quality: "Unknown", subscription: "Unknown", at: at(data.updatedAt),
    })) : [
      {
        accountId: business.whatsappPhoneNumberId ? businessId : null,
        ...meta,
        phone: overview.connectedNumber,
        displayName: overview.displayName ?? business.name,
        phoneNumberId: overview.phoneNumberId,
        wabaId: overview.wabaId,
        status: !business.active ? "Inactive" : business.whatsappPhoneNumberId ? "Configured · unverified" : "Not connected",
        quality: overview.qualityRating ?? "Unknown",
        subscription: overview.webhookSubscription ?? "Unknown",
        at:
          [overview.lastWebhookAt, overview.lastOutgoing?.recordedAt]
            .filter((value): value is string => !!value)
            .sort()
            .at(-1) ?? null,
      },
    ],
    settings: settingsProjection(configuration.settings),
    automations: defaultAutomationRules.map((rule) => ({
      ...rule,
      enabled: obj(configuration.automations)[rule.id] === true,
    })),
    health: {
      verification:
        overview.webhookVerification ??
        "Unknown Â· provider verification not recorded",
      lastReceived: overview.lastWebhookAt,
      incoming: overview.counts.incoming,
      failed: overview.counts.failed,
      duplicates: null,
      latency: null,
      lastError: overview.counts.failed
        ? "Processing failure recorded. Inspect restricted server logs."
        : "No recorded processing failures",
    },
  };
}
/** Scope is explicit at every query, including the Super Admin aggregation. Never return raw Firestore data. */
export async function getOperationsData(
  businessId?: string,
): Promise<OperationsData> {
  if (businessId) return businessOperations(await requireBusiness(businessId), true);
  const profiles = await listBusinessProfiles();
  const data = await Promise.all(profiles.map(business => businessOperations(business, true)));
  return {
    businessId: null,
    setupRequests: data.flatMap(d => d.setupRequests ?? []),
    businessName: "All WhatsApp workspaces",
    messages: data.flatMap((d) => d.messages),
    conversations: data
      .flatMap((d) => d.conversations)
      .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "")),
    contacts: data.flatMap((d) => d.contacts),
    templates: data.flatMap((d) => d.templates),
    campaigns: data.flatMap((d) => d.campaigns),
    accounts: data.flatMap((d) => d.accounts),
    settings: defaultOperationSettings,
    automations: defaultAutomationRules,
    health: {
      verification: "Unknown Â· provider verification not recorded",
      lastReceived:
        data
          .map((d) => d.health.lastReceived)
          .filter((v): v is string => !!v)
          .sort()
          .at(-1) ?? null,
      incoming: data.reduce((n, d) => n + d.health.incoming, 0),
      failed: data.reduce((n, d) => n + d.health.failed, 0),
      duplicates: null,
      latency: null,
      lastError: data.some((d) => d.health.failed)
        ? "Processing failures recorded. Inspect business diagnostics."
        : "No recorded processing failures",
    },
  };
}

// Configuration is stored separately from domain/flow settings. These are preferences, not a new flow engine.
export async function saveOperationsConfiguration(
  businessId: string,
  input: unknown,
  internalConsole = false,
) {
  if (!internalConsole) await requireWhatsAppEntitlement(businessId);
  await requireBusiness(businessId);
  const data = obj(input);
  const settings = settingsProjection(data.settings);
  const automations = Object.fromEntries(
    defaultAutomationRules.map((rule) => [
      rule.id,
      obj(data.automations)[rule.id] === true,
    ]),
  );
  await adminDb
    .collection("businesses")
    .doc(businessId)
    .collection("whatsappOperations")
    .doc("config")
    .set({ settings, automations, updatedAt: serverTimestamp() });
}
export async function createCampaignDraft(businessId: string, input: unknown, internalConsole = false) {
  if (!internalConsole) await requireWhatsAppEntitlement(businessId);
  await requireBusiness(businessId);
  const data = obj(input);
  const name = str(data.name, 120).trim();
  if (!name || !str(data.template).trim() || !str(data.audience).trim())
    throw new Error("Name, template and audience are required");
  const templates = await firestoreTemplateProvider.list({
    businessId,
    businessName: "",
  });
  if (
    !templates.some(
      (template) =>
        template.id === data.template && template.status === "approved",
    )
  )
    throw new Error("Choose an approved template from this business");
  await adminDb
    .collection("campaigns")
    .doc()
    .create({
      businessId,
      name,
      template: str(data.template, 120),
      audience: str(data.audience, 240),
      schedule: at(data.schedule),
      status: "draft",
      updatedAt: serverTimestamp(),
    });
}
export async function setConversationHandoff(
  businessId: string,
  conversationId: string,
  human: boolean,
  internalConsole = false,
) {
  if (!internalConsole) await requireWhatsAppEntitlement(businessId);
  await requireBusiness(businessId);
  if (typeof human !== "boolean") throw new Error("Invalid handoff mode");
  const ref = adminDb
    .collection("conversations")
    .doc(documentId(conversationId));
  await adminDb.runTransaction(async (transaction) => {
    const current = (await transaction.get(ref)).data();
    if (!current || current.businessId !== businessId)
      throw new Error("Conversation not found");
    transaction.update(ref, {
      status: human ? "handed_off" : "active",
      updatedAt: serverTimestamp(),
    });
  });
}
