/* eslint-disable @typescript-eslint/no-require-imports */
const fixtures = require('./fixtures/business-data.json');

/** Create missing demo records only. Existing identities/settings/prices win. */
async function seedDemoBusinesses(db, { dryRun = false } = {}) {
  const { FieldValue } = require('firebase-admin/firestore');
  const report = { businessesCreated: 0, catalogCreated: 0, catalogPreserved: 0, dryRun };
  for (const vertical of ['eats', 'salon', 'motos']) {
    const id = `demo-${vertical}`;
    const fixture = fixtures[vertical];
    const ref = db.collection('businesses').doc(id);
    const defaults = { name: `Demo ${vertical[0].toUpperCase() + vertical.slice(1)}`, vertical, active: true, whatsappPhoneNumberId: `DEMO_${vertical.toUpperCase()}_PHONE_NUMBER_ID`, settings: fixture.settings };
    const businessCreated = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const existing = snapshot.data();
      if (existing?.vertical && existing.vertical !== vertical) throw new Error(`Refusing to seed ${id}: existing vertical differs`);
      if (!snapshot.exists) {
        if (!dryRun) transaction.create(ref, defaults);
        return true;
      } else {
        const missing = Object.fromEntries(Object.entries(defaults).filter(([key]) => existing[key] === undefined));
        // Seed only absent top-level settings; retain any configured staff map.
        missing.settings = { ...fixture.settings, ...(existing.settings ?? {}) };
        if (!dryRun) transaction.set(ref, missing, { merge: true });
        return false;
      }
    });
    if (businessCreated) report.businessesCreated += 1;
    for (const item of fixture.catalog) {
      const itemRef = ref.collection('catalog').doc(item.id);
      const created = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(itemRef);
        if (snapshot.exists) return false;
        if (!dryRun) transaction.create(itemRef, { ...item, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
        return true;
      });
      if (created) report.catalogCreated += 1;
      else report.catalogPreserved += 1;
    }
  }
  return report;
}

async function main() {
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  const { createRequire } = require('node:module');
  const ts = require('typescript');
  const root = path.resolve(__dirname, '..');
  require('@next/env').loadEnvConfig(root);
  // Execute the project's unchanged Admin module, rather than duplicating setup.
  const filename = path.join(root, 'lib/firebase-admin.ts');
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const loaded = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename })(createRequire(filename), loaded, loaded.exports);
  const report = await seedDemoBusinesses(loaded.exports.adminDb, { dryRun: process.argv.includes('--dry-run') });
  console.log(JSON.stringify(report, null, 2));
}
if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { seedDemoBusinesses };
