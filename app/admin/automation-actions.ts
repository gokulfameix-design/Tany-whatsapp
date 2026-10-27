"use server";
import { revalidatePath } from "next/cache";
import {
  changeAutomation,
  saveAutomation,
  createAutomationFromTemplate,
} from "@/lib/automations/service";
export async function saveAutomationAction(
  businessId: string,
  id: string | undefined,
  input: unknown,
) {
  try {
    const savedId = await saveAutomation(businessId, id, input);
    revalidatePath("/admin", "layout");
    revalidatePath(`/business/${encodeURIComponent(businessId)}`, "layout");
    return { ok: true, id: savedId };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error &&
        !/secret|token|credential/i.test(error.message)
          ? error.message
          : "Could not save automation.",
    };
  }
}
export async function changeAutomationAction(
  businessId: string,
  id: string,
  operation: "publish" | "pause" | "resume" | "delete" | "duplicate",
) {
  if (
    !["publish", "pause", "resume", "delete", "duplicate"].includes(operation)
  )
    return { ok: false, message: "Unsupported action." };
  try {
    const savedId = await changeAutomation(businessId, id, operation);
    revalidatePath("/admin", "layout");
    revalidatePath(`/business/${encodeURIComponent(businessId)}`, "layout");
    return { ok: true, id: savedId };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error &&
        !/secret|token|credential/i.test(error.message)
          ? error.message
          : "Could not update automation.",
    };
  }
}

export async function createAutomationFromTemplateAction(
  businessId: string,
  templateId: string,
) {
  try {
    const result = await createAutomationFromTemplate(businessId, templateId);
    revalidatePath(`/business/${encodeURIComponent(businessId)}`, "layout");
    revalidatePath("/admin", "layout");
    return { ok: true as const, ...result };
  } catch {
    return {
      ok: false as const,
      message:
        "Could not create a draft. Choose a template for this business product.",
    };
  }
}
