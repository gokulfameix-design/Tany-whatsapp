import "server-only";
import { adminDb } from "@/lib/firebase-admin";
import { getAdminBusiness, getBusinessStats } from "@/lib/admin/services";
import { documentId } from "@/lib/messaging/services/shared";
import { AdminValidationError } from "@/lib/admin/validation";

export const workspaceCollections = [
  "orders",
  "bookings",
  "customers",
  "conversations",
] as const;
export type WorkspaceCollection = (typeof workspaceCollections)[number];
export type WorkspaceRecord = {
  id: string;
  businessId: string;
  collection: WorkspaceCollection;
  title: string;
  description: string;
  phone: string;
  status: string;
  amount: number | null;
  scheduledFor: string;
  updatedAt: string | null;
};

export function isWorkspaceCollection(
  value: string,
): value is WorkspaceCollection {
  return workspaceCollections.some((collection) => collection === value);
}
async function requireBusiness(businessId: string) {
  documentId(businessId);
  if (!(await getAdminBusiness(businessId)))
    throw new AdminValidationError({ businessId: "Business not found." });
}
function text(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 240) : "";
}
function timestamp(value: unknown): string | null {
  if (
    !value ||
    typeof value !== "object" ||
    !("toDate" in value) ||
    typeof value.toDate !== "function"
  )
    return null;
  const date: unknown = value.toDate();
  return date instanceof Date && Number.isFinite(date.getTime())
    ? date.toISOString()
    : null;
}

/** Only project display fields; never pass raw Firestore documents or conversation context to clients. */
export async function listWorkspaceRecords(
  businessId: string,
  collection: WorkspaceCollection,
): Promise<WorkspaceRecord[]> {
  await requireBusiness(businessId);
  if (!isWorkspaceCollection(collection))
    throw new AdminValidationError({
      collection: "Unsupported workspace collection.",
    });
  const snapshot = await adminDb
    .collection(collection)
    .where("businessId", "==", businessId)
    .get();
  return snapshot.docs
    .flatMap((doc) => {
      const data = doc.data();
      if (data.businessId !== businessId) return [];
      const amount =
        collection === "orders"
          ? data.total
          : collection === "bookings"
            ? data.amount
            : null;
      const items: unknown[] = Array.isArray(data.items) ? data.items : [];
      const names = items
        .map((item) =>
          item && typeof item === "object" && "name" in item
            ? text(item.name)
            : "",
        )
        .filter(Boolean);
      return [
        {
          id: doc.id,
          businessId,
          collection,
          title:
            collection === "customers"
              ? text(data.name) || "Unnamed customer"
              : collection === "bookings"
                ? text(data.serviceName) || "Booking"
                : collection === "conversations"
                  ? text(data.state) || "Conversation"
                  : names.join(", ").slice(0, 240) || "Order",
          description:
            collection === "conversations"
              ? text(data.lastIncomingText)
              : collection === "bookings"
                ? text(data.resourceName) || text(data.staffName)
                : "",
          phone: text(
            collection === "customers" ? data.phone : data.customerPhone,
          ),
          status: text(data.status),
          amount:
            typeof amount === "number" && Number.isFinite(amount)
              ? amount
              : null,
          scheduledFor: [text(data.bookingDate), text(data.startTime)]
            .filter(Boolean)
            .join(" · "),
          updatedAt:
            timestamp(data.updatedAt) ??
            timestamp(data.lastInteractionAt) ??
            timestamp(data.createdAt),
        },
      ];
    })
    .sort(
      (a, b) =>
        (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") ||
        a.id.localeCompare(b.id),
    );
}

export async function getWorkspaceStats(businessId: string) {
  const stats = await getBusinessStats(documentId(businessId));
  const customers = await adminDb
    .collection("customers")
    .where("businessId", "==", businessId)
    .count()
    .get();
  return { ...stats, customers: customers.data().count };
}

export async function getRecentActivity(
  businessId: string,
): Promise<WorkspaceRecord[]> {
  const records = await Promise.all(
    workspaceCollections.map((collection) =>
      listWorkspaceRecords(businessId, collection),
    ),
  );
  return records
    .flat()
    .filter((record) => record.updatedAt)
    .sort(
      (a, b) =>
        b.updatedAt!.localeCompare(a.updatedAt!) || a.id.localeCompare(b.id),
    )
    .slice(0, 8);
}
