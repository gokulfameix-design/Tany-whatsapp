"use server";
import { revalidatePath } from "next/cache";
import {
  saveCatalogConfiguration,
  mapCatalogProduct,
} from "@/lib/whatsapp/catalog";
export async function saveWhatsAppCatalog(
  businessId: string,
  catalogId: string,
  enabled: boolean,
) {
  try {
    await saveCatalogConfiguration(businessId, catalogId, enabled);
    revalidatePath(`/business/${encodeURIComponent(businessId)}/settings`);
    return { ok: true };
  } catch {
    return {
      ok: false,
      message:
        "Could not save. Check the catalog ID and this business account setup.",
    };
  }
}
export async function saveWhatsAppProductMapping(
  businessId: string,
  productId: string,
  retailerProductId: string,
) {
  try {
    await mapCatalogProduct(businessId, productId, retailerProductId);
    revalidatePath(`/business/${encodeURIComponent(businessId)}/settings`);
    return { ok: true };
  } catch {
    return {
      ok: false,
      message:
        "Could not map this product. Check its business, catalog and unique retailer product ID.",
    };
  }
}
