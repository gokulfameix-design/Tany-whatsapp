import type { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { TanyVertical, MessagingReply } from "@/lib/messaging/types";

export type StoredTimestamp = Timestamp | FieldValue;
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type ConversationContext = { [key: string]: JsonValue };
export type ConversationStatus =
  | "active"
  | "waiting_customer"
  | "waiting_payment"
  | "completed"
  | "cancelled"
  | "handed_off";
export type OrderStatus =
  | "draft"
  | "pending_confirmation"
  | "awaiting_payment"
  | "paid"
  | "confirmed"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "delivered"
  | "cancelled";
export type BookingStatus =
  | "draft"
  | "pending_confirmation"
  | "awaiting_payment"
  | "paid"
  | "confirmed"
  | "completed"
  | "cancelled";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";
export type MessageDirection = "incoming" | "outgoing";
export type MessageProcessingStatus = "received" | "processed" | "failed";

export type LocationData = {
  latitude: number;
  longitude: number;
  address: string | null;
  label: string | null;
  source: "whatsapp" | "manual" | "stored";
  updatedAt: StoredTimestamp;
};

export type Customer = {
  id: string;
  businessId: string;
  phone: string;
  uid?: string;
  linkedToTany?: boolean;
  pendingWhatsAppIntent?: string;
  savedAddresses?: Partial<Record<"home" | "work", LocationData>>;
  recentSelections?: ConversationContext;
  vehicles?: string[];
  whatsappMenu?: ConversationContext | null;
  name: string | null;
  createdAt: StoredTimestamp;
  updatedAt: StoredTimestamp;
  lastInteractionAt: StoredTimestamp;
  location?: LocationData;
  metadata: ConversationContext;
};

export type Conversation = {
  id: string;
  businessId: string;
  customerPhone: string;
  vertical: TanyVertical;
  state: string;
  status: ConversationStatus;
  context: ConversationContext;
  lastIncomingText: string;
  pendingReply: string | null;
  createdAt: StoredTimestamp;
  updatedAt: StoredTimestamp;
};

export type OrderItem = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  metadata: ConversationContext;
};

export type Order = {
  automationRevision?: number;
  id: string;
  businessId: string;
  customerPhone: string;
  vertical: TanyVertical;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  currency: "INR";
  status: OrderStatus;
  location: LocationData | null;
  paymentId: string | null;
  createdAt: StoredTimestamp;
  updatedAt: StoredTimestamp;
};

export type Booking = {
  automationRevision?: number;
  id: string;
  businessId: string;
  customerPhone: string;
  vertical: TanyVertical;
  serviceId: string | null;
  serviceName: string | null;
  staffId: string | null;
  staffName: string | null;
  resourceId: string | null;
  resourceName: string | null;
  bookingDate: string | null;
  startTime: string | null;
  endTime: string | null;
  amount: number;
  currency: "INR";
  status: BookingStatus;
  paymentId: string | null;
  metadata: ConversationContext;
  createdAt: StoredTimestamp;
  updatedAt: StoredTimestamp;
};

export type Payment = {
  automationRevision?: number;
  id: string;
  businessId: string;
  customerPhone: string;
  amount: number;
  currency: "INR";
  provider: "razorpay";
  providerPaymentId: string | null;
  referenceType: "order" | "booking";
  referenceId: string;
  status: PaymentStatus;
  failureReason: string | null;
  createdAt: StoredTimestamp;
  updatedAt: StoredTimestamp;
};

export type StoredMessage = {
  selectionId?: string;
  selectionTitle?: string;
  location?: LocationData;
  rawMessageType?: string;
  replyType?: MessagingReply["type"];
  body?: string;
  reply?: MessagingReply;
  businessId: string;
  vertical: TanyVertical;
  customerPhone: string;
  messageId: string;
  type: string;
  text: string;
  direction: MessageDirection;
  whatsappTimestamp: string | null;
  createdAt: StoredTimestamp;
  processingStatus: MessageProcessingStatus;
};
