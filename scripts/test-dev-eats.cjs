/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const { createHarness, demoBusiness } = require('./messaging-test-helpers.cjs');

async function main() {
  const h = createHarness();
  h.seed('businesses/demo-eats', demoBusiness);
  const { POST } = h.load('app/api/dev/eats-test/route.ts');
  const key = { businessId: 'demo-eats', customerPhone: '918072656887' };
  const post = (body) => POST(new NextRequest('http://localhost/api/dev/eats-test', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
  const oldEnvironment = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    assert.equal((await post({ ...key, message: '2 chicken biriyani' })).status, 404);
    assert.equal(h.writes.length, 0);
    process.env.NODE_ENV = 'development';
    assert.equal((await post({ ...key, message: 2 })).status, 400);
    assert.equal((await post({ ...key, businessId: '../invalid', message: 'hi' })).status, 400);
    assert.equal((await post({ ...key, message: '', location: { latitude: 100, longitude: 0 } })).status, 400);
    assert.equal((await post({ ...key, businessId: 'missing', message: 'hi' })).status, 404);
    assert.equal(h.writes.length, 0);
    let response = await post({ ...key, message: 'chicken biriyani' });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).state, 'eats_awaiting_quantity');
    let result = await (await post({ ...key, message: '2' })).json();
    assert.equal(result.state, 'eats_awaiting_location');
    assert.equal(result.context.total, 360);
    const orderId = result.orderId;
    result = await (await post({ ...key, message: '', location: { latitude: 12.97, longitude: 77.59, label: 'Home' } })).json();
    assert.equal(result.state, 'eats_awaiting_confirmation');
    assert.equal(result.orderId, orderId);
    result = await (await post({ ...key, message: 'CONFIRM' })).json();
    assert.equal(result.state, 'eats_awaiting_payment');
    assert.ok(result.paymentId);
    assert.equal(h.read('payments/' + result.paymentId).status, 'pending');
    assert.equal(h.read('orders/' + orderId).paymentId, result.paymentId);
    result = await (await post({ ...key, message: 'RESET' })).json();
    assert.equal(result.state, 'eats_start');
    assert.deepEqual(result.context, {});
    assert.equal(result.orderId, undefined);
    assert.equal(result.paymentId, undefined);
    assert.equal(h.read('orders/' + orderId).status, 'cancelled');
    result = await (await post({ ...key, message: '2 chicken biriyani' })).json();
    assert.equal(result.state, 'eats_awaiting_confirmation');
    assert.notEqual(result.orderId, orderId);
    assert.equal(h.sends.length, 0);
    assert.equal([...h.documents.keys()].filter((id) => id.startsWith('messages/')).length, 0);
    console.log('PASS: development Eats endpoint; production 404 with no writes; validation; quantity/location/confirmation/payment; persisted RESET/restart; no WhatsApp sends. Firestore mocked for this test.');
  } finally {
    if (oldEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldEnvironment;
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
