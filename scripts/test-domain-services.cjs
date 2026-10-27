/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { createHarness } = require('./messaging-test-helpers.cjs');

async function main() {
  const h = createHarness();
  const customer = h.load('lib/messaging/services/customer-service.ts');
  const conversations = h.load('lib/messaging/services/conversation-service.ts');
  const orders = h.load('lib/messaging/services/order-service.ts');
  const bookings = h.load('lib/messaging/services/booking-service.ts');
  const locations = h.load('lib/messaging/services/location-service.ts');
  const payments = h.load('lib/messaging/services/payment-service.ts');
  const context = h.load('lib/messaging/context.ts');
  const key = { businessId: 'demo-eats', customerPhone: '919999999999' };
  const input = { ...key, vertical: 'eats' };
  const first = await customer.getOrCreateCustomer({ businessId: key.businessId, phone: key.customerPhone });
  assert.equal(first.id, 'demo-eats_919999999999');
  assert.equal(first.name, null);
  h.seed('customers/' + first.id, { ...h.read('customers/' + first.id), name: 'Test Customer', metadata: { loyalty: 5 } });
  const createdAt = h.read('customers/' + first.id).createdAt;
  await Promise.all(Array.from({ length: 3 }, () => customer.getOrCreateCustomer({ businessId: key.businessId, phone: key.customerPhone })));
  const returning = h.read('customers/' + first.id);
  assert.equal(returning.name, 'Test Customer');
  assert.deepEqual(returning.metadata, { loyalty: 5 });
  assert.equal(returning.createdAt.toMillis(), createdAt.toMillis());
  assert.ok(returning.lastInteractionAt.toMillis() > createdAt.toMillis());
  assert.equal([...h.documents.keys()].filter((id) => id.startsWith('customers/')).length, 1);

  assert.equal(await conversations.getConversation(key), null);
  const conversation = await conversations.getOrCreateConversation(input);
  assert.equal(conversation.state, 'eats_start');
  assert.equal(conversation.status, 'active');
  await conversations.updateConversationState({ ...key, state: 'custom_state', status: 'waiting_customer', context: { orderId: 'order-1' }, lastIncomingText: 'hi', pendingReply: 'hello' });
  await conversations.updateConversationState({ ...key, state: 'custom_state', context: { step: 2 } });
  const existing = await conversations.getOrCreateConversation(input);
  assert.equal(existing.state, 'custom_state');
  assert.equal(existing.status, 'waiting_customer');
  assert.deepEqual(existing.context, { orderId: 'order-1', step: 2 });
  assert.equal(existing.lastIncomingText, 'hi');
  assert.equal(existing.pendingReply, 'hello');
  await assert.rejects(conversations.getOrCreateConversation({ ...input, vertical: 'salon' }), /vertical/);
  await conversations.resetConversation(key);
  const reset = await conversations.getConversation(key);
  assert.equal(reset.state, 'eats_start');
  assert.deepEqual(reset.context, {});
  assert.equal(reset.pendingReply, null);
  assert.equal(reset.createdAt.toMillis(), (await conversations.getConversation(key)).createdAt.toMillis());
  const legacyKey = { businessId: 'legacy', customerPhone: '123' };
  h.seed('conversations/legacy_123', { ...legacyKey, vertical: 'salon', state: 'select_staff', pendingReply: 'Choose staff' });
  const legacy = await conversations.getOrCreateConversation({ ...legacyKey, vertical: 'salon' });
  assert.equal(legacy.state, 'select_staff');
  assert.equal(legacy.status, 'active');
  assert.deepEqual(legacy.context, {});
  assert.ok(h.read('conversations/legacy_123').createdAt);

  const baseContext = { nested: { name: 'first' }, kept: true };
  const merged = context.mergeConversationContext(baseContext, { step: 1 });
  merged.nested.name = 'changed';
  assert.equal(baseContext.nested.name, 'first');
  assert.deepEqual(context.setContextValue({}, 'orderId', 'a'), { orderId: 'a' });
  assert.equal(context.getContextValue({ orderId: 'a' }, 'orderId'), 'a');
  assert.equal(context.getContextValue({}, 'missing'), undefined);
  assert.deepEqual(context.clearConversationContext(), {});
  for (const value of [{ value: undefined }, { value: NaN }, { value: new Date() }, JSON.parse('{"__proto__":{"polluted":true}}')]) {
    assert.throws(() => context.mergeConversationContext({}, value));
  }
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => context.mergeConversationContext({}, cyclic));
  assert.equal({}.polluted, undefined);

  const order = await orders.createDraftOrder(input);
  assert.equal(order.status, 'draft');
  assert.equal(order.currency, 'INR');
  assert.equal(order.total, 0);
  const item = { id: 'tea', name: 'Tea', quantity: 1, unitPrice: 10.1, totalPrice: 999 };
  await Promise.all(Array.from({ length: 3 }, () => orders.addOrderItem({ orderId: order.id, item })));
  let savedOrder = await orders.getOrder(order.id);
  assert.equal(savedOrder.items[0].quantity, 3);
  assert.equal(savedOrder.items[0].totalPrice, 30.3);
  assert.equal(savedOrder.total, 30.3);
  savedOrder = await orders.updateOrder({ orderId: order.id, data: { deliveryFee: 5, discount: 2, businessId: 'intruder' } });
  assert.equal(savedOrder.total, 33.3);
  assert.equal(savedOrder.businessId, key.businessId);
  const roundedOrder = await orders.updateOrder({ orderId: order.id, data: { deliveryFee: 0.004, discount: 0.005 } });
  assert.equal(roundedOrder.deliveryFee, 0);
  assert.equal(roundedOrder.discount, 0.01);
  assert.equal(roundedOrder.total, 30.29);
  await orders.setOrderStatus({ orderId: order.id, status: 'confirmed' });
  assert.equal((await orders.getOrder(order.id)).status, 'confirmed');
  await assert.rejects(async () => orders.addOrderItem({ orderId: order.id, item: { ...item, quantity: -1 } }));
  await assert.rejects(orders.updateOrder({ orderId: order.id, data: { discount: NaN } }));
  await assert.rejects(orders.updateOrder({ orderId: order.id, data: { items: [item, item] } }), /Duplicate/);
  assert.equal(await orders.getOrder('missing'), null);
  await assert.rejects(orders.setOrderStatus({ orderId: 'missing', status: 'paid' }), /not found/);

  for (const vertical of ['salon', 'expert', 'gaming', 'garage', 'sport', 'cabs']) {
    const booking = await bookings.createDraftBooking({ ...input, vertical });
    assert.equal(booking.status, 'draft');
    assert.equal(booking.vertical, vertical);
    const updated = await bookings.updateBooking({ bookingId: booking.id, data: {
      serviceName: 'Session', staffId: 'staff-1', resourceId: 'room-1', bookingDate: '2026-10-24', startTime: '10:00', endTime: '11:00', amount: 250, metadata: { notes: 'Test' }, businessId: 'intruder',
    } });
    assert.equal(updated.amount, 250);
    assert.equal(updated.businessId, key.businessId);
    await bookings.setBookingStatus({ bookingId: booking.id, status: 'confirmed' });
    assert.equal((await bookings.getBooking(booking.id)).status, 'confirmed');
  }
  assert.equal(await bookings.getBooking('missing'), null);
  await assert.rejects(bookings.updateBooking({ bookingId: 'missing', data: { amount: 20 } }), /not found/);

  assert.equal(await locations.getCustomerLocation(key), null);
  await conversations.updateConversationState({ ...key, state: 'location_requested', context: { orderId: order.id } });
  await locations.saveCustomerLocation({ ...key, location: { latitude: 12.97, longitude: 77.59, address: 'Bengaluru', label: 'Home', source: 'manual' } });
  const location = await locations.getCustomerLocation(key);
  assert.equal(location.source, 'manual');
  assert.equal(location.latitude, 12.97);
  assert.equal((await conversations.getConversation(key)).context.customerLocationId, first.id);
  assert.equal((await conversations.getConversation(key)).context.orderId, order.id);
  await assert.rejects(locations.saveCustomerLocation({ ...key, location: { latitude: 91, longitude: 0, source: 'manual' } }), /Invalid/);
  const newKey = { businessId: 'new-business', customerPhone: '456' };
  await locations.saveCustomerLocation({ ...newKey, location: { latitude: 0, longitude: 0, source: 'stored' } });
  assert.equal((await locations.getCustomerLocation(newKey)).longitude, 0);

  const payment = await payments.createPendingPayment({ ...key, amount: 33.3, referenceType: 'order', referenceId: order.id });
  assert.equal(payment.provider, 'razorpay');
  assert.equal(payment.currency, 'INR');
  assert.equal(payment.status, 'pending');
  assert.equal(payment.providerPaymentId, null);
  await payments.markPaymentFailed({ paymentId: payment.id, reason: 'Test failure' });
  assert.equal(h.read('payments/' + payment.id).failureReason, 'Test failure');
  await payments.markPaymentPaid({ paymentId: payment.id, providerPaymentId: 'test-provider-id' });
  assert.equal(h.read('payments/' + payment.id).status, 'paid');
  await payments.markPaymentPaid({ paymentId: payment.id, providerPaymentId: 'test-provider-id' });
  await assert.rejects(payments.markPaymentPaid({ paymentId: payment.id, providerPaymentId: 'wrong-id' }), /does not match/);
  await assert.rejects(payments.markPaymentFailed({ paymentId: payment.id }), /settled/);
  await assert.rejects(payments.createPendingPayment({ ...key, amount: -1, referenceType: 'order', referenceId: order.id }));
  await assert.rejects(payments.createPendingPayment({ ...key, amount: 0, referenceType: 'order', referenceId: order.id }));

  const messages = h.load('lib/messaging/services/message-service.ts');
  const message = { ...input, messageId: 'unsafe/id', type: 'text', text: 'hello', whatsappTimestamp: null };
  const claim = await messages.claimIncomingMessage(message);
  assert.ok(claim.id.startsWith('meta_'));
  assert.equal(await messages.claimIncomingMessage(message), null);
  h.seed('messages/' + claim.id, { ...h.read('messages/' + claim.id), leaseUntil: h.Timestamp.fromMillis(0) });
  const newClaim = await messages.claimIncomingMessage(message);
  assert.notEqual(newClaim.token, claim.token);
  await assert.rejects(messages.markMessageProcessed(claim), /lease/);
  await messages.markMessageProcessed(newClaim);
  assert.equal(await messages.claimIncomingMessage(message), null);
  console.log('PASS: customer creation/preservation; conversation creation/migration/update/reset; safe JSON context; transactional order items/totals; six booking verticals; location persistence/context; payment placeholders/transitions; safe message IDs and lease recovery. No live services.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
