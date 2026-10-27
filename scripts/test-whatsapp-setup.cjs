/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const { createHarness, demoBusiness } = require('./messaging-test-helpers.cjs');

async function main() {
  const envKeys = ['NODE_ENV', 'MESSAGING_SERVICE_SECRET', 'WHATSAPP_SETUP_ALLOW_MANUAL_TEST', 'WHATSAPP_SETUP_LIVE_TESTS', 'WHATSAPP_TOKEN_SECRET_NAMES', 'WHATSAPP_TOKEN_SECRET_BINDINGS', 'WHATSAPP_SETUP_TEST_RECIPIENTS', 'SETUP_TEST_TOKEN'];
  const previous = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  const originalFetch = global.fetch;
  try {
    process.env.NODE_ENV = 'production';
    process.env.MESSAGING_SERVICE_SECRET = 'wizard-dashboard-test-secret-'.repeat(3);
    process.env.WHATSAPP_SETUP_ALLOW_MANUAL_TEST = 'false';
    process.env.WHATSAPP_SETUP_LIVE_TESTS = 'false';
    const h = createHarness();
    for (const id of ['setup-a', 'setup-b', 'setup-c']) h.seed(`businesses/${id}`, { ...demoBusiness, whatsappPhoneNumberId: id.toUpperCase() });
    const e = h.load('lib/subscriptions/entitlements.ts');
    const setup = h.load('lib/whatsapp/setup-service.ts');
    const writesBeforeDiagnostic = h.writes.length;
    assert.equal((await h.load('app/api/test-firestore/route.ts').GET()).status, 404);
    assert.equal(h.writes.length, writesBeforeDiagnostic, 'production diagnostic performs no database writes');
    const runtime = h.load('lib/whatsapp/runtime-account.ts');
    const api = h.load('app/api/businesses/[businessId]/whatsapp/setup/route.ts');
    const { signIntegrationAccess } = h.load('lib/integration/access.ts');
    const token = await signIntegrationAccess(process.env.MESSAGING_SERVICE_SECRET, { kind: 'business', businessId: 'setup-a' }, Date.now(), 'tany-dashboard-v1');
    const origin = 'https://dashboard.test';
    const req = (id, body, source = origin) => new NextRequest(`${origin}/api/businesses/${id}/whatsapp/setup`, {
      method: body ? 'POST' : 'GET', headers: { cookie: `__Host-tany-dashboard=${token}`, origin: source, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const ctx = id => ({ params: Promise.resolve({ businessId: id }) });
    assert.equal((await api.GET(req('setup-a'), ctx('setup-a'))).status, 200, 'Pro can open wizard');
    assert.equal((await api.GET(req('setup-b'), ctx('setup-b'))).status, 401, 'foreign tenant cannot open wizard');
    for (const [plan, status] of [['basic', 'active'], ['standard', 'active'], ['pro', 'cancelled'], ['pro', 'expired']]) {
      await e.assignDemoSubscription('setup-a', plan, status);
      for (const method of ['GET', 'POST']) {
        const response = await api[method](req('setup-a', method === 'POST' ? { action: 'activate', businessId: 'setup-b', status: 'connected' } : undefined), ctx('setup-a'));
        assert.equal(response.status, 403);
        assert.equal((await response.json()).code, 'UPGRADE_REQUIRED');
      }
    }
    await e.assignDemoSubscription('setup-a', 'pro');
    global.fetch = async () => { throw new Error('Unexpected live request'); };
    const details = { setupType: 'existing', displayName: 'Tany Eats', displayPhone: '+919123456789', phoneNumberId: '10001', wabaId: '20001', tokenSecretName: 'SETUP_TEST_TOKEN', businessId: 'setup-b', accessToken: 'DO-NOT-STORE', status: 'connected' };
    assert.equal((await api.POST(req('setup-a', { action: 'save', details }, 'https://attacker.test'), ctx('setup-a'))).status, 403);
    let response = await api.POST(req('setup-a', { action: 'save', details }), ctx('setup-a'));
    assert.equal(response.status, 200);
    let account = (await response.json()).account;
    assert.equal(account.businessId, 'setup-a');
    assert.equal(account.status, 'pending');
    assert.equal(account.setupStep, 3);
    assert.equal(account.testPassed, false);
    assert.equal(h.read('whatsapp_accounts/setup-a').accessToken, undefined);
    assert.equal(await runtime.automationAccountReady('setup-a', '10001'), false);
    await assert.rejects(setup.activateWhatsAppSetup('setup-a'), /successful connection test/);
    await assert.rejects(setup.saveWhatsAppSetup('setup-b', details), /another business/);
    // Existing legacy mappings must also block claims.
    h.seed('businesses/legacy', { ...demoBusiness, whatsappPhoneNumberId: '90001' });
    await assert.rejects(setup.saveWhatsAppSetup('setup-b', { ...details, phoneNumberId: '90001' }), /another business/);
    const admin = h.load('lib/admin/services.ts');
    await assert.rejects(admin.updateBusiness('setup-b', { ...demoBusiness, settings: {}, whatsappPhoneNumberId: '10001' }), /another business/);
    const assisted = await setup.saveWhatsAppSetup('setup-b', { setupType: 'new', displayName: 'New shop', displayPhone: '+919888888888', businessName: 'Tany Shop' });
    assert.equal(assisted.status, 'pending');
    assert.equal(assisted.setupType, 'new');
    assert.equal(assisted.phoneNumberId, '');
    await assert.rejects(setup.testWhatsAppSetup('setup-b', {}), /Tany will help/);
    await assert.rejects(setup.activateWhatsAppSetup('setup-b'), /successful connection test/);
    await assert.rejects(setup.testWhatsAppSetup('setup-a', {}), /not configured/);
    assert.equal(h.read('whatsapp_accounts/setup-a').status, 'error');
    await assert.rejects(setup.testWhatsAppSetup('setup-a', { mode: 'manual_test' }), /requires Tany approval/);
    process.env.WHATSAPP_SETUP_ALLOW_MANUAL_TEST = 'true';
    account = await setup.testWhatsAppSetup('setup-a', { mode: 'manual_test' });
    assert.equal(account.testPassed, true);
    assert.equal(account.validationMode, 'manual_test');
    assert.equal(account.setupStep, 5);
    assert.ok(h.writes.some(w => w.data?.status === 'testing'), 'testing transition persisted');
    await e.assignDemoSubscription('setup-a', 'pro', 'cancelled');
    await assert.rejects(setup.activateWhatsAppSetup('setup-a'), e.EntitlementError);
    await e.assignDemoSubscription('setup-a', 'pro');
    h.seed('whatsapp_accounts/setup-a', { ...h.read('whatsapp_accounts/setup-a'), testedAt: h.Timestamp.fromMillis(Date.now() - 16 * 60000) });
    await assert.rejects(setup.activateWhatsAppSetup('setup-a'), /successful connection test/);
    await setup.testWhatsAppSetup('setup-a', { mode: 'manual_test' });
    account = await setup.activateWhatsAppSetup('setup-a');
    assert.equal(account.status, 'connected');
    assert.equal(h.read('businesses/setup-a').whatsappPhoneNumberId, '10001');
    const overview = await h.load('lib/admin/whatsapp-service.ts').getWhatsAppOverview('setup-a');
    assert.equal(overview.connectionStatus, 'connected');
    assert.equal(overview.displayName, 'Tany Eats');
    assert.equal(overview.connectedNumber, '+919123456789');
    assert.equal(await runtime.automationAccountReady('setup-a', '10001'), true);
    await assert.rejects(setup.saveWhatsAppSetup('setup-a', details), /Disconnect/);
    await setup.disconnectWhatsAppSetup('setup-a');
    assert.equal(await runtime.automationAccountReady('setup-a', '10001'), false);
    // Live validation and message sends are exercised with mocked fetch only.
    process.env.WHATSAPP_SETUP_LIVE_TESTS = 'true';
    process.env.WHATSAPP_TOKEN_SECRET_NAMES = 'SETUP_TEST_TOKEN';
    process.env.WHATSAPP_TOKEN_SECRET_BINDINGS = JSON.stringify({ 'setup-a': 'SETUP_TEST_TOKEN' });
    process.env.SETUP_TEST_TOKEN = 'private-provider-token-sentinel';
    process.env.WHATSAPP_SETUP_TEST_RECIPIENTS = '919777777777';
    const calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url, options });
      assert.equal(options.headers.Authorization, 'Bearer private-provider-token-sentinel');
      assert.ok(!url.includes('private-provider-token-sentinel'));
      assert.equal(h.read('whatsapp_accounts/setup-a').status, 'testing');
      return { ok: true, json: async () => options.method === 'POST' ? { messages: [{ id: 'wamid.mock-test' }] } : { data: [{ id: '10001', display_phone_number: '+91 91234 56789' }] } };
    };
    account = await setup.testWhatsAppSetup('setup-a', { mode: 'live' });
    assert.equal(account.validationMode, 'live');
    assert.equal(calls.length, 1, 'read-only validation does not send');
    await assert.rejects(setup.testWhatsAppSetup('setup-a', { sendTest: true, recipient: '919666666666' }), /not enabled/);
    assert.equal(calls.filter(c => c.options.method === 'POST').length, 0);
    account = await setup.testWhatsAppSetup('setup-a', { sendTest: true, recipient: '919777777777' });
    assert.equal(calls.filter(c => c.options.method === 'POST').length, 1);
    assert.equal(account.testPassed, true);
    account = await setup.activateWhatsAppSetup('setup-a');
    assert.equal(await runtime.sendingAccessToken('10001'), 'private-provider-token-sentinel');
    const serialized = JSON.stringify({ account, stored: h.read('whatsapp_accounts/setup-a') });
    assert.ok(!serialized.includes('private-provider-token-sentinel'));
    assert.ok(!serialized.includes('DO-NOT-STORE'));
    await setup.disconnectWhatsAppSetup('setup-a');
    global.fetch = async () => ({ ok: true, json: async () => ({ data: [{ id: '99999', display_phone_number: '+919123456789' }] }) });
    await assert.rejects(setup.testWhatsAppSetup('setup-a', {}), /could not be verified/);
    assert.equal(h.read('whatsapp_accounts/setup-a').status, 'error');
    await assert.rejects(setup.activateWhatsAppSetup('setup-a'), /successful connection test/);
    // Duplicate tests cannot send twice; cancelled in-flight results cannot reactivate.
    let release;
    let started;
    const begun = new Promise(resolve => { started = resolve; });
    global.fetch = () => { started(); return new Promise(resolve => { release = resolve; }); };
    const inFlight = setup.testWhatsAppSetup('setup-a', {});
    await begun;
    await assert.rejects(setup.testWhatsAppSetup('setup-a', {}), /being tested/);
    await setup.disconnectWhatsAppSetup('setup-a');
    release({ ok: true, json: async () => ({ data: [{ id: '10001', display_phone_number: '+919123456789' }] }) });
    await assert.rejects(inFlight, /changed/);
    assert.equal(h.read('whatsapp_accounts/setup-a').status, 'disconnected');
    await setup.saveWhatsAppSetup('setup-a', { ...details, phoneNumberId: '10002' });
    await assert.rejects(runtime.sendingAccessToken('10001'), /not active/, 'old routing must not fall back to a global token');
    // Simultaneous claims serialize on the unique phone reservation.
    const concurrent = await Promise.allSettled([
      setup.saveWhatsAppSetup('setup-b', { ...details, phoneNumberId: '10003' }),
      setup.saveWhatsAppSetup('setup-c', { ...details, phoneNumberId: '10003' }),
    ]);
    assert.equal(concurrent.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(concurrent.filter(r => r.status === 'rejected').length, 1);
    assert.equal(h.read('whatsapp_accounts/setup-b').status, 'pending');
    assert.equal(h.sends.length, 0);
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
  console.log('PASS: entitled wizard/API, existing and assisted setup, unique mappings, safe manual/live tests, state transitions, fresh successful test before activation, secret isolation and tenant protection.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
