import { writeEntityEvent } from "@/lib/automations/events";
import { adminDb } from "@/lib/firebase-admin";
import { mergeConversationContext } from "@/lib/messaging/context";
import type { Booking, BookingStatus } from "@/lib/messaging/domain-types";
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

export type BookingUpdate = Partial<
  Pick<
    Booking,
    | "serviceId"
    | "serviceName"
    | "staffId"
    | "staffName"
    | "resourceId"
    | "resourceName"
    | "bookingDate"
    | "startTime"
    | "endTime"
    | "amount"
    | "status"
    | "paymentId"
    | "metadata"
  >
>;
const reference = (id: string) =>
  adminDb.collection("bookings").doc(documentId(id));

export async function createDraftBooking({
  businessId,
  customerPhone,
  vertical,
  reuseConversationDraft = false,
}: {
  businessId: string;
  customerPhone: string;
  vertical: TanyVertical;
  reuseConversationDraft?: boolean;
}): Promise<Booking> {
  const conversationId = customerDocumentId(businessId, customerPhone);
  assertVertical(vertical);
  const ref = adminDb.collection("bookings").doc();
  const now = serverTimestamp();
  const data: Omit<Booking, "id"> = {
    businessId,
    customerPhone,
    vertical,
    serviceId: null,
    serviceName: null,
    staffId: null,
    staffName: null,
    resourceId: null,
    resourceName: null,
    bookingDate: null,
    startTime: null,
    endTime: null,
    amount: 0,
    currency: "INR",
    status: "draft",
    paymentId: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
  if (!reuseConversationDraft) {
    const created = { ...data, id: ref.id };
    await adminDb.runTransaction(async (tx) => {
      await writeEntityEvent(tx, "booking.created", created);
      tx.create(ref, data);
    });
    return created;
  }
  // Opt-in atomic linking prevents two simultaneous messages creating two drafts.
  // The existing independent-draft API remains unchanged for other callers.
  const conversationRef = adminDb
    .collection("conversations")
    .doc(conversationId);
  const created = await adminDb.runTransaction(async (transaction) => {
    const conversation = await transaction.get(conversationRef);
    const conversationData = conversation.data();
    if (!conversation.exists || conversationData?.vertical !== vertical)
      throw new Error(
        "Booking conversation not found or vertical does not match",
      );
    const context = mergeConversationContext(
      {},
      conversationData.context ?? {},
    );
    if (typeof context.bookingId === "string") {
      const existing = await transaction.get(reference(context.bookingId));
      const existingData = existing.data();
      if (
        !existingData ||
        existingData.businessId !== businessId ||
        existingData.customerPhone !== customerPhone ||
        existingData.vertical !== vertical
      ) {
        throw new Error(
          "Conversation booking does not match customer and business",
        );
      }
      return { ...existingData, id: existing.id } as Booking;
    }
    await writeEntityEvent(transaction, "booking.created", {
      ...data,
      id: ref.id,
    });
    transaction.create(ref, data);
    transaction.update(conversationRef, {
      context: mergeConversationContext(context, { bookingId: ref.id }),
      updatedAt: now,
    });
    return { ...data, id: ref.id };
  });
  return created;
}

export async function updateBooking({
  bookingId,
  data,
}: {
  bookingId: string;
  data: BookingUpdate;
}): Promise<Booking> {
  const {
    serviceId,
    serviceName,
    staffId,
    staffName,
    resourceId,
    resourceName,
    bookingDate,
    startTime,
    endTime,
    amount,
    status,
    paymentId,
    metadata,
  } = data;
  return mutateDocument<Booking>(
    reference(bookingId),
    (current) =>
      definedFields({
        serviceId,
        serviceName,
        staffId,
        staffName,
        resourceId,
        resourceName,
        bookingDate,
        startTime,
        endTime,
        status,
        paymentId,
        amount: amount === undefined ? undefined : money(amount),
        metadata:
          metadata === undefined
            ? undefined
            : mergeConversationContext(current.metadata, metadata),
        ...(status && status !== current.status
          ? { automationRevision: (current.automationRevision ?? 0) + 1 }
          : {}),
      }),
    async (tx, previous, updated) => {
      if (previous.status !== updated.status)
        await writeEntityEvent(tx, "booking.status.changed", updated, {
          previousStatus: previous.status,
        });
    },
  );
}

export function getBooking(bookingId: string): Promise<Booking | null> {
  return readDocument<Booking>(reference(bookingId));
}
export function setBookingStatus({
  bookingId,
  status,
}: {
  bookingId: string;
  status: BookingStatus;
}): Promise<Booking> {
  return updateBooking({ bookingId, data: { status } });
}
