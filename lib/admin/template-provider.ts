import "server-only";
import { adminDb } from "@/lib/firebase-admin";
import { documentId } from "@/lib/messaging/services/shared";
import type { OperationRecord } from "./operations-types";

/** A future Meta adapter must return this same safe, tenant-scoped contract. */
export interface WhatsAppTemplateProvider {
  readonly source: "firestore" | "meta";
  list(scope: {
    businessId: string;
    businessName: string;
  }): Promise<OperationRecord[]>;
}
const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.slice(0, max) : "";
export const firestoreTemplateProvider: WhatsAppTemplateProvider = {
  source: "firestore",
  async list({ businessId, businessName }) {
    documentId(businessId);
    const snapshot = await adminDb
      .collection("templates")
      .where("businessId", "==", businessId)
      .get();
    return snapshot.docs
      .filter((doc) => doc.data().businessId === businessId)
      .map((doc) => {
        const data = doc.data();
        const updatedAt = data.updatedAt?.toDate?.();
        return {
          id: doc.id,
          businessId,
          business: businessName,
          name: text(data.name, 120),
          status: ["approved", "pending", "rejected", "draft"].includes(
            data.status,
          )
            ? data.status
            : "draft",
          language: text(data.language, 20),
          category: ["marketing", "utility", "authentication"].includes(
            data.category,
          )
            ? data.category
            : "unknown",
          at:
            updatedAt instanceof Date && Number.isFinite(updatedAt.getTime())
              ? updatedAt.toISOString()
              : null,
          body: text(data.body || (Array.isArray(data.components) ? data.components.find((c: { type?: string }) => c.type?.toUpperCase() === "BODY")?.text : ""), 10000),
          template: "",
          audience: "",
          schedule: null,
        };
      });
  },
};
