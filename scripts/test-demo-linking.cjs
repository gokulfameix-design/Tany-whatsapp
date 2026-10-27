/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { NextRequest } = require("next/server");
const { createHarness, demoBusiness } = require("./messaging-test-helpers.cjs");

async function main() {
  const previous = process.env.DEMO_AUTH_MODE;
  process.env.DEMO_AUTH_MODE = "true";
  try {
    const h = createHarness({ linkedIdentity: false });
    h.seed("businesses/demo-eats", demoBusiness);
    const service = h.load("lib/messaging/services/identity-service.ts");
    const endpoint = h.load("app/api/connect/whatsapp/route.ts");
    const phone = "919123456789";
    const origin = "https://tany-messaging-185656276893.asia-south1.run.app";
    const request = (token, extra = {}, requestOrigin = origin) =>
      new NextRequest(`${origin}/api/connect/whatsapp`, {
        method: "POST",
        headers: { origin: requestOrigin, "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: "confirm", ...extra }),
      });
    h.seed(`customers/demo-eats_${phone}`, {
      name: "Existing customer",
      metadata: { keep: true },
      recentOrderId: "old-order",
    });
    const token = await service.createOrReuseLinkSession(phone, "demo-eats");
    assert.equal(
      service.linkingReply(token).url,
      `${origin}/connect/whatsapp?token=${token}`,
    );
    assert.equal(
      (await endpoint.POST(request(token, {}, "https://attacker.test"))).status,
      403,
    );
    let response = await endpoint.POST(request(token, { action: "inspect" }));
    assert.deepEqual(await response.json(), { phone: `+${phone}` });
    response = await endpoint.POST(
      request(token, {
        uid: "attacker",
        phone: "918888888888",
        businessId: "other-business",
      }),
    );
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.deepEqual(result, { ok: true, notificationSent: true });
    assert.equal(h.authChecks.length, 0);
    const identity = h.read(`whatsapp_identities/${phone}`);
    assert.equal(identity.uid, `demo_${phone}`);
    assert.equal(identity.linked, true);
    assert.ok(identity.linkedAt);
    const customer = h.read(`customers/demo-eats_${phone}`);
    assert.equal(customer.uid, `demo_${phone}`);
    assert.equal(customer.linkedToTany, true);
    assert.equal(customer.name, "Existing customer");
    assert.equal(customer.recentOrderId, "old-order");
    assert.deepEqual(customer.metadata, { keep: true });
    assert.equal(h.read(`whatsapp_link_sessions/${token}`).used, true);
    assert.equal(
      h.read(`whatsapp_link_sessions/${token}`).businessId,
      "demo-eats",
    );
    assert.equal(h.sends.length, 2);
    assert.equal(h.sends[0].reply, "✅ Your Tany account is connected.");
    assert.equal(h.sends[1].reply.type, "list");
    assert.equal(h.sends[1].to, phone);
    assert.equal((await endpoint.POST(request(token))).status, 400);
    assert.equal(h.sends.length, 2);
    const expired = await service.createOrReuseLinkSession(phone, "demo-eats");
    h.seed(`whatsapp_link_sessions/${expired}`, {
      ...h.read(`whatsapp_link_sessions/${expired}`),
      expiresAt: h.Timestamp.fromMillis(Date.now() - 1),
    });
    assert.equal((await endpoint.POST(request(expired))).status, 400);
    assert.equal((await endpoint.POST(request("invalid"))).status, 400);
    const conflictPhone = "919222222222";
    const conflict = await service.createOrReuseLinkSession(
      conflictPhone,
      "demo-eats",
    );
    h.seed(`whatsapp_identities/${conflictPhone}`, {
      phone: conflictPhone,
      linked: true,
      uid: "real-user",
    });
    assert.equal((await endpoint.POST(request(conflict))).status, 409);
    assert.equal(
      h.read(`whatsapp_identities/${conflictPhone}`).uid,
      "real-user",
    );
    assert.equal(h.read(`whatsapp_link_sessions/${conflict}`).used, false);
    const concurrent = await service.createOrReuseLinkSession(
      "919333333333",
      "demo-eats",
    );
    const outcomes = await Promise.all([
      endpoint.POST(request(concurrent)),
      endpoint.POST(request(concurrent)),
    ]);
    assert.deepEqual(outcomes.map((r) => r.status).sort(), [200, 400]);
    process.env.DEMO_AUTH_MODE = "false";
    assert.equal((await endpoint.POST(request(conflict))).status, 401);
    await assert.rejects(service.completeDemoLinkSession(conflict), /invalid/);
    delete process.env.DEMO_AUTH_MODE;
    assert.equal((await endpoint.POST(request(conflict))).status, 401);
  } finally {
    if (previous === undefined) delete process.env.DEMO_AUTH_MODE;
    else process.env.DEMO_AUTH_MODE = previous;
  }
  console.log(
    "PASS: demo token-only login, server-derived identity, origin/expiry/single-use/conflict checks, preserved customer history, automatic business menu and real-auth fallback.",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
