import { isTanyVertical } from "@/lib/messaging/vertical-config";
import {
  cloneProductTemplate,
} from "@/lib/automations/product-templates";
import { assertVerticalAutomationAllowed, templatesForRegisteredVertical } from "@/lib/automations/vertical-registry";
import "server-only";
import { adminDb } from "@/lib/firebase-admin";
import { getBusinessConfig } from "@/lib/messaging/services/business-config-service";
import { documentId, serverTimestamp } from "@/lib/messaging/services/shared";
import {
  validateAutomation,
  type Automation,
  type Run,
} from "@/lib/automations/model";
export async function requireAutomationBusiness(id: string) {
  const business = await getBusinessConfig(documentId(id));
  if (!business) throw new Error("Business not found.");
  return business;
}
const iso = (v: unknown) =>
  v && typeof v === "object" && "toDate" in v
    ? (v as { toDate(): Date }).toDate().toISOString()
    : typeof v === "string"
      ? v
      : null;

async function dashboardStage<T>(
  businessId: string,
  stage: string,
  operation: () => Promise<T>,
): Promise<T> {
  if (process.env.NODE_ENV === "development")
    console.info("[AUTOMATION_STAGE_START]", { businessId, stage });
  try {
    const result = await operation();
    if (process.env.NODE_ENV === "development")
      console.info("[AUTOMATION_STAGE_DONE]", {
        businessId,
        stage,
        count: Array.isArray(result) ? result.length : undefined,
      });
    return result;
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      const details = error as Error & { code?: unknown };
      console.error("[AUTOMATION_STAGE_FAILED]", {
        businessId,
        stage,
        name: details.name,
        code: details.code,
        message: details.message,
        stack: details.stack,
      });
    }
    throw error;
  }
}

export async function automationDashboard(businessId: string) {
  const business = await dashboardStage(businessId, "business", () =>
    requireAutomationBusiness(businessId),
  );
  if (!isTanyVertical(business.vertical))
    throw new Error("Unsupported business product.");
  if (process.env.NODE_ENV === "development")
    console.info("[AUTOMATION_UNUSED_DEPENDENCIES]", {
      businessId,
      whatsappAccount: false,
      subscription: false,
      entitlement: false,
    });
  const [automations, runs, templates] = await Promise.all([
    dashboardStage(businessId, "automations", () =>
      adminDb
        .collection("automations")
        .where("businessId", "==", businessId)
        .get(),
    ),
    dashboardStage(businessId, "automation_runs", () =>
      adminDb
        .collection("automation_runs")
        .where("businessId", "==", businessId)
        .get(),
    ),
    dashboardStage(businessId, "templates", () =>
      adminDb.collection("templates").where("businessId", "==", businessId).get(),
    ),
  ]);
  return {
    vertical: business.vertical,
    // The dashboard intentionally exposes only the active registry products.
    // Legacy flows remain service-compatible without being offered as new templates.
    automationTemplates: templatesForRegisteredVertical(business.vertical),
    automations: automations.docs.map((d) => {
      const v = d.data();
      return {
        ...validateAutomation(v),
        id: d.id,
        businessId,
        status: v.status,
        createdAt: iso(v.createdAt),
        updatedAt: iso(v.updatedAt),
        publishedAt: iso(v.publishedAt),
      } as Automation;
    }),
    runs: runs.docs
      .map((d) => {
        const v = d.data();
        return {
          id: d.id,
          automationId: v.automationId,
          businessId,
          trigger: v.trigger,
          status: v.status,
          startedAt: iso(v.startedAt),
          completedAt: iso(v.completedAt),
          actionsExecuted: v.actionsExecuted ?? 0,
          error: v.error ?? null,
        } as Run;
      })
      .sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? "")),
    templates: templates.docs
      .filter((d) => d.data().status === "approved")
      .map((d) => ({
        id: d.id,
        name: String(d.data().name ?? "Template"),
        body: String(d.data().body ?? ""),
      })),
  };
}
export async function saveAutomation(
  businessId: string,
  id: string | undefined,
  input: unknown,
  enforceVertical = true,
) {
  const business = await requireAutomationBusiness(businessId);
  const validated = validateAutomation(input);
  const data = enforceVertical ? assertVerticalAutomationAllowed(business.vertical, validated) : validated;
  const ref = id
    ? adminDb.collection("automations").doc(documentId(id))
    : adminDb.collection("automations").doc();
  await adminDb.runTransaction(async (tx) => {
    const current = (await tx.get(ref)).data();
    if (id && (!current || current.businessId !== businessId))
      throw new Error("Automation not found.");
    tx.set(ref, {
      ...data,
      businessId,
      status: "draft",
      createdAt: current?.createdAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
      publishedAt: current?.publishedAt ?? null,
    });
  });
  return ref.id;
}
export async function changeAutomation(
  businessId: string,
  id: string,
  operation: "publish" | "pause" | "resume" | "delete" | "duplicate",
) {
  await requireAutomationBusiness(businessId);
  const ref = adminDb.collection("automations").doc(documentId(id));
  const copy = adminDb.collection("automations").doc();
  return adminDb.runTransaction(async (tx) => {
    const current = (await tx.get(ref)).data();
    if (!current || current.businessId !== businessId)
      throw new Error("Automation not found.");
    const data = validateAutomation(current);
    if (["publish", "resume"].includes(operation)) {
      if (
        data.trigger.type === "schedule.triggered" &&
        Date.parse(data.trigger.at!) <= Date.now()
      )
        throw new Error("Choose a future schedule before publishing.");
      for (const action of data.actions.filter((a) => a.type === "template")) {
        const template = (
          await tx.get(
            adminDb.collection("templates").doc(documentId(action.templateId!)),
          )
        ).data();
        if (
          !template ||
          template.businessId !== businessId ||
          template.status !== "approved"
        )
          throw new Error("Choose an approved template from this business.");
      }
    }
    if (operation === "delete") tx.delete(ref);
    else if (operation === "duplicate")
      tx.create(copy, {
        ...data,
        name: `${data.name.slice(0, 110)} (copy)`,
        businessId,
        status: "draft",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        publishedAt: null,
      });
    else
      tx.update(ref, {
        status: operation === "pause" ? "paused" : "active",
        updatedAt: serverTimestamp(),
        ...(operation !== "pause" ? { publishedAt: serverTimestamp() } : {}),
      });
    return operation === "duplicate" ? copy.id : id;
  });
}

export async function createAutomationFromTemplate(
  businessId: string,
  templateId: string,
) {
  const business = await requireAutomationBusiness(businessId);
  const draft = cloneProductTemplate(business.vertical, templateId);
  // Legacy published template IDs remain importable; dashboard authoring is restricted by the registry.
  const id = await saveAutomation(businessId, undefined, draft, false);
  return { id, draft };
}
