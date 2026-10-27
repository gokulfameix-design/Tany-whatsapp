import "server-only";
import { getWhatsAppCatalogReviews } from "@/lib/whatsapp/catalog-review";
import { adminDb } from "@/lib/firebase-admin";
import { documentId, serverTimestamp } from "@/lib/messaging/services/shared";
import {
  getCatalogItem,
  getCatalog,
  type CatalogItem,
} from "@/lib/messaging/services/catalog-service";
import type {
  MessagingReply,
  TextReply,
  ButtonReply,
  ListReply,
  ProductSequenceReply,
} from "@/lib/messaging/types";
const mappings = (businessId: string) =>
  adminDb
    .collection("businesses")
    .doc(documentId(businessId))
    .collection("whatsapp_product_mappings");
export async function getCatalogConfiguration(businessId: string) {
  const data = (
    await adminDb
      .collection("whatsapp_accounts")
      .doc(documentId(businessId))
      .get()
  ).data();
  if (data && data.businessId !== businessId)
    throw new Error("Account business mismatch");
  const catalogId = typeof data?.catalogId === "string" ? data.catalogId : "";
  return {
    catalogId,
    catalogEnabled:
      data?.catalogEnabled === true && /^[1-9]\d{0,39}$/.test(catalogId),
    hasAccount: !!data,
  };
}
export async function saveCatalogConfiguration(
  businessId: string,
  catalogId: string,
  catalogEnabled: boolean,
) {
  if (
    typeof catalogEnabled !== "boolean" ||
    typeof catalogId !== "string" ||
    (catalogId && !/^[1-9]\d{0,39}$/.test(catalogId)) ||
    (catalogEnabled && !catalogId)
  )
    throw new Error("Enter a valid Meta catalog ID.");
  const ref = adminDb
    .collection("whatsapp_accounts")
    .doc(documentId(businessId));
  await adminDb.runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data();
    if (!data || data.businessId !== businessId)
      throw new Error("Set up this business WhatsApp account first.");
    tx.update(ref, { catalogId, catalogEnabled, updatedAt: serverTimestamp() });
  });
}
export async function mapCatalogProduct(
  businessId: string,
  tanyProductId: string,
  retailerProductId: string,
) {
  documentId(tanyProductId);
  if (
    typeof retailerProductId !== "string" ||
    !retailerProductId.trim() ||
    retailerProductId.length > 100 ||
    /[\r\n]/.test(retailerProductId)
  )
    throw new Error("Check the retailer product ID.");
  const config = await getCatalogConfiguration(businessId);
  if (!config.catalogId) throw new Error("Configure the Meta catalog first.");
  const ref = mappings(businessId).doc(tanyProductId);
  await adminDb.runTransaction(async (tx) => {
    const product = (
      await tx.get(
        adminDb
          .collection("businesses")
          .doc(businessId)
          .collection("catalog")
          .doc(tanyProductId),
      )
    ).data();
    const duplicates = await tx.get(
      mappings(businessId)
        .where("catalogId", "==", config.catalogId)
        .where("retailerProductId", "==", retailerProductId),
    );
    if (!product || product.type !== "product")
      throw new Error("Product does not belong to this business.");
    if (duplicates.docs.some((d) => d.id !== tanyProductId))
      throw new Error("Retailer product ID is already mapped.");
    tx.set(ref, {
      businessId,
      tanyProductId,
      retailerProductId,
      catalogId: config.catalogId,
      updatedAt: serverTimestamp(),
    });
  });
}
export async function resolveCatalogProduct(
  businessId: string,
  catalogId: string,
  retailerProductId: string,
): Promise<CatalogItem | null> {
  const config = await getCatalogConfiguration(businessId);
  if (!config.catalogEnabled || config.catalogId !== catalogId) return null;
  const matches = await mappings(businessId)
    .where("catalogId", "==", catalogId)
    .where("retailerProductId", "==", retailerProductId)
    .get();
  if (matches.docs.length !== 1) return null;
  const mapping = matches.docs[0].data();
  if (
    mapping.businessId !== businessId ||
    mapping.tanyProductId !== matches.docs[0].id
  )
    return null;
  const item = await getCatalogItem(businessId, mapping.tanyProductId);
  return item?.available &&
    item.type === "product" &&
    item.price > 0 &&
    item.metadata.stock !== 0
    ? item
    : null;
}
export async function catalogMenuReply(
  businessId: string,
  items: CatalogItem[],
  fallback: TextReply | ButtonReply | ListReply,
): Promise<MessagingReply> {
  const config = await getCatalogConfiguration(businessId);
  const ids: string[] = [];
  if (config.catalogEnabled) {
    const uniqueItems = [...new Map(items.filter(item => item.available && item.type === "product" && item.price > 0 && item.metadata.stock !== 0).map(item => [item.id, item])).values()];
    const entries = await Promise.all(uniqueItems.map(async item => ({ item, mapping: (await mappings(businessId).doc(item.id).get()).data() })));
    for (const { item, mapping } of entries) {
      if (!mapping || mapping.businessId !== businessId || mapping.tanyProductId !== item.id || mapping.catalogId !== config.catalogId || typeof mapping.retailerProductId !== "string" || !mapping.retailerProductId.trim() || mapping.retailerProductId.length > 100 || /[\r\n]/.test(mapping.retailerProductId)) continue;
      if (!ids.includes(mapping.retailerProductId)) ids.push(mapping.retailerProductId);
    }
  }
  const productListEnabled = process.env.WHATSAPP_PRODUCT_LIST_ENABLED === "true";
  try { console.info("[WA_CATALOG_NATIVE]", { enabled: config.catalogEnabled, catalogId: config.catalogId, mappedCount: ids.length, replyType: ids.length ? productListEnabled ? "product_list" : "product_sequence" : fallback.type }); } catch { /* Logging must not change routing. */ }
  if (!ids.length) return fallback;
  const body =
    "Choose products in WhatsApp and send your cart. Use the options below when ready.";
  if (!productListEnabled) return {
    type: "product_sequence", body, fallback,
    products: ids.map(retailerProductId => ({ type: "product", body, catalogId: config.catalogId, retailerProductId, fallback, allowFallback: false })),
    finalReply: { type: "buttons", body, buttons: [
      { id: "eats_shop_cart", title: "View Cart" },
      { id: "eats_shop_continue", title: "More Items" },
      { id: "eats_shop_checkout", title: "Checkout" },
    ] },
  };
  return {
    type: "product_list",
    body,
    header: "Menu",
    catalogId: config.catalogId,
    sections: [{ title: "Menu", productItems: ids.slice(0, 30).map(productRetailerId => ({ productRetailerId })) }],
    fallback,
  };
}

/** Prepared replies may outlive a catalog edit. The business account is the
 * authority for the catalog ID; mapping/product/WABA IDs never supply it. */
export async function resolveProductSequenceForSend(businessId: string, sequence: ProductSequenceReply): Promise<ProductSequenceReply> {
  const config = await getCatalogConfiguration(businessId);
  const [items, mapped, reviews] = await Promise.all([
    getCatalog(businessId), mappings(businessId).get(),
    config.catalogEnabled ? getWhatsAppCatalogReviews(businessId, config.catalogId) : Promise.resolve(null),
  ]);
  const products = sequence.products.map(product => {
    const mappingDoc = mapped.docs.find(doc => doc.data().businessId === businessId && doc.data().tanyProductId === doc.id && doc.data().retailerProductId === product.retailerProductId);
    const mapping = mappingDoc?.data();
    const item = mappingDoc ? items.find(item => item.id === mappingDoc.id && item.type === "product") : undefined;
    const review = reviews?.get(product.retailerProductId);
    // Cached review data can be used if Meta could not be queried. A successful
    // Meta response (including a missing product) always takes precedence.
    const cachedStatus = typeof mapping?.whatsappReviewStatus === "string" ? mapping.whatsappReviewStatus.toUpperCase() : null;
    const status = reviews ? review?.status : cachedStatus;
    const available = !!item?.available && item.price > 0 && item.metadata.stock !== 0;
    let reason: string | undefined;
    if (!mapping || !item) reason = "UNMAPPED";
    else if (!config.catalogEnabled || !config.catalogId) reason = "CATALOG_UNAVAILABLE";
    else if (mapping.catalogId !== config.catalogId) reason = "UNMAPPED";
    else if (!available || (review?.availability && !["in stock", "available for order", "preorder"].includes(review.availability))) reason = "UNAVAILABLE";
    else if (status !== "APPROVED") reason = status === "NO_REVIEW" || status === "REJECTED" || status === "PENDING" || status === "OUTDATED" ? status : "UNKNOWN_REVIEW";
    const { skipReason: _previousReason, fallbackItem: _previousItem, ...native } = product;
    void _previousReason; void _previousItem;
    return { ...native, catalogId: config.catalogId, allowFallback: false,
      ...(reason ? { skipReason: reason } : {}),
      ...(item ? { fallbackItem: { id: item.id, name: item.name, price: item.price, available } } : {}),
    };
  });
  return { ...sequence, products };
}
export async function catalogSettingsData(businessId: string) {
  const config = await getCatalogConfiguration(businessId);
  const docs = await mappings(businessId).get();
  return {
    ...config,
    mappings: docs.docs
      .filter(
        (d) =>
          d.data().businessId === businessId &&
          d.data().catalogId === config.catalogId,
      )
      .map((d) => ({
        tanyProductId: d.id,
        retailerProductId: String(d.data().retailerProductId),
      })),
  };
}
