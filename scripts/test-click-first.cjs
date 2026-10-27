/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { createHarness, demoBusiness } = require("./messaging-test-helpers.cjs");
const phone = "919999999999";
const point = (latitude, longitude, label) => ({
  latitude,
  longitude,
  label,
  address: label,
  source: "stored",
});
function setup(vertical, profile = true) {
  const h = createHarness();
  const business = { ...demoBusiness, id: `demo-${vertical}`, vertical };
  h.seed(`businesses/${business.id}`, business);
  if (profile)
    h.seed(`customers/${business.id}_${phone}`, {
      businessId: business.id,
      phone,
      uid: "fixture-linked-user",
      linkedToTany: true,
      name: "Alex",
      metadata: { keep: "history" },
      vehicles: ["Honda City"],
      savedAddresses: {
        home: point(12, 77, "Home"),
        work: point(13, 78, "Work"),
      },
      createdAt: h.Timestamp.fromMillis(1),
    });
  const process = h.load(
    "lib/messaging/services/incoming-message-service.ts",
  ).processIncomingMessage;
  let sequence = 0,
    last;
  const choices = () =>
    last?.structuredReply?.type === "buttons"
      ? last.structuredReply.buttons
      : last?.structuredReply?.type === "list"
        ? last.structuredReply.sections.flatMap((s) => s.rows)
        : [];
  const send = async (value) => {
    let incoming = {
      from: phone,
      id: `wamid.click-${vertical}-${++sequence}`,
      type: "text",
      text: { body: value },
    };
    if (value && typeof value === "object")
      incoming = { ...incoming, ...value };
    last = await process(business, incoming);
    assert.equal(last.success, true);
    if (last.structuredReply) {
      const reply = last.structuredReply;
      if (reply.type === "buttons") {
        assert.ok(reply.buttons.length <= 3);
        assert.ok(reply.buttons.every((b) => Array.from(b.title).length <= 20));
      }
      if (reply.type === "list") {
        const rows = reply.sections.flatMap((s) => s.rows);
        assert.ok(rows.length <= 10);
        assert.ok(rows.every((r) => Array.from(r.title).length <= 24));
      }
    }
    return last;
  };
  const click = async (pattern) => {
    const selected = choices().find((c) =>
      typeof pattern === "string" ? c.title === pattern : pattern.test(c.title),
    );
    assert.ok(
      selected,
      `${vertical}: missing ${pattern} in ${JSON.stringify(choices())}; state=${last?.state}; reply=${last?.reply}`,
    );
    return send({
      type: "interactive",
      text: undefined,
      interactive: {
        type: "button_reply",
        button_reply: {
          id: selected.id,
          title: "FORGED TITLE MUST NOT BE USED",
        },
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
    conversation: () => h.read(`conversations/${business.id}_${phone}`),
  };
}
async function start(h) {
  await h.send("Hi");
  assert.equal(
    h.last().structuredReply.type,
    h.business.vertical === "eats" ? "list" : "buttons",
  );
  assert.match(h.last().reply, /Alex/);
  await h.click(h.choices()[0].title);
}
async function dateTime(h) {
  await h.click("Tomorrow");
  await h.click(/^10/);
}
async function journey(v) {
  const h = setup(v);
  await start(h);
  if (v === "eats") {
    await h.click(/Chicken Biriyani/);
    await h.click("2");
    await h.click("Checkout");
    await h.click("Home");
  }
  if (v === "retail") {
    if (!h.choices().some((c) => /T-Shirt/.test(c.title)))
      await h.click(h.choices()[0].title);
    await h.click(/T-Shirt/);
    await h.click("M Blue");
    await h.click("2");
    await h.click("Home");
  }
  if (v === "ecom") {
    await h.click("Gifts");
    await h.click("100");
    await h.click("₹100");
  }
  if (v === "meds") {
    await h.click(/ORS/);
    await h.click("2");
    await h.click("Home");
  }
  if (v === "meat") {
    await h.click("Chicken");
    await h.click("Curry Cut");
    await h.click("500g");
    await h.click("Home");
  }
  if (v === "cabs") {
    await h.click("Home");
    await h.click("Work");
    await h.click("Mini");
  }
  if (v === "garage") {
    await h.click("Honda City");
    await h.click("General Service");
    await dateTime(h);
  }
  if (v === "expert") {
    await h.click("CA Consultation");
    await dateTime(h);
  }
  if (v === "gaming") {
    await h.click("PS5");
    await h.click("2 hours");
    await dateTime(h);
  }
  if (v === "sport") {
    await h.click(/Badminton/);
    await h.click(/Badminton/);
    await dateTime(h);
  }
  if (v === "salon") {
    await h.click("Haircut");
    await dateTime(h);
    if (h.last().state === "salon_awaiting_stylist")
      await h.click("Any Stylist");
  }
  if (v === "motos") {
    await h.click(/automatic/i);
    await h.click(/Creta/);
    await h.click("Test Drive");
    await dateTime(h);
  }
  assert.match(
    h.last().state,
    v === "eats" ? /eats_cart_confirmation$/ : /_awaiting_confirmation$/,
  );
  assert.equal(h.last().structuredReply.type, "buttons");
  assert.ok(h.choices().some((c) => c.title === "Confirm"));
  assert.ok(h.choices().some((c) => c.title === "Cancel"));
  const context = h.conversation().context;
  const recordId = context.orderId ?? context.bookingId;
  const collection = context.orderId ? "orders" : "bookings";
  assert.ok(recordId, `${v}: draft missing`);
  const totalBefore =
    h.read(`${collection}/${recordId}`).total ??
    h.read(`${collection}/${recordId}`).amount;
  await h.click("Confirm");
  assert.ok(
    h.last().state.endsWith("_awaiting_payment") ||
      h.last().state.endsWith("_completed"),
  );
  assert.equal(
    h.read(`${collection}/${recordId}`).total ??
      h.read(`${collection}/${recordId}`).amount,
    totalBefore,
  );
  assert.equal(
    h.read(`customers/${h.business.id}_${phone}`).metadata.keep,
    "history",
  );
  assert.equal(
    h.read(`customers/${h.business.id}_${phone}`).uid,
    "fixture-linked-user",
  );
  const status = h.read(`${collection}/${recordId}`).status;
  await h.send("RESET");
  assert.ok(
    !h.conversation().context.orderId && !h.conversation().context.bookingId,
  );
  if (status === "confirmed")
    assert.equal(h.read(`${collection}/${recordId}`).status, "confirmed");
  else assert.equal(h.read(`${collection}/${recordId}`).status, "cancelled");
  // New namespaced history/recent actions lead back through the same validations.
  await h.send({
    type: "interactive",
    interactive: {
      type: "button_reply",
      button_reply: { id: `${v}_history`, title: "Ignored" },
    },
  });
  assert.ok(h.choices().some((c) => c.title === "Use recent choice"));
  await h.click("Use recent choice");
  assert.ok(
    !h.last().state.endsWith("_awaiting_payment") &&
      !h.last().state.endsWith("_completed"),
  );
  return h;
}
async function main() {
  for (const v of [
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
  ]) {
    await journey(v);
    const cancel = setup(v);
    await start(cancel);
    await cancel.send("CANCEL");
    assert.equal(cancel.conversation().status, "cancelled");
    await cancel.click("Start again");
    assert.notEqual(cancel.conversation().status, "cancelled");
    const typed = {
      motos: "automatic",
      eats: "2 chicken biriyani",
      cabs: "Airport",
      ecom: "Gifts",
      expert: "CA Consultation",
      gaming: "PS5",
      garage: "Honda City",
      meat: "Chicken",
      meds: "ORS",
      retail: "T-Shirt",
      salon: "Haircut",
      sport: "Badminton",
    };
    await cancel.send(typed[v]);
    assert.notEqual(
      cancel.last().state,
      `${v}_start`,
      `${v}: typed fallback must advance`,
    );
    console.log(
      `PASS: ${v} linked greeting, complete tap-first journey, confirm/cancel/reset, history and recent choice.`,
    );
  }
  const eats = setup("eats");
  for (const id of ["chicken biriyani", "mutton biriyani"])
    eats.seed(`businesses/demo-eats/catalog/${id}`, {
      ...eats.read(`businesses/demo-eats/catalog/${id}`),
      category: "Meals",
    });
  for (const id of ["dosa", "idli"])
    eats.seed(`businesses/demo-eats/catalog/${id}`, {
      ...eats.read(`businesses/demo-eats/catalog/${id}`),
      category: "Breakfast",
    });
  await start(eats);
  await eats.click("Meals");
  await eats.click("Chicken Biriyani");
  const stale = eats.choices()[0].id;
  await eats.click("2");
  await eats.click("Checkout");
  await eats.click("Home");
  const id = eats.conversation().context.orderId;
  assert.equal(eats.read(`orders/${id}`).total, 360);
  await eats.send({
    type: "interactive",
    interactive: {
      type: "button_reply",
      button_reply: { id: stale, title: "CONFIRM" },
    },
  });
  assert.equal(eats.read(`orders/${id}`).status, "pending_confirmation");
  assert.equal(
    [...eats.documents.keys()].filter((k) => k.startsWith("payments/")).length,
    0,
  );
  await eats.click("Cancel");
  assert.equal(eats.read(`orders/${id}`).status, "cancelled");
  await eats.send("RESET");
  await eats.send("2 chicken biriyani");
  assert.equal(eats.last().state, "eats_awaiting_confirmation"); // typed fallback reuses canonical location
  assert.equal(
    eats.read(`orders/${eats.conversation().context.orderId}`).total,
    360,
  );

  const location = setup("cabs");
  await start(location);
  await location.click("Use current location");
  assert.equal(location.last().structuredReply.type, "location_request");
  const payload = location
    .load("lib/messaging/payload.ts")
    .buildWhatsAppPayload(phone, location.last().structuredReply);
  assert.equal(payload.interactive.type, "location_request_message");
  assert.equal(payload.interactive.action.name, "send_location");
  await location.send({
    type: "location",
    text: undefined,
    location: {
      latitude: 15,
      longitude: 80,
      name: "Home",
      address: "Saved home",
    },
  });
  assert.equal(location.last().state, "cabs_awaiting_destination");
  const saved = await location
    .load("lib/messaging/services/saved-customer-service.ts")
    .loadSavedCustomer("demo-cabs", phone);
  assert.equal(
    saved.addresses.find((a) => a.id === "home").location.latitude,
    15,
  );
  assert.equal(
    (
      await location
        .load("lib/messaging/services/saved-customer-service.ts")
        .loadSavedCustomer("another-business", phone)
    ).addresses.length,
    0,
  );

  const safety = setup("meds");
  await start(safety);
  await safety.send("diagnose my headache");
  assert.match(safety.last().reply, /licensed doctor|prescription/i);
  assert.equal(
    [...safety.documents.keys()].filter((k) => k.startsWith("orders/")).length,
    0,
  );

  // Large catalog choices paginate without overflowing WhatsApp's ten-row limit.
  const paged = setup("eats");
  for (let i = 0; i < 15; i++)
    paged.seed(`businesses/demo-eats/catalog/food-${i}`, {
      name: `Food ${i}`,
      type: "product",
      price: 10,
      available: true,
      metadata: {},
      category: null,
    });
  await start(paged);
  assert.ok(paged.choices().length <= 10);
  await paged.click("More items");
  assert.ok(paged.choices().length <= 10);
  await paged.click("Previous items");
  const arrayProfile = setup("eats");
  const customerPath = `customers/demo-eats_${phone}`;
  arrayProfile.seed(customerPath, {
    ...arrayProfile.read(customerPath),
    savedAddresses: [point(1, 2, "Home"), point(3, 4, "Work")],
  });
  const savedService = arrayProfile.load(
    "lib/messaging/services/saved-customer-service.ts",
  );
  assert.equal(
    (await savedService.loadSavedCustomer("demo-eats", phone)).addresses.length,
    2,
  );
  await arrayProfile
    .load("lib/messaging/services/location-service.ts")
    .saveCustomerLocation({
      businessId: "demo-eats",
      customerPhone: phone,
      location: point(5, 6, "Home"),
    });
  const afterSave = await savedService.loadSavedCustomer("demo-eats", phone);
  assert.equal(
    afterSave.addresses.find((a) => a.id === "home").location.latitude,
    5,
  );
  assert.equal(
    afterSave.addresses.find((a) => a.id === "work").location.latitude,
    3,
  );
  assert.ok(!JSON.stringify(afterSave).includes("fixture-linked-user"));
  arrayProfile.seed(customerPath, {
    ...arrayProfile.read(customerPath),
    uid: "different-user",
  });
  assert.equal(
    (await savedService.loadSavedCustomer("demo-eats", phone)).addresses.length,
    0,
  );

  const stylists = setup("salon");
  stylists.seed("businesses/demo-salon", {
    ...stylists.business,
    settings: {
      staff: {
        any: "Any Stylist",
        arun: "Arun",
        priya: "Priya",
        a: "Asha",
        b: "Bala",
      },
    },
  });
  const haircut = stylists.read("businesses/demo-salon/catalog/haircut");
  stylists.seed("businesses/demo-salon/catalog/haircut", {
    ...haircut,
    metadata: { ...haircut.metadata, staffIds: ["arun", "priya", "a", "b"] },
  });
  await start(stylists);
  await stylists.click("Haircut");
  await dateTime(stylists);
  assert.equal(stylists.last().state, "salon_awaiting_stylist");
  assert.equal(stylists.last().structuredReply.type, "list");
  await stylists.click("Asha");
  assert.equal(stylists.last().state, "salon_awaiting_confirmation");
  assert.equal(stylists.conversation().context.stylistId, "a");
  const newRetail = setup("retail", false);
  await newRetail.send("Hi");
  await newRetail.click("Shop Products");
  if (!newRetail.choices().some((c) => /T-Shirt/.test(c.title)))
    await newRetail.click(newRetail.choices()[0].title);
  await newRetail.click(/T-Shirt/);
  await newRetail.click("M Blue");
  await newRetail.click("2");
  await newRetail.click("Share new location");
  assert.equal(newRetail.last().structuredReply.type, "location_request");
  await newRetail.send({
    type: "location",
    text: undefined,
    location: { latitude: 10, longitude: 20, name: "Home" },
  });
  assert.ok(newRetail.choices().some((c) => c.title === "Confirm"));
  assert.equal(
    newRetail.read(`orders/${newRetail.conversation().context.orderId}`)
      .location.latitude,
    10,
  );
  console.log(
    "PASS: categories, state-bound IDs, typed fallback, saved address isolation, native location requests, prescription safeguards and pagination.",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
