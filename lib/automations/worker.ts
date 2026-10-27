import { eventKey } from "@/lib/automations/events";
import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import {
  runAutomationEvent,
  resumeAutomationRun,
} from "@/lib/automations/automation-engine";
import {
  validateAutomation,
  type AutomationEvent,
} from "@/lib/automations/model";
import {
  customerDocumentId,
  documentId,
  serverTimestamp,
} from "@/lib/messaging/services/shared";
/** Invoke per business from a trusted scheduler. Work is bounded per invocation. */
export async function processAutomationWork(businessId: string) {
  documentId(businessId);
  const queued = await adminDb
    .collection("automation_events")
    .where("businessId", "==", businessId)
    .where("status", "==", "pending")
    .get();
  for (const doc of queued.docs.slice(0, 50)) {
    const event = doc.data() as AutomationEvent;
    try {
      const automationIds = doc.data().automationIds;
      if (Array.isArray(automationIds)) {
        for (const id of automationIds) await runAutomationEvent(event, id);
      } else await runAutomationEvent(event);
      await adminDb
        .collection("automation_events")
        .doc(doc.id)
        .update({ status: "processed", completedAt: serverTimestamp() });
    } catch {
      await adminDb.collection("automation_events").doc(doc.id).update({
        status: "failed",
        error: "Event validation failed; review required",
        completedAt: serverTimestamp(),
      });
    }
  }
  const waiting = await adminDb
    .collection("automation_runs")
    .where("businessId", "==", businessId)
    .where("status", "==", "waiting")
    .get();
  for (const doc of waiting.docs
    .filter(
      (d) =>
        d.data().resumeAt instanceof Timestamp &&
        d.data().resumeAt.toMillis() <= Date.now(),
    )
    .slice(0, 50))
    await resumeAutomationRun(doc.id);
  const interrupted = await adminDb
    .collection("automation_runs")
    .where("businessId", "==", businessId)
    .where("status", "==", "running")
    .get();
  for (const doc of interrupted.docs
    .filter(
      (d) =>
        d.data().startedAt instanceof Timestamp &&
        Date.now() - d.data().startedAt.toMillis() > 900000,
    )
    .slice(0, 50)) {
    await adminDb.runTransaction(async (tx) => {
      const current = (
        await tx.get(adminDb.collection("automation_runs").doc(doc.id))
      ).data();
      if (current?.status === "running")
        tx.update(adminDb.collection("automation_runs").doc(doc.id), {
          status: "failed",
          error:
            "Worker interrupted. Manual review required; no automatic resend.",
          completedAt: serverTimestamp(),
        });
    });
  }
  const rules = await adminDb
    .collection("automations")
    .where("businessId", "==", businessId)
    .where("status", "==", "active")
    .get();
  const timed = rules.docs.filter((d) =>
    ["schedule.triggered", "conversation.no_reply"].includes(
      d.data().trigger?.type,
    ),
  );
  if (!timed.length) return;
  const conversations = await adminDb
    .collection("conversations")
    .where("businessId", "==", businessId)
    .get();
  for (const doc of timed) {
    const rule = validateAutomation(doc.data());
    if (
      rule.trigger.type === "schedule.triggered" &&
      Date.parse(rule.trigger.at!) > Date.now()
    )
      continue;
    const cursorRef = adminDb
      .collection("automation_scheduler_cursors")
      .doc(eventKey(businessId, doc.id));
    const cursor = String((await cursorRef.get()).data()?.lastId ?? "");
    const orderedConversations = [...conversations.docs].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    const batch = orderedConversations
      .filter((c) => c.id > cursor)
      .slice(0, 100);
    for (const conversation of batch) {
      const c = conversation.data();
      if (c.status === "handed_off" || !c.customerPhone) continue;
      let anchor = rule.trigger.at!;
      if (rule.trigger.type === "conversation.no_reply") {
        const messages = await adminDb
          .collection("messages")
          .where("businessId", "==", businessId)
          .where("customerPhone", "==", c.customerPhone)
          .get();
        const ordered = messages.docs
          .map(
            (m) =>
              ({ id: m.id, ...m.data() }) as {
                id: string;
                createdAt: unknown;
                direction: unknown;
                source: unknown;
                automationRunId?: string;
                automationId?: string;
              },
          )
          .sort(
            (a, b) =>
              (b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : 0) -
              (a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : 0),
          );
        const latest = ordered[0];
        // Follow up only after an outgoing message remains unanswered, once per message/rule.
        if (
          !latest ||
          latest.direction !== "outgoing" ||
          !(latest.createdAt instanceof Timestamp) ||
          Date.now() - latest.createdAt.toMillis() <
            rule.trigger.hours! * 3600000
        )
          continue;
        if (latest.source === "automation") {
          const previousRunId = latest.automationRunId ?? latest.automationId;
          if (!previousRunId) continue;
          const previousRun = (
            await adminDb
              .collection("automation_runs")
              .doc(documentId(previousRunId))
              .get()
          ).data();
          if (
            !previousRun ||
            previousRun.businessId !== businessId ||
            previousRun.trigger === "conversation.no_reply"
          )
            continue;
        }
        anchor = latest.id;
      }
      await runAutomationEvent(
        {
          id: `${doc.id}:${anchor}:${conversation.id}`,
          type: rule.trigger.type as AutomationEvent["type"],
          businessId,
          customerId: customerDocumentId(businessId, c.customerPhone),
          conversationId: conversation.id,
          timestamp: new Date().toISOString(),
          payload: {},
          source: "scheduler",
        },
        doc.id,
      );
    }
    await cursorRef.set({
      businessId,
      lastId: batch.length === 100 ? batch.at(-1)!.id : "",
      updatedAt: serverTimestamp(),
    });
  }
}
