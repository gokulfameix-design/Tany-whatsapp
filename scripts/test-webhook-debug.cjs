/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const {
  signedWebhookHeaders,
  createHarness,
  dummyPayload,
  demoBusiness,
} = require("./messaging-test-helpers.cjs");

async function main() {
  const h = createHarness();
  h.seed("businesses/demo-eats", demoBusiness);
  const request = (payload) => ({
    text: async () => JSON.stringify(payload),
    headers: new Headers(signedWebhookHeaders(payload)),
  });
  const { POST } = h.load("app/api/whatsapp/webhook/route.ts");
  const { safeWhatsAppError } = h.load("lib/messaging/debug-log.ts");
  const previousSecret = process.env.META_ACCESS_TOKEN;
  process.env.META_ACCESS_TOKEN = "debug-secret-sentinel";
  const logs = [];
  const originalInfo = console.info;
  const originalError = console.error;
  console.info = (...args) => logs.push(args);
  console.error = (...args) => logs.push(args);
  try {
    const payload = dummyPayload("wamid.debug-success");
    payload.privateRawField = "raw-payload-sentinel";
    const value = payload.entry[0].changes[0].value;
    payload.entry[0].changes[0].field = "messages";
    value.messages[0].text.body =
      "hello person@example.com debug-secret-sentinel";
    let response = await POST(request(payload));
    assert.equal(response.status, 200);
    assert.equal(h.sends.length, 1);
    for (const marker of [
      "WA_WEBHOOK_RECEIVED",
      "WA_BUSINESS_FOUND",
      "WA_IDENTITY_CHECK_START",
      "WA_IDENTITY_CHECK_DONE",
      "WA_AUTOMATION_CHECK_START",
      "WA_AUTOMATION_CHECK_DONE",
      "WA_ROUTER_START",
      "WA_ROUTER_DONE",
      "WA_CATALOG_CHECK_START",
      "WA_CATALOG_CHECK_DONE",
      "WA_REPLY_READY",
      "WA_ROUTED",
      "WA_SEND_SUCCESS",
    ])
      assert.ok(
        logs.some((entry) => entry[0] === `[${marker}]`),
        marker,
      );
    const foundIndex = logs.findIndex(
      (entry) => entry[0] === "[WA_BUSINESS_FOUND]",
    );
    for (const marker of [
      "[WA_IDENTITY_CHECK_START]",
      "[WA_AUTOMATION_CHECK_START]",
      "[WA_ROUTER_START]",
      "[WA_CATALOG_CHECK_START]",
      "[WA_REPLY_READY]",
    ])
      assert.ok(logs.findIndex((entry) => entry[0] === marker) > foundIndex);
    assert.ok(
      logs.findIndex((entry) => entry[0] === "[WA_REPLY_READY]") <
        logs.findIndex((entry) => entry[0] === "[WA_SEND_SUCCESS]"),
    );
    assert.ok(
      logs.some(
        (entry) =>
          entry[0] === "[WA_NULL_RESULT]" &&
          entry[1].step === "getPreparedMessageResult" &&
          entry[1].result === "null",
      ),
    );
    const received = logs.find(
      (entry) => entry[0] === "[WA_WEBHOOK_RECEIVED]",
    )[1];
    assert.equal(received.eventType, "messages");
    assert.equal(received.from, "919999999999");
    assert.equal(received.phoneNumberId, "TEST_PHONE_NUMBER_ID");
    const serialized = JSON.stringify(logs);
    for (const forbidden of [
      "raw-payload-sentinel",
      "debug-secret-sentinel",
      "person@example.com",
    ])
      assert.ok(!serialized.includes(forbidden), forbidden);
    assert.ok(serialized.includes("[EMAIL REDACTED]"));
    logs.length = 0;
    await POST(request(payload));
    assert.ok(!logs.some((entry) => entry[0] === "[WA_SEND_SUCCESS]"));
    assert.equal(h.sends.length, 1);
    assert.ok(
      logs.some(
        (entry) =>
          entry[0] === "[WA_EARLY_RETURN]" &&
          entry[1].reason === "duplicate_message",
      ),
    );
    assert.ok(
      logs.some(
        (entry) =>
          entry[0] === "[WA_NULL_RESULT]" &&
          entry[1].step === "claimIncomingMessage",
      ),
    );
    logs.length = 0;
    h.failNextSend();
    response = await POST(request(dummyPayload("wamid.debug-failed")));
    assert.equal(response.status, 500);
    assert.ok(logs.some((entry) => entry[0] === "[WA_SEND_FAILED]"));
    assert.ok(logs.some((entry) => entry[0] === "[WA_WEBHOOK_ERROR]"));
    assert.ok(!logs.some((entry) => entry[0] === "[WA_SEND_SUCCESS]"));
    logs.length = 0;
    const missing = dummyPayload("wamid.debug-missing");
    missing.entry[0].changes[0].value.metadata.phone_number_id = "UNKNOWN";
    await POST(request(missing));
    assert.ok(logs.some((entry) => entry[0] === "[WA_BUSINESS_NOT_FOUND]"));
    assert.ok(
      !safeWhatsAppError(
        new Error(
          "Bearer token-value debug-secret-sentinel person@example.com",
        ),
      ).includes("token-value"),
    );
    const incoming = h.load(
      "lib/messaging/services/incoming-message-service.ts",
    );
    const result = await incoming.processIncomingMessage(
      { id: "demo-eats", ...demoBusiness },
      dummyPayload("wamid.observer-failure").entry[0].changes[0].value
        .messages[0],
      {
        trace: () => {
          throw new Error("Trace logger failure");
        },
        routed: () => {
          throw new Error("Logger failure");
        },
        sendSuccess: () => {
          throw new Error("Logger failure");
        },
      },
    );
    assert.equal(result.success, true);
    assert.equal(h.sends.length, 2);

    const { debugCall } = h.load("lib/messaging/orchestration-debug.ts");
    const trace = (marker, details) => logs.push([marker, details]);
    logs.length = 0;
    assert.equal(
      await debugCall("nullable-function", async () => null, trace, "catalog"),
      null,
    );
    assert.equal(
      await debugCall("void-function", async () => undefined, trace),
      undefined,
    );
    for (const [step, value] of [
      ["false-function", false],
      ["zero-function", 0],
      ["empty-text-function", ""],
    ])
      assert.equal(await debugCall(step, async () => value, trace), value);
    assert.deepEqual(
      logs
        .filter((entry) => entry[0] === "[WA_NULL_RESULT]")
        .map((entry) => entry[1]),
      [
        { step: "nullable-function", result: "null" },
        { step: "void-function", result: "undefined" },
      ],
    );
    const failure = new Error("debug-secret-sentinel raw-payload-sentinel");
    await assert.rejects(
      () =>
        debugCall(
          "router.throw",
          async () => {
            throw failure;
          },
          trace,
          "router",
        ),
      (e) => e === failure,
    );
    assert.ok(
      logs.some(
        (entry) =>
          entry[0] === "[WA_ROUTER_DONE]" && entry[1].outcome === "error",
      ),
    );
    assert.ok(!JSON.stringify(logs).includes("debug-secret-sentinel"));
    assert.ok(!JSON.stringify(logs).includes("raw-payload-sentinel"));
    const preservedValue = { unchanged: true };
    assert.equal(
      await debugCall(
        "logger-throw",
        async () => preservedValue,
        () => {
          throw new Error("logger");
        },
        "identity",
      ),
      preservedValue,
    );

    const checkEarly = async (harness, reason, payloadId) => {
      logs.length = 0;
      const endpoint = harness.load("app/api/whatsapp/webhook/route.ts");
      const response = await endpoint.POST(request(dummyPayload(payloadId)));
      assert.equal(response.status, 200);
      assert.equal((await response.json()).skipped, reason);
      assert.ok(
        logs.some(
          (entry) =>
            entry[0] === "[WA_EARLY_RETURN]" && entry[1].reason === reason,
        ),
      );
      assert.ok(!logs.some((entry) => entry[0] === "[WA_ROUTER_START]"));
    };
    const gated = createHarness({ entitledBusinesses: false });
    gated.seed("businesses/demo-eats", demoBusiness);
    await checkEarly(gated, "subscription_required", "wamid.debug-entitlement");
    const inactive = createHarness();
    inactive.seed("businesses/demo-eats", demoBusiness);
    inactive.seed("whatsapp_accounts/demo-eats", {
      businessId: "demo-eats",
      status: "pending",
    });
    await checkEarly(
      inactive,
      "whatsapp_setup_inactive",
      "wamid.debug-inactive",
    );
    const handoff = createHarness();
    handoff.seed("businesses/demo-eats", demoBusiness);
    handoff.seed("conversations/demo-eats_919999999999", {
      businessId: "demo-eats",
      customerPhone: "919999999999",
      vertical: "eats",
      state: "eats_start",
      status: "handed_off",
      context: {},
    });
    await checkEarly(handoff, "human_handoff", "wamid.debug-handoff");
    const unlinked = createHarness({ linkedIdentity: false });
    unlinked.seed("businesses/demo-eats", demoBusiness);
    await checkEarly(unlinked, "account_link_required", "wamid.debug-unlinked");
    assert.ok(
      logs.some(
        (entry) =>
          entry[0] === "[WA_NULL_RESULT]" &&
          entry[1].step === "resolveWhatsAppIdentity",
      ),
    );
    assert.ok(
      logs.some(
        (entry) =>
          entry[0] === "[WA_REPLY_READY]" && entry[1].step === "linkingReply",
      ),
    );
    const linkToken = unlinked.sends[0].reply.url.split("token=")[1];
    assert.ok(!JSON.stringify(logs).includes(linkToken));
    const automated = createHarness();
    automated.seed("businesses/demo-eats", demoBusiness);
    automated.seed("automations/debug-handoff", {
      businessId: "demo-eats",
      name: "Debug handoff",
      description: "",
      status: "active",
      trigger: { type: "customer.message.received" },
      conditions: [],
      actions: [{ type: "handoff" }],
    });
    await checkEarly(automated, "automation_handled", "wamid.debug-automation");
    assert.ok(
      logs.some(
        (entry) =>
          entry[0] === "[WA_AUTOMATION_CHECK_DONE]" &&
          entry[1].step === "runAutomationEvent",
      ),
    );
  } finally {
    console.info = originalInfo;
    console.error = originalError;
    if (previousSecret === undefined) delete process.env.META_ACCESS_TOKEN;
    else process.env.META_ACCESS_TOKEN = previousSecret;
  }
  console.log(
    "PASS: orchestration stage markers/order, explicit early returns, null/undefined step names, safe metadata only, secret/email/raw-payload/link-token exclusion, duplicate suppression and unchanged values/errors/processing on logger failure.",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
