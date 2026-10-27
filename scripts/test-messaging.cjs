/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const { signedWebhookHeaders, createHarness, dummyPayload, demoBusiness } = require('./messaging-test-helpers.cjs');

const eatsWelcome = 'Welcome to Tany Eats! What would you like to order?\nChicken Biriyani ₹180\nMutton Biriyani ₹250\nDosa ₹60\nIdli ₹40';
const salonWelcome = 'Sure. Which service would you like?\nHaircut, Beard Trim, Haircut + Beard, Hair Spa, or Facial.';
const motosWelcome = 'What car are you looking for? You can type model, automatic/manual, or budget.';
const batchFirst = { cabs: 'pickup', retail: 'product', ecom: 'category', garage: 'vehicle', meds: 'product', meat: 'item', expert: 'service', gaming: 'station', sport: 'activity' };
const initialState = (vertical) => batchFirst[vertical] ? `${vertical}_awaiting_${batchFirst[vertical]}` : vertical === 'eats' ? 'eats_start' : vertical === 'salon' ? 'salon_awaiting_service' : vertical === 'motos' ? 'motos_awaiting_query' : vertical + '_start';

async function main() {
  const h = createHarness();
  h.seed('businesses/demo-eats', demoBusiness);
  const { routeMessage } = h.load('lib/messaging/router.ts');
  const { verticalConfig, isTanyVertical } = h.load('lib/messaging/vertical-config.ts');
  const verticals = ['motos', 'eats', 'cabs', 'ecom', 'expert', 'gaming', 'garage', 'meat', 'meds', 'retail', 'salon', 'sport'];
  assert.deepEqual(Object.keys(verticalConfig), verticals);
  for (const vertical of verticals) {
    const result = await routeMessage({ ...demoBusiness, id: 'demo-' + vertical, vertical }, 'hello');
    assert.equal(result.vertical, vertical);
    assert.equal(result.state, initialState(vertical));
    assert.equal(result.originalText, 'hello');
    if (batchFirst[vertical]) assert.ok(result.reply.body.length > 0);
    else assert.equal(result.reply.body, vertical === 'eats' ? eatsWelcome : vertical === 'salon' ? salonWelcome : vertical === 'motos' ? motosWelcome : verticalConfig[vertical].defaultReply + ': hello');
  }
  for (const invalid of ['unknown', '__proto__', 'constructor', null, 12]) assert.equal(isTanyVertical(invalid), false);
  await assert.rejects(routeMessage({ id: 'invalid', vertical: 'unknown' }, 'hello'), /Unsupported Tany vertical/);
  for (const vertical of ['eats', 'motos', 'salon']) {
    const handler = h.load(`lib/messaging/flows/${vertical}.ts`);
    assert.equal((await handler[`handle${vertical[0].toUpperCase() + vertical.slice(1)}Message`]('hello', { business: { ...demoBusiness, id: 'demo-' + vertical, vertical } })).state, initialState(vertical));
  }

  const { GET, POST } = h.load('app/api/whatsapp/webhook/route.ts');
  const oldToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
  process.env.META_WEBHOOK_VERIFY_TOKEN = 'test-verification';
  try {
    const response = await GET(new NextRequest('http://localhost/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=test-verification&hub.challenge=12345'));
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '12345');
    assert.equal((await GET(new NextRequest('http://localhost/api/whatsapp/webhook?hub.verify_token=wrong'))).status, 403);
  } finally {
    if (oldToken === undefined) delete process.env.META_WEBHOOK_VERIFY_TOKEN;
    else process.env.META_WEBHOOK_VERIFY_TOKEN = oldToken;
  }
  const post = (body) => POST(new NextRequest('http://localhost/api/whatsapp/webhook', {
    method: 'POST', headers: signedWebhookHeaders(body), body: JSON.stringify(body),
  }));
  const menu = h.load('lib/messaging/identity-menu.ts').identityMenu('eats');
  const greeting = 'Welcome to Tany Eats at Demo Eats! Choose an option or type your order.';
  const response = await post(dummyPayload());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true, businessId: 'demo-eats', vertical: 'eats', state: 'eats_start', reply: greeting,
    structuredReply: { ...menu, body: greeting },
  });
  assert.deepEqual(h.filters.filter((entry) => entry.collection === 'businesses').map((entry) => entry.args), [
    ['whatsappPhoneNumberId', '==', 'TEST_PHONE_NUMBER_ID'], ['active', '==', true],
  ]);
  const incoming = h.read('messages/wamid.test');
  for (const key of ['businessId', 'vertical', 'customerPhone', 'messageId', 'type', 'text', 'direction', 'whatsappTimestamp', 'createdAt', 'processingStatus']) assert.ok(key in incoming, key);
  assert.equal(incoming.direction, 'incoming');
  assert.equal(incoming.processingStatus, 'processed');
  assert.equal(incoming.text, 'hello');
  const conversation = h.read('conversations/demo-eats_919999999999');
  assert.equal(conversation.state, 'eats_start');
  assert.equal(conversation.status, 'active');
  assert.deepEqual(conversation.context, {});
  assert.equal(conversation.pendingReply, greeting);
  assert.ok(h.read('customers/demo-eats_919999999999'));
  assert.equal(h.sends.length, 1);
  const outgoing = [...h.documents.values()].find((doc) => doc.direction === 'outgoing');
  assert.equal(outgoing.messageId, 'wamid.out-1');
  assert.equal(outgoing.incomingMessageId, 'wamid.test');
  assert.equal(outgoing.processingStatus, 'processed');

  const writesBefore = h.writes.length;
  assert.equal((await (await post(dummyPayload())).json()).skipped, 'duplicate_message');
  assert.equal(h.writes.length, writesBefore);
  assert.equal(h.sends.length, 1);
  const simultaneous = await Promise.all([post(dummyPayload('wamid.concurrent')), post(dummyPayload('wamid.concurrent'))]);
  const results = await Promise.all(simultaneous.map((item) => item.json()));
  assert.equal(results.filter((item) => item.skipped === 'duplicate_message').length, 1);
  assert.equal(h.sends.length, 2);

  // Pre-migration messages used random Firestore IDs and must also deduplicate.
  h.seed('messages/legacy-auto-id', { businessId: 'demo-eats', messageId: 'wamid.legacy', direction: 'incoming' });
  assert.equal((await (await post(dummyPayload('wamid.legacy'))).json()).skipped, 'duplicate_message');
  assert.equal(h.sends.length, 2);

  // Failures retain the incoming record and saved conversation; Meta can retry.
  h.failNextSend();
  const oldError = console.error;
  let failed;
  try { console.error = () => {}; failed = await post(dummyPayload('wamid.retry')); }
  finally { console.error = oldError; }
  assert.equal(failed.status, 500);
  assert.equal(h.read('messages/wamid.retry').processingStatus, 'failed');
  assert.equal(h.read('conversations/demo-eats_919999999999').pendingReply, greeting);
  assert.equal((await post(dummyPayload('wamid.retry'))).status, 200);
  assert.equal(h.read('messages/wamid.retry').processingStatus, 'processed');
  assert.equal(h.sends.length, 3);

  // A crash after storing the outgoing record must not cause a second send.
  h.seed('messages/wamid.retry', { ...h.read('messages/wamid.retry'), processingStatus: 'failed' });
  assert.equal((await post(dummyPayload('wamid.retry'))).status, 200);
  assert.equal(h.sends.length, 3);

  // WhatsApp location events remain non-text and enrich reusable context.
  const locationPayload = dummyPayload('wamid.location');
  const locationMessage = locationPayload.entry[0].changes[0].value.messages[0];
  locationMessage.type = 'location';
  delete locationMessage.text;
  locationMessage.location = { latitude: 12.97, longitude: 77.59, name: 'Home', address: 'Bengaluru' };
  assert.equal((await post(locationPayload)).status, 200);
  assert.equal(h.read('customers/demo-eats_919999999999').location.source, 'whatsapp');
  assert.equal(h.read('conversations/demo-eats_919999999999').context.location.label, 'Home');

  assert.deepEqual(await (await post({})).json(), { success: true });
  const missingMetadata = dummyPayload();
  delete missingMetadata.entry[0].changes[0].value.metadata;
  assert.equal((await (await post(missingMetadata)).json()).skipped, 'missing_phone_number_id');
  h.documents.delete('businesses/demo-eats');
  assert.equal((await (await post(dummyPayload())).json()).skipped, 'business_not_found');
  h.seed('businesses/demo-eats', { ...demoBusiness, vertical: 'unknown' });
  const { findBusinessByPhoneNumberId } = h.load('lib/messaging/business.ts');
  await assert.rejects(findBusinessByPhoneNumberId('TEST_PHONE_NUMBER_ID'), /Unsupported Tany vertical/);
  console.log('PASS: all 12 verticals; legacy imports; GET verification; demo-eats POST; message/customer/conversation saves; sequential/concurrent/legacy duplicates; send failure/retry; stored reply deduplication; WhatsApp location; skipped events. No live Meta/Firebase calls.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
