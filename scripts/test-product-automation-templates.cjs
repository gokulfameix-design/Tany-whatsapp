/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createHarness, demoBusiness } = require("./messaging-test-helpers.cjs");
const verticals = [
  "motos",
  "eats",
  "cabs",
  "ecom",
  "expert",
  "gaming",
  "garage",
  "meat",
  "meds",
  "retail",
  "salon",
  "sport",
];
const common = [
  "Welcome",
  "Business Closed",
  "No Reply Follow-up",
  "Payment Reminder",
  "Feedback",
  "Human Handoff",
];
async function main() {
  const h = createHarness({ seedFixtures: false });
  const catalogue = h.load("lib/automations/product-templates.ts");
  const { templateToAutomationInput } = h.load("app/admin/components/automations/template-draft.ts");
  const { eatsTemplateCards, eatsFilters } = h.load("app/admin/components/automations/eats-template-presentation.ts");
  const eats = catalogue.templatesForVertical("eats");
  const originalEats = JSON.stringify(eats);
  assert.deepEqual(eatsFilters, ["Recommended", "Orders", "Payments", "Support", "All"]);
  const cards = eatsTemplateCards(eats, "All");
  assert.equal(cards.length, 10);
  assert.equal(cards.filter(c => c.display.name === "Welcome Customer").length, 1);
  assert.ok(!cards.some(c => c.template.id === "eats_welcome"));
  assert.deepEqual(eatsTemplateCards(eats, "Recommended").map(c => c.display.name), ["Welcome Customer", "Confirm Order", "Payment Reminder"]);
  for (const category of ["Orders", "Payments", "Support"])
    assert.ok(eatsTemplateCards(eats, category).every(c => c.display.category === category));
  for (const card of cards) {
    assert.equal(card.template, eats.find(t => t.id === card.template.id));
    assert.ok(card.display.when && card.display.does);
  }
  assert.equal(JSON.stringify(eats), originalEats);
  assert.ok(catalogue.cloneProductTemplate("eats", "eats_welcome"));
  const localTemplate = eats.find(t => t.id === "eats_welcome_product");
  const localDraft = templateToAutomationInput(localTemplate);
  assert.deepEqual(localDraft, {
    name: localTemplate.name,
    description: localTemplate.description,
    trigger: localTemplate.trigger,
    conditions: localTemplate.conditions,
    actions: localTemplate.actions,
  });
  localDraft.actions[0].text = "Changed locally";
  assert.notEqual(localTemplate.actions[0].text, "Changed locally");
  const builderSource = fs.readFileSync(
    "app/admin/components/automations/automation-builder.tsx",
    "utf8",
  );
  const localSelection = builderSource.slice(
    builderSource.indexOf("const useTemplate"),
    builderSource.indexOf("const gallery"),
  );
  assert.ok(localSelection.includes("templateToAutomationInput(template)"));
  assert.equal(localSelection.includes("createAutomationFromTemplateAction"), false);
  assert.equal(localSelection.includes("router.refresh"), false);
  const { previewMessages, previewText } = h.load("app/admin/components/automations/preview-messages.ts");
  const welcome = eats.find(t => t.id === "eats_welcome_product");
  const welcomePreview = previewMessages(welcome.actions, "Demo Restaurant");
  assert.equal(welcomePreview[0].kind, "buttons");
  assert.ok(welcomePreview[0].text.includes("Demo Restaurant"));
  assert.deepEqual(welcomePreview[0].choices, ["Start Order", "My Orders", "Help"]);
  const edited = structuredClone(welcome.actions);
  edited[0].text = "Hello from {{business_name}}";
  edited[0].choices[0] = "Choose food";
  assert.equal(previewMessages(edited, "My Cafe")[0].text, "Hello from My Cafe");
  assert.equal(previewMessages(edited, "My Cafe")[0].choices[0], "Choose food");
  assert.equal(previewMessages([{type:"list",text:"Menu",choices:["Food"]}], "Cafe")[0].kind, "list");
  assert.equal(previewMessages([{type:"location",text:"Where?"}], "Cafe")[0].kind, "location");
  assert.deepEqual(previewMessages([{type:"handoff"},{type:"tag",value:"x"},{type:"delay",minutes:2}], "Cafe"), []);
  assert.equal(previewMessages([{type:"payment_link"}], "Cafe")[0].kind, "url");
  assert.equal(previewMessages([{type:"template",templateId:"approved",parameters:["Alex"]}], "Cafe", [{id:"approved",body:"Hi {{1}} from {{business_name}}"}])[0].text, "Hi Alex from Cafe");
  assert.equal(previewText("Order {{order_id}} {{unknown}}", "Cafe"), "Order #1024 {{unknown}}");
  const simulator = h.load("app/admin/components/automations/chat-simulator.ts");
  assert.equal(simulator.previewScenarioKey("eats_welcome_product"), "welcome");
  assert.equal(simulator.previewScenarioKey("eats_payment"), "payment");
  const welcomeChat = simulator.initialChat("welcome", "Demo Restaurant", [], true);
  assert.equal(welcomeChat[0].from, "customer");
  assert.deepEqual(welcomeChat[1].actions.map((a) => a.label), ["Start Order", "My Orders", "Help"]);
  const menuChat = simulator.continueChat(welcomeChat[1].actions[0]);
  assert.equal(menuChat[0].text, "Start Order");
  assert.equal(menuChat[1].kind, "menu");
  assert.deepEqual(menuChat[1].actions.map((a) => a.label), ["Chicken Biriyani", "Mutton Biriyani", "Dosa", "Idli"]);
  assert.equal(simulator.continueChat({ id: "pay-now", label: "Pay Now" })[1].text.includes("No payment is made"), true);
  assert.deepEqual(simulator.continueChat({ id: "talk-staff", label: "Talk to Staff" }).map((entry) => entry.text), ["Talk to Staff", "A team member will continue this conversation.", "Automated replies are paused."]);
  assert.equal(simulator.continueChat({ id: "more-items", label: "More Items" })[1].kind, "menu");
  for (const file of [
    "app/admin/components/automations/chat-simulator.ts",
    "app/admin/components/automations/whatsapp-preview.tsx",
  ]) {
    const source = fs.readFileSync(file, "utf8").toLowerCase();
    for (const prohibited of ["firestore", "firebase", "router.push", "useRouter", "fetch(", "api/", "next/link"])
      assert.equal(source.includes(prohibited), false, `${file} must remain local-only: ${prohibited}`);
  }
  const previewSource = fs.readFileSync("app/admin/components/automations/whatsapp-preview.tsx", "utf8");
  assert.ok(previewSource.includes("event.preventDefault()"));
  assert.ok(previewSource.includes("event.stopPropagation()"));
  assert.equal(JSON.stringify(eats), originalEats);
  const model = h.load("lib/automations/model.ts");
  const service = h.load("lib/automations/service.ts");
  const snapshots = Object.fromEntries(
    verticals.map((v) => [
      v,
      JSON.stringify(catalogue.templatesForVertical(v)),
    ]),
  );
  const allIds = new Set();
  let count = 0;
  for (const vertical of verticals) {
    const businessId = `templates-${vertical}`;
    h.seed(`businesses/${businessId}`, {
      ...demoBusiness,
      name: `Test ${vertical}`,
      vertical,
    });
    const templates = catalogue.templatesForVertical(vertical);
    assert.ok(templates.length >= 10);
    assert.ok(templates.some((t) => t.recommended));
    for (const name of common)
      assert.ok(
        templates.some((t) => t.name === name),
        `${vertical}: ${name}`,
      );
    for (const template of templates) {
      assert.equal(template.vertical, vertical);
      assert.ok(template.active);
      for (const field of [
        "id",
        "vertical",
        "name",
        "description",
        "category",
        "recommended",
        "trigger",
        "conditions",
        "actions",
        "active",
      ])
        assert.ok(Object.hasOwn(template, field));
      assert.ok(!allIds.has(template.id));
      allIds.add(template.id);
      const cloned = catalogue.cloneProductTemplate(vertical, template.id);
      model.validateAutomation(cloned);
      assert.equal(cloned.id, undefined);
      const created = await service.createAutomationFromTemplate(
        businessId,
        template.id,
      );
      assert.equal(h.read(`automations/${created.id}`).status, "draft");
      assert.equal(h.read(`automations/${created.id}`).businessId, businessId);
      assert.equal(
        h.read(`automations/${created.id}`).vertical,
        undefined,
        "catalogue metadata cannot override tenant identity",
      );
      await service.changeAutomation(businessId, created.id, "publish");
      assert.equal(h.read(`automations/${created.id}`).status, "active");
      count++;
    }
    const dashboard = await service.automationDashboard(businessId);
    assert.equal(dashboard.vertical, vertical);
    assert.ok(
      dashboard.automationTemplates.every((t) => t.vertical === vertical),
    );
    const source = templates.find((t) => t.id.endsWith("_welcome_product"));
    const first = await service.createAutomationFromTemplate(
      businessId,
      source.id,
    );
    const second = await service.createAutomationFromTemplate(
      businessId,
      source.id,
    );
    assert.notEqual(first.id, second.id);
    first.draft.name = "Custom customer welcome";
    first.draft.actions[0].text = "Edited greeting for {{business_name}}";
    await service.saveAutomation(businessId, first.id, first.draft);
    await service.changeAutomation(businessId, first.id, "publish");
    assert.equal(
      h.read(`automations/${first.id}`).name,
      "Custom customer welcome",
    );
    assert.equal(h.read(`automations/${second.id}`).name, source.name);
    const foreign = catalogue.templatesForVertical(
      vertical === "salon" ? "eats" : "salon",
    )[0];
    const before = h.writes.length;
    await assert.rejects(
      service.createAutomationFromTemplate(businessId, foreign.id),
    );
    assert.equal(h.writes.length, before);
    assert.equal(
      JSON.stringify(catalogue.templatesForVertical(vertical)),
      snapshots[vertical],
      "source catalogue unchanged after clone/edit/publish",
    );
    templates[0].actions[0].text = "Mutated client copy";
    templates[0].active = false;
    assert.equal(
      JSON.stringify(catalogue.templatesForVertical(vertical)),
      snapshots[vertical],
    );
  }
  assert.deepEqual(catalogue.templatesForVertical("unknown"), []);
  for (const [vertical, names] of Object.entries({
    salon: [
      "Welcome & Book",
      "Booking Confirmation",
      "Appointment Reminder",
      "Missed Appointment Follow-up",
    ],
    eats: [
      "Welcome & Start Order",
      "Order Confirmation",
      "Preparing",
      "Out for Delivery",
      "Delivered",
    ],
    motos: [
      "Welcome & Browse Cars",
      "Vehicle Enquiry",
      "Test Drive Booking",
      "Test Drive Reminder",
      "Price Enquiry",
      "Finance Enquiry",
      "Lead Follow-up",
    ],
  }))
    for (const name of names)
      assert.ok(
        catalogue.templatesForVertical(vertical).some((t) => t.name === name),
      );
  const placeholders = h.load("lib/automations/placeholders.ts");
  const values = placeholders.automationPlaceholderValues({
    business: { name: "Glow Salon", secret: "PRIVATE" },
    customer: { name: "Asha", uid: "PRIVATE_UID" },
    order: { id: "order-123", total: 250 },
    booking: { bookingDate: "2026-11-01", startTime: "10:30" },
    payment: { amount: 250 },
  });
  assert.equal(
    placeholders.renderAutomationText(
      "{{business_name}} | {{customer_name}} | {{order_id}} | {{booking_date}} | {{booking_time}} | {{amount}}",
      values,
    ),
    "Glow Salon | Asha | order-123 | 2026-11-01 | 10:30 | 250.00",
  );
  assert.equal(
    placeholders.renderAutomationText("Hi {{ customer_name }}", values),
    "Hi Asha",
  );
  assert.throws(() =>
    placeholders.renderAutomationText("{{customer_name}}", {}),
  );
  assert.throws(() => placeholders.renderAutomationText("{{uid}}", values));
  assert.ok(!JSON.stringify(values).includes("PRIVATE"));
  assert.throws(() =>
    model.validateAutomation({
      name: "Unsafe",
      description: "",
      trigger: { type: "customer.message.received" },
      conditions: [],
      actions: [{ type: "text", text: "{{META_ACCESS_TOKEN}}" }],
    }),
  );
  // Exercise the real engine and inbound orchestration, including welcome-button fallback.
  const live = createHarness({ seedFixtures: false });
  const phone = "919999999999",
    customerId = `salon_${phone}`;
  live.seed("businesses/salon", {
    ...demoBusiness,
    vertical: "salon",
    name: "Glow Salon",
  });
  live.seed(`customers/${customerId}`, {
    businessId: "salon",
    phone,
    name: "Asha",
  });
  live.seed(`whatsapp_identities/${phone}`, {
    phone,
    linked: true,
    uid: "PRIVATE_UID",
  });
  live.seed(`conversations/${customerId}`, {
    businessId: "salon",
    customerPhone: phone,
    vertical: "salon",
    status: "active",
    state: "salon_start",
    context: { bookingId: "b1", orderId: "o1" },
  });
  live.seed("bookings/b1", {
    businessId: "salon",
    customerPhone: phone,
    vertical: "salon",
    bookingDate: "2026-11-01",
    startTime: "10:30",
    status: "confirmed",
    amount: 250,
  });
  live.seed("orders/o1", {
    businessId: "salon",
    customerPhone: phone,
    status: "confirmed",
    total: 250,
  });
  live.seed("messages/incoming", {
    businessId: "salon",
    customerPhone: phone,
    direction: "incoming",
    createdAt: live.Timestamp.now(),
  });
  const svc = live.load("lib/automations/service.ts");
  const created = await svc.createAutomationFromTemplate(
    "salon",
    "salon_welcome_product",
  );
  created.draft.actions[0].text =
    "Hi {{customer_name}}, welcome to {{business_name}}. Order {{order_id}}; booking {{booking_date}} {{booking_time}}; INR {{amount}}.";
  await svc.saveAutomation("salon", created.id, created.draft);
  await svc.changeAutomation("salon", created.id, "publish");
  const inbound = live.load(
    "lib/messaging/services/incoming-message-service.ts",
  );
  await inbound.processIncomingMessage(
    { ...demoBusiness, id: "salon", vertical: "salon", name: "Glow Salon" },
    {
      from: phone,
      id: "wamid.welcome.product",
      type: "text",
      text: { body: "Hi" },
    },
  );
  assert.equal(live.sends.length, 1);
  assert.equal(
    live.sends[0].reply.body,
    "Hi Asha, welcome to Glow Salon. Order o1; booking 2026-11-01 10:30; INR 250.00.",
  );
  for (const item of require("./fixtures/business-data.json").salon.catalog)
    live.seed(`businesses/salon/catalog/${item.id}`, item);
  const button = live.sends[0].reply.buttons[0];
  assert.equal(button.title, "Book Appointment");
  const selected = await inbound.processIncomingMessage(
    { ...demoBusiness, id: "salon", vertical: "salon", name: "Glow Salon" },
    {
      from: phone,
      id: "wamid.product.button",
      type: "interactive",
      interactive: { type: "button_reply", button_reply: button },
    },
  );
  assert.notEqual(selected.skipped, "automation_handled");
  assert.ok(
    ["list", "buttons"].includes(selected.structuredReply.type),
    "product primary action presents the existing booking service choices",
  );
  assert.ok(JSON.stringify(selected.structuredReply).includes("Haircut"));
  live.seed(`customers/${customerId}`, {
    ...live.read(`customers/${customerId}`),
    name: "",
  });
  const beforeMissing = live.sends.length;
  await live
    .load("lib/automations/automation-engine.ts")
    .runAutomationEvent({
      id: "missing-name",
      type: "customer.message.received",
      businessId: "salon",
      customerId,
      conversationId: customerId,
      timestamp: new Date().toISOString(),
      payload: { text: "hello" },
      source: "customer",
    });
  assert.equal(
    live.sends.length,
    beforeMissing,
    "missing placeholder context cannot send unresolved text",
  );
  assert.ok(
    [...live.documents].some(
      ([p, v]) =>
        p.startsWith("automation_runs/") &&
        v.event?.id === "missing-name" &&
        v.status === "failed",
    ),
  );
  const gallery = fs.readFileSync(
    "app/admin/components/automations/template-gallery.tsx",
    "utf8",
  );
  for (const text of [
    "Recommended for",
    "View all templates",
    "Use Template",
    "Start from Scratch",
    "Recommended",
  ])
    assert.ok(gallery.includes(text));
  console.log(
    `PASS: ${count} product/common templates across all 12 verticals; scoped catalogue, draft cloning/editing/source immutability, publish, all six resolved placeholders, unknown/missing placeholder rejection, and welcome-button vertical fallback.`,
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
