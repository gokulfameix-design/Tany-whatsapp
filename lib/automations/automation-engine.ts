import {
  renderAutomationText,
  automationPlaceholderValues,
} from "@/lib/automations/placeholders";
import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { documentId, serverTimestamp } from "@/lib/messaging/services/shared";
import { sendWhatsAppMessage } from "@/lib/messaging/whatsapp";
import { buttonReply, listReply } from "@/lib/messaging/replies";
import { sendingAccessToken } from "@/lib/whatsapp/runtime-account";
import { hasEntitlement } from "@/lib/subscriptions/entitlements";
import { automationAccountReady } from "@/lib/whatsapp/runtime-account";
import { eventKey } from "@/lib/automations/events";
import {
  validateAutomation,
  type AutomationEvent,
  type AutomationInput,
  type Action,
  type Condition,
} from "@/lib/automations/model";
import type { MessagingReply } from "@/lib/messaging/types";
type Data = Record<string, unknown>;
const millis = (value: unknown): number =>
  value instanceof Timestamp
    ? value.toMillis()
    : typeof value === "string"
      ? Date.parse(value)
      : 0;
const object = (v: unknown): Data =>
  v && typeof v === "object" ? (v as Data) : {};
async function scoped(
  collection: string,
  id: string | undefined,
  businessId: string,
  phone?: string,
): Promise<Data> {
  if (!id) return {};
  const value = (
    await adminDb.collection(collection).doc(documentId(id)).get()
  ).data();
  if (
    !value ||
    value.businessId !== businessId ||
    (phone && value.customerPhone !== phone && value.phone !== phone)
  )
    throw new Error("Context unavailable");
  return { ...value, id };
}
export function triggerMatches(
  automation: AutomationInput,
  event: AutomationEvent,
) {
  if (automation.trigger.type === "keyword.matched")
    return (
      event.type === "customer.message.received" &&
      (automation.trigger.keywords ?? []).some((k) =>
        ` ${String(event.payload.text ?? "")
          .toLowerCase()
          .split(/[^\p{L}\p{N}]+/u)
          .filter(Boolean)
          .join(" ")} `.includes(
          ` ${k
            .toLowerCase()
            .split(/[^\p{L}\p{N}]+/u)
            .filter(Boolean)
            .join(" ")} `,
        ),
      )
    );
  return automation.trigger.type === event.type;
}
export function conditionsMatch(
  conditions: Condition[],
  context: {
    timestamp: string;
    text: string;
    customerType: string;
    tags: string[];
    orderStatus: string;
    bookingStatus: string;
    paymentStatus: string;
  },
) {
  const date = new Date(context.timestamp);
  const local = new Date(
    date.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
  );
  const time = `${String(local.getHours()).padStart(2, "0")}:${String(local.getMinutes()).padStart(2, "0")}`;
  return conditions.every((c) => {
    if (c.type === "business_hours" || c.type === "time_range")
      return c.value <= (c.end ?? "")
        ? time >= c.value && time < c.end!
        : time >= c.value || time < c.end!;
    if (c.type === "day")
      return c.value.split(",").includes(String(local.getDay()));
    if (c.type === "keyword")
      return context.text.toLowerCase().includes(c.value.toLowerCase());
    if (c.type === "customer_type") return context.customerType === c.value;
    if (c.type === "tag") return context.tags.includes(c.value);
    return (
      (
        {
          order_status: context.orderStatus,
          booking_status: context.bookingStatus,
          payment_status: context.paymentStatus,
        } as Record<string, string>
      )[c.type] === c.value
    );
  });
}
async function contextFor(event: AutomationEvent) {
  documentId(event.businessId);
  documentId(event.customerId);
  const customer = await scoped(
    "customers",
    event.customerId,
    event.businessId,
  );
  const phone = String(customer.phone ?? "");
  if (!/^[1-9]\d{7,14}$/.test(phone)) throw new Error("Customer unavailable");
  const conversation = await scoped(
    "conversations",
    event.conversationId,
    event.businessId,
    phone,
  );
  const context = object(conversation.context);
  const orderId = event.type.startsWith("order.")
    ? event.entityId
    : typeof context.orderId === "string"
      ? context.orderId
      : undefined;
  const bookingId = event.type.startsWith("booking.")
    ? event.entityId
    : typeof context.bookingId === "string"
      ? context.bookingId
      : undefined;
  const order = await scoped("orders", orderId, event.businessId, phone);
  const booking = await scoped("bookings", bookingId, event.businessId, phone);
  const paymentId =
    event.type === "payment.completed"
      ? event.entityId
      : typeof order.paymentId === "string"
        ? order.paymentId
        : typeof booking.paymentId === "string"
          ? booking.paymentId
          : undefined;
  const payment = await scoped("payments", paymentId, event.businessId, phone);
  const previous = await adminDb
    .collection("orders")
    .where("businessId", "==", event.businessId)
    .where("customerPhone", "==", phone)
    .get();
  const bookings = await adminDb
    .collection("bookings")
    .where("businessId", "==", event.businessId)
    .where("customerPhone", "==", phone)
    .get();
  return {
    customer,
    conversation,
    phone,
    order,
    booking,
    payment,
    conditions: {
      timestamp: event.timestamp,
      text: String(event.payload.text ?? ""),
      customerType:
        previous.docs.some((d) => d.id !== event.entityId) ||
        bookings.docs.some((d) => d.id !== event.entityId)
          ? "returning"
          : "new",
      tags: Array.isArray(customer.tags) ? (customer.tags as string[]) : [],
      orderStatus: String(
        event.type.startsWith("order.")
          ? (event.payload.status ?? order.status ?? "")
          : (order.status ?? ""),
      ),
      bookingStatus: String(
        event.type.startsWith("booking.")
          ? (event.payload.status ?? booking.status ?? "")
          : (booking.status ?? ""),
      ),
      paymentStatus: String(
        event.type === "payment.completed" ? "paid" : (payment.status ?? ""),
      ),
    },
  };
}
async function assertReady(event: AutomationEvent, phone: string) {
  const business = await scopedBusiness(event.businessId);
  if (
    !(await hasEntitlement(event.businessId, "whatsappAutomation")) ||
    !(await automationAccountReady(
      event.businessId,
      String(business.whatsappPhoneNumberId ?? ""),
    ))
  )
    throw new Error("Messaging unavailable");
  const identity = (
    await adminDb.collection("whatsapp_identities").doc(phone).get()
  ).data();
  if (!identity?.linked) throw new Error("Identity is not linked");
  return business;
}
async function scopedBusiness(id: string) {
  const value = (
    await adminDb.collection("businesses").doc(documentId(id)).get()
  ).data();
  if (!value?.active) throw new Error("Business unavailable");
  return value;
}
async function sendAction(
  action: Action,
  event: AutomationEvent,
  runId: string,
  index: number,
  context: Awaited<ReturnType<typeof contextFor>>,
  onSent: () => Promise<void>,
) {
  const business = await assertReady(event, context.phone);
  const values = automationPlaceholderValues({ business, ...context });
  action = {
    ...action,
    ...(action.text !== undefined
      ? { text: renderAutomationText(action.text, values) }
      : {}),
    ...(action.parameters
      ? {
          parameters: action.parameters.map((p) =>
            renderAutomationText(p, values),
          ),
        }
      : {}),
  };
  if (
    action.text &&
    action.text.length > (action.type === "text" ? 4096 : 1024)
  )
    throw new Error("Resolved message exceeds WhatsApp length limit");
  if (action.parameters?.some((p) => p.length > 1000))
    throw new Error(
      "Resolved template parameter exceeds WhatsApp length limit",
    );

  const messageRef = adminDb
    .collection("messages")
    .doc(`automation_${runId}_${index}`);
  // The run claim ensures only one worker can reach this external side effect.
  let reply: MessagingReply = { type: "text", body: action.text ?? "" };
  const choiceId = (n: number) => `auto:${runId.slice(0, 16)}:${index}:${n}`;
  if (action.type === "buttons")
    reply = buttonReply({
      body: action.text!,
      buttons: action.choices!.map((title, n) => ({ id: choiceId(n), title })),
    });
  if (action.type === "list")
    reply = listReply({
      body: action.text!,
      buttonText: "Choose",
      sections: [
        {
          rows: action.choices!.map((title, n) => ({ id: choiceId(n), title })),
        },
      ],
    });
  if (action.type === "location")
    reply = { type: "location_request", body: action.text! };
  if (action.type === "payment_link") {
    const payment = context.payment;
    const entity =
      payment.referenceType === "order"
        ? context.order
        : payment.referenceType === "booking"
          ? context.booking
          : {};
    const expectedId = entity.id;
    const url = new URL(
      String(payment.paymentLink ?? payment.paymentUrl ?? ""),
    );
    if (
      !expectedId ||
      payment.referenceId !== expectedId ||
      entity.paymentId !== payment.id ||
      payment.currency !== "INR" ||
      Number(payment.amount) !==
        Number(
          payment.referenceType === "order" ? entity.total : entity.amount,
        ) ||
      !Object.keys(entity).length ||
      payment.status !== "pending" ||
      !Number.isFinite(payment.amount) ||
      Number(payment.amount) <= 0 ||
      ["cancelled", "completed", "paid"].includes(String(entity.status)) ||
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !["rzp.io", "rzp.co", "razorpay.com"].some(
        (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
      )
    )
      throw new Error("Valid pending payment context required");
    reply = {
      type: "cta_url",
      body: "Complete payment for your request.",
      title: "Pay securely",
      url: url.href,
    };
  }
  let template: Data | undefined;
  if (action.type === "template") {
    const raw = await scoped("templates", action.templateId, event.businessId);
    if (
      raw.status !== "approved" ||
      !/^[a-z0-9_]{1,120}$/.test(String(raw.name)) ||
      !/^[a-z]{2,3}(_[A-Z]{2})?$/.test(String(raw.language))
    )
      throw new Error("Approved template required");
    const parts = Array.isArray(raw.components)
      ? (raw.components as Data[])
      : [];
    if (
      parts.some(
        (p) => !["BODY", "FOOTER"].includes(String(p.type).toUpperCase()),
      )
    )
      throw new Error("Only text templates are supported");
    const body = String(
      raw.body ??
        parts.find((p) => String(p.type).toUpperCase() === "BODY")?.text ??
        "",
    );
    const numbers = [
      ...new Set(
        Array.from(body.matchAll(/\{\{(\d+)\}\}/g), (m) => Number(m[1])),
      ),
    ].sort((a, b) => a - b);
    const parameters = action.parameters ?? [];
    if (
      numbers.length !== parameters.length ||
      numbers.some((n, i) => n !== i + 1)
    )
      throw new Error("Template parameters required");
    reply = {
      type: "text",
      body: body.replace(/\{\{(\d+)\}\}/g, (_, n) => parameters[Number(n) - 1]),
    };
    template = {
      name: raw.name,
      language: { code: raw.language },
      ...(parameters.length
        ? {
            components: [
              {
                type: "body",
                parameters: parameters.map((text) => ({ type: "text", text })),
              },
            ],
          }
        : {}),
    };
  } else {
    const incoming = await adminDb
      .collection("messages")
      .where("businessId", "==", event.businessId)
      .where("customerPhone", "==", context.phone)
      .where("direction", "==", "incoming")
      .get();
    const last = Math.max(
      0,
      ...incoming.docs.map((d) => {
        const v = d.data();
        return /^\d{10}$/.test(v.whatsappTimestamp ?? "")
          ? Number(v.whatsappTimestamp) * 1000
          : millis(v.createdAt);
      }),
    );
    if (!last || Date.now() - last >= 86400000)
      throw new Error(
        "An approved template is required outside the reply window",
      );
  }
  await messageRef.create({
    businessId: event.businessId,
    customerPhone: context.phone,
    conversationId: event.conversationId ?? "",
    direction: "outgoing",
    type: template ? "template" : reply.type,
    text: reply.body,
    body: reply.body,
    source: "automation",
    automationRunId: runId,
    deliveryStatus: "sending",
    processingStatus: "received",
    createdAt: serverTimestamp(),
  });
  try {
    if (
      event.conversationId &&
      (
        await scoped(
          "conversations",
          event.conversationId,
          event.businessId,
          context.phone,
        )
      ).status === "handed_off"
    )
      throw new Error("Human handoff is active");
    let result;
    if (template) {
      const token = await sendingAccessToken(
        String(business.whatsappPhoneNumberId),
      );
      if (!token) throw new Error("Credential unavailable");
      const response = await fetch(
        `https://graph.facebook.com/v26.0/${business.whatsappPhoneNumberId}/messages`,
        {
          method: "POST",
          signal: AbortSignal.timeout(15000),
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: context.phone,
            type: "template",
            template,
          }),
        },
      );
      result = await response.json();
      if (!response.ok) throw new Error("Send failed");
    } else
      result = await sendWhatsAppMessage({
        phoneNumberId: String(business.whatsappPhoneNumberId),
        to: context.phone,
        reply,
      });
    if (!result?.messages?.[0]?.id) throw new Error("No provider receipt");
    await onSent();
    await messageRef.update({
      messageId: result.messages[0].id,
      deliveryStatus: "sent",
      processingStatus: "processed",
      updatedAt: serverTimestamp(),
    });
  } catch {
    await messageRef.update({
      deliveryStatus: "failed",
      processingStatus: "failed",
      updatedAt: serverTimestamp(),
    });
    throw new Error("Send could not be confirmed; manual review required");
  }
}
export type AutomationResult = { handled: boolean; terminal: boolean; messageSent: boolean; actionCount: number };

async function recordedOutcome(runId: string): Promise<AutomationResult> {
  const run = (await adminDb.collection("automation_runs").doc(runId).get()).data();
  // Older runs have no effect flags. Only a confirmed outgoing receipt or an
  // actual handoff is evidence of a terminal outcome, never the run status.
  const messages = await adminDb.collection("messages").where("automationRunId", "==", runId).get();
  const messageSent = run?.messageSent === true || messages.docs.some(doc => doc.data().businessId === run?.businessId && !!doc.data().messageId && ["sent", "delivered", "read"].includes(doc.data().deliveryStatus));
  let handedOff = false;
  if (run?.event?.conversationId) {
    const conversation = (await adminDb.collection("conversations").doc(documentId(run.event.conversationId)).get()).data();
    handedOff = conversation?.businessId === run.businessId && conversation?.status === "handed_off";
  }
  return { handled: !!run && run.status !== "skipped", terminal: run?.terminal === true || messageSent || handedOff, messageSent, actionCount: Number(run?.actionsExecuted) || 0 };
}

export async function runAutomationEvent(
  event: AutomationEvent,
  onlyAutomationId?: string,
) {
  if (
    !["domain", "customer", "scheduler", undefined].includes(event.source) ||
    !event.id ||
    !Number.isFinite(Date.parse(event.timestamp))
  )
    throw new Error("Invalid automation event");
  const automations = await adminDb
    .collection("automations")
    .where("businessId", "==", documentId(event.businessId))
    .where("status", "==", "active")
    .get();
  let handled = false;
  let terminal = false;
  let messageSent = false;
  let actionCount = 0;
  for (const doc of automations.docs) {
    if (onlyAutomationId && doc.id !== onlyAutomationId) continue;
    const automation = validateAutomation(doc.data());
    if (!triggerMatches(automation, event)) continue;
    const runId = eventKey(event.businessId, doc.id, event.id);
    const ref = adminDb.collection("automation_runs").doc(runId);
    const claimed = await adminDb.runTransaction(async (tx) => {
      const existing = (await tx.get(ref)).data();
      if (existing) return false;
      tx.create(ref, {
        automationId: doc.id,
        businessId: event.businessId,
        trigger: event.type,
        event,
        definition: automation,
        status: "running",
        startedAt: serverTimestamp(),
        completedAt: null,
        actionsExecuted: 0,
        error: null,
        attempts: 1,
      });
      return true;
    });
    const outcome = claimed ? await executeRun(runId, event, automation, 0) : await recordedOutcome(runId);
    handled ||= outcome.handled;
    terminal ||= outcome.terminal;
    messageSent ||= outcome.messageSent;
    actionCount += outcome.actionCount;
    // Each matching rule runs once; bot-generated messages never emit incoming events.
  }
  return { handled, terminal, messageSent, actionCount };
}
async function executeRun(
  runId: string,
  event: AutomationEvent,
  automation: AutomationInput,
  cursor: number,
) {
  const ref = adminDb.collection("automation_runs").doc(runId);
  let executed = cursor;
  const previous = (await ref.get()).data();
  let terminal = previous?.terminal === true;
  let messageSent = previous?.messageSent === true;
  const outcome = (handled = true): AutomationResult => ({ handled, terminal, messageSent, actionCount: executed });
  try {
    let context = await contextFor(event);
    if (context.conversation.status === "handed_off") {
      terminal = true;
      await ref.update({
        status: "skipped",
        error: "Human handoff is active",
        completedAt: serverTimestamp(),
      });
      return outcome();
    }
    if (
      cursor === 0 &&
      !conditionsMatch(automation.conditions, context.conditions)
    ) {
      await ref.update({
        status: "skipped",
        error: null,
        completedAt: serverTimestamp(),
      });
      return outcome(false);
    }
    for (let i = cursor; i < automation.actions.length; i++) {
      context = await contextFor(event);
      if (context.conversation.status === "handed_off") { terminal = true; break; }
      const current = (await ref.get()).data();
      const live = (
        await adminDb
          .collection("automations")
          .doc(String(current?.automationId))
          .get()
      ).data();
      if (
        !live ||
        live.businessId !== event.businessId ||
        live.status !== "active"
      ) {
        await ref.update({
          status: "skipped",
          error: "Automation is paused or deleted",
          completedAt: serverTimestamp(),
        });
        return outcome(false);
      }
      const action = automation.actions[i];
      if (action.type === "delay") {
        await ref.update({
          status: "waiting",
          cursor: i + 1,
          actionsExecuted: i + 1,
          terminal, messageSent,
          resumeAt: Timestamp.fromMillis(Date.now() + action.minutes! * 60000),
        });
        executed = i + 1;
        return outcome();
      }
      if (action.type === "end") {
        // End this rule, not the customer's normal conversation flow.
        executed = i + 1;
        break;
      }
      if (["handoff", "state"].includes(action.type)) {
        if (!event.conversationId) throw new Error("Conversation required");
        const target = adminDb
          .collection("conversations")
          .doc(documentId(event.conversationId));
        await adminDb.runTransaction(async (tx) => {
          const c = (await tx.get(target)).data();
          if (
            !c ||
            c.businessId !== event.businessId ||
            c.customerPhone !== context.phone ||
            c.status === "handed_off"
          )
            throw new Error("Conversation unavailable");
          tx.update(
            target,
            action.type === "handoff"
              ? { status: "handed_off", updatedAt: serverTimestamp() }
              : { state: action.value!, updatedAt: serverTimestamp() },
          );
        });
        if (action.type === "handoff") terminal = true;
      } else if (action.type === "tag") {
        const target = adminDb.collection("customers").doc(event.customerId);
        await adminDb.runTransaction(async (tx) => {
          const c = (await tx.get(target)).data();
          if (!c || c.businessId !== event.businessId)
            throw new Error("Customer unavailable");
          const tags = Array.isArray(c.tags) ? c.tags : [];
          tx.update(target, {
            tags: [...new Set([...tags, action.value])].slice(-100),
            updatedAt: serverTimestamp(),
          });
        });
      } else await sendAction(action, event, runId, i, context, async () => {
        terminal = true;
        messageSent = true;
        executed = i + 1;
        await ref.update({ terminal, messageSent, actionsExecuted: executed });
      });
      executed = i + 1;
      await ref.update({ actionsExecuted: executed, terminal, messageSent });
      if (action.type === "handoff") break;
    }
    await ref.update({
      status: "completed",
      actionsExecuted: executed,
      terminal, messageSent,
      completedAt: serverTimestamp(),
    });
    return outcome();
  } catch {
    // Provider errors may contain credentials/customer content. Never persist raw exception strings.
    await ref.update({
      status: "failed",
      actionsExecuted: executed,
      terminal, messageSent,
      error:
        "Action failed. Check context, approved template, reply window and account configuration. Automatic retries stopped; review before retrying.",
      completedAt: serverTimestamp(),
    });
    return outcome();
  }
}
export async function resumeAutomationRun(runId: string) {
  const ref = adminDb.collection("automation_runs").doc(documentId(runId));
  const claimed = await adminDb.runTransaction(async (tx) => {
    const run = (await tx.get(ref)).data();
    if (!run || run.status !== "waiting" || millis(run.resumeAt) > Date.now())
      return null;
    tx.update(ref, { status: "running" });
    return run;
  });
  if (claimed)
    await executeRun(
      runId,
      claimed.event as AutomationEvent,
      validateAutomation(claimed.definition),
      Number(claimed.cursor),
    );
}
