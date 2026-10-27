/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");
const { NextRequest } = require("next/server");
const {
  createHarness,
  demoBusiness,
  dummyPayload,
} = require("./messaging-test-helpers.cjs");

async function main() {
  process.env.DEMO_AUTH_MODE = "false";
  const h = createHarness({ linkedIdentity: false });
  h.seed("businesses/demo-eats", demoBusiness);
  h.seed("businesses/other-eats", {
    ...demoBusiness,
    whatsappPhoneNumberId: "OTHER",
  });
  const identity = h.load("lib/messaging/services/identity-service.ts");
  const { processIncomingMessage } = h.load(
    "lib/messaging/services/incoming-message-service.ts",
  );
  const business = { id: "demo-eats", ...demoBusiness };
  const phone = "919999999999";
  const customerPath = `customers/demo-eats_${phone}`;
  const message = (id, text = "2 chicken biriyani") => ({
    from: phone,
    id,
    type: "text",
    text: { body: text },
  });
  let result = await processIncomingMessage(
    business,
    message("wamid.unlinked"),
  );
  assert.equal(result.skipped, "account_link_required");
  assert.equal(h.sends.length, 1);
  assert.equal(h.sends[0].reply.type, "cta_url");
  assert.equal(h.read(customerPath), undefined);
  assert.equal(
    [...h.documents.keys()].filter((k) => k.startsWith("orders/")).length,
    0,
  );
  assert.equal(
    [...h.documents.keys()].filter((k) => k.startsWith("conversations/"))
      .length,
    0,
  );
  const sessionPath = [...h.documents.keys()].find((k) =>
    k.startsWith("whatsapp_link_sessions/"),
  );
  const session = h.read(sessionPath);
  assert.match(session.token, /^[a-f0-9]{64}$/);
  assert.ok(session.expiresAt.toMillis() > Date.now() + 14 * 60 * 1000);
  assert.equal(session.used, false);
  assert.equal(session.businessId, "demo-eats");
  const payload = h
    .load("lib/messaging/payload.ts")
    .buildWhatsAppPayload(phone, h.sends[0].reply);
  assert.equal(payload.interactive.type, "cta_url");
  assert.equal(
    payload.interactive.action.parameters.url,
    `https://tany-messaging-185656276893.asia-south1.run.app/connect/whatsapp?token=${session.token}`,
  );
  assert.equal(
    payload.interactive.action.parameters.display_text,
    "Login/Create Account",
  );
  assert.ok(!JSON.stringify(result).includes(session.token));
  assert.equal(
    (await processIncomingMessage(business, message("wamid.unlinked"))).skipped,
    "duplicate_message",
  );
  assert.equal(h.sends.length, 1);
  await processIncomingMessage(business, message("wamid.unlinked-again"));
  assert.equal(
    [...h.documents.keys()].filter((k) =>
      k.startsWith("whatsapp_link_sessions/"),
    ).length,
    1,
  );
  const concurrentTokens = await Promise.all([
    identity.createOrReuseLinkSession(phone, "other-eats"),
    identity.createOrReuseLinkSession(phone, "other-eats"),
  ]);
  assert.equal(concurrentTokens[0], concurrentTokens[1]);

  h.seed(customerPath, {
    businessId: "demo-eats",
    phone,
    name: "Existing customer",
    metadata: { history: "keep" },
    createdAt: h.Timestamp.fromMillis(1),
  });
  h.seed("orders/existing-history", {
    businessId: "demo-eats",
    customerPhone: phone,
    vertical: "eats",
    status: "paid",
    total: 100,
  });
  const historicalOrder = h.read("orders/existing-history");
  const scope = await identity.completeLinkSession(
    session.token,
    "private-uid-a",
  );
  assert.equal(scope.businessId, "demo-eats");
  assert.equal(h.read(`whatsapp_identities/${phone}`).uid, "private-uid-a");
  assert.equal(h.read(sessionPath).used, true);
  assert.equal(h.read(customerPath).name, "Existing customer");
  assert.deepEqual(h.read(customerPath).metadata, { history: "keep" });
  assert.equal(h.read(customerPath).createdAt.toMillis(), 1);
  assert.equal(h.read(customerPath).uid, "private-uid-a");
  assert.equal(h.read(customerPath).linkedToTany, true);
  assert.deepEqual(h.read("orders/existing-history"), historicalOrder);
  await assert.rejects(
    identity.completeLinkSession(session.token, "private-uid-a"),
    (e) => e.code === "used",
  );
  await assert.rejects(
    identity.inspectLinkSession(session.token),
    (e) => e.code === "used",
  );
  await assert.rejects(
    identity.completeLinkSession(concurrentTokens[0], "other-uid"),
    (e) => e.code === "conflict",
  );
  assert.equal(
    h.read(`whatsapp_link_sessions/${concurrentTokens[0]}`).used,
    false,
  );
  assert.equal(h.read(`whatsapp_identities/${phone}`).uid, "private-uid-a");
  assert.equal(await identity.notifyAccountLinked(session.token, scope), true);
  const notifications = h.sends.slice(-2);
  assert.equal(notifications[0].reply, "✅ Your Tany account is connected.");
  assert.equal(notifications[1].reply.type, "list");
  assert.deepEqual(
    notifications[1].reply.sections.flatMap((s) => s.rows).map((b) => b.title),
    ["Order Now", "View Menu", "Track Order", "Help"],
  );
  const sends = h.sends.length;
  assert.equal(await identity.notifyAccountLinked(session.token, scope), false);
  assert.equal(h.sends.length, sends);
  result = await processIncomingMessage(
    business,
    message("wamid.linked-hi", "Hi"),
  );
  assert.equal(result.state, "eats_start");
  assert.equal(result.structuredReply.type, "list");
  assert.ok(!JSON.stringify(result).includes("private-uid-a"));
  assert.equal(
    [...h.documents.keys()].filter((k) =>
      k.startsWith("whatsapp_link_sessions/"),
    ).length,
    2,
  );
  assert.equal(
    h.read(customerPath).pendingWhatsAppIntent,
    "2 chicken biriyani",
  );
  result = await processIncomingMessage(business, {
    from: phone,
    id: "wamid.resume",
    type: "interactive",
    interactive: {
      type: "button_reply",
      button_reply: { id: "tany:start", title: "Start Order" },
    },
  });
  assert.equal(result.state, "eats_awaiting_location");
  assert.equal(h.read(customerPath).pendingWhatsAppIntent, undefined);
  const resumedOrderId = h.read(`conversations/demo-eats_${phone}`).context
    .orderId;
  assert.equal(h.read(`orders/${resumedOrderId}`).total, 360);
  result = await processIncomingMessage(
    business,
    message("wamid.linked-order"),
  );
  assert.equal(result.state, "eats_awaiting_location");
  assert.equal(h.read(customerPath).uid, "private-uid-a");
  h.seed("orders/foreign-history", {
    businessId: "other-eats",
    customerPhone: phone,
    status: "foreign_sentinel",
  });
  result = await processIncomingMessage(business, {
    from: phone,
    id: "wamid.history",
    type: "interactive",
    interactive: {
      type: "button_reply",
      button_reply: { id: "tany:history", title: "My Orders" },
    },
  });
  assert.ok(!result.reply.includes("foreign_sentinel"));
  assert.match(result.reply, /paid/);

  const expired = await identity.createOrReuseLinkSession(
    "918888888888",
    "demo-eats",
  );
  h.seed(`whatsapp_link_sessions/${expired}`, {
    ...h.read(`whatsapp_link_sessions/${expired}`),
    expiresAt: h.Timestamp.fromMillis(Date.now() - 1),
  });
  await assert.rejects(
    identity.inspectLinkSession(expired),
    (e) => e.code === "expired",
  );
  await assert.rejects(
    identity.completeLinkSession(expired, "private-uid-b"),
    (e) => e.code === "expired",
  );
  await assert.rejects(
    identity.inspectLinkSession("../not-a-token"),
    (e) => e.code === "invalid",
  );
  const replacement = await identity.createOrReuseLinkSession(
    "918888888888",
    "demo-eats",
  );
  assert.notEqual(replacement, expired);
  const raced = await identity.createOrReuseLinkSession(
    "917777777777",
    "demo-eats",
  );
  const claims = await Promise.allSettled([
    identity.completeLinkSession(raced, "uid-one"),
    identity.completeLinkSession(raced, "uid-two"),
  ]);
  assert.equal(claims.filter((c) => c.status === "fulfilled").length, 1);

  // Public linking API uses verified Firebase identity, never request-provided UID/phone/business.
  const endpoint = h.load("app/api/connect/whatsapp/route.ts");
  h.authTokens.set("valid-firebase-token", "server-verified-uid");
  const request = (
    body,
    credential = "valid-firebase-token",
    origin = "https://tany.in",
  ) =>
    new NextRequest("https://tany.in/api/connect/whatsapp", {
      method: "POST",
      headers: {
        origin,
        "Content-Type": "application/json",
        Authorization: `Bearer ${credential}`,
      },
      body: JSON.stringify(body),
    });
  assert.equal(
    (
      await endpoint.POST(
        request({ token: replacement, action: "inspect" }, "invalid-token"),
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await endpoint.POST(
        request(
          { token: replacement, action: "inspect" },
          "valid-firebase-token",
          "https://attacker.test",
        ),
      )
    ).status,
    403,
  );
  let response = await endpoint.POST(
    request({ token: replacement, action: "inspect" }),
  );
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), { phone: "+918888888888" });
  response = await endpoint.POST(
    request({
      token: replacement,
      action: "confirm",
      uid: "forged-uid",
      whatsappPhone: phone,
      businessId: "other-eats",
    }),
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.ok(!JSON.stringify(body).includes("uid"));
  assert.equal(
    h.read("whatsapp_identities/918888888888").uid,
    "server-verified-uid",
  );
  assert.equal(
    h.read(`whatsapp_link_sessions/${replacement}`).businessId,
    "demo-eats",
  );
  assert.ok(h.authChecks.every((check) => check.checkRevoked === true));
  assert.equal(
    (await endpoint.POST(request({ token: replacement, action: "confirm" })))
      .status,
    400,
  );

  // Production webhook verifies the raw Meta signature before trusting the sender.
  const webhook = h.load("app/api/whatsapp/webhook/route.ts");
  const previousMode = process.env.NODE_ENV,
    previousSecret = process.env.META_APP_SECRET;
  process.env.NODE_ENV = "production";
  process.env.META_APP_SECRET = "test-meta-app-secret";
  try {
    const raw = JSON.stringify(dummyPayload("wamid.signed"));
    const headers = {
      "Content-Type": "application/json",
      "x-hub-signature-256":
        "sha256=" +
        createHmac("sha256", "test-meta-app-secret").update(raw).digest("hex"),
    };
    const bad = await webhook.POST(
      new NextRequest("https://tany.in/api/whatsapp/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: raw,
      }),
    );
    assert.equal(bad.status, 401);
    assert.equal(
      (
        await webhook.POST(
          new NextRequest("https://tany.in/api/whatsapp/webhook", {
            method: "POST",
            headers,
            body: raw,
          }),
        )
      ).status,
      200,
    );
  } finally {
    if (previousMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousMode;
    if (previousSecret === undefined) delete process.env.META_APP_SECRET;
    else process.env.META_APP_SECRET = previousSecret;
  }
  const { identityMenu } = h.load("lib/messaging/identity-menu.ts");
  assert.deepEqual(
    identityMenu("salon").buttons.map((b) => b.title),
    ["Book Appointment", "My Bookings", "Help"],
  );
  assert.deepEqual(
    identityMenu("motos").buttons.map((b) => b.title),
    ["Browse Cars", "My Bookings", "Help"],
  );
  for (const vertical of ["salon", "motos"]) {
    const verticalHarness = createHarness();
    const verticalBusiness = {
      ...demoBusiness,
      id: `demo-${vertical}`,
      vertical,
    };
    verticalHarness.seed(`businesses/demo-${vertical}`, verticalBusiness);
    const service = verticalHarness.load(
      "lib/messaging/services/incoming-message-service.ts",
    );
    const greeting = await service.processIncomingMessage(
      verticalBusiness,
      message(`wamid.${vertical}-hello`, "Hello"),
    );
    assert.equal(greeting.structuredReply.type, "buttons");
    assert.deepEqual(
      greeting.structuredReply.buttons.map((b) => b.title),
      identityMenu(vertical).buttons.map((b) => b.title),
    );
    const start = await service.processIncomingMessage(verticalBusiness, {
      from: phone,
      id: `wamid.${vertical}-start`,
      type: "interactive",
      interactive: {
        type: "button_reply",
        button_reply: { id: "tany:start", title: "Start" },
      },
    });
    assert.equal(start.state, `${vertical}_start`);
  }
  console.log(
    "PASS: unknown/known identity gate, secure reusable expiring sessions, single-use concurrent linking, conflict protection, customer/history preservation, verified Firebase Auth, safe public DTOs, click-first menus, typed fallback and signed production webhook.",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
