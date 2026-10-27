import type { TanyVertical } from "@/lib/messaging/types";

export const operationSections = [
  "inbox",
  "contacts",
  "templates",
  "campaigns",
  "automations",
  "message-status",
  "webhook-health",
  "whatsapp-accounts",
  "setup-requests",
  "settings",
] as const;
export type OperationSection = "overview" | (typeof operationSections)[number];
export const operationLabels: Record<OperationSection, string> = {
  overview: "Overview",
  inbox: "Inbox",
  contacts: "Contacts",
  templates: "Templates",
  campaigns: "Campaigns",
  automations: "Automations",
  "message-status": "Message Status",
  "webhook-health": "Webhook Health",
  "whatsapp-accounts": "WhatsApp Accounts",
  "setup-requests": "Setup Requests",
  settings: "Settings",
};
export type OperationMessage = {
  id: string;
  messageId: string;
  businessId: string;
  business: string;
  vertical: TanyVertical;
  phone: string;
  direction: "incoming" | "outgoing";
  type: string;
  text: string;
  status: string;
  at: string | null;
  failure: string;
};
export type OperationConversation = {
  id: string;
  businessId: string;
  business: string;
  vertical: TanyVertical;
  phone: string;
  name: string;
  lastMessage: string;
  at: string | null;
  status: string;
  unread: number | null;
  total: number;
};
export type OperationRecord = {
  body?: string;
  id: string;
  businessId: string;
  business: string;
  name: string;
  status: string;
  language: string;
  category: string;
  at: string | null;
  template: string;
  audience: string;
  schedule: string | null;
};
export type OperationAccount = {
  internalTestingActive?: boolean;
  accountId?: string | null;
  metadataStatus?: string;
  businessId: string;
  business: string;
  vertical: TanyVertical;
  phone: string | null;
  displayName: string;
  phoneNumberId: string | null;
  wabaId: string | null;
  status: string;
  quality: string;
  subscription: string;
  at: string | null;
};
export type OperationSettings = {
  defaultBehavior: "bot" | "human";
  handoffEnabled: boolean;
  timeoutMinutes: number;
  templateLanguage: string;
  retryAttempts: number;
  logging: "minimal" | "standard";
};
export type AutomationRule = {
  id: string;
  name: string;
  trigger: string;
  action: string;
  enabled: boolean;
};
export type OperationsData = {
  audience?: "client" | "admin";
  setupRequests?: Array<{ businessId: string; business: string; displayName: string; phone: string; status: string; at: string | null }>;
  businessId: string | null;
  businessName: string;
  messages: OperationMessage[];
  conversations: OperationConversation[];
  contacts: OperationConversation[];
  templates: OperationRecord[];
  campaigns: OperationRecord[];
  accounts: OperationAccount[];
  settings: OperationSettings;
  automations: AutomationRule[];
  health: {
    verification: string;
    lastReceived: string | null;
    incoming: number;
    failed: number;
    duplicates: number | null;
    latency: number | null;
    lastError: string;
  };
};

export const clientOperationSections = ["inbox", "contacts", "templates", "campaigns", "automations", "message-status", "settings"] as const;
export function isClientOperationSection(section: string) {
  return section === "overview" || clientOperationSections.some(value => value === section);
}
