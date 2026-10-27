/* eslint-disable @typescript-eslint/no-require-imports */
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const suites = [
  'eats-product-approval',
  'native-product-sequence',
  'whatsapp-account-metadata',
  'eats-catalog', 'product-automation-templates', 'active-vertical-registry', 'automation-builder', 'internal-dashboard', 'client-operations', 'whatsapp-setup', 'entitlements', 'click-first', 'demo-linking',
  'whatsapp-identity', 'webhook-debug', 'webhook-signature',
  'operations', 'whatsapp-dashboard', 'admin-services', 'integration-api',
  'catalog-services',
  'cabs-flow', 'retail-flow', 'ecom-flow', 'garage-flow', 'meds-flow', 'meat-flow',
  'expert-flow', 'gaming-flow', 'sport-flow', 'motos-flow', 'salon-flow', 'eats-flow',
  'interactive-messaging', 'messaging', 'domain-services', 'dev-eats',
];
for (const suite of suites) {
  const result = spawnSync(process.execPath, [path.join(__dirname, `test-${suite}.cjs`)], { stdio: 'inherit' });
  if (result.error) { console.error(result.error); process.exit(1); }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`PASS: all ${suites.length} flow/regression suites.`);
