/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { inspectMetaCatalog } = require('./inspect-meta-catalog.cjs');
async function main() {
  const token = 'private-test-token';
  const requests = [], lines = [];
  const rows = await inspectMetaCatalog({ accessToken: token, write: line => lines.push(line), fetchImpl: async (url, options) => {
    requests.push(url.href);
    assert.equal(url.origin, 'https://graph.facebook.com');
    assert.equal(url.pathname, '/v26.0/1125148453496527/products');
    assert.equal(url.searchParams.get('fields'), 'name,id,retailer_id,availability,capability_to_review_status');
    assert.equal(options.headers.Authorization, `Bearer ${token}`);
    assert.ok(!url.href.includes(token));
    if (requests.length === 1) return { ok: true, json: async () => ({ data: [{ name: 'Chicken biriyani', id: '100', retailer_id: 'real-chicken', availability: 'in stock', capability_to_review_status: [{ key: 'DA', value: 'APPROVED' }, { key: 'WHATSAPP', value: 'NO_REVIEW' }], access_token: token, extra: 'not for output' }], paging: { next: `https://untrusted.test/?access_token=${token}`, cursors: { after: 'cursor2' } } }) };
    assert.equal(url.searchParams.get('after'), 'cursor2');
    return { ok: true, json: async () => ({ data: [{ name: 'Mutton biriyani', id: '200', retailer_id: 'real-mutton', availability: 'in stock' }] }) };
  } });
  assert.equal(rows.length, 2); assert.equal(lines.length, 2);
  for (const line of lines) assert.deepEqual(Object.keys(JSON.parse(line)), ['name', 'id', 'retailer_id', 'availability', 'whatsapp_review_status']);
  assert.equal(rows[0].whatsapp_review_status, 'NO_REVIEW');
  assert.equal(rows[1].whatsapp_review_status, null, 'missing channel status must not imply approval');
  assert.ok(!JSON.stringify(lines).includes(token));
  const errors = [];
  await assert.rejects(inspectMetaCatalog({ accessToken: token, write: line => errors.push(line), fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ error: { code: 100, message: `Error with access_token=${token}` } }) }) }), error => !error.message.includes(token) && /HTTP 400, code 100/.test(error.message));
  assert.deepEqual(errors, []);
  await assert.rejects(inspectMetaCatalog({ accessToken: '' }), /not configured/);
  console.log('PASS: read-only catalog query, allowlisted output, safe cursor pagination, no token output and sanitized failures.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
