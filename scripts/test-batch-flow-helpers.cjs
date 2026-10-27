/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const { signedWebhookHeaders, createHarness, dummyPayload } = require('./messaging-test-helpers.cjs');
const clock = new Date('2026-10-23T04:30:00Z');
const coordinate = { latitude: 12.97, longitude: 77.59, address: 'Bengaluru', label: 'Home', source: 'manual' };
const select = (id, type = 'list') => ({ type, text: 'Untrusted title', selectionId: id, selectionTitle: 'Untrusted title' });
const definitions = {
  cabs: { first: 'pickup', kind: 'booking', paid: false, amount: 80, typed: ['Airport', 'Station', 'Mini'], interactive: ['Airport', 'Station', select('cabs_vehicle_mini')] },
  retail: { first: 'product', kind: 'order', paid: true, amount: 998, typed: ['T-Shirt', 'M Blue', '2'], interactive: [select('retail_product_tshirt'), select('retail_variant_5'), '2'] },
  ecom: { first: 'category', kind: 'order', paid: true, amount: 10000, typed: ['Gifts', '100', '100'], interactive: [select('ecom_category_gifts'), '100', '100'] },
  garage: { first: 'vehicle', kind: 'booking', paid: false, amount: 1500, typed: ['Honda City', 'General Service', 'tomorrow', '10 AM'], interactive: ['Honda City', select('garage_service_general'), select('garage_date_tomorrow', 'button'), select('garage_time_1000')] },
  meds: { first: 'product', kind: 'order', paid: true, amount: 50, typed: ['ORS', '2', 'LOCATION'], interactive: [select('meds_product_ors'), '2', 'LOCATION'] },
  meat: { first: 'item', kind: 'order', paid: true, amount: 125, typed: ['Chicken', 'Curry Cut', '500g', 'LOCATION'], interactive: [select('meat_item_chicken'), select('meat_cut_1'), '500g', 'LOCATION'] },
  expert: { first: 'service', kind: 'booking', paid: true, amount: 1000, typed: ['CA Consultation', 'tomorrow', '10 AM'], interactive: [select('expert_service_ca'), select('expert_date_tomorrow', 'button'), select('expert_time_1000')] },
  gaming: { first: 'station', kind: 'booking', paid: true, amount: 400, typed: ['PS5', '2 hours', 'tomorrow', '10 AM'], interactive: [select('gaming_station_ps5'), select('gaming_duration_2'), select('gaming_date_tomorrow', 'button'), select('gaming_time_1000')] },
  sport: { first: 'activity', kind: 'booking', paid: true, amount: 500, typed: ['Badminton', 'tomorrow', '10 AM'], interactive: [select('sport_activity_badminton'), select('sport_date_tomorrow', 'button'), select('sport_time_1000')] },
};

function setup(vertical) {
  const h = createHarness();
  const business = { id: `demo-${vertical}`, name: `Demo ${vertical}`, vertical, active: true, whatsappPhoneNumberId: 'TEST_PHONE_NUMBER_ID' };
  const key = { businessId: business.id, customerPhone: '919999999999' };
  const flowModule = h.load(`lib/messaging/flows/${vertical}.ts`);
  const handler = flowModule[`handle${vertical[0].toUpperCase() + vertical.slice(1)}Message`];
  const customers = h.load('lib/messaging/services/customer-service.ts');
  const conversations = h.load('lib/messaging/services/conversation-service.ts');
  return {
    ...h, business, key,
    conversation: () => h.read(`conversations/${key.businessId}_${key.customerPhone}`),
    count: (collection) => [...h.documents.keys()].filter((id) => id.startsWith(collection + '/')).length,
    async send(value, now = clock) {
      await customers.getOrCreateCustomer({ businessId: key.businessId, phone: key.customerPhone });
      const conversation = await conversations.getOrCreateConversation({ ...key, vertical });
      const input = value === 'LOCATION' ? { type: 'location', text: '', location: { ...coordinate, updatedAt: h.Timestamp.now() } } : value;
      const result = await handler(input, { business, customerPhone: key.customerPhone, conversation }, now);
      await conversations.updateConversationState({ ...key, state: result.state, status: result.status, context: result.context, lastIncomingText: typeof input === 'string' ? input : input.text, pendingReply: result.reply.body });
      return result;
    },
  };
}

async function journey(h, steps) {
  let result = await h.send('Hello');
  for (const step of steps) result = await h.send(step);
  return result;
}

async function runVerticalTests(v) {
  const def = definitions[v];
  const h = setup(v);
  let result = await h.send('HI');
  assert.equal(result.state, `${v}_awaiting_${def.first}`);
  result = await h.send('');
  assert.equal(result.state, `${v}_awaiting_${def.first}`);
  assert.equal(h.count(def.kind + 's'), 0);
  result = await journey(h, def.typed);
  assert.equal(result.state, `${v}_awaiting_confirmation`, v + ': typed journey');
  assert.equal(result.reply.type, 'buttons');
  const recordId = result.context[def.kind + 'Id'];
  assert.ok(recordId);
  const record = h.read(`${def.kind}s/${recordId}`);
  assert.equal(def.kind === 'order' ? record.total : record.amount, def.amount);
  assert.equal(record.vertical, v);
  assert.equal(record.businessId, h.key.businessId);
  if (v === 'cabs') { assert.equal(record.metadata.estimateOnly, true); assert.match(result.reply.body, /estimate/); }
  if (v === 'ecom') { assert.equal(result.context.quoteId, recordId); assert.equal(result.context.estimatedTotal, 10000); assert.match(result.reply.body, /supplier approval/); }
  if (v === 'gaming') { assert.equal(record.metadata.durationMinutes, 120); assert.equal(record.endTime, '12:00'); }
  if (v === 'sport') assert.ok(record.resourceName.startsWith('Mock '));
  // Repeating a prompt does not create another draft.
  await h.send('repeat');
  assert.equal(h.count(def.kind + 's'), 1);
  result = await h.send('CONFIRM');
  assert.equal(result.state, `${v}_${def.paid ? 'awaiting_payment' : 'completed'}`);
  await h.send('CONFIRM');
  assert.equal(h.count(def.kind + 's'), 1);
  assert.equal(h.count('payments'), def.paid ? 1 : 0);
  if (def.paid) {
    await h.send('paid');
    assert.equal(h.conversation().state, `${v}_awaiting_payment`);
    const paymentId = h.conversation().context.paymentId;
    const payments = h.load('lib/messaging/services/payment-service.ts');
    await payments.markPaymentPaid({ paymentId, providerPaymentId: 'mock-paid' });
    result = await h.send('status');
    assert.equal(result.state, `${v}_completed`);
    assert.equal(h.read(`${def.kind}s/${recordId}`).status, def.kind === 'order' ? 'paid' : 'confirmed');
  }
  assert.equal(h.conversation().status, 'completed');
  await h.send('CANCEL');
  assert.notEqual(h.read(`${def.kind}s/${recordId}`).status, 'cancelled');
  result = await h.send('RESET');
  assert.equal(result.state, `${v}_start`);
  assert.deepEqual(result.context, {});
  assert.ok(h.read(`customers/${h.key.businessId}_${h.key.customerPhone}`));
  const interactive = setup(v);
  result = await journey(interactive, def.interactive);
  assert.equal(result.state, `${v}_awaiting_confirmation`, v + ': interactive journey');
  result = await interactive.send(select(`${v}_confirm`, 'button'));
  assert.equal(result.state, `${v}_${def.paid ? 'awaiting_payment' : 'completed'}`);
  // Cancel and reset unfinished records, then create a distinct new draft.
  const cancelled = setup(v);
  await journey(cancelled, def.typed);
  const cancelledId = cancelled.conversation().context[def.kind + 'Id'];
  result = await cancelled.send(select(`${v}_cancel`, 'button'));
  assert.equal(result.status, 'cancelled');
  assert.equal(cancelled.read(`${def.kind}s/${cancelledId}`).status, 'cancelled');
  await cancelled.send('RESET');
  assert.deepEqual(cancelled.conversation().context, {});
  await journey(cancelled, def.typed);
  assert.notEqual(cancelled.conversation().context[def.kind + 'Id'], cancelledId);
  const fresh = setup(v);
  await fresh.send('Hello');
  assert.equal((await fresh.send('CANCEL')).status, 'cancelled');
  assert.equal((await fresh.send('RESET')).state, `${v}_start`);
  // Concurrent completion of the same draft remains one record.
  const concurrent = setup(v);
  await concurrent.send('Hello');
  for (const step of def.typed.slice(0, -1)) await concurrent.send(step);
  const same = await Promise.all([concurrent.send(def.typed.at(-1)), concurrent.send(def.typed.at(-1))]);
  assert.equal(same[0].context[def.kind + 'Id'], same[1].context[def.kind + 'Id']);
  await Promise.all([concurrent.send('CONFIRM'), concurrent.send('CONFIRM')]);
  assert.equal(concurrent.count(def.kind + 's'), 1);
  assert.equal(concurrent.count('payments'), def.paid ? 1 : 0);

  // Real generic webhook modules with mocked Firestore/transport, including
  // repeated final Meta message IDs, not just repeated direct flow calls.
  const web = createHarness();
  web.seed(`businesses/demo-${v}`, h.business);
  const { POST } = web.load('app/api/whatsapp/webhook/route.ts');
  let index = 0;
  const post = async (step, id = `wamid.${v}-${++index}`) => {
    const payload = dummyPayload(id);
    const message = payload.entry[0].changes[0].value.messages[0];
    if (step === 'LOCATION') { message.type = 'location'; delete message.text; message.location = { latitude: 12.97, longitude: 77.59, name: 'Home' }; }
    else message.text.body = step === 'tomorrow' ? '2099-10-25' : step;
    const response = await POST(new NextRequest('http://localhost/api/whatsapp/webhook', { method: 'POST', headers: signedWebhookHeaders(payload), body: JSON.stringify(payload) }));
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    return body;
  };
  await post('Hello');
  for (const step of def.typed) await post(step);
  const final = await post('CONFIRM', `wamid.${v}-confirm`);
  assert.equal(final.state, `${v}_${def.paid ? 'awaiting_payment' : 'completed'}`);
  const sends = web.sends.length;
  assert.equal((await post('CONFIRM', `wamid.${v}-confirm`)).skipped, 'duplicate_message');
  assert.equal(web.sends.length, sends);
  assert.equal([...web.documents.keys()].filter((id) => id.startsWith(def.kind + 's/')).length, 1);

  if (v === 'ecom') {
    const quote = setup(v);
    result = await quote.send('100 return gifts under ₹100');
    assert.equal(result.state, 'ecom_awaiting_confirmation');
    assert.equal(result.context.quantity, 100);
    assert.equal(result.context.budgetPerItem, 100);
    assert.equal(result.context.estimatedTotal, 10000);
    const invalid = setup(v);
    await invalid.send('Gifts');
    assert.equal((await invalid.send('-1')).state, 'ecom_awaiting_quantity');
  }
  if (v === 'meds') {
    for (const query of ['amoxicillin', 'What should I take for fever?', 'paracetamol dosage for a child', 'diagnose headache', 'insulin']) {
      const safety = setup(v);
      result = await safety.send(query);
      assert.equal(result.state, 'meds_awaiting_prescription');
      assert.equal(result.reply.body, 'Please upload a valid prescription or consult a licensed doctor/pharmacist.');
      assert.equal(safety.count('orders'), 0);
      assert.equal(safety.count('payments'), 0);
      result = await safety.send({ type: 'unsupported', text: '' });
      assert.equal(result.state, 'meds_awaiting_prescription');
    }
    const pending = setup(v);
    await journey(pending, def.typed);
    result = await pending.send('cefixime');
    assert.equal(result.state, 'meds_awaiting_confirmation');
    assert.equal(result.reply.body, 'Please upload a valid prescription or consult a licensed doctor/pharmacist.');
    assert.equal(pending.count('orders'), 1);
    assert.equal(pending.count('payments'), 0);
  }
  if (v === 'meat') {
    const cuts = setup(v); await cuts.send('Fish');
    assert.equal((await cuts.send('Boneless')).state, 'meat_awaiting_cut');
  }
  if (v === 'cabs') {
    const loc = setup(v);
    result = await loc.send('LOCATION');
    assert.equal(result.state, 'cabs_awaiting_destination');
    assert.equal(result.context.pickup.latitude, 12.97);
    result = await loc.send('LOCATION');
    assert.equal(result.state, 'cabs_awaiting_destination');
  }
  if (['garage', 'expert', 'gaming', 'sport'].includes(v)) {
    const past = setup(v); await past.send('Hello');
    for (const step of def.typed.slice(0, -2)) await past.send(step);
    assert.equal((await past.send('22/10/2026')).state, `${v}_awaiting_date`);
    await past.send('tomorrow');
    assert.equal((await past.send('9 PM')).state, `${v}_awaiting_time`);
  }
  console.log(`PASS: ${v} happy/missing/interactive/typed paths; confirm/payment rules; CANCEL/RESET; concurrent draft/payment reuse; full webhook duplicate protection; vertical-specific checks. No live services.`);
}
module.exports = { runVerticalTests, definitions, setup };
