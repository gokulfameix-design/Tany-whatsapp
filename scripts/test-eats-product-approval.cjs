/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { createHarness, demoBusiness } = require('./messaging-test-helpers.cjs');
const phone = '919999999999';
const definitions = [
  ['veg', 'Veg biriyani', 'puda0gyarp', 'APPROVED'],
  ['chicken', 'Chicken biriyani', 'vhv4ckhmrx', 'NO_REVIEW'],
  ['mutton', 'Mutton biriyani', 'kk945xsl0r', 'NO_REVIEW'],
  ['dosa', 'Dosa', 'jrk1eu28id', 'NO_REVIEW'],
  ['idly', 'Idly', '83334sv9y1', 'NO_REVIEW'],
];
function fixture(statuses = definitions.map(d => d[3])) {
  const h = createHarness({ seedFixtures: false });
  const business = { ...demoBusiness, id: 'demo-eats' };
  h.seed('businesses/demo-eats', business);
  h.seed(`whatsapp_identities/${phone}`, { phone, uid: 'linked', linked: true });
  h.seed('whatsapp_accounts/demo-eats', { businessId: 'demo-eats', phoneNumberId: business.whatsappPhoneNumberId, wabaId: '123456', displayPhone: '+919876543210', status: 'connected', catalogId: '1125148453496527', catalogEnabled: true });
  definitions.forEach(([id, name, retailerProductId], index) => {
    h.seed(`businesses/demo-eats/catalog/${id}`, { name, type: 'product', price: 100 + index * 10, available: true, category: 'Meals', metadata: { sortOrder: index } });
    h.seed(`businesses/demo-eats/whatsapp_product_mappings/${id}`, { businessId: 'demo-eats', tanyProductId: id, retailerProductId, catalogId: '1125148453496527', whatsappReviewStatus: statuses[index] });
  });
  const incoming = h.load('lib/messaging/services/incoming-message-service.ts').processIncomingMessage;
  return { ...h, send: (id = 'wamid.approval') => incoming(business, { from: phone, id, type: 'text', text: { body: 'Start Order' } }), select: row => incoming(business, { from: phone, id: 'wamid.fallback-choice', type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: row.id, title: row.title } } }) };
}
async function main() {
  delete process.env.WHATSAPP_PRODUCT_LIST_ENABLED;
  const oldToken = process.env.META_ACCESS_TOKEN, oldFetch = global.fetch, info = console.info;
  const logs = [];
  try {
    console.info = (...args) => logs.push(args);
    process.env.META_ACCESS_TOKEN = 'approval-inspection-token';
    global.fetch = async (url, options) => {
      assert.equal(new URL(url).searchParams.get('fields'), 'retailer_id,availability,capability_to_review_status');
      assert.equal(options.headers.Authorization, 'Bearer approval-inspection-token');
      return { ok: true, json: async () => ({ data: definitions.map(([, , retailer_id, status]) => ({ retailer_id, availability: 'in stock', capability_to_review_status: [{ key: 'DA', value: 'APPROVED' }, { key: 'WHATSAPP', value: status }] })) }) };
    };
    const mixed = fixture(definitions.map(() => 'APPROVED')); // Live status must override a stale approved cache.
    await mixed.send();
    assert.deepEqual(mixed.sends.map(s => s.reply.type), ['product', 'list', 'buttons']);
    assert.equal(mixed.sends[0].reply.retailerProductId, 'puda0gyarp');
    const fallback = mixed.sends[1].reply.sections.flatMap(s => s.rows);
    assert.deepEqual(fallback.map(row => row.title), ['Chicken biriyani', 'Mutton biriyani', 'Dosa', 'Idly']);
    assert.deepEqual(mixed.sends.at(-1).reply.buttons.map(b => b.title), ['View Cart', 'More Items', 'Checkout']);
    const skipLogs = logs.filter(([marker]) => marker === '[WA_PRODUCT_SKIPPED]');
    assert.equal(skipLogs.length, 4);
    assert.ok(skipLogs.every(([, details]) => details.reason === 'NO_REVIEW' && Object.keys(details).length === 2));
    assert.ok(!JSON.stringify(skipLogs).includes(phone));
    assert.ok(!JSON.stringify(skipLogs).includes('approval-inspection-token'));
    await mixed.send();
    assert.equal(mixed.sends.length, 3, 'duplicate complete replies are suppressed');
    const choice = await mixed.select(fallback[0]);
    assert.equal(choice.state, 'eats_cart_quantity', 'fallback selections use the existing item/quantity handler');

    delete process.env.META_ACCESS_TOKEN;
    const rejected = fixture(['NO_REVIEW', 'REJECTED', 'PENDING', 'OUTDATED', 'NO_REVIEW']);
    await rejected.send();
    assert.deepEqual(rejected.sends.map(s => s.reply.type), ['list', 'buttons'], 'all skipped products still produce a usable reply');
    assert.equal(rejected.sends[0].reply.sections[0].rows.length, 5);

    // A product that passed preflight can still be rejected by the Messages API.
    const failed = fixture(['APPROVED', 'APPROVED', 'APPROVED', 'NO_REVIEW', 'NO_REVIEW']);
    const push = failed.sends.push.bind(failed.sends);
    failed.sends.push = (...args) => { const count = push(...args); if (count === 1) failed.failNextSend(131009); if (count === 3) failed.failNextSend(); return count; };
    await assert.rejects(failed.send(), /Mock Meta failure/); // Final buttons fail once, after native and fallback successes.
    assert.deepEqual(failed.sends.slice(0, 2).map(s => s.reply.retailerProductId), ['puda0gyarp', 'kk945xsl0r'], '131009 must not prevent later approved cards');
    assert.deepEqual(failed.sends[2].reply.sections[0].rows.map(row => row.title), ['Chicken biriyani', 'Dosa', 'Idly']);
    assert.equal(failed.read('messages/wamid.approval').catalogSequenceSkips['1'].reason, 'META_131009');
    await failed.send();
    assert.deepEqual(failed.sends.map(s => s.reply.type), ['product', 'product', 'list', 'buttons'], 'retry does not repeat sent cards, rejected cards or fallback pages');
    assert.equal(failed.read('messages/wamid.approval').processingStatus, 'processed');

    process.env.META_ACCESS_TOKEN = 'approval-inspection-token';
    global.fetch = async () => ({ ok: false, json: async () => ({ error: { code: 100 } }) });
    const unknown = fixture(definitions.map(() => undefined));
    await unknown.send();
    assert.deepEqual(unknown.sends.map(s => s.reply.type), ['list', 'buttons'], 'missing review access must never block ordinary ordering');
  } finally {
    console.info = info; global.fetch = oldFetch;
    if (oldToken === undefined) delete process.env.META_ACCESS_TOKEN; else process.env.META_ACCESS_TOKEN = oldToken;
  }
  console.log('PASS: live WhatsApp approval filtering, safe skips, full menu fallback, all-unapproved and unknown statuses, 131009 continuation, persisted retry decisions and unchanged fallback item handling.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
