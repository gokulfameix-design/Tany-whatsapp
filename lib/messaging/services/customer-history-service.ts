import "server-only";
import { adminDb } from "@/lib/firebase-admin";
import { customerDocumentId } from "@/lib/messaging/services/shared";

export type RecentRequest = {
  kind: "order" | "booking";
  title: string;
  status: string;
};
/** Private, tenant-scoped history projection shared by linked-customer menus. No IDs, UID or payment data. */
export async function listRecentCustomerRequests(
  businessId: string,
  phone: string,
  kind?: RecentRequest["kind"],
): Promise<RecentRequest[]> {
  customerDocumentId(businessId, phone);
  const collections = kind
    ? [kind === "order" ? "orders" : "bookings"]
    : ["orders", "bookings"];
  const history = await Promise.all(
    collections.map(async (collection) => {
      const snapshot = await adminDb
        .collection(collection)
        .where("businessId", "==", businessId)
        .where("customerPhone", "==", phone)
        .get();
      return snapshot.docs
        .filter(
          (doc) =>
            doc.data().businessId === businessId &&
            doc.data().customerPhone === phone,
        )
        .map((doc) => {
          const row = doc.data();
          const title =
            collection === "bookings"
              ? row.serviceName
              : Array.isArray(row.items)
                ? row.items[0]?.name
                : "Order";
          return {
            kind:
              collection === "orders"
                ? ("order" as const)
                : ("booking" as const),
            title:
              typeof title === "string"
                ? title.slice(0, 100)
                : "Recent request",
            status:
              typeof row.status === "string" &&
              /^[a-z_]{1,30}$/.test(row.status)
                ? row.status
                : "unknown",
            at:
              row.updatedAt?.toDate?.()?.getTime?.() ??
              row.createdAt?.toDate?.()?.getTime?.() ??
              0,
          };
        });
    }),
  );
  return history
    .flat()
    .sort((a, b) => b.at - a.at)
    .slice(0, 5)
    .map(({ kind, title, status }) => ({ kind, title, status }));
}
