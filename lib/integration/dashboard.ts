import { requireWhatsAppEntitlement } from "@/lib/subscriptions/entitlements";
﻿import "server-only";
import { getAdminBusiness, listBusinessProfiles, updateBusiness } from "@/lib/admin/services";
import { getWhatsAppOverview, prepareWhatsAppTest } from "@/lib/admin/whatsapp-service";
import { listWorkspaceRecords } from "@/lib/admin/workspace-service";
import { objectInput, stringInput, AdminValidationError } from "@/lib/admin/validation";
import { documentId } from "@/lib/messaging/services/shared";
import { buildWhatsAppPayload } from "@/lib/messaging/payload";
import type { MessagingBusiness, MessagingOverview, MessagingTemplates, MessagingTest } from "./contracts";
import { IntegrationError } from "@/lib/integration/http";

export async function integrationBusinesses(): Promise<MessagingBusiness[]> {
  return (await listBusinessProfiles()).map(({ id, name, vertical, active }) => ({ id, name, vertical, active }));
}
export async function integrationRead(businessId: string, resource: string) {
  await requireWhatsAppEntitlement(businessId);
  documentId(businessId);
  if (!await getAdminBusiness(businessId)) throw new IntegrationError(404, "Business not found.");
  if (resource === "conversations") return { businessId, conversations: await listWorkspaceRecords(businessId, "conversations") };
  if (resource === "templates") return { businessId, status: "pending_setup", items: [] } satisfies MessagingTemplates;
  if (["overview", "status", "webhook", "setup"].includes(resource)) return await getWhatsAppOverview(businessId) satisfies MessagingOverview;
  throw new IntegrationError(404, "Resource not found.");
}
export async function integrationSetup(businessId: string, input: unknown): Promise<MessagingOverview> {
  await requireWhatsAppEntitlement(businessId);
  const business = await getAdminBusiness(documentId(businessId));
  if (!business) throw new IntegrationError(404, "Business not found.");
  const value = objectInput(input, ["phoneNumberId", "wabaId", "connectedNumber"]);
  const phoneNumberId = stringInput(value.phoneNumberId, "phoneNumberId", 40);
  const wabaId = stringInput(value.wabaId ?? "", "wabaId", 40, true);
  const connectedNumber = stringInput(value.connectedNumber ?? "", "connectedNumber", 30, true);
  if (!/^\d+$/.test(phoneNumberId)) throw new AdminValidationError({ phoneNumberId: "Use a numeric WhatsApp Phone Number ID." });
  if (wabaId && !/^\d+$/.test(wabaId)) throw new AdminValidationError({ wabaId: "Use a numeric WABA ID." });
  if (connectedNumber && !/^\+?[\d ()-]{6,30}$/.test(connectedNumber)) throw new AdminValidationError({ connectedNumber: "Enter a valid display phone number." });
  const previous = business.settings.whatsapp;
  const whatsapp = previous && typeof previous === "object" && !Array.isArray(previous) ? previous : {};
  await updateBusiness(businessId, { name: business.name, vertical: business.vertical, active: business.active, whatsappPhoneNumberId: phoneNumberId, settings: { ...business.settings, whatsapp: { ...whatsapp, wabaId, connectedNumber } } });
  return getWhatsAppOverview(businessId);
}
export async function integrationTest(businessId: string, input: unknown): Promise<MessagingTest> {
  const value = objectInput(input, ["recipient", "message"]);
  const prepared = await prepareWhatsAppTest(businessId, value.recipient, value.message);
  const payload = buildWhatsAppPayload(prepared.to, prepared.text);
  return { ...prepared, to: payload.to, sent: false };
}

