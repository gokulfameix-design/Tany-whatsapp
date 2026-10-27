/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { createHarness } = require("./messaging-test-helpers.cjs");

async function main() {
  const h = createHarness({ seedFixtures: false });
  const dashboard = h.load("lib/admin/whatsapp-service.ts");
  const profile = {
    name: "Tenant A",
    vertical: "eats",
    active: true,
    whatsappPhoneNumberId: "111111111111",
    wabaId: "1234567890",
    connectedNumber: "+91 98765 43210",
    accessToken: "NEVER_EXPOSE_SECRET",
    settings: {
      whatsapp: {
        accessToken: "NEVER_EXPOSE_SECRET",
        verifyToken: "NEVER_EXPOSE_SECRET",
      },
    },
  };
  h.seed("businesses/tenant-a", profile);
  h.seed("businesses/tenant-b", {
    ...profile,
    name: "Tenant B",
    whatsappPhoneNumberId: "222222222222",
    wabaId: "22222222",
  });
  const time = (millis) => h.Timestamp.fromMillis(millis);
  const seed = (id, businessId, direction, processingStatus, millis) =>
    h.seed("messages/" + id, {
      businessId,
      direction,
      processingStatus,
      type: "text",
      createdAt: time(millis),
      updatedAt: time(millis + 99),
      text: "NEVER_EXPOSE_SECRET",
      error: "NEVER_EXPOSE_SECRET",
      processingToken: "NEVER_EXPOSE_SECRET",
      preparedResult: { token: "NEVER_EXPOSE_SECRET" },
    });
  seed("incoming-a", "tenant-a", "incoming", "processed", 1000);
  seed("outgoing-a", "tenant-a", "outgoing", "processed", 2000);
  seed("failed-a", "tenant-a", "incoming", "failed", 3000);
  seed("foreign-b", "tenant-b", "incoming", "processed", 999999);
  h.seed("messages/missing-tenant", {
    direction: "incoming",
    processingStatus: "processed",
    createdAt: time(9999999),
  });
  const result = await dashboard.getWhatsAppOverview("tenant-a");
  assert.deepEqual(result.counts, {
    incoming: 2,
    outgoing: 1,
    failed: 1,
    processing: 0,
  });
  assert.equal(result.phoneNumberId, profile.whatsappPhoneNumberId);
  assert.equal(result.wabaId, profile.wabaId);
  assert.equal(result.connectedNumber, profile.connectedNumber);
  assert.equal(result.lastWebhookAt, time(3000).toDate().toISOString());
  assert.equal(result.lastOutgoing.id, "outgoing-a");
  assert.equal(result.lastOutgoing.status, "processed");
  assert.ok(
    result.activity.every(
      (message) =>
        message.id !== "foreign-b" && message.id !== "missing-tenant",
    ),
  );
  assert.ok(!JSON.stringify(result).includes("NEVER_EXPOSE_SECRET"));
  assert.ok(!JSON.stringify(result).includes("22222222"));
  assert.ok(
    result.activity.every(
      (message) =>
        !("text" in message) &&
        !("error" in message) &&
        !("processingToken" in message),
    ),
  );
  const second = await dashboard.getWhatsAppOverview("tenant-b");
  assert.equal(second.activity.length, 1);
  assert.equal(second.activity[0].id, "foreign-b");
  h.seed("businesses/pending", {
    ...profile,
    whatsappPhoneNumberId: "TEST_PHONE_NUMBER_ID",
    wabaId: null,
    connectedNumber: null,
    settings: {},
  });
  const pending = await dashboard.getWhatsAppOverview("pending");
  assert.equal(pending.phoneNumberId, null);
  assert.equal(pending.wabaId, null);
  assert.equal(pending.connectedNumber, null);
  assert.equal(pending.lastWebhookAt, null);
  assert.equal(pending.lastOutgoing, null);
  assert.equal(pending.activity.length, 0);
  const test = await dashboard.prepareWhatsAppTest(
    "tenant-a",
    "+919876543210",
    " Hello ",
  );
  assert.equal(test.businessId, "tenant-a");
  assert.equal(test.phoneNumberId, "111111111111");
  assert.equal(test.to, "919876543210");
  assert.equal(test.text, "Hello");
  const sender = h.load("lib/messaging/whatsapp.ts");
  assert.equal(
    sender.buildWhatsAppPayload(test.to, test.text).text.body,
    "Hello",
  );
  assert.equal(
    (await dashboard.prepareWhatsAppTest("tenant-b", "919876543210", "Hello"))
      .phoneNumberId,
    "222222222222",
  );
  for (const recipient of ["", "bad", "123", "00000000"])
    await assert.rejects(
      dashboard.prepareWhatsAppTest("tenant-a", recipient, "Hello"),
    );
  for (const message of ["", " ", "x".repeat(1001)])
    await assert.rejects(
      dashboard.prepareWhatsAppTest("tenant-a", "919876543210", message),
    );
  await assert.rejects(dashboard.getWhatsAppOverview("../tenant-b"));
  await assert.rejects(dashboard.getWhatsAppOverview("missing"));
  await assert.rejects(
    dashboard.prepareWhatsAppTest("missing", "919876543210", "Hello"),
  );
  assert.equal(h.writes.length, 0);
  assert.equal(h.sends.length, 0);
  console.log(
    "PASS: WhatsApp dashboard tenant isolation, safe projection/no secrets, timestamps/status accuracy, missing setup, scoped test validation, reusable payload builder; zero writes or sends.",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
