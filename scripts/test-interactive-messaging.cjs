/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const { signedWebhookHeaders, createHarness, dummyPayload } = require('./messaging-test-helpers.cjs');

async function main() {
  const h = createHarness();
  const { textReply, buttonReply, listReply, normalizeReply, replyTextFallback } = h.load('lib/messaging/replies.ts');
  const { buildWhatsAppPayload, sendWhatsAppMessage, sendWhatsAppText } = h.load('lib/messaging/whatsapp.ts');
  const { normalizeIncomingMessage } = h.load('lib/messaging/incoming.ts');
  const text = textReply('hello');
  const buttons = buttonReply({ body: 'Continue?', buttons: [{ id: 'confirm', title: 'Confirm' }, { id: 'cancel', title: 'Cancel' }] });
  const list = listReply({ body: 'Choose service', buttonText: 'Services', sections: [{ title: 'Salon', rows: [{ id: 'haircut', title: 'Haircut', description: '30 minutes' }] }] });
  assert.deepEqual(normalizeReply('legacy string'), { type: 'text', body: 'legacy string' });
  assert.deepEqual(buildWhatsAppPayload('919999999999', text), {
    messaging_product: 'whatsapp', recipient_type: 'individual', to: '919999999999', type: 'text', text: { preview_url: false, body: 'hello' },
  });
  assert.deepEqual(buildWhatsAppPayload('919999999999', buttons).interactive, {
    type: 'button', body: { text: 'Continue?' }, action: { buttons: [
      { type: 'reply', reply: { id: 'confirm', title: 'Confirm' } }, { type: 'reply', reply: { id: 'cancel', title: 'Cancel' } },
    ] },
  });
  assert.deepEqual(buildWhatsAppPayload('919999999999', list).interactive, {
    type: 'list', body: { text: 'Choose service' }, action: { button: 'Services', sections: list.sections },
  });
  assert.equal(replyTextFallback(buttons).body, 'Continue?\n\nConfirm\nCancel');
  assert.equal(buildWhatsAppPayload('919999999999', list, true).type, 'text');
  assert.match(buildWhatsAppPayload('919999999999', list, true).text.body, /Haircut/);
  for (const invalidButtons of [[], [{ id: '', title: 'Yes' }], [{ id: 'one', title: 'x'.repeat(21) }], [{ id: 'a', title: 'A' }, { id: 'a', title: 'B' }]]) {
    assert.equal(buttonReply({ body: 'Fallback', buttons: invalidButtons }).type, 'text');
  }
  for (const sections of [[], [{ rows: [] }], [{ rows: [{ id: 'same', title: 'A' }] }, { rows: [{ id: 'same', title: 'B' }] }]]) {
    assert.equal(listReply({ body: 'Fallback', buttonText: 'Choose', sections }).type, 'text');
  }
  const base = { from: '919999999999', id: 'wamid.parse', type: 'interactive' };
  assert.deepEqual(normalizeIncomingMessage({ ...base, interactive: { type: 'button_reply', button_reply: { id: 'salon_confirm', title: 'Confirm' } } }), {
    type: 'button', text: 'Confirm', selectionId: 'salon_confirm', selectionTitle: 'Confirm',
  });
  assert.equal(normalizeIncomingMessage({ ...base, interactive: { type: 'list_reply', list_reply: { id: 'salon_service_haircut', title: 'Haircut' } } }).type, 'list');
  assert.equal(normalizeIncomingMessage({ ...base, interactive: { type: 'unknown' } }).type, 'unsupported');
  const location = normalizeIncomingMessage({ ...base, type: 'location', location: { latitude: 0, longitude: 0, name: 'Home', address: 'Address' } });
  assert.equal(location.location.latitude, 0);
  assert.equal(location.location.longitude, 0);
  assert.equal(location.location.label, 'Home');
  assert.equal(location.location.source, 'whatsapp');
  assert.equal(location.location.address, 'Address');
  assert.ok(location.location.updatedAt);
  assert.throws(() => normalizeIncomingMessage({ ...base, type: 'location', location: { latitude: 91, longitude: 0 } }));

  // Exercise the real sender and compatibility wrapper with a strictly local fetch stub.
  const oldFetch = global.fetch;
  const oldToken = process.env.META_ACCESS_TOKEN;
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ messages: [{ id: 'mock.out' }] }) };
  };
  process.env.META_ACCESS_TOKEN = 'test-only-token';
  try {
    await sendWhatsAppMessage({ phoneNumberId: 'TEST', to: '919999999999', reply: buttons });
    await sendWhatsAppMessage({ phoneNumberId: 'TEST', to: '919999999999', reply: list });
    await sendWhatsAppText({ phoneNumberId: 'TEST', to: '919999999999', message: 'compatibility' });
    assert.equal(requests[0].body.interactive.type, 'button');
    assert.equal(requests[1].body.interactive.type, 'list');
    assert.equal(requests[2].body.text.body, 'compatibility');
    const previousError = console.error;
    const logs = [];
    let attempts = 0;
    try {
      console.error = (...args) => logs.push(args);
      global.fetch = async () => {
        attempts++;
        return { ok: false, status: 400, json: async () => ({ error: {
          message: 'Invalid request', code: 131009, error_subcode: 2494010,
          error_data: { details: 'Missing product; Bearer test-only-token' }, fbtrace_id: 'META_TRACE_abc123',
          access_token: 'test-only-token',
        } }) };
      };
      await assert.rejects(sendWhatsAppMessage({ phoneNumberId: 'TEST', to: '919999999999', reply: 'hello' }), /Invalid request/);
      assert.equal(attempts, 1, 'logging must not change retry behavior');
      assert.equal(logs[0][0], 'WhatsApp send failed:');
      assert.equal(logs[0][1].error, 'Invalid request');
      assert.equal(logs[0][1].code, 131009);
      assert.equal(logs[0][1].subcode, 2494010);
      assert.match(logs[0][1].details, /Missing product/);
      assert.equal(logs[0][1].fbtraceId, 'META_TRACE_abc123');
      assert.ok(!JSON.stringify(logs).includes('test-only-token'));
    } finally { console.error = previousError; }
  } finally {
    global.fetch = oldFetch;
    if (oldToken === undefined) delete process.env.META_ACCESS_TOKEN;
    else process.env.META_ACCESS_TOKEN = oldToken;
  }

  // End-to-end interactive webhook with real parsing, routing, and persistence.
  const business = { name: 'Demo Salon', vertical: 'salon', active: true, whatsappPhoneNumberId: 'TEST_PHONE_NUMBER_ID' };
  h.seed('businesses/demo-salon', business);
  const { POST } = h.load('app/api/whatsapp/webhook/route.ts');
  const post = async (id, selection, type = 'button_reply', title = 'Label') => {
    const payload = dummyPayload(id);
    const message = payload.entry[0].changes[0].value.messages[0];
    message.type = 'interactive'; delete message.text;
    message.interactive = { type, [type]: { id: selection, title } };
    return POST(new NextRequest('http://localhost/api/whatsapp/webhook', { method: 'POST', headers: signedWebhookHeaders(payload), body: JSON.stringify(payload) }));
  };
  let response = await post('wamid.select-service', 'salon_service_haircut', 'list_reply', 'Haircut');
  assert.equal(response.status, 200);
  let result = await response.json();
  assert.equal(result.state, 'salon_awaiting_date');
  assert.equal(result.structuredReply.type, 'buttons');
  const stored = h.read('messages/wamid.select-service');
  assert.equal(stored.selectionId, 'salon_service_haircut');
  assert.equal(stored.selectionTitle, 'Haircut');
  assert.equal(stored.rawMessageType, 'interactive');
  const outgoing = [...h.documents.values()].find((entry) => entry.direction === 'outgoing');
  assert.equal(outgoing.replyType, 'buttons');
  assert.equal(outgoing.body, 'What date would you like to book?');
  assert.equal(outgoing.reply.buttons.length, 3);
  assert.equal((await (await post('wamid.select-service', 'salon_service_haircut', 'list_reply', 'Haircut')).json()).skipped, 'duplicate_message');
  assert.equal(h.sends.length, 1);

  // Failed sends replay the stored reply instead of interpreting stale IDs.
  h.failNextSend();
  const oldError = console.error;
  try {
    console.error = () => {};
    response = await post('wamid.select-date', 'salon_date_tomorrow');
  } finally { console.error = oldError; }
  assert.equal(response.status, 500);
  assert.equal(h.read('conversations/demo-salon_919999999999').state, 'salon_awaiting_time');
  result = await (await post('wamid.select-date', 'salon_date_tomorrow')).json();
  assert.equal(result.structuredReply.type, 'list');
  assert.equal(result.state, 'salon_awaiting_time');
  assert.equal(h.sends.length, 2);
  result = await (await post('wamid.select-time', 'salon_time_1700', 'list_reply', '5:00 PM')).json();
  assert.equal(result.state, 'salon_awaiting_confirmation');
  assert.equal(result.structuredReply.type, 'buttons');
  await post('wamid.confirm', 'salon_confirm');
  await post('wamid.confirm', 'salon_confirm');
  assert.equal([...h.documents.keys()].filter((key) => key.startsWith('payments/')).length, 1);
  console.log('PASS: text/button/list payloads; real sender with mocked fetch; legacy normalization/wrapper; safe validation and text fallbacks; button/list/location parsing; metadata storage; duplicate protection; interactive retry replay; Salon webhook journey. No live API calls.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
