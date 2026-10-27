import { assertWhatsAppPhoneMapping } from "@/lib/whatsapp/setup-service";
import { requireWhatsAppEntitlement } from "@/lib/subscriptions/entitlements";
import "server-only";
import { cache } from "react";
import { adminDb } from "@/lib/firebase-admin";
import { getBusinessConfig } from "@/lib/messaging/services/business-config-service";
import { getCatalog } from "@/lib/messaging/services/catalog-service";
import { documentId, serverTimestamp } from "@/lib/messaging/services/shared";
import {
  AdminValidationError,
  booleanInput,
  businessInput,
  catalogInput,
} from "@/lib/admin/validation";
import type {
  AdminBusiness,
  AdminCatalogItem,
  BusinessListItem,
  BusinessStats,
} from "@/lib/admin/types";

const businessRef = (businessId: string) =>
  adminDb.collection("businesses").doc(documentId(businessId));
const itemRef = (businessId: string, itemId: string) =>
  businessRef(businessId).collection("catalog").doc(documentId(itemId));
export async function getAdminBusiness(
  businessId: string,
): Promise<AdminBusiness | null> {
  return getBusinessConfig(documentId(businessId));
}
async function requireBusiness(businessId: string) {
  const business = await getAdminBusiness(businessId);
  if (!business)
    throw new AdminValidationError({
      businessId: "Business not found or profile is incomplete.",
    });
  return business;
}
/** Share profile reads between the directory and switcher within a server render. */
export const listBusinessProfiles = cache(
  async (): Promise<AdminBusiness[]> => {
    const snapshot = await adminDb.collection("businesses").get();
    const businesses = await Promise.all(
      snapshot.docs.map((doc) => getAdminBusiness(doc.id)),
    );
    return businesses
      .filter((business): business is AdminBusiness => !!business)
      .sort((a, b) => a.name.localeCompare(b.name));
  },
);
export async function listBusinesses(): Promise<BusinessListItem[]> {
  const businesses = await listBusinessProfiles();
  return Promise.all(
    businesses.map(async (business) => {
      const count = await businessRef(business.id)
        .collection("catalog")
        .count()
        .get();
      return { ...business, catalogCount: count.data().count };
    }),
  );
}
export async function createBusiness(input: unknown): Promise<AdminBusiness> {
  const { businessId, ...data } = businessInput(input, true);
  const ref = businessRef(businessId!);
  await adminDb.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists)
      throw new AdminValidationError({
        businessId: "This business ID is already in use.",
      });
    await assertWhatsAppPhoneMapping(transaction, ref.id, data.whatsappPhoneNumberId);
    const phones = await transaction.get(
      adminDb
        .collection("businesses")
        .where("whatsappPhoneNumberId", "==", data.whatsappPhoneNumberId),
    );
    if (!phones.empty)
      throw new AdminValidationError({
        whatsappPhoneNumberId:
          "This phone number ID belongs to another business.",
      });
    transaction.create(ref, {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  return { id: ref.id, ...data };
}
export async function updateBusiness(
  businessId: string,
  input: unknown,
): Promise<AdminBusiness> {
  await requireWhatsAppEntitlement(businessId);
  const { businessId: ignored, ...data } = businessInput(input, false);
  void ignored;
  const ref = businessRef(businessId);
  await adminDb.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (!existing.exists)
      throw new AdminValidationError({ businessId: "Business not found." });
    const setup = (await transaction.get(adminDb.collection("whatsapp_accounts").doc(businessId))).data();
    if (setup && existing.data()?.whatsappPhoneNumberId !== data.whatsappPhoneNumberId)
      throw new AdminValidationError({ whatsappPhoneNumberId: "Change this account through the WhatsApp setup wizard." });
    await assertWhatsAppPhoneMapping(transaction, ref.id, data.whatsappPhoneNumberId);
    const phones = await transaction.get(
      adminDb
        .collection("businesses")
        .where("whatsappPhoneNumberId", "==", data.whatsappPhoneNumberId),
    );
    if (phones.docs.some((doc) => doc.id !== businessId))
      throw new AdminValidationError({
        whatsappPhoneNumberId:
          "This phone number ID belongs to another business.",
      });
    transaction.update(ref, { ...data, updatedAt: serverTimestamp() });
  });
  return { id: ref.id, ...data };
}
export async function toggleBusiness(businessId: string, active: unknown) {
  const value = booleanInput(active, "active");
  const ref = businessRef(businessId);
  await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const business = snapshot.data();
    if (!business)
      throw new AdminValidationError({ businessId: "Business not found." });
    if (value) {
      businessInput(
        {
          name: business.name,
          vertical: business.vertical,
          whatsappPhoneNumberId: business.whatsappPhoneNumberId,
          active: true,
          settings: business.settings ?? {},
        },
        false,
      );
      await assertWhatsAppPhoneMapping(transaction, ref.id, business.whatsappPhoneNumberId);
      const phones = await transaction.get(
        adminDb
          .collection("businesses")
          .where("whatsappPhoneNumberId", "==", business.whatsappPhoneNumberId),
      );
      if (phones.docs.some((doc) => doc.id !== businessId))
        throw new AdminValidationError({
          whatsappPhoneNumberId:
            "This phone number ID belongs to another business.",
        });
    }
    transaction.update(ref, { active: value, updatedAt: serverTimestamp() });
  });
}
export async function getBusinessStats(
  businessId: string,
): Promise<BusinessStats> {
  await requireBusiness(businessId);
  const counts = await Promise.all([
    businessRef(businessId).collection("catalog").count().get(),
    ...["conversations", "orders", "bookings"].map((name) =>
      adminDb
        .collection(name)
        .where("businessId", "==", businessId)
        .count()
        .get(),
    ),
  ]);
  return {
    catalog: counts[0].data().count,
    conversations: counts[1].data().count,
    orders: counts[2].data().count,
    bookings: counts[3].data().count,
  };
}
export async function listCatalog(
  businessId: string,
): Promise<AdminCatalogItem[]> {
  await requireBusiness(businessId);
  return (await getCatalog(businessId)).map(
    ({
      id,
      type,
      name,
      category,
      description,
      price,
      available,
      metadata,
    }) => ({
      id,
      type,
      name,
      category,
      description,
      price,
      available,
      metadata,
    }),
  );
}
export async function createCatalogItem(
  businessId: string,
  input: unknown,
): Promise<AdminCatalogItem> {
  const data = catalogInput(input);
  const business = businessRef(businessId);
  const ref = business.collection("catalog").doc();
  await adminDb.runTransaction(async (transaction) => {
    if (!(await transaction.get(business)).exists)
      throw new AdminValidationError({ businessId: "Business not found." });
    transaction.create(ref, {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  return { id: ref.id, ...data };
}
export async function updateCatalogItem(
  businessId: string,
  itemId: string,
  input: unknown,
): Promise<AdminCatalogItem> {
  const data = catalogInput(input),
    ref = itemRef(businessId, itemId);
  await adminDb.runTransaction(async (transaction) => {
    const business = await transaction.get(businessRef(businessId));
    const item = await transaction.get(ref);
    if (!business.exists || !item.exists)
      throw new AdminValidationError({
        form: "Catalog item not found in this business.",
      });
    transaction.update(ref, { ...data, updatedAt: serverTimestamp() });
  });
  return { id: ref.id, ...data };
}
export async function toggleCatalogAvailability(
  businessId: string,
  itemId: string,
  available: unknown,
) {
  const value = booleanInput(available, "available");
  const ref = itemRef(businessId, itemId);
  await adminDb.runTransaction(async (transaction) => {
    const business = await transaction.get(businessRef(businessId));
    const item = await transaction.get(ref);
    if (!business.exists || !item.exists)
      throw new AdminValidationError({
        form: "Catalog item not found in this business.",
      });
    transaction.update(ref, { available: value, updatedAt: serverTimestamp() });
  });
}
export async function deleteCatalogItem(
  businessId: string,
  itemId: string,
  confirmation: unknown,
): Promise<void> {
  if (confirmation !== "DELETE")
    throw new AdminValidationError({
      confirmation: "Type DELETE to confirm removal.",
    });
  const ref = itemRef(businessId, itemId);
  await adminDb.runTransaction(async (transaction) => {
    const business = await transaction.get(businessRef(businessId));
    const item = await transaction.get(ref);
    if (!business.exists || !item.exists)
      throw new AdminValidationError({
        form: "Catalog item not found in this business.",
      });
    transaction.delete(ref);
  });
}
