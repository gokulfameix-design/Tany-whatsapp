import "server-only";
import { adminDb } from "@/lib/firebase-admin";
import { documentId } from "@/lib/messaging/services/shared";
import { accountAccessToken } from "@/lib/whatsapp/credentials";

export type CatalogReview = { status: string | null; availability: string | null };
/** Missing permission/network/review data means ordinary-menu fallback, never
 * a claim of approval. Credentials and provider response bodies are not logged. */
export async function getWhatsAppCatalogReviews(businessId: string, catalogId: string): Promise<Map<string, CatalogReview> | null> {
  const account = (await adminDb.collection("whatsapp_accounts").doc(documentId(businessId)).get()).data();
  if (!account || account.businessId !== businessId || account.catalogId !== catalogId) return null;
  const scoped = typeof account.tokenSecretName === "string" ? accountAccessToken(account.tokenSecretName, businessId) : null;
  const token = process.env.META_ACCESS_TOKEN || scoped;
  if (!token) return null;
  const reviews = new Map<string, CatalogReview>();
  const cursors = new Set<string>();
  let after: string | undefined;
  try {
    do {
      const url = new URL(`https://graph.facebook.com/v26.0/${catalogId}/products`);
      url.searchParams.set("fields", "retailer_id,availability,capability_to_review_status");
      url.searchParams.set("limit", "100");
      if (after) url.searchParams.set("after", after);
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
      const body = await response.json();
      if (!response.ok || !Array.isArray(body.data)) return null;
      for (const product of body.data) {
        if (typeof product.retailer_id !== "string") continue;
        const status = Array.isArray(product.capability_to_review_status) ? product.capability_to_review_status.find((entry: { key?: string }) => entry?.key === "WHATSAPP")?.value : null;
        reviews.set(product.retailer_id, { status: typeof status === "string" ? status.toUpperCase() : null, availability: typeof product.availability === "string" ? product.availability : null });
      }
      after = body.paging?.next ? body.paging?.cursors?.after : undefined;
      if (body.paging?.next && (typeof after !== "string" || !after || cursors.has(after))) return null;
      if (after) cursors.add(after);
    } while (after);
    return reviews;
  } catch { return null; }
}
