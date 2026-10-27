/* eslint-disable @typescript-eslint/no-require-imports */
// Temporary, read-only inspection. No messaging or Firestore writes.
const path = require('node:path');
const CATALOG_ID = '1125148453496527';

class InspectionError extends Error {}

async function inspectMetaCatalog({ accessToken, fetchImpl = fetch, write = console.log }) {
  if (typeof accessToken !== 'string' || !accessToken.trim()) throw new InspectionError('META_ACCESS_TOKEN is not configured.');
  const token = accessToken.trim();
  const rows = [];
  const cursors = new Set();
  let after;
  do {
    const url = new URL(`https://graph.facebook.com/v26.0/${CATALOG_ID}/products`);
    url.searchParams.set('fields', 'name,id,retailer_id,availability,capability_to_review_status');
    url.searchParams.set('limit', '100');
    if (after) url.searchParams.set('after', after);
    let response, body;
    try {
      response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
      body = await response.json();
    } catch { throw new InspectionError('Meta catalog inspection could not complete. Check network connectivity and retry.'); }
    if (!response.ok) {
      const code = Number.isSafeInteger(body?.error?.code) ? `, code ${body.error.code}` : '';
      throw new InspectionError(`Meta catalog query failed (HTTP ${response.status}${code}).`);
    }
    if (!Array.isArray(body.data)) throw new InspectionError('Meta catalog returned an unexpected response.');
    for (const product of body.data) {
      const safe = value => typeof value === 'string' ? value.split(token).join('[REDACTED]') : null;
      const whatsappReview = Array.isArray(product.capability_to_review_status)
        ? product.capability_to_review_status.find(status => status?.key === 'WHATSAPP')?.value
        : null;
      rows.push({ name: safe(product.name), id: safe(product.id), retailer_id: safe(product.retailer_id), availability: safe(product.availability), whatsapp_review_status: safe(whatsappReview) });
    }
    // Never follow or print paging.next: Meta may place credentials in that URL.
    after = body.paging?.next ? body.paging?.cursors?.after : undefined;
    if (body.paging?.next && (typeof after !== 'string' || !after || cursors.has(after))) throw new InspectionError('Meta catalog pagination could not continue safely.');
    if (after) cursors.add(after);
  } while (after);
  for (const row of rows) write(JSON.stringify(row));
  return rows;
}

if (require.main === module) {
  require('@next/env').loadEnvConfig(path.resolve(__dirname, '..'), true, { info() {}, error() {} });
  inspectMetaCatalog({ accessToken: process.env.META_ACCESS_TOKEN }).catch(error => {
    console.error(error instanceof InspectionError ? error.message : 'Meta catalog inspection failed.');
    process.exitCode = 1;
  });
}
module.exports = { inspectMetaCatalog };
