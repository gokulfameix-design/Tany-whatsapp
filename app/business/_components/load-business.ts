import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getAdminBusiness } from "@/lib/admin/services";
import { documentId } from "@/lib/messaging/services/shared";

export const loadBusiness = cache(async (businessId: string) => {
  if (process.env.NODE_ENV === "development")
    console.info("[LOAD_BUSINESS_START]", { businessId });
  try {
    documentId(businessId);
  } catch {
    notFound();
  }
  let business;
  try {
    business = await getAdminBusiness(businessId);
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      const details = error as Error & { code?: unknown };
      console.error("[LOAD_BUSINESS_FAILED]", {
        businessId,
        name: details.name,
        code: details.code,
        message: details.message,
        stack: details.stack,
      });
    }
    throw error;
  }
  if (!business) notFound();
  if (process.env.NODE_ENV === "development")
    console.info("[LOAD_BUSINESS_SUCCESS]", {
      businessId,
      vertical: business.vertical,
      active: business.active,
    });
  return business;
});
