/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { createHarness } = require('./messaging-test-helpers.cjs');
async function main() {
  const h = createHarness({ seedFixtures: false, entitledBusinesses: false });
  const { updateAccountMetadata: save } = h.load('lib/admin/account-metadata.ts');
  const { getOperationsData } = h.load('lib/admin/operations-service.ts');
  for (const id of ['a', 'b']) h.seed(`businesses/${id}`, { name: id, vertical: 'eats', active: true, whatsappPhoneNumberId: id === 'a' ? '111' : '222', settings: {} });
  const initial = { businessId: 'a', vertical: 'eats', displayName: 'Demo Restaurant', displayPhone: '+919876543210', phoneNumberId: '111', wabaId: '333', status: 'connected', revision: 4, testPassed: true, validationMode: 'live', testedAt: h.Timestamp.fromMillis(Date.now()), tokenSecretName: 'private-secret-reference', accessToken: 'private-token', catalogEnabled: true };
  h.seed('whatsapp_accounts/restaurant', initial);
  h.seed('whatsapp_phone_mappings/111', { businessId: 'a', accountId: 'restaurant' });
  h.seed('customers/existing', { businessId: 'a', name: 'History' });
  const input = { displayName: 'Real Restaurant', displayPhone: '+91 98765 43210', phoneNumberId: '444', wabaId: '555', status: 'connected' };
  for (const invalid of [{ phoneNumberId: '' }, { wabaId: '' }, { phoneNumberId: 'abc' }, { status: 'testing' }, { accessToken: 'changed' }]) {
    await assert.rejects(save('a', 'restaurant', { ...input, ...invalid }));
    assert.equal(h.read('whatsapp_accounts/restaurant').phoneNumberId, '111');
  }
  await assert.rejects(save('b', 'restaurant', input));
  await assert.rejects(save('a', 'missing', input));
  await assert.rejects(save('a/other', 'restaurant', input));
  await assert.rejects(save('a', 'restaurant', { ...input, phoneNumberId: '222' }));
  h.seed('whatsapp_accounts/duplicate', { businessId: 'a', phoneNumberId: '666' });
  await assert.rejects(save('a', 'restaurant', { ...input, phoneNumberId: '666' }));
  const result = await save('a', 'restaurant', input);
  assert.equal(result.status, 'pending');
  const updated = h.read('whatsapp_accounts/restaurant');
  assert.equal(updated.phoneNumberId, '444'); assert.equal(updated.wabaId, '555');
  assert.equal(updated.displayName, input.displayName); assert.equal(updated.displayPhone, '+919876543210');
  assert.equal(updated.testPassed, false); assert.equal(updated.testedAt, null); assert.equal(updated.revision, 5);
  assert.equal(updated.tokenSecretName, initial.tokenSecretName); assert.equal(updated.accessToken, initial.accessToken); assert.equal(updated.catalogEnabled, true);
  assert.equal(h.read('businesses/a').whatsappPhoneNumberId, '444');
  assert.equal(h.read('businesses/b').whatsappPhoneNumberId, '222');
  assert.equal(h.read('whatsapp_phone_mappings/111'), undefined);
  assert.equal(h.read('whatsapp_phone_mappings/444').accountId, 'restaurant');
  assert.equal(h.read('customers/existing').name, 'History');
  const data = await getOperationsData('a');
  const card = data.accounts.find(a => a.accountId === 'restaurant');
  assert.equal(card.phoneNumberId, '444'); assert.equal(card.wabaId, '555'); assert.equal(card.status, 'Configured · unverified');
  assert.ok(data.accounts.every(a => a.businessId === 'a'));
  assert.ok(!JSON.stringify(data).includes('private-'));
  h.seed('whatsapp_accounts/restaurant', { ...initial });
  const verified = await save('a', 'restaurant', { ...input, phoneNumberId: '111', wabaId: '333' });
  assert.equal(verified.status, 'connected');
  assert.equal(h.read('whatsapp_accounts/restaurant').testPassed, true);
  // Legacy Demo Restaurant has only profile configuration, with no setup/account doc.
  h.seed('businesses/demo-restaurant', { name: 'Demo Restaurant', vertical: 'eats', active: true, whatsappPhoneNumberId: 'DEMO_PHONE_ID', settings: { whatsapp: { connectedNumber: '+919876543210', wabaId: '777' } } });
  const legacy = (await getOperationsData('demo-restaurant')).accounts[0];
  assert.equal(legacy.accountId, 'demo-restaurant', 'configured legacy accounts must have an editable target even with demo IDs');
  assert.equal(h.read('subscriptions/demo-restaurant'), undefined, 'no Pro subscription is needed');
  await assert.rejects(save('demo-restaurant', 'wrong-id', input));
  await assert.rejects(save('demo-restaurant', 'demo-restaurant', { ...input, wabaId: '' }));
  await assert.rejects(save('demo-restaurant', 'demo-restaurant', { ...input, phoneNumberId: '222' }));
  assert.equal(h.read('whatsapp_accounts/demo-restaurant'), undefined);
  await save('demo-restaurant', 'demo-restaurant', { ...input, phoneNumberId: '888', wabaId: '999' });
  const migrated = h.read('whatsapp_accounts/demo-restaurant');
  assert.equal(migrated.businessId, 'demo-restaurant'); assert.equal(migrated.vertical, 'eats');
  assert.equal(migrated.status, 'pending'); assert.equal(migrated.testPassed, false);
  assert.equal(migrated.tokenSecretName, undefined); assert.equal(migrated.accessToken, undefined);
  const refreshed = (await getOperationsData('demo-restaurant')).accounts[0];
  assert.equal(refreshed.accountId, legacy.accountId); assert.equal(refreshed.wabaId, '999');
  assert.equal(refreshed.phone, '+919876543210'); assert.equal(refreshed.status, 'Configured · unverified');
  await save('demo-restaurant', 'demo-restaurant', { ...input, phoneNumberId: '888', status: 'disconnected' });
  assert.equal(h.read('whatsapp_accounts/demo-restaurant').status, 'disconnected');
  h.seed('businesses/unconfigured', { name: 'Empty', vertical: 'eats', active: true, settings: {} });
  await assert.rejects(save('unconfigured', 'unconfigured', input));
  const runtime = h.load('lib/whatsapp/runtime-account.ts');
  assert.equal(await runtime.automationAccountReady('demo-restaurant', '888'), false);
  await assert.rejects(save('a', 'demo-restaurant', input, true));
  await assert.rejects(save('demo-restaurant', 'demo-restaurant', { ...input, phoneNumberId: '222' }, true));
  await assert.rejects(save('demo-restaurant', 'demo-restaurant', { ...input, wabaId: '' }, true));
  const activated = await save('demo-restaurant', 'demo-restaurant', { ...input, phoneNumberId: '888', wabaId: '999' }, true);
  assert.equal(activated.status, 'connected');
  assert.equal(h.read('whatsapp_accounts/demo-restaurant').testPassed, false, 'internal activation must not fabricate live proof');
  assert.equal(h.read('whatsapp_accounts/demo-restaurant').internalTestingActive, true);
  assert.equal(h.read('whatsapp_accounts/demo-restaurant').setupStep, 5);
  assert.ok(h.read('whatsapp_accounts/demo-restaurant').activatedAt.toMillis());
  assert.equal(h.read('whatsapp_accounts/demo-restaurant').testStatus, 'internal_manual');
  assert.equal(await runtime.automationAccountReady('demo-restaurant', '888'), true);
  assert.equal(await runtime.automationAccountReady('demo-restaurant', '999'), false);
  assert.equal((await getOperationsData('demo-restaurant')).accounts[0].internalTestingActive, true);
  const activeManual = h.read('whatsapp_accounts/demo-restaurant');
  h.seed('whatsapp_accounts/demo-restaurant', { ...activeManual, status: 'configured', testPassed: false, testedAt: null, setupStep: 1 });
  assert.equal(await runtime.automationAccountReady('demo-restaurant', '888'), true, 'configured manual account requires no wizard proof');
  for (const status of ['pending', 'disconnected', 'error', 'testing']) {
    h.seed('whatsapp_accounts/demo-restaurant', { ...activeManual, status });
    assert.equal(await runtime.automationAccountReady('demo-restaurant', '888'), false, status);
  }
  h.seed('whatsapp_accounts/demo-restaurant', activeManual);
  for (const field of ['wabaId', 'displayPhone']) {
    h.seed('whatsapp_accounts/demo-restaurant', { ...activeManual, [field]: '' });
    assert.equal(await runtime.automationAccountReady('demo-restaurant', '888'), false, field);
  }
  h.seed('whatsapp_accounts/demo-restaurant', activeManual);
  // A complete connected record with a noncanonical ID also works without any wizard fields.
  h.seed('businesses/manual', { name: 'Manual', vertical: 'eats', active: true, whatsappPhoneNumberId: '12345', settings: {} });
  const manual = { businessId: 'manual', phoneNumberId: '12345', wabaId: '67890', displayPhone: '+919876543210', status: 'connected' };
  h.seed('whatsapp_accounts/manual-record', manual);
  assert.equal(await runtime.automationAccountReady('manual', '12345'), true);
  for (const status of ['pending', 'disconnected', 'error']) {
    h.seed('whatsapp_accounts/manual-record', { ...manual, status });
    assert.equal(await runtime.automationAccountReady('manual', '12345'), false, `noncanonical ${status}`);
  }
  h.seed('whatsapp_accounts/manual-record', manual);
  assert.equal(await runtime.automationAccountReady('b', '12345'), false, 'foreign business cannot use a manual account');
  h.seed('whatsapp_accounts/foreign', { ...manual, businessId: 'b' });
  assert.equal(await runtime.automationAccountReady('manual', '12345'), false, 'ambiguous mappings fail closed');
  const flow = createHarness();
  const demo = require('./messaging-test-helpers.cjs').demoBusiness;
  flow.seed('businesses/demo-eats', { ...demo, whatsappPhoneNumberId: '12345' });
  const flowAccount = { ...manual, businessId: 'demo-eats' };
  flow.seed('whatsapp_accounts/internal-eats', flowAccount);
  const processIncoming = flow.load('lib/messaging/services/incoming-message-service.ts').processIncomingMessage;
  const business = { ...demo, id: 'demo-eats', whatsappPhoneNumberId: '12345' };
  const incoming = { from: '919999999999', id: 'wamid.manual-ready', timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: 'Hi' } };
  const routed = await processIncoming(business, incoming);
  assert.equal(routed.success, true); assert.ok(routed.structuredReply); assert.equal(routed.skipped, undefined);
  assert.equal(flow.sends.length, 1, 'connected manual account reaches normal routing and send');
  for (const status of ['pending', 'disconnected', 'error']) {
    flow.seed('whatsapp_accounts/internal-eats', { ...flowAccount, status });
    const blocked = await processIncoming(business, { ...incoming, id: `wamid.manual-${status}` });
    assert.equal(blocked.skipped, 'whatsapp_setup_inactive');
    assert.equal(flow.sends.length, 1, 'inactive records never route or send');
  }
  // Exercise the actual signed webhook, not just the orchestration helper.
  const { NextRequest } = require('next/server');
  const { dummyPayload, signedWebhookHeaders } = require('./messaging-test-helpers.cjs');
  const oldSecret = process.env.META_APP_SECRET;
  const oldInfo = console.info;
  const logs = [];
  console.info = (...args) => logs.push(args);
  try {
    for (const canonical of [true, false]) {
      for (const status of ['connected', 'configured', 'pending', 'disconnected', 'error']) {
        const webhook = createHarness();
        webhook.seed('businesses/demo-eats', { ...demo, whatsappPhoneNumberId: '12345' });
        webhook.seed(`whatsapp_accounts/${canonical ? 'demo-eats' : 'manual-account'}`, { ...flowAccount, status, setupStep: 1, testPassed: false, testedAt: null });
        const payload = dummyPayload(`wamid.manual-webhook-${canonical}-${status}`);
        payload.entry[0].changes[0].value.metadata.phone_number_id = '12345';
        logs.length = 0;
        const response = await webhook.load('app/api/whatsapp/webhook/route.ts').POST(new NextRequest('https://dashboard.test/api/whatsapp/webhook', { method: 'POST', body: JSON.stringify(payload), headers: signedWebhookHeaders(payload) }));
        assert.equal(response.status, 200);
        const result = await response.json();
        if (['connected', 'configured'].includes(status)) {
          assert.notEqual(result.skipped, 'whatsapp_setup_inactive');
          assert.ok(logs.some(entry => entry[0] === '[WA_IDENTITY_CHECK_START]'));
          assert.ok(logs.some(entry => entry[0] === '[WA_ROUTER_START]'));
          assert.equal(webhook.sends.length, 1);
        } else {
          assert.equal(result.skipped, 'whatsapp_setup_inactive');
          assert.equal(webhook.sends.length, 0);
        }
      }
    }
  } finally {
    console.info = oldInfo;
    if (oldSecret === undefined) delete process.env.META_APP_SECRET; else process.env.META_APP_SECRET = oldSecret;
  }
  console.log('PASS: account metadata validation, existing-record update, isolation, duplicates, credential preservation, safe projection and verification states.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
