/* eslint-disable @typescript-eslint/no-require-imports */
// Trusted local/Admin-SDK command. There is intentionally no public plan-assignment API.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');

async function main() {
  const [businessId, plan, status = 'active'] = process.argv.slice(2);
  if (!businessId || !['basic', 'standard', 'pro'].includes(plan)) throw new Error('Usage: node scripts/assign-demo-subscription.cjs demo-eats pro [active|trialing|past_due|cancelled|expired]');
  const root = path.resolve(__dirname, '..');
  require('@next/env').loadEnvConfig(root);
  const cache = new Map();
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = { exports: {} }; cache.set(filename, mod);
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const nativeRequire = createRequire(filename);
    const localRequire = name => name === 'server-only' ? {} : name.startsWith('@/') ? load(name.slice(2) + '.ts') : nativeRequire(name);
    vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename })(localRequire, mod, mod.exports);
    return mod.exports;
  }
  await load('lib/subscriptions/entitlements.ts').assignDemoSubscription(businessId, plan, status);
  console.log(`Assigned ${plan} (${status}) to ${businessId} for 30 days.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
