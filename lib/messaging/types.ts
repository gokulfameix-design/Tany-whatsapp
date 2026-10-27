import type { DebugReporter } from "@/lib/messaging/orchestration-debug";
import type { FieldValue, Timestamp } from "firebase-admin/firestore";
import type {
  ConversationContext,
  ConversationStatus,
} from "@/lib/messaging/domain-types";
import type { LocationData } from "@/lib/messaging/domain-types";

export type TextReply = { type: "text"; body: string };
export type ButtonReply = {
  type: "buttons";
  body: string;
  buttons: Array<{ id: string; title: string }>;
};
export type ListReply = {
  type: "list";
  body: string;
  buttonText: string;
  sections: Array<{
    title?: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>;
};
export type UrlReply = {
  type: "cta_url";
  body: string;
  title: string;
  url: string;
};
export type LocationRequestReply = { type: "location_request"; body: string };
export type ProductReply = {
  skipReason?: string;
  fallbackItem?: { id: string; name: string; price: number; available: boolean };
  allowFallback?: boolean;
  type: "product";
  body: string;
  catalogId: string;
  retailerProductId: string;
  fallback: TextReply | ButtonReply | ListReply;
};
export type ProductListReply = {
  type: "product_list";
  body: string;
  header: string;
  catalogId: string;
  footer?: string;
  sections: { title: string; productItems?: { productRetailerId: string }[]; productIds?: string[] }[];
  fallback: TextReply | ButtonReply | ListReply;
};
export type MessagingReply =
  | TextReply
  | ButtonReply
  | ListReply
  | UrlReply
  | LocationRequestReply
  | ProductReply
  | ProductListReply
  | ProductSequenceReply;
export type ProductSequenceReply = {
  type: "product_sequence";
  body: string;
  products: ProductReply[];
  finalReply: ButtonReply;
  fallback: TextReply | ButtonReply | ListReply;
};
export type IncomingMessageInput = {
  type:
    | "text"
    | "button"
    | "list"
    | "location"
    | "order"
    | "product"
    | "unsupported";
  text: string;
  messageId?: string;
  product?: { catalogId: string; retailerProductId: string };
  order?: {
    catalogId: string;
    items: { retailerProductId: string; quantity: number }[];
  };
  selectionId?: string;
  selectionTitle?: string;
  location?: LocationData;
};

export type TanyVertical =
  | "motos"
  | "eats"
  | "cabs"
  | "ecom"
  | "expert"
  | "gaming"
  | "garage"
  | "meat"
  | "meds"
  | "retail"
  | "salon"
  | "sport";

export type Business = {
  id: string;
  name: string;
  vertical: TanyVertical;
  whatsappPhoneNumberId: string;
  active: boolean;
};

export type FlowResult = {
  state: string;
  reply: MessagingReply;
  vertical: TanyVertical;
  originalText: string;
  status?: ConversationStatus;
  context?: ConversationContext;
  action?: {
    type: string;
    payload?: Record<string, unknown>;
  };
};

export type ConversationState = {
  businessId: string;
  vertical: TanyVertical;
  customerPhone: string;
  state: string;
  lastIncomingText: string;
  pendingReply: string | null;
  updatedAt: Timestamp | FieldValue;
  status?: ConversationStatus;
  context?: ConversationContext;
};

export type FlowContext = {
  debugTrace?: DebugReporter;
  /** Enabled by the authenticated WhatsApp orchestration; domain handlers retain typed APIs. */
  clickFirst?: boolean;
  useRecent?: boolean;
  incoming?: IncomingMessageInput;
  business?: Business;
  customerPhone?: string;
  conversation?: ConversationState;
};
