import "server-only";
import { createHash } from "node:crypto";
import { listReply } from "@/lib/messaging/replies";
import type { MessagingReply, ProductReply, ProductSequenceReply } from "@/lib/messaging/types";

export type ProductSkip = { retailerProductId: string; reason: string };
export function logProductSkipped(retailerProductId: string, reason: string) {
  try { console.info("[WA_PRODUCT_SKIPPED]", { retailerProductId, reason }); } catch { /* Diagnostics only. */ }
}
export function isProductUnavailableError(error: unknown) {
  return !!error && typeof error === "object" && "code" in error && Number(error.code) === 131009;
}
/** The caller owns persistence. Only product-specific rejection is swallowed;
 * auth, transport and final-message failures still use normal webhook retry. */
export async function deliverProductSequence<T>(sequence: ProductSequenceReply, send: (reply: MessagingReply, key: string, index?: number) => Promise<T>, options: {
  skipped?: Record<string, ProductSkip>;
  isNativeSent?: (index: number) => Promise<boolean>;
  onSkip?: (index: number, skip: ProductSkip) => Promise<void>;
} = {}): Promise<T> {
  const fallback: ProductReply[] = [];
  for (const [index, product] of sequence.products.entries()) {
    if (await options.isNativeSent?.(index)) continue;
    const previous = options.skipped?.[String(index)];
    let reason = previous?.retailerProductId === product.retailerProductId ? previous.reason : product.skipReason;
    if (!reason) {
      try { await send(product, `catalog:${index}`, index); continue; }
      catch (error) { if (!isProductUnavailableError(error)) throw error; reason = "META_131009"; }
    }
    const skip = { retailerProductId: product.retailerProductId, reason };
    logProductSkipped(skip.retailerProductId, skip.reason);
    await options.onSkip?.(index, skip);
    fallback.push(product);
  }
  const unique = [...new Map(fallback.filter(product => product.fallbackItem).map(product => [product.fallbackItem!.id, product.fallbackItem!])).values()];
  const rows = unique.map(item => ({
    id: `eats_shop_item_${createHash("sha256").update(item.id).digest("hex").slice(0, 16)}`,
    title: Array.from(item.name).slice(0, 24).join(""),
    description: item.available ? `INR ${item.price.toFixed(2)} · Order from this menu` : "Currently unavailable",
  }));
  // Unavailable/unknown items navigate back to the menu; never invent an orderable SKU.
  const seen = new Set<string>();
  const distinctRows = rows.filter(row => !seen.has(row.id) && !!seen.add(row.id));
  if (fallback.some(product => !product.fallbackItem) && !seen.has("eats_shop_menu")) distinctRows.push({ id: "eats_shop_menu", title: "View current menu", description: "Some catalog items are unavailable" });
  for (let page = 0; page * 10 < distinctRows.length; page++) {
    await send(listReply({ body: sequence.body, buttonText: "Choose item", sections: [{ title: "Order from menu", rows: distinctRows.slice(page * 10, page * 10 + 10) }] }), `catalog-fallback:${page}`);
  }
  return send(sequence.finalReply, "final");
}
