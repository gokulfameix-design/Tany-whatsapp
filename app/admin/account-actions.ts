"use server";
import { revalidatePath } from "next/cache";
import { updateAccountMetadata } from "@/lib/admin/account-metadata";
import { getOperationsData } from "@/lib/admin/operations-service";
import { AdminValidationError } from "@/lib/admin/validation";
import { SetupError } from "@/lib/whatsapp/setup-service";
import { getDashboardSession } from "@/lib/admin/dashboard-session";

async function save(businessId: string, accountId: string, input: unknown, activateForTesting: boolean) {
  try {
    const session = await getDashboardSession();
    if (session.role !== "admin") return { ok: false, message: "Internal administrator access required." };
    const result = await updateAccountMetadata(businessId, accountId, input, activateForTesting);
    revalidatePath("/admin", "layout");
    revalidatePath(`/business/${encodeURIComponent(businessId)}`, "layout");
    const data = await getOperationsData(businessId);
    return { ok: true, message: result.message, account: data.accounts.find(a => a.accountId === accountId) };
  } catch (error) {
    if (error instanceof AdminValidationError) return { ok: false, message: error.message, errors: error.errors };
    if (error instanceof SetupError) return { ok: false, message: error.message };
    return { ok: false, message: "Unable to save account metadata. Please try again." };
  }
}

export async function saveAccountMetadata(businessId: string, accountId: string, input: unknown) {
  return save(businessId, accountId, input, false);
}

export async function activateAccountForTesting(businessId: string, accountId: string, input: unknown) {
  return save(businessId, accountId, input, true);
}
