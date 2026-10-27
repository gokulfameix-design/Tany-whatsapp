import "server-only";
import { createHash } from "node:crypto";
import { adminDb } from "@/lib/firebase-admin";
import {
  customerDocumentId,
  serverTimestamp,
} from "@/lib/messaging/services/shared";
import type { AutomationEvent } from "@/lib/automations/model";
export const eventKey = (...values: string[]) =>
  createHash("sha256").update(JSON.stringify(values)).digest("hex");
/** Durable normalized events; no webhook-specific or vertical-specific logic. */
export async function queueAutomationEvent(event: AutomationEvent) {
  const active = await adminDb
    .collection("automations")
    .where("businessId", "==", event.businessId)
    .where("status", "==", "active")
    .get();
  if (active.empty) return;
  const ref = adminDb
    .collection("automation_events")
    .doc(eventKey(event.businessId, event.id));
  await adminDb.runTransaction(async (tx) => {
    if (!(await tx.get(ref)).exists)
      tx.create(ref, {
        ...event,
        automationIds: active.docs.map((d) => d.id),
        status: "pending",
        createdAt: serverTimestamp(),
      });
  });
}
export async function emitEntityEvent(
  type: AutomationEvent["type"],
  entity: {
    id: string;
    businessId: string;
    customerPhone: string;
    updatedAt?: unknown;
    status?: string;
  },
  payload: Record<string, unknown> = {},
) {
  await queueAutomationEvent({
    id: `${type}:${entity.id}:${entity.status ?? "created"}`,
    type,
    businessId: entity.businessId,
    customerId: customerDocumentId(entity.businessId, entity.customerPhone),
    conversationId: customerDocumentId(entity.businessId, entity.customerPhone),
    entityId: entity.id,
    timestamp: new Date().toISOString(),
    payload: { ...payload, status: entity.status ?? "" },
    source: "domain",
  });
}

/** Called before any writes in a domain transaction: entity and event commit atomically. */
export async function writeEntityEvent(
  tx: FirebaseFirestore.Transaction,
  type: AutomationEvent["type"],
  entity: {
    id: string;
    businessId: string;
    customerPhone: string;
    status?: string;
    automationRevision?: number;
  },
  payload: Record<string, unknown> = {},
) {
  const active = await tx.get(
    adminDb
      .collection("automations")
      .where("businessId", "==", entity.businessId)
      .where("status", "==", "active"),
  );
  if (active.empty) return;
  const event: AutomationEvent = {
    id: `${type}:${entity.id}:${entity.automationRevision ?? 0}:${entity.status ?? "created"}`,
    type,
    businessId: entity.businessId,
    customerId: customerDocumentId(entity.businessId, entity.customerPhone),
    conversationId: customerDocumentId(entity.businessId, entity.customerPhone),
    entityId: entity.id,
    timestamp: new Date().toISOString(),
    payload: { ...payload, status: entity.status ?? "" },
    source: "domain",
  };
  const ref = adminDb
    .collection("automation_events")
    .doc(eventKey(event.businessId, event.id));
  if (!(await tx.get(ref)).exists)
    tx.create(ref, {
      ...event,
      automationIds: active.docs.map((d) => d.id),
      status: "pending",
      createdAt: serverTimestamp(),
    });
}
