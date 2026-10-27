/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const { signedWebhookHeaders, createHarness, dummyPayload } = require('./messaging-test-helpers.cjs');
const now = new Date('2026-10-23T04:30:00Z'); // Asia/Kolkata 10:00.
const business = { id: 'demo-motos', name: 'Demo Motos', vertical: 'motos', active: true, whatsappPhoneNumberId: 'TEST_PHONE_NUMBER_ID' };
const key = { businessId: business.id, customerPhone: '919999999999' };
const select = (selectionId, type = 'button', text = 'Untrusted title') => ({ type, text, selectionId, selectionTitle: text });

function setup() {
  const h = createHarness();
  const { handleMotosMessage } = h.load('lib/messaging/flows/motos.ts');
  const conversations = h.load('lib/messaging/services/conversation-service.ts');
  const customers = h.load('lib/messaging/services/customer-service.ts');
  return {
    ...h,
    conversation: () => h.read('conversations/demo-motos_919999999999'),
    booking: () => h.read('bookings/' + h.read('conversations/demo-motos_919999999999')?.context.bookingId),
    count: (collection) => [...h.documents.keys()].filter((id) => id.startsWith(collection + '/')).length,
    async send(input, clock = now) {
      await customers.getOrCreateCustomer({ businessId: key.businessId, phone: key.customerPhone });
      const conversation = await conversations.getOrCreateConversation({ ...key, vertical: 'motos' });
      const result = await handleMotosMessage(input, { business, customerPhone: key.customerPhone, conversation }, clock);
      await conversations.updateConversationState({ ...key, state: result.state, status: result.status, context: result.context, lastIncomingText: typeof input === 'string' ? input : input.text, pendingReply: result.reply.body });
      return result;
    },
  };
}

async function chooseVehicle(h, model = 'Creta', id = 'creta_2021') {
  await h.send(model);
  return h.send(select('motos_car_' + id, 'list'));
}

async function main() {
  const h = setup();
  const { searchMotosInventory } = h.load('lib/messaging/flows/motos-inventory.ts');
  for (const [query, expected] of [
    ['Creta automatic iruka?', ['creta_2021']],
    ['automatic suv', ['creta_2021', 'seltos_2020']],
    ['Nexon', ['nexon_2019']],
    ['cars under 10 lakh', ['nexon_2019', 'baleno_2022']],
    ['manual', ['nexon_2019']],
    ['Hyundai', ['creta_2021']],
    ['hatchback', ['baleno_2022']],
    ['budget 8.5L', ['nexon_2019', 'baleno_2022']],
    ['below INR 8,00,000', ['nexon_2019']],
    ['Honda', []], ['sedan', []], ['automatic under 1 lakh', []], ['cars under abc', []],
  ]) assert.deepEqual(searchMotosInventory(query, require('./fixtures/business-data.json').motos.catalog.map((item) => ({ ...item.metadata, id: item.id, price: item.price }))).map((car) => car.id), expected, query);
  let result = await h.send('hi');
  assert.equal(result.state, 'motos_awaiting_query');
  assert.equal(result.reply.body, 'What car are you looking for? You can type model, automatic/manual, or budget.');
  result = await h.send('cars under 10 lakh');
  assert.equal(result.state, 'motos_showing_results');
  assert.equal(result.reply.type, 'list');
  assert.deepEqual(result.reply.sections[0].rows.map((row) => row.id), ['motos_car_nexon_2019', 'motos_car_baleno_2022']);
  result = await h.send(select('motos_car_creta_2021', 'list', 'CANCEL'));
  assert.equal(result.state, 'motos_showing_results');
  assert.notEqual(result.status, 'cancelled');
  result = await h.send(select('motos_car_baleno_2022', 'list'));
  assert.equal(result.state, 'motos_vehicle_selected');
  assert.match(result.reply.body, /Maruti Baleno/);
  assert.match(result.reply.body, /2022/);
  assert.match(result.reply.body, /Alpha/);
  assert.match(result.reply.body, /Automatic/);
  assert.match(result.reply.body, /₹8,40,000/);
  assert.deepEqual(result.reply.buttons.map((button) => button.id), ['motos_testdrive', 'motos_call', 'motos_details']);
  assert.equal((await h.send(select('motos_details'))).reply.body, result.reply.body);
  result = await h.send(select('motos_call'));
  assert.equal(result.context.dealerContactRequested, true);
  assert.match(result.reply.body, /not configured/);
  result = await h.send(select('motos_testdrive'));
  assert.equal(result.state, 'motos_awaiting_testdrive_date');
  assert.deepEqual(result.reply.buttons.map((button) => button.id), ['motos_date_today', 'motos_date_tomorrow', 'motos_date_custom']);
  result = await h.send(select('motos_date_custom'));
  assert.equal(result.reply.type, 'text');
  assert.match(result.reply.body, /25 Oct/);
  result = await h.send('22/10/2026');
  assert.equal(result.state, 'motos_awaiting_testdrive_date');
  result = await h.send('31 February');
  assert.equal(result.state, 'motos_awaiting_testdrive_date');
  result = await h.send(select('motos_date_tomorrow'));
  assert.equal(result.state, 'motos_awaiting_testdrive_time');
  assert.equal(result.context.bookingDate, '2026-10-24');
  assert.equal(result.reply.sections[0].rows.length, 7);
  result = await h.send('8 PM');
  assert.equal(result.state, 'motos_awaiting_testdrive_time');
  result = await h.send(select('motos_time_1400', 'list'));
  assert.equal(result.state, 'motos_awaiting_confirmation');
  assert.equal(result.reply.type, 'buttons');
  assert.match(result.reply.body, /Maruti Baleno 2022/);
  assert.match(result.reply.body, /2026-10-24/);
  assert.match(result.reply.body, /2 PM/);
  const bookingId = result.context.bookingId;
  const booking = h.booking();
  assert.equal(booking.vertical, 'motos');
  assert.equal(booking.serviceName, 'Test Drive');
  assert.equal(booking.resourceId, 'baleno_2022');
  assert.equal(booking.resourceName, 'Maruti Baleno 2022');
  assert.equal(booking.startTime, '14:00');
  assert.equal(booking.endTime, '14:30');
  assert.equal(booking.status, 'draft');
  assert.equal(booking.amount, 0);
  await h.send('please repeat');
  assert.equal(h.count('bookings'), 1);
  result = await h.send(select('motos_confirm'));
  assert.equal(result.state, 'motos_completed');
  assert.equal(result.status, 'completed');
  assert.equal(result.reply.body, 'Your test drive is confirmed.');
  assert.equal(h.booking().status, 'confirmed');
  await h.send('CONFIRM');
  await h.send('CANCEL');
  assert.equal(h.booking().status, 'confirmed');
  assert.equal(h.count('payments'), 0);
  result = await h.send('RESET');
  assert.equal(result.state, 'motos_start');
  assert.deepEqual(result.context, {});
  assert.equal(h.read('bookings/' + bookingId).status, 'confirmed');
  assert.ok(h.read('customers/demo-motos_919999999999'));

  // Fully typed journey, including list number selection and booking reuse.
  const typed = setup();
  await typed.send('Nexon');
  result = await typed.send('1');
  assert.equal(result.context.selectedVehicleId, 'nexon_2019');
  assert.equal((await typed.send('More Details')).state, 'motos_vehicle_selected');
  await typed.send('Test Drive');
  await typed.send('25 Oct');
  await typed.send('5 PM');
  assert.equal((await typed.send('CONFIRM')).state, 'motos_completed');
  assert.equal(typed.booking().bookingDate, '2026-10-25');

  const noResults = setup();
  result = await noResults.send('Honda');
  assert.equal(result.state, 'motos_awaiting_query');
  assert.equal(result.reply.type, 'text');
  assert.deepEqual(result.context.matchedVehicleIds, []);
  const modelSelection = setup();
  await modelSelection.send('Creta');
  assert.equal((await modelSelection.send('Creta')).state, 'motos_vehicle_selected');

  for (const stage of ['query', 'results', 'selected', 'date', 'time', 'confirmation']) {
    const cancelled = setup();
    if (stage === 'query') await cancelled.send('Hello');
    if (stage === 'results') await cancelled.send('automatic');
    if (['selected', 'date', 'time', 'confirmation'].includes(stage)) await chooseVehicle(cancelled);
    if (['date', 'time', 'confirmation'].includes(stage)) await cancelled.send('Test Drive');
    if (['time', 'confirmation'].includes(stage)) await cancelled.send('tomorrow');
    if (stage === 'confirmation') await cancelled.send('2 PM');
    const id = cancelled.conversation()?.context.bookingId;
    result = await cancelled.send(select('motos_cancel'));
    assert.equal(result.status, 'cancelled');
    if (id) assert.equal(cancelled.read('bookings/' + id).status, 'cancelled');
    result = await cancelled.send('RESET');
    assert.equal(result.state, 'motos_start');
    assert.deepEqual(cancelled.conversation().context, {});
  }
  const reset = setup();
  await chooseVehicle(reset);
  await reset.send('Test Drive'); await reset.send('tomorrow'); await reset.send('2 PM');
  const oldId = reset.conversation().context.bookingId;
  await reset.send('RESET');
  assert.equal(reset.read('bookings/' + oldId).status, 'cancelled');
  await chooseVehicle(reset); await reset.send('Test Drive'); await reset.send('tomorrow');
  const raced = await Promise.all([reset.send('2 PM'), reset.send('2 PM')]);
  assert.equal(raced[0].context.bookingId, raced[1].context.bookingId);
  assert.notEqual(raced[0].context.bookingId, oldId);
  assert.equal(reset.count('bookings'), 2);
  assert.equal((await reset.send('CONFIRM', new Date('2026-10-25T04:30:00Z'))).state, 'motos_awaiting_testdrive_date');
  const slots = setup();
  await chooseVehicle(slots); await slots.send('Test Drive');
  result = await slots.send('today');
  assert.ok(!result.reply.sections[0].rows.some((row) => row.id === 'motos_time_1000'));
  const scheduling = slots.load('lib/messaging/flows/motos-scheduling.ts');
  assert.equal(scheduling.parseMotosDate('tomorrow', new Date('2026-10-23T19:00:00Z')), '2026-10-25');
  assert.equal(scheduling.parseMotosTime('25:00'), null);
  assert.equal(scheduling.parseMotosTime('2:99pm'), null);

  // Generic webhook integration and duplicate message suppression.
  const webhook = createHarness();
  webhook.seed('businesses/demo-motos', business);
  const { POST } = webhook.load('app/api/whatsapp/webhook/route.ts');
  const payload = dummyPayload('wamid.motos');
  payload.entry[0].changes[0].value.messages[0].text.body = 'automatic suv';
  const post = () => POST(new NextRequest('http://localhost/api/whatsapp/webhook', { method: 'POST', headers: signedWebhookHeaders(payload), body: JSON.stringify(payload) }));
  result = await (await post()).json();
  assert.equal(result.vertical, 'motos');
  assert.equal(result.structuredReply.type, 'buttons'); // Up to three matching cars use reply buttons.
  assert.equal((await (await post()).json()).skipped, 'duplicate_message');
  assert.equal(webhook.sends.length, 1);
  console.log('PASS: Motos model/brand/transmission/body/budget search; no results; interactive and typed selection/details; dealer interest; dates/slots; draft reuse/concurrency; summary/confirm; CANCEL/RESET; India timezone/past dates; generic webhook duplicate protection. No live services.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
