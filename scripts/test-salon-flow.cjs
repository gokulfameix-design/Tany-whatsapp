/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const { signedWebhookHeaders, createHarness, dummyPayload } = require('./messaging-test-helpers.cjs');
const now = new Date('2026-10-23T04:30:00Z'); // 10:00 AM Asia/Kolkata.
const business = { id: 'demo-salon', name: 'Demo Salon', vertical: 'salon', active: true, whatsappPhoneNumberId: 'TEST_PHONE_NUMBER_ID' };
const key = { businessId: business.id, customerPhone: '919999999999' };

function setup() {
  const h = createHarness();
  const { handleSalonMessage } = h.load('lib/messaging/flows/salon.ts');
  const conversations = h.load('lib/messaging/services/conversation-service.ts');
  const customer = h.load('lib/messaging/services/customer-service.ts');
  return {
    ...h,
    conversation: () => h.read('conversations/demo-salon_919999999999'),
    count: (collection) => [...h.documents.keys()].filter((name) => name.startsWith(collection + '/')).length,
    async send(text, clock = now) {
      await customer.getOrCreateCustomer({ businessId: key.businessId, phone: key.customerPhone });
      const conversation = await conversations.getOrCreateConversation({ ...key, vertical: 'salon' });
      const result = await handleSalonMessage(text, { business, customerPhone: key.customerPhone, conversation }, clock);
      await conversations.updateConversationState({ ...key, state: result.state, status: result.status, context: result.context, lastIncomingText: typeof text === 'string' ? text : text.text, pendingReply: result.reply.body });
      return result;
    },
  };
}

async function main() {
  const h = setup();
  let result = await h.send('Haircut tomorrow 5pm');
  assert.equal(result.state, 'salon_awaiting_confirmation');
  assert.equal(result.reply.body, 'Booking summary:\nHaircut\nDate: 2026-10-24\nTime: 5:00 PM\nStylist: Any Stylist\nAmount: ₹300\n\nReply CONFIRM to continue.');
  const context = h.conversation().context;
  for (const field of ['serviceId', 'serviceName', 'price', 'durationMinutes', 'bookingDate', 'startTime', 'stylistId', 'stylistName', 'bookingId', 'paymentId']) assert.ok(field in context, field);
  const bookingId = context.bookingId;
  let booking = h.read('bookings/' + bookingId);
  assert.equal(booking.status, 'draft');
  assert.equal(booking.vertical, 'salon');
  assert.equal(booking.staffName, 'Any Stylist');
  assert.equal(booking.endTime, '17:30');
  assert.equal(booking.currency, 'INR');
  result = await h.send('Haircut tomorrow 5pm');
  assert.equal(result.state, 'salon_awaiting_confirmation');
  assert.equal(h.count('bookings'), 1);
  assert.equal((await h.send('yes')).state, 'salon_awaiting_confirmation');
  assert.equal(h.count('payments'), 0);
  result = await h.send('confirm');
  assert.equal(result.state, 'salon_awaiting_payment');
  assert.equal(result.reply.body, 'Your appointment is reserved. Payment link will be sent shortly.');
  booking = h.read('bookings/' + bookingId);
  assert.equal(booking.status, 'awaiting_payment');
  const paymentId = booking.paymentId;
  const payment = h.read('payments/' + paymentId);
  assert.equal(payment.referenceType, 'booking');
  assert.equal(payment.referenceId, bookingId);
  assert.equal(payment.amount, 300);
  assert.equal(payment.status, 'pending');
  assert.equal(h.conversation().context.paymentId, paymentId);
  await h.send('CONFIRM');
  await h.send('paid');
  assert.equal(h.conversation().state, 'salon_awaiting_payment');
  assert.equal(h.count('payments'), 1);
  // Replaying the pre-save confirmation state reuses the linked payment.
  h.seed('conversations/demo-salon_919999999999', { ...h.conversation(), state: 'salon_awaiting_confirmation' });
  await h.send('CONFIRM');
  assert.equal(h.count('payments'), 1);
  const payments = h.load('lib/messaging/services/payment-service.ts');
  await payments.markPaymentPaid({ paymentId, providerPaymentId: 'mock-paid' });
  result = await h.send('status');
  assert.equal(result.state, 'salon_completed');
  assert.equal(result.status, 'completed');
  assert.equal(h.read('bookings/' + bookingId).status, 'confirmed');
  await h.send('CANCEL');
  assert.equal(h.read('bookings/' + bookingId).status, 'confirmed');
  await h.send('RESET');
  assert.deepEqual(h.conversation().context, {});
  assert.equal(h.read('bookings/' + bookingId).status, 'confirmed');

  const partial = setup();
  result = await partial.send('hair cut');
  assert.equal(result.state, 'salon_awaiting_date');
  assert.equal(result.reply.body, 'What date would you like to book?');
  assert.equal(partial.count('bookings'), 0);
  result = await partial.send('tomorrow');
  assert.equal(result.state, 'salon_awaiting_time');
  assert.equal(result.reply.body, 'What time would you prefer?');
  result = await partial.send('17:00');
  assert.equal(result.state, 'salon_awaiting_confirmation');
  assert.equal(partial.conversation().context.startTime, '17:00');
  const missingDate = setup();
  assert.equal((await missingDate.send('Haircut 5pm')).state, 'salon_awaiting_date');
  assert.equal((await missingDate.send('25 October')).state, 'salon_awaiting_confirmation');
  assert.equal(missingDate.conversation().context.bookingDate, '2026-10-25');
  const missingTime = setup();
  assert.equal((await missingTime.send('Haircut tomorrow')).state, 'salon_awaiting_time');
  assert.equal((await missingTime.send('5:00pm')).state, 'salon_awaiting_confirmation');

  for (const [text, expectedId, price, duration, date, time] of [
    ['Beard trim today 6:30pm', 'beard_trim', 150, 20, '2026-10-23', '18:30'],
    ['haircut and beard 25 Oct 5pm', 'haircut_beard', 400, 45, '2026-10-25', '17:00'],
    ['Haircut + Beard 25/10/2026 6:30 pm', 'haircut_beard', 400, 45, '2026-10-25', '18:30'],
    ['hair spa tomorrow 17:00', 'hair_spa', 800, 60, '2026-10-24', '17:00'],
    ['Facial tomorrow 5pm', 'facial', 1000, 60, '2026-10-24', '17:00'],
  ]) {
    const item = setup();
    assert.equal((await item.send(text)).state, 'salon_awaiting_confirmation');
    const data = item.conversation().context;
    assert.equal(data.serviceId, expectedId); assert.equal(data.price, price);
    assert.equal(data.durationMinutes, duration); assert.equal(data.bookingDate, date); assert.equal(data.startTime, time);
  }
  const styled = setup();
  await styled.send('Haircut tomorrow 5pm with Arun');
  assert.equal(styled.conversation().context.stylistName, 'Arun');
  const unknownStylist = setup();
  assert.equal((await unknownStylist.send('Haircut tomorrow 5pm with Ravi')).state, 'salon_awaiting_stylist');
  assert.equal(unknownStylist.count('bookings'), 0);
  assert.equal((await unknownStylist.send('Priya')).state, 'salon_awaiting_confirmation');
  assert.equal(unknownStylist.conversation().context.stylistName, 'Priya');

  for (const time of ['8am', '8pm', '7:45pm', '21:00']) {
    const outside = setup();
    result = await outside.send('Haircut tomorrow ' + time);
    assert.equal(result.state, 'salon_awaiting_time');
    assert.equal(result.reply.body, 'That time is outside our available hours. Please choose a time between 9:00 AM and 8:00 PM.');
    assert.equal(outside.count('bookings'), 0);
    assert.equal((await outside.send('7:30pm')).state, 'salon_awaiting_confirmation');
  }
  for (const date of ['22/10/2026', '31 February', '2026-02-30']) {
    const past = setup();
    result = await past.send(`Haircut ${date} 5pm`);
    assert.equal(result.state, 'salon_awaiting_date');
    assert.equal(past.count('bookings'), 0);
  }
  const pastTime = setup();
  assert.equal((await pastTime.send('Haircut today 9am')).state, 'salon_awaiting_time');
  const invalidTime = setup();
  assert.equal((await invalidTime.send('Haircut tomorrow 25:00')).state, 'salon_awaiting_time');
  assert.equal((await invalidTime.send('6:99pm')).state, 'salon_awaiting_time');
  const stale = setup();
  await stale.send('Haircut today 5pm');
  assert.equal((await stale.send('CONFIRM', new Date('2026-10-24T04:30:00Z'))).state, 'salon_awaiting_date');
  assert.equal(stale.count('payments'), 0);
  const { parseSalonInput, salonLocalNow } = h.load('lib/messaging/flows/salon-scheduling.ts');
  const midnight = new Date('2026-10-23T19:00:00Z');
  assert.equal(salonLocalNow(midnight).date, '2026-10-24');
  assert.equal(parseSalonInput('Haircut tomorrow 5pm', midnight).bookingDate, '2026-10-25');
  const serviceFixtures = Object.fromEntries(require('./fixtures/business-data.json').salon.catalog.map((item) => [item.id, { name: item.name, price: item.price, ...item.metadata }]));
  assert.equal(parseSalonInput('beard tomorrow 5pm', now, serviceFixtures).serviceId, 'beard_trim');

  for (const stage of ['start', 'service', 'date', 'time', 'stylist', 'confirmation', 'payment']) {
    const cancelled = setup();
    if (stage === 'service') await cancelled.send('hello');
    if (stage === 'date') await cancelled.send('Haircut');
    if (stage === 'time') await cancelled.send('Haircut tomorrow');
    if (stage === 'stylist') await cancelled.send('Haircut tomorrow 5pm with Unknown');
    if (['confirmation', 'payment'].includes(stage)) await cancelled.send('Haircut tomorrow 5pm');
    if (stage === 'payment') await cancelled.send('CONFIRM');
    const id = cancelled.conversation()?.context.bookingId;
    result = await cancelled.send('CANCEL');
    assert.equal(result.reply.body, 'Your appointment has been cancelled.');
    assert.equal(result.status, 'cancelled');
    if (id) assert.equal(cancelled.read('bookings/' + id).status, 'cancelled');
    result = await cancelled.send('RESET');
    assert.equal(result.state, 'salon_start'); assert.deepEqual(cancelled.conversation().context, {});
    assert.ok(cancelled.read('customers/demo-salon_919999999999'));
  }
  const reset = setup();
  await reset.send('Haircut tomorrow 5pm');
  const previous = reset.conversation().context.bookingId;
  await reset.send('RESET');
  assert.equal(reset.read('bookings/' + previous).status, 'cancelled');
  await reset.send('Haircut tomorrow 5pm');
  assert.notEqual(reset.conversation().context.bookingId, previous);

  // Complete interactive journey, with typed fallbacks still tested above.
  const select = (id, type = 'button', title = 'Display title') => ({ type, text: title, selectionId: id, selectionTitle: title });
  const interactive = setup();
  result = await interactive.send('Hello');
  assert.equal(result.reply.type, 'list');
  assert.deepEqual(result.reply.sections[0].rows.map((row) => row.id), [
    'salon_service_haircut', 'salon_service_beard_trim', 'salon_service_haircut_beard', 'salon_service_hair_spa', 'salon_service_facial',
  ]);
  result = await interactive.send(select('salon_service_haircut', 'list', 'Untrusted title'));
  assert.equal(result.state, 'salon_awaiting_date');
  assert.equal(result.context.serviceName, 'Haircut');
  assert.equal(result.reply.type, 'buttons');
  assert.deepEqual(result.reply.buttons.map((button) => button.id), ['salon_date_today', 'salon_date_tomorrow', 'salon_date_custom']);
  result = await interactive.send(select('salon_date_custom'));
  assert.equal(result.reply.type, 'text');
  assert.equal(result.reply.body, 'Please enter your preferred date, for example 25 Oct.');
  result = await interactive.send(select('salon_date_tomorrow'));
  assert.equal(result.context.bookingDate, '2026-10-24');
  assert.equal(result.reply.type, 'list');
  assert.equal(result.reply.sections[0].rows.length, 9);
  assert.ok(result.reply.sections[0].rows.every((row) => /^salon_time_\d{4}$/.test(row.id)));
  result = await interactive.send(select('salon_time_1700', 'list'));
  assert.equal(result.context.startTime, '17:00');
  assert.equal(result.context.stylistName, 'Any Stylist');
  assert.equal(result.reply.type, 'buttons');
  assert.deepEqual(result.reply.buttons.map((button) => button.id), ['salon_confirm', 'salon_cancel']);
  result = await interactive.send(select('salon_confirm'));
  assert.equal(result.state, 'salon_awaiting_payment');
  result = await interactive.send(select('salon_cancel'));
  assert.equal(result.status, 'cancelled');
  const explicit = setup();
  result = await explicit.send('Haircut tomorrow 5pm with Unknown');
  assert.equal(result.reply.type, 'buttons');
  assert.deepEqual(result.reply.buttons.map((button) => button.id), ['salon_stylist_any', 'salon_stylist_arun', 'salon_stylist_priya']);
  result = await explicit.send(select('salon_stylist_priya'));
  assert.equal(result.context.stylistName, 'Priya');
  const staleSelection = setup();
  await staleSelection.send('Hello');
  result = await staleSelection.send(select('unknown_id', 'button', 'CANCEL'));
  assert.equal(result.state, 'salon_awaiting_service');
  assert.notEqual(result.status, 'cancelled');
  assert.equal(staleSelection.count('bookings'), 0);
  const remaining = setup();
  result = await remaining.send('Hair Spa today');
  assert.equal(result.reply.type, 'list');
  assert.ok(!result.reply.sections[0].rows.some((row) => row.id === 'salon_time_1000'));
  result = await remaining.send('Hair Spa today', new Date('2026-10-23T14:00:00Z')); // 19:30 India
  assert.equal(result.reply.type, 'text');
  assert.match(result.reply.body, /No mock slots remain/);

  // Crash after placeholder creation, before linking it, still reuses payment.
  const retry = setup();
  await retry.send('Haircut tomorrow 5pm');
  const retryId = retry.conversation().context.bookingId;
  const retryPayments = retry.load('lib/messaging/services/payment-service.ts');
  const request = { ...key, amount: 300, referenceType: 'booking', referenceId: retryId, idempotencyKey: `salon-booking:${retryId}` };
  const same = await Promise.all([retryPayments.createPendingPayment(request), retryPayments.createPendingPayment(request)]);
  assert.equal(same[0].id, same[1].id);
  await retry.send('CONFIRM');
  assert.equal(retry.count('payments'), 1);

  // Different message deliveries racing for one conversation reuse one draft.
  const racing = setup();
  const raced = await Promise.all([racing.send('Haircut tomorrow 5pm'), racing.send('Haircut tomorrow 5pm')]);
  assert.equal(raced[0].context.bookingId, raced[1].context.bookingId);
  assert.equal(racing.count('bookings'), 1);
  await Promise.all([racing.send('CONFIRM'), racing.send('CONFIRM')]);
  assert.equal(racing.count('payments'), 1);

  // Full generic webhook path, including transport stub and duplicate protection.
  const webhook = createHarness();
  webhook.seed('businesses/demo-salon', business);
  const { POST } = webhook.load('app/api/whatsapp/webhook/route.ts');
  const payload = dummyPayload('wamid.salon');
  payload.entry[0].changes[0].value.messages[0].text.body = 'Haircut 25/10/2099 5pm with Priya';
  const post = () => POST(new NextRequest('http://localhost/api/whatsapp/webhook', { method: 'POST', headers: signedWebhookHeaders(payload), body: JSON.stringify(payload) }));
  result = await (await post()).json();
  assert.equal(result.vertical, 'salon'); assert.equal(result.state, 'salon_awaiting_confirmation');
  assert.equal((await (await post()).json()).skipped, 'duplicate_message');
  assert.equal([...webhook.documents.keys()].filter((id) => id.startsWith('bookings/')).length, 1);

  // A context-supplied booking must belong to the active business/customer.
  const guarded = setup();
  await guarded.send('Haircut tomorrow 5pm');
  const ownedId = guarded.conversation().context.bookingId;
  guarded.seed('bookings/' + ownedId, { ...guarded.read('bookings/' + ownedId), businessId: 'other' });
  await assert.rejects(guarded.send('CANCEL'), /does not match/);
  console.log('PASS: Salon parsing and all five services; incremental date/time; India timezone/midnight; stylist default/selection; hours/duration/past dates; draft/summary reuse; confirmation/idempotent payments; trusted paid completion; CANCEL/RESET; generic webhook duplicates; ownership. All external services mocked.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
