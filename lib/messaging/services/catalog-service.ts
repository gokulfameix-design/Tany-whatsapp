import { adminDb } from "@/lib/firebase-admin";
import type { DocumentData } from "firebase-admin/firestore";
import type { ConversationContext, StoredTimestamp } from "@/lib/messaging/domain-types";
import { mergeConversationContext } from "@/lib/messaging/context";
import { documentId } from "@/lib/messaging/services/shared";

export type CatalogItem = {
  id: string; type: string; name: string; description: string; price: number;
  available: boolean; category: string | null; metadata: ConversationContext;
  createdAt: StoredTimestamp | null; updatedAt: StoredTimestamp | null;
};
export type CatalogFilters = { available?: boolean; type?: string; category?: string; maxPrice?: number };
const collection = (businessId: string) => adminDb.collection("businesses").doc(documentId(businessId)).collection("catalog");
function parseItem(id: string, data: DocumentData | undefined): CatalogItem | null {
  if (!data || typeof data.name !== "string" || !data.name.trim() || typeof data.type !== "string" ||
      !Number.isFinite(data.price) || data.price < 0 || data.price > Number.MAX_SAFE_INTEGER / 100 || typeof data.available !== "boolean") return null;
  try {
    return { id, type: data.type, name: data.name, description: typeof data.description === "string" ? data.description : "", price: data.price,
      available: data.available, category: typeof data.category === "string" ? data.category : null,
      metadata: mergeConversationContext({}, data.metadata ?? {}), createdAt: data.createdAt ?? null, updatedAt: data.updatedAt ?? null };
  } catch { return null; }
}
export async function getCatalog(businessId: string, filters: CatalogFilters = {}): Promise<CatalogItem[]> {
  const snapshot = await collection(businessId).get();
  return snapshot.docs.map((doc) => parseItem(doc.id, doc.data())).filter((item): item is CatalogItem => !!item)
    .filter((item) => (filters.available === undefined || item.available === filters.available) && (!filters.type || item.type === filters.type) &&
      (!filters.category || item.category === filters.category) && (filters.maxPrice === undefined || item.price <= filters.maxPrice))
    .sort((a, b) => Number(a.metadata.sortOrder ?? 0) - Number(b.metadata.sortOrder ?? 0) || a.id.localeCompare(b.id));
}
export async function getCatalogItem(businessId: string, itemId: string): Promise<CatalogItem | null> {
  const snapshot = await collection(businessId).doc(documentId(itemId)).get();
  return parseItem(snapshot.id, snapshot.data());
}
export async function getAvailableCatalogItems(businessId: string): Promise<CatalogItem[]> {
  return (await getCatalog(businessId, { available: true })).filter((item) => item.metadata.stock !== 0);
}
export async function findCatalogItems(businessId: string, query: string): Promise<CatalogItem[]> {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const items = await getAvailableCatalogItems(businessId);
  return items.filter((item) => {
    const haystack = [item.name, item.description, item.category, ...Object.values(item.metadata).flatMap((value) => typeof value === "string" ? [value] : Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [])].join(" ").toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
}
