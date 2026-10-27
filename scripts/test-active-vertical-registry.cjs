/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { createHarness, demoBusiness } = require("./messaging-test-helpers.cjs");

async function main() {
  const h = createHarness({ seedFixtures: false });
  const registry = h.load("lib/automations/vertical-registry.ts");
  assert.deepEqual(Object.keys(registry.verticalRegistry), ["eats", "motos", "cabs"]);
  for (const vertical of ["eats", "motos", "cabs"]) {
    const definition = registry.getVerticalDefinition(vertical);
    const templates = registry.templatesForRegisteredVertical(vertical);
    assert.ok(definition && templates.length === 10, `${vertical} has its configured templates`);
    assert.ok(templates.every(template => template.vertical === vertical), `${vertical} has no template leakage`);
    assert.ok(definition.supportedTriggers.length && definition.supportedActions.length);
  }
  assert.deepEqual(registry.templatesForRegisteredVertical("salon"), []);
  assert.ok(registry.templatesForRegisteredVertical("eats").some(t => t.name === "Start Order"));
  assert.ok(registry.templatesForRegisteredVertical("motos").some(t => t.name === "Book Test Drive"));
  assert.ok(registry.templatesForRegisteredVertical("cabs").some(t => t.name === "Driver Assigned"));
  const simulator = h.load("app/admin/components/automations/chat-simulator.ts");
  for (const vertical of ["eats", "motos", "cabs"]) {
    const scenario = simulator.previewScenarioKey(`${vertical}_welcome`, "Welcome", vertical);
    const initial = simulator.initialChat(scenario, "Demo", [], true);
    assert.ok(initial.length && initial.at(-1).actions?.length, `${vertical} preview is interactive`);
    assert.ok(simulator.continueChat(initial.at(-1).actions[0]).length > 1, `${vertical} preview remains local`);
  }
  for (const vertical of ["eats", "motos", "cabs"]) h.seed(`businesses/${vertical}`, { ...demoBusiness, vertical, name: `Demo ${vertical}` });
  const service = h.load("lib/automations/service.ts");
  await service.saveAutomation("eats", undefined, { name: "Menu", description: "", trigger: { type: "order.created" }, conditions: [], actions: [{ type: "list", text: "Choose", choices: ["Menu"] }] });
  await service.saveAutomation("motos", undefined, { name: "Lead", description: "", trigger: { type: "keyword.matched", keywords: ["car"] }, conditions: [], actions: [{ type: "text", text: "Tell us the vehicle." }] });
  await service.saveAutomation("cabs", undefined, { name: "Pickup", description: "", trigger: { type: "customer.message.received" }, conditions: [], actions: [{ type: "location", text: "Share pickup." }] });
  await assert.rejects(() => service.saveAutomation("motos", undefined, { name: "No payment", description: "", trigger: { type: "customer.message.received" }, conditions: [], actions: [{ type: "payment_link" }] }), /not available/);
  await assert.rejects(() => service.saveAutomation("cabs", undefined, { name: "No order", description: "", trigger: { type: "order.created" }, conditions: [], actions: [{ type: "text", text: "Hello" }] }), /not available/);
  console.log("PASS: three active vertical registry, scoped templates, trigger/action enforcement, local previews, and Eats compatibility.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
