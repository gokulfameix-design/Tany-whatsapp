/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { createHarness, demoBusiness } = require("./messaging-test-helpers.cjs");
const phone = "919999999999";
function setup() {
  const h = createHarness();
  const business = { ...demoBusiness, id: "demo-eats" };
  h.seed("businesses/demo-eats", business);
  h.seed("businesses/foreign", { ...demoBusiness });
  h.seed(`customers/demo-eats_${phone}`, {
    businessId: "demo-eats",
    phone,
    uid: "fixture-linked-user",
    linkedToTany: true,
    name: "Alex",
    savedAddresses: {
      home: {
        latitude: 12,
        longitude: 77,
        address: "Home",
        label: "Home",
        source: "stored",
      },
    },
  });
  let seq = 0,
    last;
  const process = h.load(
    "lib/messaging/services/incoming-message-service.ts",
  ).processIncomingMessage;
  const send = async (value, key) => {
    const msg =
      typeof value === "string"
        ? { type: "text", text: { body: value } }
        : value;
    last = await process(business, {
      from: phone,
      id: key ?? `wamid.catalog.${++seq}`,
      ...msg,
    });
    return last;
  };
  const choices = () =>
    last?.structuredReply?.type === "buttons"
      ? last.structuredReply.buttons
      : last?.structuredReply?.type === "list"
        ? last.structuredReply.sections.flatMap((s) => s.rows)
        : [];
  const click = async (pattern) => {
    const c = choices().find((c) =>
      typeof pattern === "string" ? c.title === pattern : pattern.test(c.title),
    );
    assert.ok(
      c,
      `Missing ${pattern}: ${JSON.stringify(choices())}; ${last?.reply}`,
    );
    return send({
      type: "interactive",
      interactive: {
        type: "button_reply",
        button_reply: { id: c.id, title: "FORGED TITLE" },
      },
    });
  };
  return {
    ...h,
    business,
    send,
    click,
    choices,
    last: () => last,
    conversation: () => h.read(`conversations/demo-eats_${phone}`),
  };
}
async function main() {
  process.env.WHATSAPP_PRODUCT_LIST_ENABLED = "true"; // Explicitly exercise the retained future product-list implementation.

  let h = setup();
  await h.send("Hi");
  assert.equal(h.last().structuredReply.type, "list");
  assert.deepEqual(
    h.choices().map((c) => c.title),
    ["Order Now", "View Menu", "Track Order", "Help"],
  );
  await h.click("View Menu");
  assert.ok(["list", "buttons"].includes(h.last().structuredReply.type));
  assert.ok(h.choices().some((c) => /Chicken Biriyani/.test(c.title)));
  await h.click(/Chicken Biriyani/);
  await h.click("2");
  let orderId = h.conversation().context.orderId;
  let order = h.read(`orders/${orderId}`);
  assert.equal(order.items[0].quantity, 2);
  assert.equal(order.total, 360);
  await h.click("Continue shopping");
  await h.click(/Dosa/);
  await h.click("1");
  order = h.read(`orders/${orderId}`);
  assert.equal(order.items.length, 2);
  assert.equal(order.total, 420);
  await h.click("View Cart");
  await h.click("Edit Cart");
  await h.click(/Chicken Biriyani/);
  await h.send("3");
  assert.equal(h.read(`orders/${orderId}`).total, 600);
  await h.send("View Cart");
  assert.match(h.last().reply, /Your cart/);
  await h.click("Checkout");
  await h.click("Home");
  assert.ok(h.choices().some((c) => c.title === "Confirm"));
  assert.equal(h.read(`orders/${orderId}`).items.length, 2);
  // Server repricing requires review when a price changes after the summary.
  const itemId = h.read(`orders/${orderId}`).items[0].id;
  const originalProduct = h.read(`businesses/demo-eats/catalog/${itemId}`);
  h.seed(`businesses/demo-eats/catalog/${itemId}`, {
    ...originalProduct,
    price: 200,
  });
  await h.click("Confirm");
  assert.match(h.last().reply, /prices changed/i);
  assert.equal(h.read(`orders/${orderId}`).paymentId, null);
  await h.click("Confirm");
  assert.equal(h.last().state, "eats_awaiting_payment");
  const paymentId = h.read(`orders/${orderId}`).paymentId;
  assert.ok(paymentId);
  assert.equal(h.read(`payments/${paymentId}`).amount, 660);
  await h.send("Track Order");
  assert.match(h.last().reply, /received/);
  assert.match(h.last().reply, new RegExp(orderId));
  for (const status of [
    "confirmed",
    "preparing",
    "out_for_delivery",
    "delivered",
    "cancelled",
  ]) {
    h.seed(`orders/${orderId}`, { ...h.read(`orders/${orderId}`), status });
    await h.send("Track Order");
    assert.match(h.last().reply, new RegExp(status));
  }
  // Mapping service and native single/multi-product payloads.
  h = setup();
  const catalog = h.load("lib/whatsapp/catalog.ts");
  h.seed("whatsapp_accounts/demo-eats", {
    businessId: "demo-eats",
    phoneNumberId: "TEST_PHONE_NUMBER_ID",
    status: "connected",
    wabaId: "123456789",
    displayPhone: "+919876543210",
    catalogId: "1234567",
    catalogEnabled: true,
  });
  const products = await h
    .load("lib/messaging/services/catalog-service.ts")
    .getAvailableCatalogItems("demo-eats");
  for (const p of products)
    await catalog.mapCatalogProduct("demo-eats", p.id, `sku-${p.id}`);
  await assert.rejects(
    catalog.mapCatalogProduct("demo-eats", "foreign-item", "foreign-sku"),
  );
  await assert.rejects(
    catalog.mapCatalogProduct(
      "demo-eats",
      products[1].id,
      `sku-${products[0].id}`,
    ),
  );
  await h.send("View Menu");
  assert.equal(h.last().structuredReply.type, "product_list");
  const build = h.load("lib/messaging/payload.ts").buildWhatsAppPayload;
  const payload = build(phone, h.last().structuredReply);
  assert.equal(payload.interactive.type, "product_list");
  assert.equal(payload.interactive.action.catalog_id, "1234567");
  assert.equal(
    payload.interactive.action.sections[0].product_items[0].product_retailer_id,
    `sku-${products[0].id}`,
  );
  assert.equal(build(phone, h.last().structuredReply, true).type, "text");
  const fallback = { type: "text", body: "Menu fallback" };
  const single = await catalog.catalogMenuReply(
    "demo-eats",
    [products[0]],
    fallback,
  );
  assert.equal(build(phone, single).interactive.type, "product_list");
  assert.equal(
    build(phone, single).interactive.action.sections[0].product_items[0].product_retailer_id,
    `sku-${products[0].id}`,
  );
  // Entry points must stay native through routing, category menus and greeting decoration.
  for (const command of ["START", "Start Order", "View Menu"]) {
    for (const mode of ["mapped", "missing", "disabled", "no-catalog"]) {
      const entry = setup();
      entry.seed("whatsapp_accounts/demo-eats", { businessId: "demo-eats", phoneNumberId: "TEST_PHONE_NUMBER_ID", status: "connected", wabaId: "123456789", displayPhone: "+919876543210", catalogId: mode === "no-catalog" ? "" : "1125148453496527", catalogEnabled: mode !== "disabled" });
      const available = await entry.load("lib/messaging/services/catalog-service.ts").getAvailableCatalogItems("demo-eats");
      for (const [i, product] of available.entries()) entry.seed(`businesses/demo-eats/catalog/${product.id}`, { ...product, category: i % 2 ? "Meals" : "Snacks" });
      // One mapped item among otherwise unmapped products is sufficient.
      if (mode !== "missing") entry.seed(`businesses/demo-eats/whatsapp_product_mappings/${available[0].id}`, { businessId: "demo-eats", tanyProductId: available[0].id, catalogId: "1125148453496527", retailerProductId: "REAL_META_CONTENT_ID" });
      await entry.send(command);
      const reply = entry.last().structuredReply;
      assert.equal(reply.type, mode === "mapped" ? "product_list" : "list", `${command}: ${mode}`);
      if (mode === "mapped") {
        assert.equal(reply.catalogId, "1125148453496527");
        assert.deepEqual(reply.sections[0].productItems, [{ productRetailerId: "REAL_META_CONTENT_ID" }]);
        const native = build(phone, reply);
        assert.equal(native.type, "interactive"); assert.equal(native.interactive.type, "product_list");
        assert.equal(native.interactive.action.catalog_id, "1125148453496527");
        assert.deepEqual(native.interactive.action.sections, [{ title: "Menu", product_items: [{ product_retailer_id: "REAL_META_CONTENT_ID" }] }]);
        assert.ok(!JSON.stringify(native).includes(available[0].name));
      }
    }
  }
  const incoming = {
    type: "order",
    order: {
      catalog_id: "1234567",
      product_items: [
        {
          product_retailer_id: `sku-${products[0].id}`,
          quantity: "2",
          item_price: "0.01",
          currency: "USD",
        },
        {
          product_retailer_id: `sku-${products[1].id}`,
          quantity: 1,
          item_price: "0",
          currency: "USD",
        },
      ],
    },
  };
  await h.send(incoming, "wamid.native.cart");
  orderId = h.conversation().context.orderId;
  order = h.read(`orders/${orderId}`);
  assert.equal(order.items.length, 2);
  assert.equal(order.total, products[0].price * 2 + products[1].price);
  assert.ok(order.items.every((i) => i.unitPrice > 1));
  const before = JSON.stringify(order.items);
  await h.send(incoming, "wamid.native.cart");
  assert.equal(
    JSON.stringify(h.read(`orders/${orderId}`).items),
    before,
    "duplicate webhook cannot add cart twice",
  );
  const cartService = h.load("lib/messaging/services/cart-service.ts");
  const operation = {
    businessId: "demo-eats",
    customerPhone: phone,
    orderId,
    eventId: "same-event",
    mode: "add",
    selections: [{ productId: products[0].id, quantity: 1 }],
  };
  await Promise.all([
    cartService.changeCart(operation),
    cartService.changeCart(operation),
  ]);
  assert.equal(h.read(`orders/${orderId}`).items[0].quantity, 3);
  await assert.rejects(
    cartService.changeCart({
      ...operation,
      businessId: "foreign",
      eventId: "foreign",
    }),
  );
  const stableTotal = h.read(`orders/${orderId}`).total;
  await h.send({
    type: "order",
    order: {
      catalog_id: "foreign-catalog",
      product_items: [{ product_retailer_id: "foreign", quantity: 1 }],
    },
  });
  assert.match(h.last().reply, /not available/);
  assert.equal(h.read(`orders/${orderId}`).total, stableTotal);
  await h.send({
    type: "text",
    text: { body: "Tell me more" },
    context: {
      referred_product: {
        catalog_id: "1234567",
        product_retailer_id: `sku-${products[0].id}`,
      },
    },
  });
  assert.equal(h.last().state, "eats_cart_quantity");
  assert.ok(h.choices().some((c) => c.title === "2"));
  // Disabled/missing mappings fall back automatically; cart never uses another business price.
  await catalog.saveCatalogConfiguration("demo-eats", "1234567", false);
  await h.send("View Menu");
  assert.equal(h.last().structuredReply.type, "list");
  const parser = h.load("lib/messaging/incoming.ts").normalizeIncomingMessage;
  assert.throws(() =>
    parser({
      from: phone,
      id: "bad",
      type: "order",
      order: {
        catalog_id: "1234567",
        product_items: [{ product_retailer_id: "x", quantity: 0 }],
      },
    }),
  );
  assert.throws(() =>
    parser({
      from: phone,
      id: "bad2",
      type: "order",
      order: {
        catalog_id: "1234567",
        product_items: [
          { product_retailer_id: "x", quantity: 1 },
          { product_retailer_id: "x", quantity: 1 },
        ],
      },
    }),
  );

  const categories = setup();
  const categoryItems = await categories
    .load("lib/messaging/services/catalog-service.ts")
    .getAvailableCatalogItems("demo-eats");
  for (const [i, p] of categoryItems.entries())
    categories.seed(`businesses/demo-eats/catalog/${p.id}`, {
      ...p,
      category: i < 2 ? "Biriyani" : "Breakfast",
    });
  await categories.send("View Menu");
  assert.deepEqual(
    categories.choices().map((c) => c.title),
    ["Biriyani", "Breakfast"],
  );
  await categories.click("Breakfast");
  await categories.click("Dosa");
  await categories.send("0");
  assert.match(categories.last().reply, /1 to 99/);
  await categories.send("2");
  await categories.send("2 chicken biriyani");
  const typedId = categories.conversation().context.orderId;
  assert.equal(categories.read(`orders/${typedId}`).items.length, 2);
  await categories.click("View Cart");
  await categories.click("Edit Cart");
  await categories.click("Dosa");
  await categories.click("Remove");
  assert.equal(categories.read(`orders/${typedId}`).items.length, 1);
  const senderHarness = createHarness({ seedFixtures: false });
  const actualSender = senderHarness.load("lib/messaging/whatsapp.ts");
  const oldFetch = global.fetch,
    oldToken = process.env.META_ACCESS_TOKEN;
  process.env.META_ACCESS_TOKEN = "catalog-test-token";
  const requests = [];
  global.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return requests.length === 1
      ? {
          ok: false,
          status: 400,
          json: async () => ({
            error: { code: 131009, message: "Unsupported product" },
          }),
        }
      : {
          ok: true,
          status: 200,
          json: async () => ({ messages: [{ id: "wamid.fallback" }] }),
        };
  };
  try {
    const previousError = console.error;
    try {
      console.error = () => {};
      await assert.rejects(actualSender.sendWhatsAppProducts({
      phoneNumberId: "123",
      to: phone,
      reply: single,
      }), /Unsupported product/);
    } finally { console.error = previousError; }
    assert.equal(requests.length, 1, "native catalog errors must not silently send a Firestore fallback");
    assert.equal(requests[0].interactive.type, "product_list");
    await actualSender.sendWhatsAppProducts({ phoneNumberId: "123", to: phone, reply: single });
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[1].interactive.action.sections[0].product_items, [{ product_retailer_id: `sku-${products[0].id}` }]);
    let attempts = 0;
    global.fetch = async () => {
      attempts++;
      throw new Error("Timeout");
    };
    await assert.rejects(
      actualSender.sendWhatsAppProduct({
        phoneNumberId: "123",
        to: phone,
        reply: single,
      }),
    );
    assert.equal(attempts, 1);
  } finally {
    global.fetch = oldFetch;
    if (oldToken === undefined) delete process.env.META_ACCESS_TOKEN;
    else process.env.META_ACCESS_TOKEN = oldToken;
  }
  console.log(
    "PASS: Eats four-choice greeting, Firestore fallback, native product/product-list payloads, product/order parsing, multi-item cart, quantity/edit, server repricing, checkout/payment, duplicate events, invalid products, business isolation and order tracking.",
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
