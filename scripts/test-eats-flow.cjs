/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const { signedWebhookHeaders, createHarness, dummyPayload, demoBusiness } = require('./messaging-test-helpers.cjs');

function setup() {
  const h = createHarness();
  h.seed('businesses/demo-eats', demoBusiness);
  const { POST } = h.load('app/api/whatsapp/webhook/route.ts');
  const conversationId = 'conversations/demo-eats_919999999999';
  let sequence = 0;
  return {
    ...h,
    conversation: () => h.read(conversationId),
    order: () => h.read('orders/' + h.read(conversationId)?.context.orderId),
    count: (collection) => [...h.documents.keys()].filter((key) => key.startsWith(collection + '/')).length,
    async send(text, location, messageId, expectedStatus = 200) {
      const payload = dummyPayload(messageId ?? `wamid.eats-${++sequence}`);
      const message = payload.entry[0].changes[0].value.messages[0];
      if (location) {
        message.type = 'location'; delete message.text; message.location = location;
      } else message.text.body = text;
      const response = await POST(new NextRequest('http://localhost/api/whatsapp/webhook', {
        method: 'POST', headers: signedWebhookHeaders(payload), body: JSON.stringify(payload),
      }));
      const result = await response.json();
      assert.equal(response.status, expectedStatus, JSON.stringify(result));
      return result;
    },
  };
}

const location = { latitude: 12.97, longitude: 77.59, address: 'Bengaluru', name: 'Home' };
const customerKey = { businessId: 'demo-eats', customerPhone: '919999999999' };

async function main() {
  const h = setup();
  let response = await h.send('2 chicken biriyani');
  assert.equal(response.state, 'eats_awaiting_location');
  assert.equal(response.reply, 'Please share your delivery location.');
  assert.equal(h.conversation().context.itemName, 'chicken biriyani');
  assert.equal(h.conversation().context.quantity, 2);
  assert.equal(h.order().subtotal, 360);
  assert.equal(h.order().deliveryFee, 0);
  assert.equal(h.order().total, 360);
  assert.equal(h.order().status, 'draft');
  const orderId = h.conversation().context.orderId;
  await h.send('not a location');
  assert.equal(h.count('orders'), 1);
  assert.equal(h.conversation().state, 'eats_awaiting_location');
  response = await h.send('', location);
  assert.equal(response.state, 'eats_awaiting_confirmation');
  assert.equal(response.reply, 'Order summary:\n2 × Chicken Biriyani\nTotal: ₹360\n\nReply CONFIRM to continue.');
  assert.equal(h.conversation().context.orderId, orderId);
  assert.equal(h.conversation().context.location.label, 'Home');
  assert.equal(h.order().location.source, 'whatsapp');
  assert.equal(h.order().status, 'pending_confirmation');
  assert.equal((await h.send('yes')).state, 'eats_awaiting_confirmation');
  assert.equal(h.count('payments'), 0);
  response = await h.send(' confirm ');
  assert.equal(response.state, 'eats_awaiting_payment');
  assert.equal(response.reply, 'Your order is confirmed. Payment link will be sent shortly.');
  assert.equal(h.conversation().status, 'waiting_payment');
  assert.equal(h.order().status, 'awaiting_payment');
  const paymentId = h.order().paymentId;
  const payment = h.read('payments/' + paymentId);
  assert.equal(payment.status, 'pending');
  assert.equal(payment.referenceType, 'order');
  assert.equal(payment.referenceId, orderId);
  assert.equal(payment.amount, 360);
  assert.equal(payment.provider, 'razorpay');
  await h.send('CONFIRM');
  await h.send('paid');
  assert.equal(h.conversation().state, 'eats_awaiting_payment');
  assert.equal(h.count('payments'), 1);
  // A retried confirmation with pre-save conversation state still reuses payment.
  const originalConversation = h.conversation();
  h.seed('conversations/demo-eats_919999999999', { ...originalConversation, state: 'eats_awaiting_confirmation' });
  await h.send('CONFIRM');
  assert.equal(h.count('payments'), 1);
  const { markPaymentPaid } = h.load('lib/messaging/services/payment-service.ts');
  await markPaymentPaid({ paymentId, providerPaymentId: 'mock-paid' });
  response = await h.send('status');
  assert.equal(response.state, 'eats_completed');
  assert.equal(h.conversation().status, 'completed');
  assert.equal(h.order().status, 'paid');
  await h.send('CANCEL');
  assert.equal(h.order().status, 'paid');
  const settledOrderId = h.conversation().context.orderId;
  await h.send('RESET');
  assert.deepEqual(h.conversation().context, {});
  assert.equal(h.read('orders/' + settledOrderId).status, 'paid');

  const missing = setup();
  response = await missing.send('chicken biriyani');
  assert.equal(response.state, 'eats_awaiting_quantity');
  assert.equal(response.reply, 'How many would you like?');
  assert.equal(missing.count('orders'), 0);
  for (const input of ['0', '-1', '1.5', '999999999999999999999']) {
    response = await missing.send(input);
    assert.equal(response.state, 'eats_awaiting_quantity');
    assert.equal(missing.count('orders'), 0);
  }
  response = await missing.send('3');
  assert.equal(response.state, 'eats_awaiting_location');
  assert.equal(missing.order().total, 540);

  const unknown = setup();
  response = await unknown.send('2 pizza');
  assert.equal(response.state, 'eats_awaiting_item');
  assert.equal(response.reply, "Sorry, I couldn't find that item. Please try another item.");
  assert.equal(unknown.count('orders'), 0);
  assert.equal(unknown.count('payments'), 0);
  response = await unknown.send('1 dosa');
  assert.equal(response.state, 'eats_awaiting_location');
  assert.equal(unknown.order().total, 60);

  // A canonical stored location skips the WhatsApp location request entirely.
  const stored = setup();
  const { saveCustomerLocation } = stored.load('lib/messaging/services/location-service.ts');
  await saveCustomerLocation({ ...customerKey, location: { ...location, label: 'Home', source: 'stored' } });
  response = await stored.send('2 biriyani');
  assert.equal(response.state, 'eats_awaiting_confirmation');
  assert.equal(stored.order().total, 360);
  assert.equal(stored.order().location.label, 'Home');
  assert.equal(stored.conversation().context.itemName, 'chicken biriyani');

  // Future flows can supply JSON location context without a location webhook.
  const contextual = setup();
  await contextual.send('1 idli');
  const { updateConversationState } = contextual.load('lib/messaging/services/conversation-service.ts');
  await updateConversationState({ ...customerKey, state: 'eats_awaiting_location', context: { location: { latitude: 0, longitude: 0, label: 'Office' } } });
  response = await contextual.send('location supplied');
  assert.equal(response.state, 'eats_awaiting_confirmation');
  assert.equal(contextual.order().total, 40);
  assert.equal(contextual.order().location.latitude, 0);

  // CANCEL works at every active stage, with and without a draft/payment.
  for (const stage of ['start', 'item', 'quantity', 'location', 'confirmation', 'payment']) {
    const cancelled = setup();
    if (stage === 'item') await cancelled.send('hello');
    if (stage === 'quantity') await cancelled.send('dosa');
    if (['location', 'confirmation', 'payment'].includes(stage)) await cancelled.send('2 dosa');
    if (['confirmation', 'payment'].includes(stage)) await cancelled.send('', location);
    if (stage === 'payment') await cancelled.send('CONFIRM');
    const id = cancelled.conversation()?.context.orderId;
    response = await cancelled.send('cancel');
    assert.equal(response.reply, 'Your order has been cancelled.');
    assert.equal(cancelled.conversation().status, 'cancelled');
    assert.deepEqual(cancelled.conversation().context, {});
    if (id) assert.equal(cancelled.read('orders/' + id).status, 'cancelled');
    await cancelled.send('CONFIRM');
    assert.notEqual(cancelled.conversation().status, 'cancelled');
    assert.equal(cancelled.conversation().state, 'eats_awaiting_item');
    if (id) assert.equal(cancelled.read('orders/' + id).status, 'cancelled');
  }

  // Cancelled sessions reopen on greetings, restart commands and ordinary order text.
  for (const input of ['Hi', 'Start', 'New order', '2 chicken biriyani', 'RESET', 'START NEW ORDER', 'START A NEW ORDER', 'HELLO', 'something else']) {
    const reopened = setup();
    await reopened.send('1 dosa');
    const cancelledOrderId = reopened.conversation().context.orderId;
    await reopened.send('CANCEL');
    assert.deepEqual(reopened.conversation().context, {});
    // Legacy cancelled sessions may still carry stale order/payment/location context.
    reopened.seed('conversations/demo-eats_919999999999', { ...reopened.conversation(), context: { orderId: cancelledOrderId, paymentId: 'stale-payment', location: {latitude:1,longitude:2}, total:60, quantity:1, itemName:'dosa' } });
    response = await reopened.send(input);
    assert.notEqual(response.reply, 'Your order has been cancelled.', input);
    assert.notEqual(reopened.conversation().status, 'cancelled', input);
    assert.equal(reopened.read('orders/' + cancelledOrderId).status, 'cancelled');
    assert.equal(reopened.conversation().context.paymentId, undefined);
    if (input === '2 chicken biriyani') {
      assert.equal(response.state, 'eats_awaiting_location');
      assert.equal(reopened.order().total, 360);
      assert.equal(reopened.order().items[0].quantity, 2);
      assert.notEqual(reopened.conversation().context.orderId, cancelledOrderId);
    } else if (input !== 'something else') {
      assert.equal(response.state, 'eats_start');
      assert.equal(reopened.conversation().status, 'active');
      assert.match(response.reply, /Welcome to Tany Eats/);
      assert.deepEqual(reopened.conversation().context, {});
      await reopened.send('2 chicken biriyani');
      assert.notEqual(reopened.conversation().context.orderId, cancelledOrderId);
      assert.equal(reopened.order().total, 360);
    }
  }

  // Restart commands protect paid and fulfilled orders, even from an older conversation state.
  for (const status of ['paid', 'delivered']) {
    for (const input of ['CANCEL', 'RESET', 'HI', 'NEW ORDER', 'START A NEW ORDER']) {
      const protectedOrder = setup();
      await protectedOrder.send('1 dosa');
      const id = protectedOrder.conversation().context.orderId;
      const settled = { ...protectedOrder.order(), status };
      protectedOrder.seed('orders/' + id, settled);
      await protectedOrder.send(input);
      assert.deepEqual(protectedOrder.read('orders/' + id), settled);
      if (input !== 'CANCEL') {
        assert.equal(protectedOrder.conversation().status, 'active');
        assert.deepEqual(protectedOrder.conversation().context, {});
      }
    }
  }

  // RESET clears context in persisted storage despite normal context merge semantics.
  const reset = setup();
  await reset.send('2 dosa');
  const previousOrder = reset.conversation().context.orderId;
  response = await reset.send('RESET');
  assert.equal(response.state, 'eats_start');
  assert.equal(reset.conversation().status, 'active');
  assert.deepEqual(reset.conversation().context, {});
  assert.equal(reset.read('orders/' + previousOrder).status, 'cancelled');
  await reset.send('1 mutton biriyani');
  assert.equal(reset.order().total, 250);
  assert.notEqual(reset.conversation().context.orderId, previousOrder);

  // Transactional idempotency also covers the crash before paymentId is linked.
  const retries = setup();
  await retries.send('1 dosa');
  await retries.send('', location);
  const { createPendingPayment } = retries.load('lib/messaging/services/payment-service.ts');
  const retryOrderId = retries.conversation().context.orderId;
  const request = { ...customerKey, amount: 60, referenceType: 'order', referenceId: retryOrderId, idempotencyKey: `eats-order:${retryOrderId}` };
  const concurrentPayments = await Promise.all([createPendingPayment(request), createPendingPayment(request)]);
  assert.equal(concurrentPayments[0].id, concurrentPayments[1].id);
  await retries.send('CONFIRM');
  assert.equal(retries.count('payments'), 1);
  assert.equal(retries.order().paymentId, concurrentPayments[0].id);
  await assert.rejects(createPendingPayment({ ...request, amount: 61 }), /does not match/);

  // Retried Meta IDs cannot add quantities or create a second order/payment.
  const duplicate = setup();
  await duplicate.send('2 chicken biriyani', null, 'wamid.same');
  assert.equal((await duplicate.send('2 chicken biriyani', null, 'wamid.same')).skipped, 'duplicate_message');
  assert.equal(duplicate.count('orders'), 1);
  assert.equal(duplicate.order().items[0].quantity, 2);

  // A failed summary send replays the same summary, preserving one draft.
  const summaryRetry = setup();
  const locationService = summaryRetry.load('lib/messaging/services/location-service.ts');
  await locationService.saveCustomerLocation({ ...customerKey, location: { ...location, source: 'stored' } });
  summaryRetry.failNextSend();
  const originalError = console.error;
  try {
    console.error = () => {};
    await summaryRetry.send('2 chicken biriyani', null, 'wamid.summary-retry', 500);
  } finally { console.error = originalError; }
  response = await summaryRetry.send('2 chicken biriyani', null, 'wamid.summary-retry');
  assert.equal(response.reply, 'Order summary:\n2 × Chicken Biriyani\nTotal: ₹360\n\nReply CONFIRM to continue.');
  assert.equal(summaryRetry.count('orders'), 1);
  assert.equal(summaryRetry.order().items[0].quantity, 2);

  // Ownership is checked before acting on context-supplied IDs.
  const { handleEatsMessage } = duplicate.load('lib/messaging/flows/eats.ts');
  const otherOrder = { ...duplicate.order(), businessId: 'other-business' };
  duplicate.seed('orders/other-order', otherOrder);
  await assert.rejects(handleEatsMessage('CANCEL', {
    business: { ...demoBusiness, id: 'demo-eats' }, customerPhone: customerKey.customerPhone,
    conversation: { ...duplicate.conversation(), context: { orderId: 'other-order' } },
  }), /does not match/);
  assert.notEqual(duplicate.read('orders/other-order').status, 'cancelled');
  console.log('PASS: Eats item/quantity parsing; all four prices; unknown item; invalid quantities; location request/context/native/stored skip; summary; confirmation/payment reuse; trusted completion; CANCEL at all active stages; persisted RESET; CANCEL followed by greetings/restart/direct orders; paid and fulfilled order protection; duplicate webhook; order ownership. No live Meta/Razorpay/Firebase calls.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
