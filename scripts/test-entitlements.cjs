/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { NextRequest } = require("next/server");
const {
  createHarness,
  demoBusiness,
  dummyPayload,
  signedWebhookHeaders,
} = require("./messaging-test-helpers.cjs");

async function main() {
  const h = createHarness({ entitledBusinesses: false });
  for (const id of ["demo-eats", "tenant-b"])
    h.seed(`businesses/${id}`, {
      ...demoBusiness,
      whatsappPhoneNumberId:
        id === "demo-eats" ? "TEST_PHONE_NUMBER_ID" : "TENANT_B_PHONE_ID",
    });
  const e = h.load("lib/subscriptions/entitlements.ts");
  const allowed = () => e.hasEntitlement("demo-eats", "whatsappAutomation");
  assert.equal(await allowed(), false, "missing records fail closed");
  for (const plan of ["basic", "standard", "pro"]) {
    await e.assignDemoSubscription("demo-eats", plan);
    assert.equal(await allowed(), plan === "pro");
    assert.equal(h.read("subscriptions/demo-eats").businessId, "demo-eats");
    for (const feature of ["campaigns", "advancedAnalytics", "aiAssistant"])
      assert.equal(await e.hasEntitlement("demo-eats", feature), false);
  }
  for (const status of ["cancelled", "expired", "trialing", "past_due"]) {
    await e.assignDemoSubscription("demo-eats", "pro", status);
    assert.equal(await allowed(), false, status);
  }
  await e.assignDemoSubscription("demo-eats", "pro");
  const activeSubscription = h.read("subscriptions/demo-eats");
  h.seed("subscriptions/demo-eats", {
    ...activeSubscription,
    expiresAt: h.Timestamp.fromMillis(Date.now() - 1),
  });
  assert.equal(await allowed(), false, "active label cannot bypass expiry");
  h.seed("subscriptions/demo-eats", {
    ...activeSubscription,
    startedAt: h.Timestamp.fromMillis(Date.now() + 60000),
  });
  assert.equal(await allowed(), false, "future subscription");
  h.seed("subscriptions/demo-eats", { ...activeSubscription, expiresAt: null });
  assert.equal(await allowed(), false, "invalid expiry");
  await e.assignDemoSubscription("demo-eats", "basic");
  h.seed("entitlements/demo-eats", {
    businessId: "demo-eats",
    whatsappAutomation: true,
  });
  assert.equal(
    await allowed(),
    false,
    "stale or forged entitlement cannot override plan policy",
  );
  const previousSecret = process.env.MESSAGING_SERVICE_SECRET;
  process.env.MESSAGING_SERVICE_SECRET =
    "entitlement-integration-secret-".repeat(3);
  try {
    const { signIntegrationAccess } = h.load("lib/integration/access.ts");
    const token = await signIntegrationAccess(
      process.env.MESSAGING_SERVICE_SECRET,
      { kind: "business", businessId: "demo-eats" },
    );
    const integration = h.load(
      "app/api/integration/v1/businesses/[businessId]/[resource]/route.ts",
    );
    const context = (businessId) => ({
      params: Promise.resolve({ businessId, resource: "setup" }),
    });
    const request = (businessId, body = {}) =>
      new Request(
        `https://test/api/integration/v1/businesses/${businessId}/setup`,
        {
          method: "PATCH",
          headers: {
            authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );
    const beforeWrites = h.writes.length;
    let response = await integration.PATCH(
      request("demo-eats", { plan: "pro", whatsappAutomation: true }),
      context("demo-eats"),
    );
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, "UPGRADE_REQUIRED");
    assert.equal(h.writes.length, beforeWrites);
    const send = h.load("app/api/whatsapp/send/route.ts");
    const sendRequest = (businessId) =>
      new NextRequest("https://test/api/whatsapp/send", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          businessId,
          to: "919999999999",
          message: "hello",
          plan: "pro",
        }),
      });
    assert.equal((await send.POST(sendRequest("demo-eats"))).status, 403);
    assert.equal(h.sends.length, 0);
    const identity = h.load("lib/messaging/services/identity-service.ts");
    await assert.rejects(
      identity.createOrReuseLinkSession("919888888888", "demo-eats"),
      e.EntitlementError,
    );
    const operations = h.load("lib/admin/operations-service.ts");
    await assert.rejects(
      operations.saveOperationsConfiguration("demo-eats", {}),
      e.EntitlementError,
    );
    const webhook = h.load("app/api/whatsapp/webhook/route.ts");
    const payload = dummyPayload("wamid.entitlement-denied");
    const webhookRequest = () =>
      new NextRequest("https://test/api/whatsapp/webhook", {
        method: "POST",
        headers: signedWebhookHeaders(payload),
        body: JSON.stringify(payload),
      });
    response = await webhook.POST(webhookRequest());
    assert.equal((await response.json()).code, "UPGRADE_REQUIRED");
    assert.equal(h.sends.length, 0);
    await e.assignDemoSubscription("demo-eats", "pro");
    assert.equal(await allowed(), true);
    assert.equal(
      await e.hasEntitlement("tenant-b", "whatsappAutomation"),
      false,
    );
    assert.equal(
      (await integration.PATCH(request("tenant-b"), context("tenant-b")))
        .status,
      401,
    );
    assert.equal((await send.POST(sendRequest("tenant-b"))).status, 401);
    response = await webhook.POST(webhookRequest());
    assert.equal(response.status, 200);
    assert.equal((await response.json()).success, true);
    assert.equal(
      h.sends.length,
      1,
      "entitled business keeps existing click-first flow",
    );
    assert.equal(h.sends[0].reply.type, "list");
    h.seed("entitlements/demo-eats", {
      businessId: "tenant-b",
      whatsappAutomation: true,
    });
    assert.equal(
      await allowed(),
      false,
      "cross-tenant record cannot grant access",
    );
  } finally {
    if (previousSecret === undefined)
      delete process.env.MESSAGING_SERVICE_SECRET;
    else process.env.MESSAGING_SERVICE_SECRET = previousSecret;
  }
  console.log(
    "PASS: central plan/status/time policy, fail-closed entitlements, protected APIs/linking/activation, spoof prevention, tenant isolation and entitled webhook flow.",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
