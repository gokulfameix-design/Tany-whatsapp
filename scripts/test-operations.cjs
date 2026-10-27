/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createHarness } = require("./messaging-test-helpers.cjs");

async function main() {
  const h = createHarness({ seedFixtures: false });
  const service = h.load("lib/admin/operations-service.ts");
  const { signIntegrationAccess, verifyIntegrationAccess } = h.load(
    "lib/integration/access.ts",
  );
  const { dashboardAccess } = h.load("lib/admin/dashboard-access.ts");
  const secret = "dashboard-test-secret-".repeat(3);
  const businessScope = { kind: "business", businessId: "a" };
  const token = await signIntegrationAccess(
    secret,
    businessScope,
    Date.now(),
    "tany-dashboard-v1",
  );
  assert.equal(await dashboardAccess(secret, token, "a"), "business");
  assert.equal(await dashboardAccess(secret, token, "b"), null);
  assert.equal(await dashboardAccess(secret, token), null);
  assert.equal(await dashboardAccess(secret, token + "tampered", "a"), null);
  assert.equal(
    await verifyIntegrationAccess(secret, token, businessScope),
    false,
  );
  const directoryToken = await signIntegrationAccess(secret, {
    kind: "directory",
  });
  assert.equal(await dashboardAccess(secret, directoryToken, "a"), null);
  const adminToken = await signIntegrationAccess(
    secret,
    { kind: "directory" },
    Date.now(),
    "tany-dashboard-v1",
  );
  assert.equal(await dashboardAccess(secret, adminToken), "admin");
  assert.equal(await dashboardAccess(secret, adminToken, "b"), "admin");
  const expired = await signIntegrationAccess(
    secret,
    businessScope,
    Date.now() - 180000,
    "tany-dashboard-v1",
  );
  assert.equal(await dashboardAccess(secret, expired, "a"), null);
  const { NextRequest } = require("next/server");
  const { proxy } = h.load("proxy.ts");
  const previousMode = process.env.NODE_ENV;
  const previousSecret = process.env.MESSAGING_SERVICE_SECRET;
  process.env.NODE_ENV = "production";
  process.env.MESSAGING_SERVICE_SECRET = secret;
  try {
    const request = (path, credential = "") => new NextRequest(`https://dashboard.test${path}`, {headers:{cookie:`__Host-tany-dashboard=${credential}`}});
    assert.equal((await proxy(request("/admin"))).status,200);
    assert.equal((await proxy(request("/business/a/inbox",token))).status,200);
    assert.equal((await proxy(request("/business/b/inbox",token))).status,200);
    assert.equal((await proxy(request("/admin",token))).status,200);
    assert.equal((await proxy(request("/admin",directoryToken))).status,200);
    assert.equal((await proxy(request("/admin",adminToken))).status,200);
    assert.equal((await proxy(request("/business/b/inbox",adminToken))).headers.get("cache-control"),"private, no-store");
  } finally {
    if (previousMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousMode;
    if (previousSecret === undefined) delete process.env.MESSAGING_SERVICE_SECRET; else process.env.MESSAGING_SERVICE_SECRET = previousSecret;
  }
  const stamp = h.Timestamp.fromMillis(Date.now());
  for (const id of ["a", "b"]) {
    h.seed(`businesses/${id}`, {
      name: `Business ${id}`,
      vertical: "eats",
      active: true,
      whatsappPhoneNumberId: id === "a" ? "111111" : "222222",
      accessToken: "SECRET_SENTINEL",
      settings: {
        whatsapp: {
          verifyToken: "SECRET_SENTINEL",
          appSecret: "SECRET_SENTINEL",
        },
      },
    });
    h.seed(`customers/customer-${id}`, {
      businessId: id,
      phone: "919999999999",
      name: `Customer ${id}`,
      lastInteractionAt: stamp,
      metadata: { secret: "SECRET_SENTINEL" },
    });
    h.seed(`conversations/chat-${id}`, {
      businessId: id,
      customerPhone: "919999999999",
      status: "active",
      state: "EATS_START",
      context: { secret: "SECRET_SENTINEL" },
      updatedAt: stamp,
    });
    h.seed(`messages/in-${id}`, {
      businessId: id,
      customerPhone: "919999999999",
      direction: "incoming",
      type: "text",
      text: `hello ${id}`,
      processingStatus: "processed",
      createdAt: stamp,
      processingToken: "SECRET_SENTINEL",
    });
    h.seed(`messages/out-${id}`, {
      businessId: id,
      customerPhone: "919999999999",
      direction: "outgoing",
      type: "text",
      text: `reply ${id}`,
      messageId: `wamid.${id}`,
      deliveryStatus: "read",
      processingStatus: "processed",
      createdAt: stamp,
    });
    h.seed(`templates/template-${id}`, {
      businessId: id,
      name: `Approved ${id}`,
      status: "approved",
      language: "en",
      category: "utility",
      accessToken: "SECRET_SENTINEL",
    });
  }
  h.seed("businesses/disabled", {
    name: "Disabled",
    vertical: "eats",
    active: false,
    whatsappPhoneNumberId: "333333",
    settings: {},
  });
  h.seed("businesses/unconfigured", {
    name: "Not WhatsApp enabled",
    vertical: "eats",
    active: true,
    whatsappPhoneNumberId: "TEST_PHONE_NUMBER_ID",
    settings: {},
  });
  h.seed("messages/fail-a", {
    businessId: "a",
    direction: "incoming",
    customerPhone: "919999999999",
    processingStatus: "failed",
    error: "SECRET_SENTINEL",
    createdAt: stamp,
  });
  h.seed("messages/no-tenant", {
    direction: "incoming",
    text: "SECRET_SENTINEL",
  });
  const a = await service.getOperationsData("a");
  assert.equal(a.messages.length, 3);
  assert.ok(a.messages.every((m) => m.businessId === "a"));
  assert.equal(a.contacts.length, 1);
  assert.equal(a.contacts[0].name, "Customer a");
  assert.equal(a.contacts[0].total, 3);
  assert.equal(a.conversations[0].lastMessage, "reply a");
  assert.equal(a.messages.find((m) => m.id === "out-a").status, "read");
  assert.equal(a.health.incoming, 2);
  assert.equal(a.health.failed, 1);
  assert.equal(a.health.latency, null);
  assert.equal(a.health.duplicates, null);
  assert.match(a.health.verification, /Unknown/);
  assert.ok(!JSON.stringify(a).includes("SECRET_SENTINEL"));
  assert.ok(!JSON.stringify(a).includes("222222"));
  assert.ok(
    h.filters
      .filter((f) =>
        [
          "messages",
          "customers",
          "conversations",
          "templates",
          "campaigns",
        ].includes(f.collection),
      )
      .every((f) => f.args[0] === "businessId" && f.args[2] === "a"),
  );
  const b = await service.getOperationsData("b");
  assert.equal(b.contacts[0].name, "Customer b");
  assert.equal(b.messages.length, 2);
  const all = await service.getOperationsData();
  assert.deepEqual(Array.from(all.accounts, (a) => a.businessId).sort(), [
    "a",
    "b",
    "disabled",
    "unconfigured",
  ]);
  assert.equal(h.writes.length, 0);
  await assert.rejects(service.getOperationsData("../b"));
  await assert.rejects(service.setConversationHandoff("a", "chat-b", true));
  await service.setConversationHandoff("a", "chat-a", true);
  assert.equal(h.read("conversations/chat-a").status, "handed_off");
  assert.equal(h.read("conversations/chat-b").status, "active");
  await service.saveOperationsConfiguration("a", {
    settings: { retryAttempts: 999, accessToken: "SECRET_SENTINEL" },
    automations: { welcome: true, accessToken: true },
  });
  assert.ok(
    !JSON.stringify(h.read("businesses/a/whatsappOperations/config")).includes(
      "SECRET_SENTINEL",
    ),
  );
  assert.equal(
    h.read("businesses/a/whatsappOperations/config").settings.retryAttempts,
    5,
  );
  await assert.rejects(
    service.createCampaignDraft("a", {
      name: "Cross-tenant",
      template: "template-b",
      audience: "Customers",
    }),
  );
  await service.createCampaignDraft("a", {
    name: "Safe draft",
    template: "template-a",
    audience: "Opted-in customers",
  });
  const campaign = h.writes.find((w) => w.path.startsWith("campaigns/"));
  assert.equal(campaign.data.status, "draft");
  assert.equal(campaign.data.businessId, "a");
  assert.equal(h.sends.length, 0);
  const shell = fs.readFileSync("app/admin/components/admin-shell.tsx", "utf8");
  for (const label of [
    "Overview",
    "Inbox",
    "Contacts",
    "Templates",
    "Campaigns",
    "Automations",
    "Message Status",
    "Webhook Health",
    "WhatsApp Accounts",
    "Settings",
  ])
    assert.ok(shell.includes(`label: "${label}"`));
  for (const label of ["Catalog", "Orders", "Bookings", "New business"])
    assert.ok(!shell.includes(`label: "${label}"`));
  const switcher = fs.readFileSync(
    "app/admin/components/workspace-switcher.tsx",
    "utf8",
  );
  assert.ok(switcher.includes(".filter((profile) => profile.active)"));
  assert.ok(!switcher.includes("test(profile.whatsappPhoneNumberId)"));
  const flow = createHarness();
  const incoming = flow.load(
    "lib/messaging/services/incoming-message-service.ts",
  );
  flow.seed("conversations/demo-eats_919999999999", {
    businessId: "demo-eats",
    customerPhone: "919999999999",
    vertical: "eats",
    state: "EATS_START",
    status: "handed_off",
    context: {},
    createdAt: stamp,
    updatedAt: stamp,
  });
  const result = await incoming.processIncomingMessage(
    {
      id: "demo-eats",
      name: "Demo Eats",
      vertical: "eats",
      active: true,
      whatsappPhoneNumberId: "TEST_PHONE_NUMBER_ID",
    },
    {
      from: "919999999999",
      id: "wamid.handoff",
      type: "text",
      text: { body: "Need help" },
    },
  );
  assert.equal(result.skipped, "human_handoff");
  assert.equal(flow.sends.length, 0);
  assert.equal(
    flow.read("conversations/demo-eats_919999999999").lastIncomingText,
    "Need help",
  );
  console.log(
    "PASS: operations inbox/contact isolation, safe account projection, status/health, signed workspace authorization/audience isolation, campaign drafts, config isolation and bot pause during handoff.",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
