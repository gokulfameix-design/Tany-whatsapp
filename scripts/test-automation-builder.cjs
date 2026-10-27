/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { NextRequest } = require("next/server");
const { createHarness, demoBusiness } = require("./messaging-test-helpers.cjs");
const phone = "919999999999";
const customerId = `a_${phone}`;
function setup() {
  const h = createHarness({ seedFixtures: false });
  const stamp = h.Timestamp.now();
  h.seed("businesses/a", { ...demoBusiness });
  h.seed("businesses/b", { ...demoBusiness });
  h.seed(`customers/${customerId}`, {
    businessId: "a",
    phone,
    tags: ["vip"],
    createdAt: stamp,
  });
  h.seed("conversations/chat", {
    businessId: "a",
    customerPhone: phone,
    status: "active",
    state: "eats_start",
    context: {},
    createdAt: stamp,
  });
  h.seed(`whatsapp_identities/${phone}`, {
    phone,
    uid: "private-customer-uid",
    linked: true,
  });
  h.seed("messages/incoming", {
    businessId: "a",
    customerPhone: phone,
    direction: "incoming",
    text: "hi",
    createdAt: stamp,
  });
  return h;
}
const input = (
  type = "keyword.matched",
  actions = [{ type: "text", text: "Welcome!" }],
) => ({
  name: "Test automation",
  description: "Regression test",
  trigger: {
    type,
    ...(type === "keyword.matched" ? { keywords: ["hi", "hello"] } : {}),
  },
  conditions: [],
  actions,
});
const event = (
  id = "event1",
  type = "customer.message.received",
  payload = { text: "Hi!" },
) => ({
  id,
  type,
  businessId: "a",
  customerId,
  conversationId: "chat",
  timestamp: new Date().toISOString(),
  payload,
  source: "customer",
});
async function active(h, definition = input(), businessId = "a") {
  const service = h.load("lib/automations/service.ts");
  const id = await service.saveAutomation(businessId, undefined, definition);
  await service.changeAutomation(businessId, id, "publish");
  return id;
}
function runs(h) {
  return [...h.documents]
    .filter(([p]) => p.startsWith("automation_runs/"))
    .map(([, v]) => v);
}
async function main() {
  let h = setup(),
    engine = h.load("lib/automations/automation-engine.ts");
  const model = h.load("lib/automations/model.ts");
  assert.equal(Object.keys(model.triggerOptions).length, 10);
  assert.equal(Object.keys(model.conditionOptions).length, 9);
  assert.equal(Object.keys(model.actionOptions).length, 11);
  assert.throws(() =>
    model.validateAutomation(
      input("keyword.matched", [
        { type: "buttons", text: "Choose", choices: ["1", "2", "3", "4"] },
      ]),
    ),
  );
  assert.throws(() =>
    model.validateAutomation(
      input("keyword.matched", [
        {
          type: "list",
          text: "Choose",
          choices: Array.from({ length: 11 }, (_, i) => String(i)),
        },
      ]),
    ),
  );
  assert.equal(
    engine.triggerMatches(
      input(),
      event("no", "customer.message.received", { text: "shipping" }),
    ),
    false,
  );
  const id = await active(
    h,
    input("keyword.matched", [
      { type: "tag", value: "welcomed" },
      {
        type: "buttons",
        text: "Welcome. You can type too.",
        choices: ["Start", "Help"],
      },
      { type: "state", value: "eats_start" },
      { type: "end" },
    ]),
  );
  await Promise.all([
    engine.runAutomationEvent(event()),
    engine.runAutomationEvent(event()),
  ]);
  assert.equal(h.sends.length, 1, "concurrent duplicate event sends once");
  assert.equal(h.sends[0].reply.type, "buttons");
  assert.ok(h.read(`customers/${customerId}`).tags.includes("welcomed"));
  assert.equal(runs(h)[0].actionsExecuted, 4);
  assert.equal(runs(h)[0].status, "completed");
  assert.equal(h.read("conversations/chat").state, "eats_start");
  assert.ok(
    h.writes.findIndex((w) => w.path === `customers/${customerId}`) <
      h.writes.findIndex((w) => w.path.startsWith("messages/automation_")),
    "actions execute in order",
  );
  const service = h.load("lib/automations/service.ts");
  await assert.rejects(service.changeAutomation("b", id, "pause"));
  await assert.rejects(service.saveAutomation("b", id, input()));
  await service.changeAutomation("a", id, "pause");
  assert.equal(
    (await engine.runAutomationEvent(event("paused"))).handled,
    false,
  );
  assert.equal(h.sends.length, 1);
  await service.changeAutomation("a", id, "resume");
  h.seed("conversations/chat", {
    ...h.read("conversations/chat"),
    status: "handed_off",
  });
  await engine.runAutomationEvent(event("human"));
  assert.equal(h.sends.length, 1);
  assert.equal(runs(h).at(-1).status, "skipped");
  h = setup();
  engine = h.load("lib/automations/automation-engine.ts");
  await active(h, input(), "b");
  assert.equal((await engine.runAutomationEvent(event())).handled, false);
  assert.equal(h.sends.length, 0);
  h = setup();
  engine = h.load("lib/automations/automation-engine.ts");
  h.seed("orders/order1", {
    businessId: "a",
    customerPhone: phone,
    status: "confirmed",
    items: [],
    paymentId: null,
  });
  await active(h, {
    ...input("order.status.changed"),
    conditions: [
      { type: "order_status", value: "confirmed" },
      { type: "tag", value: "vip" },
    ],
  });
  await engine.runAutomationEvent({
    ...event("order", "order.status.changed", { status: "confirmed" }),
    entityId: "order1",
  });
  assert.equal(h.sends.length, 1, "order status trigger and AND conditions");
  await engine.runAutomationEvent({
    ...event("order2", "order.status.changed", { status: "cancelled" }),
    entityId: "order1",
  });
  assert.equal(h.sends.length, 1, "condition failure skips");
  h = setup();
  engine = h.load("lib/automations/automation-engine.ts");
  h.seed("bookings/booking1", {
    businessId: "a",
    customerPhone: phone,
    status: "draft",
  });
  await active(h, input("booking.created"));
  await engine.runAutomationEvent({
    ...event("booking", "booking.created"),
    entityId: "booking1",
  });
  assert.equal(h.sends.length, 1, "booking trigger");
  const conditionContext = {
    timestamp: "2026-10-26T06:00:00Z",
    text: "Hello price",
    customerType: "new",
    tags: ["vip"],
    orderStatus: "confirmed",
    bookingStatus: "confirmed",
    paymentStatus: "pending",
  };
  assert.ok(
    engine.conditionsMatch(
      [
        { type: "business_hours", value: "09:00", end: "18:00" },
        { type: "time_range", value: "22:00", end: "12:00" },
        { type: "day", value: "1" },
        { type: "customer_type", value: "new" },
        { type: "keyword", value: "price" },
        { type: "booking_status", value: "confirmed" },
        { type: "payment_status", value: "pending" },
      ],
      conditionContext,
    ),
  );
  assert.equal(
    engine.conditionsMatch(
      [{ type: "customer_type", value: "returning" }],
      conditionContext,
    ),
    false,
  );
  h = setup();
  engine = h.load("lib/automations/automation-engine.ts");
  await active(h, input());
  h.failNextSend();
  await engine.runAutomationEvent(event());
  assert.equal(runs(h)[0].status, "failed");
  assert.ok(runs(h)[0].error.includes("Automatic retries stopped"));
  assert.ok(!JSON.stringify(runs(h)).includes("Mock Meta failure"));
  await engine.runAutomationEvent(event());
  assert.equal(runs(h).length, 1);
  // Matching a rule is not evidence that it replied or took over the conversation.
  for (const actions of [
    [{ type: "tag", value: "seen" }, { type: "end" }],
    [{ type: "state", value: "eats_start" }, { type: "end" }],
    [{ type: "delay", minutes: 1 }, { type: "text", text: "Later" }],
    [{ type: "end" }],
  ]) {
    const fallback = setup();
    await active(fallback, input("customer.message.received", actions));
    const trace = [];
    const result = await fallback.load("lib/messaging/services/incoming-message-service.ts").processIncomingMessage(
      { ...demoBusiness, id: "a" },
      { from: phone, id: "wamid.nonterminal", type: "text", text: { body: "Hi" } },
      { trace: (marker, details) => trace.push([marker, details]) },
    );
    assert.notEqual(result.skipped, "automation_handled");
    assert.ok(result.structuredReply);
    assert.ok(trace.some(([marker]) => marker === "[WA_ROUTER_START]"));
    const logged = trace.find(([marker]) => marker === "[WA_AUTOMATION_RESULT]")[1];
    assert.equal(logged.handled, true); assert.equal(logged.terminal, false); assert.equal(logged.messageSent, false);
    assert.ok(logged.actionCount > 0);
    assert.equal(fallback.sends.length, 1, "normal router must reply");
    const persisted = runs(fallback)[0];
    const replay = await fallback.load("lib/automations/automation-engine.ts").runAutomationEvent(persisted.event);
    assert.equal(replay.terminal, false, "a completed/waiting nonterminal run must not swallow replay");
  }
  for (const actions of [[{ type: "text", text: "Automation reply" }], [{ type: "handoff" }], [{ type: "text", text: "Reply before failure" }, { type: "payment_link" }]]) {
    const terminal = setup();
    await active(terminal, input("customer.message.received", actions));
    const trace = [];
    const result = await terminal.load("lib/messaging/services/incoming-message-service.ts").processIncomingMessage(
      { ...demoBusiness, id: "a" },
      { from: phone, id: "wamid.terminal", type: "text", text: { body: "Hi" } },
      { trace: (marker, details) => trace.push([marker, details]) },
    );
    assert.equal(result.skipped, "automation_handled");
    assert.ok(!trace.some(([marker]) => marker === "[WA_ROUTER_START]"));
    const logged = trace.find(([marker]) => marker === "[WA_AUTOMATION_RESULT]")[1];
    assert.equal(logged.terminal, true);
    assert.equal(logged.messageSent, actions[0].type === "text");
    assert.equal(terminal.sends.length, actions[0].type === "text" ? 1 : 0);
    const persisted = runs(terminal)[0];
    const replay = await terminal.load("lib/automations/automation-engine.ts").runAutomationEvent(persisted.event);
    assert.equal(replay.terminal, true, "recorded terminal effects remain terminal on replay");
  }
  const failed = setup();
  await active(failed, input());
  failed.failNextSend();
  const recovered = await failed.load("lib/messaging/services/incoming-message-service.ts").processIncomingMessage(
    { ...demoBusiness, id: "a" }, { from: phone, id: "wamid.failed-automation", type: "text", text: { body: "Hi" } },
  );
  assert.notEqual(recovered.skipped, "automation_handled");
  assert.equal(runs(failed)[0].status, "failed");
  assert.equal(runs(failed)[0].terminal, false);
  assert.equal(failed.sends.length, 1, "a failed automation send permits the normal reply");
  h = setup();
  engine = h.load("lib/automations/automation-engine.ts");
  await active(h, input("keyword.matched", [{ type: "payment_link" }]));
  await engine.runAutomationEvent(event());
  assert.equal(h.sends.length, 0, "payment link blocked without payment/order");
  assert.equal(runs(h)[0].status, "failed");
  h = setup();
  engine = h.load("lib/automations/automation-engine.ts");
  await active(
    h,
    input("keyword.matched", [
      { type: "handoff" },
      { type: "text", text: "Must not send" },
    ]),
  );
  await engine.runAutomationEvent(event());
  assert.equal(h.sends.length, 0);
  assert.equal(h.read("conversations/chat").status, "handed_off");
  h = setup();
  engine = h.load("lib/automations/automation-engine.ts");
  await active(
    h,
    input("keyword.matched", [
      { type: "delay", minutes: 1 },
      { type: "text", text: "After waiting" },
    ]),
  );
  await engine.runAutomationEvent(event());
  const [runPath, run] = [...h.documents].find(([p]) =>
    p.startsWith("automation_runs/"),
  );
  assert.equal(run.status, "waiting");
  assert.equal(h.sends.length, 0);
  h.seed(runPath, { ...run, resumeAt: h.Timestamp.fromMillis(Date.now() - 1) });
  await Promise.all([
    engine.resumeAutomationRun(runPath.split("/")[1]),
    engine.resumeAutomationRun(runPath.split("/")[1]),
  ]);
  assert.equal(h.sends.length, 1);
  assert.equal(h.read(runPath).status, "completed");
  h = setup();
  const templates = h.load("lib/automations/templates.ts").starterTemplates;
  assert.equal(Object.keys(templates).length, 10);
  const s = h.load("lib/automations/service.ts");
  for (const [key, t] of Object.entries(templates)) {
    const v = structuredClone(t);
    if (key === "appointment")
      v.trigger.at = new Date(Date.now() + 3600000).toISOString();
    const id = await s.saveAutomation("a", undefined, v);
    assert.equal(h.read(`automations/${id}`).status, "draft");
  }
  const first = (await s.automationDashboard("a")).automations[0];
  const copy = await s.changeAutomation("a", first.id, "duplicate");
  assert.equal(h.read(`automations/${copy}`).status, "draft");
  assert.notEqual(copy, first.id);
  await s.changeAutomation("a", copy, "delete");
  assert.equal(h.read(`automations/${copy}`), undefined);
  // Domain services emit normalized queued events, worker executes them outside domain transactions.
  h = setup();
  h.seed(`conversations/${customerId}`, h.read("conversations/chat"));
  await active(h, input("order.created"));
  const order = await h
    .load("lib/messaging/services/order-service.ts")
    .createDraftOrder({
      businessId: "a",
      customerPhone: phone,
      vertical: "eats",
    });
  assert.equal(
    [...h.documents].filter(([p]) => p.startsWith("automation_events/")).length,
    1,
  );
  await h.load("lib/automations/worker.ts").processAutomationWork("a");
  assert.equal(h.sends.length, 1);
  assert.equal(h.read(`orders/${order.id}`).status, "draft");
  // Scheduled trigger fires once per recipient/time; worker requires a private server credential.
  h = setup();
  const scheduled = await active(h, {
    ...input("schedule.triggered"),
    trigger: {
      type: "schedule.triggered",
      at: new Date(Date.now() + 60000).toISOString(),
    },
  });
  h.seed(`automations/${scheduled}`, {
    ...h.read(`automations/${scheduled}`),
    trigger: {
      type: "schedule.triggered",
      at: new Date(Date.now() - 60000).toISOString(),
    },
  });
  await h.load("lib/automations/worker.ts").processAutomationWork("a");
  await h.load("lib/automations/worker.ts").processAutomationWork("a");
  assert.equal(h.sends.length, 1);
  const api = h.load("app/api/internal/automations/tick/route.ts");
  const previous = process.env.AUTOMATION_WORKER_SECRET;
  process.env.AUTOMATION_WORKER_SECRET = "x".repeat(40);
  try {
    assert.equal(
      (
        await api.POST(
          new NextRequest(
            "https://console.test/api/internal/automations/tick",
            { method: "POST", body: JSON.stringify({ businessId: "a" }) },
          ),
        )
      ).status,
      401,
    );
  } finally {
    if (previous === undefined) delete process.env.AUTOMATION_WORKER_SECRET;
    else process.env.AUTOMATION_WORKER_SECRET = previous;
  }
  // Real inbound orchestration preserves the identity gate and existing typed fallback.
  h = setup();
  await active(h, input());
  const inbound = h.load("lib/messaging/services/incoming-message-service.ts");
  const response = await inbound.processIncomingMessage(
    { ...demoBusiness, id: "a" },
    { from: phone, id: "wamid.automation", type: "text", text: { body: "Hi" } },
  );
  assert.equal(response.skipped, "automation_handled");
  assert.equal(h.sends.length, 1);
  await inbound.processIncomingMessage(
    { ...demoBusiness, id: "a" },
    { from: phone, id: "wamid.automation", type: "text", text: { body: "Hi" } },
  );
  assert.equal(h.sends.length, 1);
  const unlinked = await inbound.processIncomingMessage(
    { ...demoBusiness, id: "a" },
    {
      from: "918888888888",
      id: "wamid.unlinked",
      type: "text",
      text: { body: "Hi" },
    },
  );
  assert.equal(unlinked.skipped, "account_link_required");
  assert.equal(runs(h).length, 1);
  // Conversation-start events are committed only on creation, never on later messages/resets.
  h = setup();
  await active(h, input("conversation.started"));
  const conversations = h.load(
    "lib/messaging/services/conversation-service.ts",
  );
  await conversations.getOrCreateConversation({
    businessId: "a",
    customerPhone: phone,
    vertical: "eats",
  });
  await conversations.getOrCreateConversation({
    businessId: "a",
    customerPhone: phone,
    vertical: "eats",
  });
  assert.equal(
    [...h.documents].filter(
      ([p, v]) =>
        p.startsWith("automation_events/") && v.type === "conversation.started",
    ).length,
    1,
  );
  await h.load("lib/automations/worker.ts").processAutomationWork("a");
  assert.equal(h.sends.length, 1);
  // A legitimate repeated status transition gets a distinct transactional event revision.
  h = setup();
  h.seed(`conversations/${customerId}`, h.read("conversations/chat"));
  await active(h, input("order.status.changed"));
  const orders = h.load("lib/messaging/services/order-service.ts");
  const draft = await orders.createDraftOrder({
    businessId: "a",
    customerPhone: phone,
    vertical: "eats",
  });
  await orders.setOrderStatus({ orderId: draft.id, status: "confirmed" });
  await orders.setOrderStatus({ orderId: draft.id, status: "preparing" });
  await orders.setOrderStatus({ orderId: draft.id, status: "confirmed" });
  const statusEvents = [...h.documents].filter(
    ([p, v]) =>
      p.startsWith("automation_events/") && v.type === "order.status.changed",
  );
  assert.equal(statusEvents.length, 3);
  assert.equal(h.read(`orders/${draft.id}`).automationRevision, 3);
  // No-reply reminders run once and cannot recursively follow up their own outgoing message.
  h = setup();
  await active(h, {
    ...input("conversation.no_reply"),
    trigger: { type: "conversation.no_reply", hours: 1 },
  });
  h.seed("messages/incoming", {
    businessId: "a",
    customerPhone: phone,
    direction: "incoming",
    createdAt: h.Timestamp.fromMillis(Date.now() - 10800000),
  });
  h.seed("messages/outgoing", {
    businessId: "a",
    customerPhone: phone,
    direction: "outgoing",
    source: "operator",
    createdAt: h.Timestamp.fromMillis(Date.now() - 7200000),
  });
  await h.load("lib/automations/worker.ts").processAutomationWork("a");
  await h.load("lib/automations/worker.ts").processAutomationWork("a");
  assert.equal(h.sends.length, 1);
  // A valid payment link must belong to the same customer/order/payment with matching amount.
  h = setup();
  engine = h.load("lib/automations/automation-engine.ts");
  h.seed("conversations/chat", {
    ...h.read("conversations/chat"),
    context: { orderId: "pay-order" },
  });
  h.seed("orders/pay-order", {
    businessId: "a",
    customerPhone: phone,
    status: "awaiting_payment",
    paymentId: "pay1",
    total: 200,
  });
  h.seed("payments/pay1", {
    businessId: "a",
    customerPhone: phone,
    status: "pending",
    amount: 200,
    currency: "INR",
    referenceType: "order",
    referenceId: "pay-order",
    paymentUrl: "https://rzp.io/i/test-payment",
  });
  await active(h, input("keyword.matched", [{ type: "payment_link" }]));
  await engine.runAutomationEvent(event());
  assert.equal(h.sends.length, 1);
  assert.equal(h.sends[0].reply.type, "cta_url");
  // Templates may send outside the session window; template parameters and owner remain checked.
  h = setup();
  engine = h.load("lib/automations/automation-engine.ts");
  h.seed("messages/incoming", {
    businessId: "a",
    customerPhone: phone,
    direction: "incoming",
    createdAt: h.Timestamp.fromMillis(Date.now() - 172800000),
  });
  h.seed("templates/approved", {
    businessId: "a",
    name: "welcome_customer",
    language: "en",
    status: "approved",
    body: "Hello {{1}}",
  });
  await active(
    h,
    input("keyword.matched", [
      { type: "template", templateId: "approved", parameters: ["Customer"] },
    ]),
  );
  const oldFetch = global.fetch,
    oldToken = process.env.META_ACCESS_TOKEN;
  let sentTemplate;
  process.env.META_ACCESS_TOKEN = "template-secret-test";
  global.fetch = async (_url, options) => {
    sentTemplate = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({ messages: [{ id: "wamid.template.automation" }] }),
    };
  };
  try {
    await engine.runAutomationEvent(event());
    assert.equal(sentTemplate.template.name, "welcome_customer");
    assert.equal(runs(h)[0].status, "completed");
  } finally {
    global.fetch = oldFetch;
    if (oldToken === undefined) delete process.env.META_ACCESS_TOKEN;
    else process.env.META_ACCESS_TOKEN = oldToken;
  }
  assert.ok(!JSON.stringify(runs(h)).includes("template-secret-test"));
  console.log(
    "PASS: automation builder model, 10 editable templates, keyword/order/booking triggers, AND conditions, ordered actions, concurrent deduplication, handoff, isolation, pause/resume, safe failure logging, payment safety, durable delay, scheduled worker and authenticated worker boundary.",
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
