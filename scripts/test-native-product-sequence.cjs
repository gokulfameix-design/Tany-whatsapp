/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { createHarness, demoBusiness } = require('./messaging-test-helpers.cjs');
const phone = '919999999999';
async function setup() {
  const h = createHarness();
  const business = { ...demoBusiness, id: 'demo-eats' };
  h.seed('businesses/demo-eats', business);
  h.seed('whatsapp_accounts/demo-eats', { businessId: 'demo-eats', phoneNumberId: demoBusiness.whatsappPhoneNumberId, wabaId: '123456', displayPhone: '+919876543210', status: 'connected', catalogEnabled: true, catalogId: '1125148453496527' });
  const items = await h.load('lib/messaging/services/catalog-service.ts').getAvailableCatalogItems('demo-eats');
  for (const [index, item] of items.entries()) {
    h.seed(`businesses/demo-eats/catalog/${item.id}`, { ...item, category: `Category ${index}` });
    h.seed(`businesses/demo-eats/whatsapp_product_mappings/${item.id}`, { businessId: 'demo-eats', tanyProductId: item.id, catalogId: '1125148453496527', retailerProductId: `meta-${item.id}`, whatsappReviewStatus: "APPROVED" });
  }
  const processIncoming = h.load('lib/messaging/services/incoming-message-service.ts').processIncomingMessage;
  const send = (text, id = 'wamid.sequence') => processIncoming(business, { from: phone, id, type: 'text', text: { body: text } });
  return { ...h, items, send, processIncoming, business };
}
async function main() {
  delete process.env.WHATSAPP_PRODUCT_LIST_ENABLED;
  for (const command of ['START', 'Start Order', 'View Menu']) {
    const h = await setup();
    const result = await h.send(command);
    assert.equal(result.structuredReply.type, 'product_sequence');
    assert.equal(h.sends.length, h.items.length + 1);
    assert.deepEqual(h.sends.slice(0, -1).map(s => s.reply.retailerProductId), h.items.map(i => `meta-${i.id}`));
    assert.ok(h.sends.slice(0, -1).every(s => s.reply.type === 'product' && s.reply.catalogId === '1125148453496527' && s.reply.allowFallback === false));
    assert.deepEqual(h.sends.at(-1).reply.buttons.map(b => b.title), ['View Cart', 'More Items', 'Checkout']);
    assert.ok(h.sends.every(s => s.reply.type !== 'product_list'));
    await h.send(command);
    assert.equal(h.sends.length, h.items.length + 1, 'duplicate events do not resend cards');
    const more = h.sends.at(-1).reply.buttons[1];
    const moreResult = await h.processIncoming(h.business, { from: phone, id: 'wamid.more', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: more.id, title: more.title } } });
    assert.equal(moreResult.structuredReply.type, 'product_sequence');
    assert.equal(h.sends.length, (h.items.length + 1) * 2, 'More Items sends the whole mapped menu');
  }
  for (const failurePoint of ['card', 'buttons']) {
    const h = await setup();
    const push = h.sends.push.bind(h.sends);
    h.sends.push = (...args) => { const count = push(...args); if (count === (failurePoint === 'card' ? 1 : h.items.length)) h.failNextSend(); return count; };
    await assert.rejects(h.send('View Menu'), /Mock Meta failure/);
    await h.send('View Menu');
    assert.equal(h.sends.length, h.items.length + 1, 'retry skips every previously recorded success');
    assert.equal(new Set(h.sends.slice(0, -1).map(s => s.reply.retailerProductId)).size, h.items.length);
    assert.equal(h.sends.at(-1).reply.type, 'buttons');
    const outgoing = [...h.documents.values()].filter(d => d.direction === 'outgoing');
    assert.equal(outgoing.length, h.items.length + 1, 'each card and the final buttons have a delivery record');
  }
  const cart = await setup();
  await cart.send('View Menu');
  const selected = cart.items[0];
  await cart.processIncoming(cart.business, { from: phone, id: 'wamid.sequence-cart', type: 'order', order: { catalog_id: '1125148453496527', product_items: [{ product_retailer_id: `meta-${selected.id}`, quantity: 2, item_price: '0.01', currency: 'USD' }] } });
  const conversation = cart.read(`conversations/demo-eats_${phone}`);
  const order = cart.read(`orders/${conversation.context.orderId}`);
  assert.equal(order.items[0].quantity, 2);
  assert.equal(order.total, selected.price * 2, 'incoming cart still uses server prices');
  const cached = await setup();
  cached.failNextSend();
  await assert.rejects(cached.send('View Menu'), /Mock Meta failure/);
  const preparedMessage = cached.read('messages/wamid.sequence');
  cached.seed('messages/wamid.sequence', { ...preparedMessage, preparedResult: { ...preparedMessage.preparedResult, reply: { ...preparedMessage.preparedResult.reply, products: preparedMessage.preparedResult.reply.products.map(product => ({ ...product, catalogId: '99887766' })) } } });
  const replayed = await cached.send('View Menu');
  assert.ok(replayed.structuredReply.products.every(product => product.catalogId === '1125148453496527'));
  assert.ok(cached.sends.slice(0, -1).every(send => send.reply.catalogId === '1125148453496527'), 'webhook retries must rebind stale prepared catalog IDs before sending');
  // Exercise real fetch payloads: strictly sequential native cards, then buttons.
  const h = await setup();
  const sequence = (await h.send('View Menu')).structuredReply;
  const transportHarness = createHarness({ seedFixtures: false });
  for (const [key, data] of h.documents) if (key.startsWith('businesses/demo-eats/') || key === 'businesses/demo-eats' || key === 'whatsapp_accounts/demo-eats') transportHarness.seed(key, data);
  transportHarness.seed('businesses/demo-eats', { ...h.business, whatsappPhoneNumberId: '123' });
  transportHarness.seed('whatsapp_accounts/demo-eats', { ...h.read('whatsapp_accounts/demo-eats'), phoneNumberId: '123', tokenSecretName: 'SEQUENCE_TEST_TOKEN' });
  const transport = transportHarness.load('lib/messaging/whatsapp.ts');
  const oldFetch = global.fetch, oldToken = process.env.META_ACCESS_TOKEN;
  const envKeys = ['WHATSAPP_TOKEN_SECRET_NAMES', 'WHATSAPP_TOKEN_SECRET_BINDINGS', 'SEQUENCE_TEST_TOKEN'];
  const previousEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  process.env.WHATSAPP_TOKEN_SECRET_NAMES = 'SEQUENCE_TEST_TOKEN';
  process.env.WHATSAPP_TOKEN_SECRET_BINDINGS = JSON.stringify({ 'demo-eats': 'SEQUENCE_TEST_TOKEN' });
  process.env.SEQUENCE_TEST_TOKEN = 'sequence-test-token';
  process.env.META_ACCESS_TOKEN = 'sequence-test-token';
  const payloads = [];
  const info = console.info;
  const logs = [];
  let active = 0;
  try {
    console.info = (...args) => logs.push(args);
    global.fetch = async (_url, options) => {
      if (options.method !== 'POST') return { ok: true, json: async () => ({ data: h.items.map(item => ({ retailer_id: `meta-${item.id}`, availability: 'in stock', capability_to_review_status: [{ key: 'WHATSAPP', value: 'APPROVED' }] })) }) };
      assert.equal(active++, 0, 'sends must not overlap');
      payloads.push(JSON.parse(options.body));
      await Promise.resolve(); active--;
      return { ok: true, json: async () => ({ messages: [{ id: `wamid.${payloads.length}` }] }) };
    };
    const stale = { ...sequence, products: sequence.products.map((product, index) => ({ ...product, catalogId: index % 2 ? '99887766' : '123456' })) };
    await transport.sendWhatsAppMessage({ phoneNumberId: '123', to: phone, reply: stale });
    assert.deepEqual(payloads.map(p => p.interactive.type), [...h.items.map(() => 'product'), 'button']);
    assert.deepEqual(payloads.slice(0, -1).map(p => p.interactive.action.product_retailer_id), h.items.map(i => `meta-${i.id}`));
    assert.ok(payloads.slice(0, -1).every(p => p.interactive.action.catalog_id === '1125148453496527'), 'every card must use current catalog config, never cached product/WABA IDs');
    const sendLogs = logs.filter(([marker]) => marker === '[WA_PRODUCT_SEQUENCE_SEND]');
    assert.deepEqual(sendLogs.map(([, details]) => details.index), h.items.map((_, index) => index));
    for (const [, details] of sendLogs) {
      assert.deepEqual(Object.keys(details).sort(), ['catalogId', 'retailerProductId', 'index'].sort());
      assert.equal(details.catalogId, '1125148453496527');
    }
    assert.ok(!JSON.stringify(sendLogs).includes(phone));
    assert.ok(!JSON.stringify(sendLogs).includes('sequence-test-token'));
    const legacy = { type: 'product_list', body: sequence.body, header: 'Menu', catalogId: '99887766', sections: [{ title: 'Menu', productIds: [`meta-${h.items[0].id}`] }], fallback: sequence.fallback };
    await transport.sendWhatsAppMessage({ phoneNumberId: '123', to: phone, reply: legacy });
    assert.deepEqual(payloads.slice(-2).map(p => p.interactive.type), ['product', 'button'], 'disabled flag also converts old prepared product lists');
    assert.equal(payloads.at(-2).interactive.action.catalog_id, '1125148453496527', 'legacy converted sequences also use current catalog');
    const before = payloads.length;
    await transport.sendWhatsAppMessage({ phoneNumberId: '123', to: phone, reply: { ...sequence, products: [{ ...sequence.products[0], retailerProductId: 'foreign-product' }] } });
    assert.deepEqual(payloads.slice(before).map(payload => payload.interactive.type), ['list', 'button'], 'unmapped product uses a safe menu fallback without aborting');
  } finally {
    console.info = info;
    global.fetch = oldFetch;
    for (const key of envKeys) if (previousEnv[key] === undefined) delete process.env[key]; else process.env[key] = previousEnv[key];
    if (oldToken === undefined) delete process.env.META_ACCESS_TOKEN; else process.env.META_ACCESS_TOKEN = oldToken;
  }
  console.log('PASS: ordered complete native product sequences, final cart buttons, more items, individual delivery records, duplicate suppression, partial failure recovery, sequential Meta payloads and disabled legacy product lists.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
