"use server";

import { EntitlementError } from "@/lib/subscriptions/entitlements";
import { revalidatePath } from "next/cache";
import { requireDashboardAccess } from "@/lib/admin/dashboard-session";
import { AdminValidationError } from "@/lib/admin/validation";
import {
  createBusiness,
  updateBusiness,
  toggleBusiness,
  createCatalogItem,
  updateCatalogItem,
  deleteCatalogItem,
  toggleCatalogAvailability,
} from "@/lib/admin/services";
import type { ActionState } from "@/lib/admin/types";

function failure(error: unknown): ActionState {
  if (error instanceof EntitlementError) return { ok: false, ...error.details };
  if (error instanceof AdminValidationError)
    return { ok: false, message: error.message, errors: error.errors };
  console.error("Admin action failed:", error);
  return {
    ok: false,
    message:
      "Could not save this change. Check the server connection and try again.",
  };
}
function invalidate(businessId: string) {
  revalidatePath("/admin", "layout");
  revalidatePath("/business/[businessId]", "layout");
  revalidatePath(`/business/${encodeURIComponent(businessId)}`, "layout");
  revalidatePath("/admin/businesses");
  revalidatePath(`/admin/businesses/${encodeURIComponent(businessId)}`);
  revalidatePath(`/admin/businesses/${encodeURIComponent(businessId)}/catalog`);
}
export async function saveBusinessAction(
  businessId: string | null,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    await requireDashboardAccess();
    const input = {
      name: form.get("name"),
      vertical: form.get("vertical"),
      whatsappPhoneNumberId: form.get("whatsappPhoneNumberId"),
      active: form.get("active") === "on",
      settings: form.get("settings"),
    };
    const business = businessId
      ? await updateBusiness(businessId, input)
      : await createBusiness({ ...input, businessId: form.get("businessId") });
    invalidate(business.id);
    return { ok: true, message: "Business saved.", businessId: business.id };
  } catch (error) {
    return failure(error);
  }
}
export async function toggleBusinessAction(
  businessId: string,
  active: boolean,
  _previous: ActionState,
  _form: FormData,
): Promise<ActionState> {
  void _previous;
  void _form;
  try {
    await requireDashboardAccess();
    await toggleBusiness(businessId, active);
    invalidate(businessId);
    return {
      ok: true,
      message: active ? "Business activated." : "Business deactivated.",
    };
  } catch (error) {
    return failure(error);
  }
}
export async function saveCatalogAction(
  businessId: string,
  itemId: string | null,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    await requireDashboardAccess(businessId);
    const data = {
      name: form.get("name"),
      type: form.get("type"),
      category: form.get("category"),
      description: form.get("description"),
      price: form.get("price"),
      available: form.get("available") === "on",
      metadata: form.get("metadata"),
    };
    if (itemId) await updateCatalogItem(businessId, itemId, data);
    else await createCatalogItem(businessId, data);
    invalidate(businessId);
    return { ok: true, message: itemId ? "Item updated." : "Item added." };
  } catch (error) {
    return failure(error);
  }
}
export async function toggleCatalogAction(
  businessId: string,
  itemId: string,
  available: boolean,
  _previous: ActionState,
  _form: FormData,
): Promise<ActionState> {
  void _previous;
  void _form;
  try {
    await requireDashboardAccess(businessId);
    await toggleCatalogAvailability(businessId, itemId, available);
    invalidate(businessId);
    return { ok: true, message: "Availability updated." };
  } catch (error) {
    return failure(error);
  }
}
export async function deleteCatalogAction(
  businessId: string,
  itemId: string,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    await requireDashboardAccess(businessId);
    await deleteCatalogItem(businessId, itemId, form.get("confirmation"));
    invalidate(businessId);
    return { ok: true, message: "Item deleted." };
  } catch (error) {
    return failure(error);
  }
}
