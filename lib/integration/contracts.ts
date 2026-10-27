/** API v1 display contracts. This file is safe to copy into a UI-only consumer. */
export type MessagingVertical = "motos" | "eats" | "cabs" | "ecom" | "expert" | "gaming" | "garage" | "meat" | "meds" | "retail" | "salon" | "sport";
export type MessagingBusiness = { id: string; name: string; vertical: MessagingVertical; active: boolean };
export type MessagingActivity = { id: string; direction: "incoming" | "outgoing"; type: string; status: "received" | "processed" | "failed" | "unknown"; recordedAt: string | null };
export type MessagingOverview = { businessId: string; businessName: string; businessActive: boolean; phoneNumberId: string | null; wabaId: string | null; connectedNumber: string | null; lastWebhookAt: string | null; lastOutgoing: MessagingActivity | null; counts: { incoming: number; outgoing: number; failed: number; processing: number }; activity: MessagingActivity[] };
export type MessagingConversation = { id: string; businessId: string; title: string; description: string; phone: string; status: string; updatedAt: string | null };
export type MessagingTemplates = { businessId: string; status: "pending_setup"; items: { id: string; name: string; language: string; status: string }[] };
export type MessagingSetup = { phoneNumberId: string; wabaId: string; connectedNumber: string };
export type MessagingTest = { businessId: string; to: string; text: string; phoneNumberId: string | null; sent: false };
