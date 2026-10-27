/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { NextRequest } = require('next/server');
const { createHarness, demoBusiness } = require('./messaging-test-helpers.cjs');
async function main() {
  const h = createHarness({ seedFixtures: false, entitledBusinesses: false });
  const stamp = h.Timestamp.now();
  for (const vertical of ['motos', 'eats', 'salon']) {
    const id = `demo-${vertical}`;
    h.seed(`businesses/${id}`, { ...demoBusiness, name: `Demo ${vertical}`, vertical, settings: {} });
    h.seed(`subscriptions/${id}`, { businessId: id, plan: 'basic', status: 'cancelled' });
    h.seed(`conversations/${id}-chat`, { businessId: id, customerPhone: '919999999999', status: 'active', context: { orderId: 'preserved' }, updatedAt: stamp });
  }
  const { proxy } = h.load('proxy.ts');
  for (const root of ['/admin', '/business/demo-motos', '/business/demo-eats', '/business/demo-salon']) {
    for (const section of ['', '/inbox', '/webhook-health', '/whatsapp-accounts']) assert.equal((await proxy(new NextRequest(`https://console.test${root}${section}`))).status, 200);
  }
  const api = h.load('app/api/admin/operations/route.ts');
  const req = (id, body, origin = 'https://console.test') => new NextRequest(`https://console.test/api/admin/operations?businessId=${id}`, { method: body ? 'POST' : 'GET', headers: { origin, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  for (const id of ['demo-motos', 'demo-eats', 'demo-salon']) {
    const response = await api.GET(req(id));
    assert.equal(response.status, 200);
    const data = (await response.json()).data;
    assert.equal(data.businessId, id);
    assert.equal(data.audience, 'admin');
    assert.ok(data.conversations.every(c => c.businessId === id));
  }
  assert.equal((await api.POST(req('demo-eats', { action: 'handoff', input: { id: 'demo-eats-chat', human: true } }))).status, 200);
  assert.equal(h.read('conversations/demo-eats-chat').status, 'handed_off');
  assert.deepEqual(h.read('conversations/demo-eats-chat').context, { orderId: 'preserved' });
  assert.equal((await api.POST(req('demo-motos', { action: 'read', input: { id: 'demo-eats-chat' } }))).status, 404);
  assert.equal((await api.POST(req('demo-eats', { action: 'read', input: { id: 'demo-eats-chat' } }, 'https://foreign.test'))).status, 403);
  const page = fs.readFileSync('app/admin/components/operations-page.tsx', 'utf8');
  assert.ok(!/hasEntitlement|clientConnectionReady|AutomationAccessCard/.test(page));
  const switcher = fs.readFileSync('app/admin/components/workspace-switcher.tsx', 'utf8');
  assert.ok(switcher.includes('business={business'));
  assert.ok(!switcher.includes('ClientWorkspaceMenu'));
  const verticals = h.load('lib/messaging/vertical-config.ts').verticalConfig;
  assert.equal(Object.keys(verticals).length, 12);
  assert.ok(fs.readFileSync('app/page.tsx', 'utf8').includes('redirect("/admin")'));
  console.log('PASS: standalone admin and three demo workspaces open without login, entitlement or connection; all 12 products, scoped reads/actions and origin checks preserved.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
