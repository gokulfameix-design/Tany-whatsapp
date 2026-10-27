import { writeEntityEvent } from "@/lib/automations/events";
import { adminDb } from "@/lib/firebase-admin";
import { mergeConversationContext } from "@/lib/messaging/context";
import type {
  Order,
  OrderItem,
  OrderStatus,
} from "@/lib/messaging/domain-types";
import type { TanyVertical } from "@/lib/messaging/types";
import {
  assertVertical,
  customerDocumentId,
  definedFields,
  documentId,
  money,
  mutateDocument,
  readDocument,
  serverTimestamp,
} from "@/lib/messaging/services/shared";

export type OrderItemInput = Omit<OrderItem, "totalPrice" | "metadata"> &
  Partial<Pick<OrderItem, "totalPrice" | "metadata">>;
export type OrderUpdate = Partial<
  Pick<Order, "deliveryFee" | "discount" | "location" | "paymentId" | "status">
> & { items?: OrderItemInput[] };
const reference = (id: string) =>
  adminDb.collection("orders").doc(documentId(id));

function normalizeItem(item: OrderItemInput): OrderItem {
  if (
    !item.id?.trim() ||
    !item.name?.trim() ||
    !Number.isFinite(item.quantity) ||
    item.quantity <= 0
  ) {
    throw new Error("Order item requires ID, name and positive quantity");
  }
  const unitPrice = money(item.unitPrice);
  return {
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    unitPrice,
    totalPrice: money(item.quantity * unitPrice),
    metadata: mergeConversationContext({}, item.metadata ?? {}),
  };
}

function totals(items: OrderItem[], deliveryFee: number, discount: number) {
  const subtotal = money(items.reduce((sum, item) => sum + item.totalPrice, 0));
  const normalizedFee = money(deliveryFee);
  const normalizedDiscount = money(discount);
  return {
    subtotal,
    deliveryFee: normalizedFee,
    discount: normalizedDiscount,
    total: money(Math.max(0, subtotal + normalizedFee - normalizedDiscount)),
  };
}

export async function createDraftOrder({
  businessId,
  customerPhone,
  vertical,
  reuseConversationDraft = false,
}: {
  businessId: string;
  customerPhone: string;
  vertical: TanyVertical;
  reuseConversationDraft?: boolean;
}): Promise<Order> {
  const conversationId = customerDocumentId(businessId, customerPhone);
  assertVertical(vertical);
  const ref = adminDb.collection("orders").doc();
  const now = serverTimestamp();
  const data: Omit<Order, "id"> = {
    businessId,
    customerPhone,
    vertical,
    items: [],
    subtotal: 0,
    deliveryFee: 0,
    discount: 0,
    total: 0,
    currency: "INR",
    status: "draft",
    location: null,
    paymentId: null,
    createdAt: now,
    updatedAt: now,
  };
  if (!reuseConversationDraft) {
    const created = { ...data, id: ref.id };
    await adminDb.runTransaction(async (tx) => {
      await writeEntityEvent(tx, "order.created", created);
      tx.create(ref, data);
    });
    return created;
  }
  const conversationRef = adminDb
    .collection("conversations")
    .doc(conversationId);
  const created = await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(conversationRef);
    const conversation = snapshot.data();
    if (!conversation || conversation.vertical !== vertical)
      throw new Error(
        "Order conversation not found or vertical does not match",
      );
    const context = mergeConversationContext({}, conversation.context ?? {});
    if (typeof context.orderId === "string") {
      const existing = await transaction.get(reference(context.orderId));
      const order = existing.data();
      if (
        !order ||
        order.businessId !== businessId ||
        order.customerPhone !== customerPhone ||
        order.vertical !== vertical
      )
        throw new Error(
          "Conversation order does not match customer and business",
        );
      return { ...order, id: existing.id } as Order;
    }
    await writeEntityEvent(transaction, "order.created", {
      ...data,
      id: ref.id,
    });
    transaction.create(ref, data);
    transaction.update(conversationRef, {
      context: mergeConversationContext(context, { orderId: ref.id }),
      updatedAt: now,
    });
    return { ...data, id: ref.id };
  });
  return created;
}

export function addOrderItem({
  orderId,
  item,
}: {
  orderId: string;
  item: OrderItemInput;
}): Promise<Order> {
  const normalized = normalizeItem(item);
  return mutateDocument<Order>(reference(orderId), (current) => {
    const items = [...current.items];
    const index = items.findIndex((entry) => entry.id === normalized.id);
    if (index === -1) items.push(normalized);
    else
      items[index] = normalizeItem({
        ...normalized,
        quantity: items[index].quantity + normalized.quantity,
      });
    return { items, ...totals(items, current.deliveryFee, current.discount) };
  });
}

export async function updateOrder({
  orderId,
  data,
}: {
  orderId: string;
  data: OrderUpdate;
}): Promise<Order> {
  return mutateDocument<Order>(
    reference(orderId),
    (current) => {
      const items = data.items?.map(normalizeItem) ?? current.items;
      if (new Set(items.map((item) => item.id)).size !== items.length)
        throw new Error("Duplicate order item IDs");
      return definedFields({
        items,
        ...totals(
          items,
          data.deliveryFee ?? current.deliveryFee,
          data.discount ?? current.discount,
        ),
        status: data.status,
        location: data.location,
        paymentId: data.paymentId,
        ...(data.status && data.status !== current.status
          ? { automationRevision: (current.automationRevision ?? 0) + 1 }
          : {}),
      });
    },
    async (tx, previous, updated) => {
      if (previous.status !== updated.status)
        await writeEntityEvent(tx, "order.status.changed", updated, {
          previousStatus: previous.status,
        });
    },
  );
}

export function getOrder(orderId: string): Promise<Order | null> {
  return readDocument<Order>(reference(orderId));
}
export function setOrderStatus({
  orderId,
  status,
}: {
  orderId: string;
  status: OrderStatus;
}): Promise<Order> {
  return updateOrder({ orderId, data: { status } });
}
