/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { createHarness } = require("./messaging-test-helpers.cjs");

async function main() {
  const h = createHarness({ seedFixtures: false });
  const admin = h.load("lib/admin/services.ts");
  const validation = h.load("lib/admin/validation.ts");
  const base = {
    name: "First Business",
    vertical: "eats",
    whatsappPhoneNumberId: "11111111",
    active: true,
    settings: {},
  };
  assert.equal(
    validation.slugifyBusinessName(" Tany Eats & More! "),
    "tany-eats-more",
  );
  const a = await admin.createBusiness({
    ...base,
    businessId: "first-business",
  });
  const b = await admin.createBusiness({
    ...base,
    name: "Second Business",
    businessId: "second-business",
    whatsappPhoneNumberId: "22222222",
  });
  await h.load("lib/subscriptions/entitlements.ts").assignDemoSubscription(a.id, "pro");
  assert.equal(a.id, "first-business");
  const createdAt = h.read("businesses/" + a.id).createdAt.toMillis();
  await assert.rejects(
    admin.createBusiness({ ...base, businessId: a.id }),
    /already in use/,
  );
  await assert.rejects(
    admin.createBusiness({ ...base, businessId: "duplicate-phone" }),
    /another business/,
  );
  await admin.updateBusiness(a.id, {
    ...base,
    name: "Renamed Business",
    vertical: "salon",
    settings: { staff: { person: "Anna" }, customFlag: true },
  });
  assert.equal((await admin.getAdminBusiness(a.id)).vertical, "salon");
  assert.equal((await admin.getAdminBusiness(a.id)).settings.customFlag, true);
  assert.equal(h.read("businesses/" + a.id).createdAt.toMillis(), createdAt);
  await admin.toggleBusiness(a.id, false);
  assert.equal(h.read("businesses/" + a.id).active, false);
  await admin.toggleBusiness(a.id, true);
  assert.equal(h.read("businesses/" + a.id).active, true);
  assert.equal(h.read("businesses/" + a.id).name, "Renamed Business");
  const itemInput = {
    name: "Haircut",
    type: "service",
    category: "Hair",
    description: "A trim",
    price: 350,
    available: true,
    metadata: {
      aliases: ["cut"],
      durationMinutes: 45,
      staffIds: ["person"],
      custom: { keep: "yes" },
    },
  };
  const item = await admin.createCatalogItem(a.id, itemInput);
  assert.equal((await admin.listCatalog(a.id)).length, 1);
  assert.equal((await admin.listCatalog(b.id)).length, 0);
  await admin.updateCatalogItem(a.id, item.id, {
    ...itemInput,
    price: 499.5,
    metadata: { ...itemInput.metadata, custom: { keep: "yes", updated: true } },
  });
  assert.equal((await admin.listCatalog(a.id))[0].price, 499.5);
  assert.equal((await admin.listCatalog(a.id))[0].metadata.custom.keep, "yes");
  await admin.toggleCatalogAvailability(a.id, item.id, false);
  assert.equal((await admin.listCatalog(a.id))[0].available, false);
  await admin.toggleCatalogAvailability(a.id, item.id, true);
  assert.equal((await admin.listCatalog(a.id))[0].available, true);
  await assert.rejects(
    admin.updateCatalogItem(b.id, item.id, itemInput),
    /not found/,
  );
  await assert.rejects(
    admin.deleteCatalogItem(b.id, item.id, "DELETE"),
    /not found/,
  );
  await assert.rejects(
    admin.toggleCatalogAvailability(b.id, item.id, false),
    /not found/,
  );
  assert.ok(h.read(`businesses/${a.id}/catalog/${item.id}`));
  h.seed(`businesses/${b.id}/catalog/${item.id}`, { ...itemInput, price: 777 });
  await admin.updateCatalogItem(a.id, item.id, { ...itemInput, price: 100 });
  assert.equal(h.read(`businesses/${b.id}/catalog/${item.id}`).price, 777);
  h.seed("orders/a", { businessId: a.id });
  h.seed("orders/b", { businessId: b.id });
  h.seed("bookings/a", { businessId: a.id });
  h.seed("conversations/a", { businessId: a.id });
  assert.deepEqual(await admin.getBusinessStats(a.id), {
    catalog: 1,
    orders: 1,
    bookings: 1,
    conversations: 1,
  });
  assert.equal((await admin.listBusinesses()).length, 2);
  // Business workspace reads must never expose records from another tenant.
  const workspace = h.load("lib/admin/workspace-service.ts");
  const updatedAt = h.read("businesses/" + a.id).updatedAt;
  for (const collection of [
    "orders",
    "bookings",
    "customers",
    "conversations",
  ]) {
    h.seed(`${collection}/workspace-a`, {
      id: "forged-id",
      businessId: a.id,
      customerPhone: "911111111111",
      phone: "911111111111",
      name: "Customer A",
      serviceName: "Tenant A service",
      state: "salon_start",
      status: "draft",
      total: 123,
      amount: 100,
      items: [{ name: "Tenant A item" }],
      updatedAt,
      context: { privateField: "DO_NOT_PROJECT" },
      metadata: { privateField: "DO_NOT_PROJECT" },
    });
    h.seed(`${collection}/workspace-b`, {
      businessId: b.id,
      name: "TENANT_B_SECRET",
      serviceName: "TENANT_B_SECRET",
      state: "TENANT_B_SECRET",
      phone: "922222222222",
      items: [{ name: "TENANT_B_SECRET" }],
      updatedAt,
    });
    const records = await workspace.listWorkspaceRecords(a.id, collection);
    assert.ok(records.length);
    assert.ok(records.every((record) => record.businessId === a.id));
    assert.ok(records.some((record) => record.id === "workspace-a"));
    assert.ok(
      records.every(
        (record) => record.id !== "forged-id" && record.id !== "workspace-b",
      ),
    );
    assert.ok(!JSON.stringify(records).includes("TENANT_B_SECRET"));
    assert.ok(!JSON.stringify(records).includes("DO_NOT_PROJECT"));
    assert.ok(
      records.every(
        (record) =>
          record.updatedAt === null || typeof record.updatedAt === "string",
      ),
    );
    const tenantB = await workspace.listWorkspaceRecords(b.id, collection);
    assert.ok(
      tenantB.every(
        (record) => record.businessId === b.id && record.id !== "workspace-a",
      ),
    );
  }
  const workspaceStats = await workspace.getWorkspaceStats(a.id);
  assert.deepEqual(workspaceStats, {
    catalog: 1,
    orders: 2,
    bookings: 2,
    conversations: 2,
    customers: 1,
  });
  assert.equal((await workspace.getWorkspaceStats(b.id)).customers, 1);
  const activity = await workspace.getRecentActivity(a.id);
  assert.equal(activity.length, 4);
  assert.ok(
    activity.every(
      (record) => record.businessId === a.id && record.id === "workspace-a",
    ),
  );
  assert.ok(!JSON.stringify(activity).includes("TENANT_B_SECRET"));
  assert.equal(workspace.isWorkspaceCollection("payments"), false);
  assert.equal(workspace.isWorkspaceCollection("businesses"), false);
  await assert.rejects(
    workspace.listWorkspaceRecords(a.id, "businesses"),
    /Unsupported/,
  );
  await assert.rejects(workspace.listWorkspaceRecords("../bad", "customers"));
  await assert.rejects(
    workspace.listWorkspaceRecords("missing-business", "orders"),
    /not found/,
  );
  await assert.rejects(
    workspace.getWorkspaceStats("missing-business"),
    /not found/,
  );
  await assert.rejects(
    admin.updateBusiness(a.id, { ...base, businessId: b.id }),
    /cannot be changed/,
  );
  await assert.rejects(
    admin.updateCatalogItem(a.id, item.id, { ...itemInput, businessId: b.id }),
    /cannot be changed/,
  );
  await assert.rejects(admin.createCatalogItem("../bad", itemInput));
  await assert.rejects(admin.updateCatalogItem(a.id, "../bad", itemInput));
  for (const input of [
    { ...base, businessId: "Bad Slug" },
    { ...base, businessId: "ok", vertical: "unknown" },
    { ...base, businessId: "ok", active: "yes" },
    { ...base, businessId: "ok", name: "" },
    { ...base, businessId: "ok", settings: "[]" },
    { ...base, businessId: "ok", whatsappPhoneNumberId: "123 / 456" },
  ])
    await assert.rejects(admin.createBusiness(input));
  for (const patch of [
    { price: -1 },
    { price: "NaN" },
    { price: "" },
    { price: 1.234 },
    { metadata: "{bad" },
    { metadata: { durationMinutes: 0 } },
    { metadata: { aliases: "wrong" } },
    { metadata: { stock: -1 } },
    { available: "yes" },
    { type: "unknown" },
  ])
    await assert.rejects(
      admin.updateCatalogItem(a.id, item.id, { ...itemInput, ...patch }),
    );
  await assert.rejects(
    admin.updateCatalogItem(a.id, item.id, {
      ...itemInput,
      metadata: JSON.parse('{"__proto__":{"polluted":true}}'),
    }),
  );
  const med = await admin.createCatalogItem(b.id, {
    ...itemInput,
    type: "product",
    metadata: { otcEligible: true, prescriptionRequired: false },
  });
  assert.equal(med.metadata.otc, true);
  assert.equal(med.metadata.requiresPrescription, false);
  const rx = await admin.updateCatalogItem(b.id, med.id, {
    ...itemInput,
    type: "product",
    metadata: { otcEligible: true, prescriptionRequired: true },
  });
  assert.equal(rx.metadata.otc, false);
  await assert.rejects(
    admin.deleteCatalogItem(a.id, item.id, "yes"),
    /Type DELETE/,
  );
  await admin.deleteCatalogItem(a.id, item.id, "DELETE");
  assert.equal((await admin.listCatalog(a.id)).length, 0);
  assert.equal(h.read(`businesses/${b.id}/catalog/${item.id}`).price, 777);
  assert.equal(h.read("orders/a").businessId, a.id);
  console.log(
    "PASS: admin create/update/toggle; catalog CRUD/availability/confirmed delete; tenant/path/ID isolation; scoped stats/workspace lists/activity/customer counts; projection/collection validation; metadata/JSON/price validation; Meds mapping. No live services.",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
