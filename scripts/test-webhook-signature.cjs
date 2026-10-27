/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { NextRequest } = require('next/server');
const { createHarness } = require('./messaging-test-helpers.cjs');

async function main() {
  const previous = { NODE_ENV: process.env.NODE_ENV, META_APP_SECRET: process.env.META_APP_SECRET, META_WEBHOOK_VERIFY_TOKEN: process.env.META_WEBHOOK_VERIFY_TOKEN };
  const info = console.info;
  const error = console.error;
  const logs = [];
  console.info = (...args) => logs.push(args);
  console.error = (...args) => logs.push(args);
  try {
    process.env.NODE_ENV = 'production';
    process.env.META_APP_SECRET = 'signature-test-secret-sentinel';
    process.env.META_WEBHOOK_VERIFY_TOKEN = 'signature-test-verify-token';
    const h = createHarness();
    const { POST, GET } = h.load('app/api/whatsapp/webhook/route.ts');
    const { verifyWhatsAppSignature } = h.load('lib/messaging/webhook-signature.ts');
    const raw = '{\n  "object": "whatsapp_business_account", "entry": [], "sample": "வணக்கம் 👋"\n}';
    const sign = body => 'sha256=' + createHmac('sha256', process.env.META_APP_SECRET).update(body, 'utf8').digest('hex');
    const signature = sign(raw);
    const post = async (body, header) => {
      const request = new NextRequest('https://tany.in/api/whatsapp/webhook', {
        method: 'POST', body, headers: header === undefined ? {} : { 'x-hub-signature-256': header },
      });
      const read = request.text.bind(request);
      let reads = 0;
      request.text = () => { reads++; return read(); };
      request.json = () => { throw new Error('request.json must not be called'); };
      const response = await POST(request);
      assert.equal(reads, 1, 'body must be read exactly once');
      return response;
    };
    assert.equal(verifyWhatsAppSignature(raw, signature, process.env.META_APP_SECRET), true);
    assert.equal((await post(raw, signature)).status, 200);
    assert.equal((await post(raw, 'sha256=' + '0'.repeat(64))).status, 401);
    assert.equal((await post(raw + ' ', signature)).status, 401);
    assert.equal((await post(JSON.stringify(JSON.parse(raw)), signature)).status, 401);
    assert.equal((await post(raw)).status, 401);
    for (const malformed of ['', 'sha256=abc', 'sha1=' + '0'.repeat(64), 'sha256=' + 'z'.repeat(64)]) {
      assert.equal((await post(raw, malformed)).status, 401);
    }
    assert.equal((await post('not json', signature)).status, 401, 'reject before parsing JSON');
    const malformedBody = 'private-payload-sentinel';
    assert.equal((await post(malformedBody, sign(malformedBody))).status, 500);
    delete process.env.META_APP_SECRET;
    const missingConfig = await post(raw, signature);
    assert.equal(missingConfig.status, 503);
    assert.match((await missingConfig.json()).error, /not configured/);
    process.env.NODE_ENV = 'development';
    assert.equal((await post(raw)).status, 401, 'no unsigned development bypass');
    const beforeGet = logs.length;
    const validGet = await GET(new NextRequest('https://tany.in/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=signature-test-verify-token&hub.challenge=12345'));
    assert.equal(validGet.status, 200);
    assert.equal(await validGet.text(), '12345');
    assert.equal((await GET(new NextRequest('https://tany.in/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong'))).status, 403);
    assert.equal(logs.length, beforeGet, 'GET does not run POST signature checks');
    assert.equal(h.sends.length, 0);
    assert.equal(h.writes.length, 0);
    for (const marker of ['[WA_SIGNATURE_CHECK]', '[WA_SIGNATURE_VALID]', '[WA_SIGNATURE_INVALID]']) assert.ok(logs.some(log => log[0] === marker));
    for (const log of logs.filter(log => log[0] === '[WA_SIGNATURE_CHECK]')) {
      assert.deepEqual(Object.keys(log[1]).sort(), ['hasAppSecret', 'hasHeader']);
      assert.equal(typeof log[1].hasHeader, 'boolean');
      assert.equal(typeof log[1].hasAppSecret, 'boolean');
    }
    const serialized = JSON.stringify(logs);
    for (const forbidden of ['signature-test-secret-sentinel', 'signature-test-verify-token', signature, 'வணக்கம்', '"entry": []', malformedBody]) assert.ok(!serialized.includes(forbidden));
  } finally {
    console.info = info;
    console.error = error;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  console.log('PASS: raw UTF-8 HMAC, single read, tampered/missing/malformed signatures, production configuration error, safe logs and unchanged GET verification.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
