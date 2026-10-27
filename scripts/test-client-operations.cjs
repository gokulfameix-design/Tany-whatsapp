/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const { createHarness, demoBusiness } = require('./messaging-test-helpers.cjs');

async function main() {
  const keys = ['NODE_ENV', 'MESSAGING_SERVICE_SECRET', 'META_ACCESS_TOKEN', 'META_APP_SECRET'];
  const beforeEnv = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const oldFetch = global.fetch;
  process.env.NODE_ENV = 'production';
  process.env.MESSAGING_SERVICE_SECRET = 'client-dashboard-scope-test-'.repeat(3);
  process.env.META_ACCESS_TOKEN = 'operator-secret-sentinel';
  try {
    const h = createHarness({ seedFixtures: false });
    const stamp = h.Timestamp.fromMillis(Date.now() - 1000);
    for (const id of ['a', 'b', 'c']) {
      h.seed(`businesses/${id}`, { ...demoBusiness, name: `Business ${id}`, whatsappPhoneNumberId: id === 'a' ? '111111' : id === 'b' ? '222222' : '333333', settings: { whatsapp: { connectionStatus: id === 'c' ? 'disconnected' : 'connected', accessToken: 'NEVER_EXPOSE' } } });
      h.seed(`customers/${id}_919999999999`, { businessId: id, phone: '919999999999', name: `Customer ${id}`, uid: 'PRIVATE_UID', lastInteractionAt: stamp });
      h.seed(`conversations/${id}-conversation`, { businessId: id, customerPhone: '919999999999', state: 'eats_start', status: 'active', context: { orderId: 'keep-this-order' }, updatedAt: stamp });
      h.seed(`messages/${id}-incoming`, { businessId: id, customerPhone: '919999999999', direction: 'incoming', messageId: `wamid.${id}.in`, text: `hello-${id}`, type: 'text', createdAt: stamp, processingStatus: 'processed' });
      h.seed(`templates/template-${id}`, { businessId: id, name: `welcome_${id}`, language: 'en', status: 'approved', body: 'Hello {{1}}', updatedAt: stamp });
    }
    const { signIntegrationAccess } = h.load('lib/integration/access.ts');
    const { resolveDashboardSession } = h.load('lib/admin/dashboard-access.ts');
    const secret = process.env.MESSAGING_SERVICE_SECRET;
    const token = await signIntegrationAccess(secret, { kind: 'business', businessId: 'a' }, Date.now(), 'tany-dashboard-v1');
    const adminToken = await signIntegrationAccess(secret, { kind: 'directory' }, Date.now(), 'tany-dashboard-v1');
    assert.deepEqual(await resolveDashboardSession(secret, token), { role: 'business', businessId: 'a' });
    assert.equal(await resolveDashboardSession(secret, token + 'changed'), null);
    const integrationToken = await signIntegrationAccess(secret, { kind: 'business', businessId: 'a' });
    assert.equal(await resolveDashboardSession(secret, integrationToken), null, 'API credentials cannot become dashboard sessions');
    const api = h.load('app/api/dashboard/operations/route.ts');
    const req = (query = '', body, cookie = token, origin = 'https://dashboard.test') => new NextRequest(`https://dashboard.test/api/dashboard/operations${query}`, {
      method: body ? 'POST' : 'GET', headers: { cookie: `__Host-tany-dashboard=${cookie}`, origin, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let response = await api.GET(req('?section=inbox'));
    assert.equal(response.status, 200);
    let data = (await response.json()).data;
    assert.equal(data.businessId, 'a');
    assert.equal(data.audience, 'client');
    for (const collection of ['messages', 'contacts', 'templates', 'campaigns', 'conversations']) assert.ok(data[collection].every(row => row.businessId === 'a'));
    assert.equal(data.conversations[0].name, 'Customer a');
    assert.equal(data.conversations[0].unread, 1);
    assert.deepEqual(data.accounts, []);
    assert.deepEqual(data.setupRequests, []);
    for (const secret of ['NEVER_EXPOSE', 'PRIVATE_UID', '111111', 'operator-secret-sentinel', 'hello-b']) assert.ok(!JSON.stringify(data).includes(secret));
    assert.equal((await api.GET(req('?businessId=b'))).status, 403);
    assert.equal((await api.GET(req('', undefined, 'bad'))).status, 401);
    for (const section of ['webhook-health', 'whatsapp-accounts', 'setup-requests']) assert.equal((await api.GET(req(`?section=${section}`))).status, 403);
    const post = (action, input, query = '') => api.POST(req(query, { action, input, businessId: 'b' }));
    const writesBefore = h.writes.length;
    assert.equal((await post('handoff', { id: 'b-conversation', human: true })).status, 404);
    assert.equal((await api.POST(req('', { action: 'read', input: { id: 'a-conversation' } }, token, 'https://attacker.test'))).status, 403);
    assert.equal(h.writes.length, writesBefore);
    assert.equal((await post('read', { id: 'a-conversation' })).status, 200);
    response = await api.GET(req('?section=inbox'));
    assert.equal((await response.json()).data.conversations[0].unread, 0);
    assert.equal((await post('send', { id: 'a-conversation', text: 'Hello', requestId: 'operator_request_0001' })).status, 409);
    assert.equal((await post('handoff', { id: 'a-conversation', human: true })).status, 200);
    const send = { id: 'a-conversation', text: 'Human reply', customerPhone: '918888888888', requestId: 'operator_request_0001' };
    assert.equal((await post('send', send)).status, 200);
    assert.equal(h.sends.length, 1);
    assert.equal(h.sends[0].to, '919999999999', 'recipient is resolved from the scoped conversation');
    assert.equal(h.sends[0].phoneNumberId, '111111');
    assert.deepEqual(h.read('conversations/a-conversation').context, { orderId: 'keep-this-order' });
    assert.equal((await post('send', send)).status, 200);
    assert.equal(h.sends.length, 1, 'duplicate send request cannot call Meta twice');
    assert.equal((await post('send', { ...send, text: 'Changed payload' })).status, 409);
    const receipts = h.load('lib/admin/delivery-receipts.ts');
    assert.equal(receipts.receiptStatus('failed', 'sent'), 'failed');
    assert.equal(receipts.receiptStatus('read', 'failed'), 'read');
    const event = status => ({ id: 'wamid.out-1', status, timestamp: String(Math.floor(Date.now()/1000)) });
    await receipts.recordDeliveryReceipts('a', [event('delivered'), event('read'), event('sent')]);
    response = await api.GET(req('?section=message-status'));
    data = (await response.json()).data;
    assert.equal(data.messages.find(m => m.direction === 'outgoing').status, 'read');
    const metrics = h.load('lib/admin/operations-metrics.ts').operationsMetrics(data);
    assert.equal(metrics.today, 2);
    assert.equal(metrics.incoming, 1);
    assert.equal(metrics.outgoing, 1);
    assert.equal(metrics.delivered, 1);
    assert.equal(metrics.read, 1);
    assert.equal(metrics.handoffs, 1);
    // Cross-tenant receipts with the same provider ID cannot update this business.
    await receipts.recordDeliveryReceipts('b', [event('failed')]);
    assert.equal((await h.load('lib/admin/operations-service.ts').getOperationsData('a')).messages.find(m => m.direction === 'outgoing').status, 'read');
    h.seed('messages/a-incoming', { ...h.read('messages/a-incoming'), createdAt: h.Timestamp.fromMillis(Date.now()-25*3600000) });
    assert.equal((await post('send', { ...send, requestId: 'operator_request_0002' })).status, 409);
    assert.equal((await post('send', { ...send, templateId: 'template-b', parameters: ['Name'], requestId: 'operator_request_0003' })).status, 400);
    const calls = [];
    global.fetch = async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ messages: [{ id: 'wamid.template' }] }) }; };
    response = await post('send', { ...send, templateId: 'template-a', parameters: ['Tany customer'], requestId: 'operator_request_0004' });
    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    const payload = JSON.parse(calls[0].options.body);
    assert.equal(payload.type, 'template');
    assert.equal(payload.template.name, 'welcome_a');
    assert.equal(payload.template.components[0].parameters[0].text, 'Tany customer');
    assert.equal((await api.GET(req('?businessId=c', undefined, adminToken))).status, 403, 'disconnected requires setup');
    const e = h.load('lib/subscriptions/entitlements.ts');
    for (const [plan,status] of [['basic','active'],['standard','active'],['pro','cancelled'],['pro','expired']]) {
      await e.assignDemoSubscription('a', plan, status);
      response = await api.GET(req());
      assert.equal(response.status, 403);
      assert.equal((await response.json()).code, 'UPGRADE_REQUIRED');
    }
    h.seed('whatsapp_accounts/b', { businessId: 'b', setupType: 'new', displayName: 'Pending shop', displayPhone: '+919888888888', status: 'pending', createdAt: stamp, tokenSecretName: 'PRIVATE_SECRET_REFERENCE' });
    await e.assignDemoSubscription('b', 'pro', 'cancelled');
    const all = await h.load('lib/admin/operations-service.ts').getOperationsData();
    assert.ok(all.accounts.some(account => account.businessId === 'b'), 'Super Admin retains all-business operations');
    assert.equal(all.setupRequests.find(request => request.businessId === 'b').displayName, 'Pending shop');
    assert.ok(!JSON.stringify(all).includes('PRIVATE_SECRET_REFERENCE'));
    // Receipt events use the existing verified raw webhook path; the router is not invoked.
    process.env.META_APP_SECRET = 'receipt-hmac-test-secret';
    const raw = JSON.stringify({ entry: [{ changes: [{ value: { metadata: { phone_number_id: '111111' }, statuses: [event('read')] } }] }] });
    const signature = 'sha256=' + require('node:crypto').createHmac('sha256', process.env.META_APP_SECRET).update(raw, 'utf8').digest('hex');
    const webhook = h.load('app/api/whatsapp/webhook/route.ts');
    assert.equal((await webhook.POST(new NextRequest('https://dashboard.test/api/whatsapp/webhook', { method: 'POST', headers: { 'x-hub-signature-256': signature }, body: raw }))).status, 200);
    assert.equal(h.sends.length, 1);
    // Main-app handoff is scoped, short-lived, single-use and contains no provider secrets.
    await e.assignDemoSubscription('a', 'pro');
    const integration = h.load('app/api/integration/v1/businesses/[businessId]/[resource]/route.ts');
    const handoffRequest = new Request('https://dashboard.test/api/integration/v1/businesses/a/workspace', { method: 'POST', headers: { authorization: `Bearer ${integrationToken}` } });
    response = await integration.POST(handoffRequest, { params: Promise.resolve({ businessId: 'a', resource: 'workspace' }) });
    assert.equal(response.status, 200);
    const path = (await response.json()).data.path;
    assert.match(path, /^\/api\/dashboard\/connect\?token=[a-f0-9]{64}$/);
    const connect = h.load('app/api/dashboard/connect/route.ts');
    response = await connect.GET(new NextRequest(`https://dashboard.test${path}`));
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/business/a');
    assert.match(response.headers.get('set-cookie'), /HttpOnly/);
    assert.match(response.headers.get('set-cookie'), /Secure/);
    const cookie = response.cookies.get('__Host-tany-dashboard').value;
    assert.deepEqual(await resolveDashboardSession(secret, cookie), { role: 'business', businessId: 'a' });
    assert.equal((await connect.GET(new NextRequest(`https://dashboard.test${path}`))).status, 400);
    const handoffs = h.load('lib/admin/workspace-handoff.ts');
    const expiredPath = (await handoffs.createWorkspaceHandoff('a')).path;
    const expiredToken = new URL(`https://dashboard.test${expiredPath}`).searchParams.get('token');
    const expiredId = require('node:crypto').createHash('sha256').update(expiredToken).digest('hex');
    h.seed(`dashboard_handoffs/${expiredId}`, { ...h.read(`dashboard_handoffs/${expiredId}`), expiresAt: h.Timestamp.fromMillis(Date.now()-1) });
    assert.equal((await connect.GET(new NextRequest(`https://dashboard.test${expiredPath}`))).status, 400);
  } finally {
    global.fetch = oldFetch;
    for (const [key,value] of Object.entries(beforeEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
  console.log('PASS: session-derived client scope, admin split, entitlement/setup states, scoped inbox/contacts/templates, human replies, read markers, reply-window/template enforcement, idempotent sends and delivery receipts; flow context unchanged.');
}
main().catch(error => { console.error(error); process.exitCode=1; });
