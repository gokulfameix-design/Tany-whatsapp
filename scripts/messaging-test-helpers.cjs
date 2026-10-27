/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { Timestamp } = require('firebase-admin/firestore');

// In-memory Firestore boundary: real modules, serialized atomic transactions,
// server timestamps, missing-document failures, merge/update and query semantics.
function createHarness({ seedFixtures = true, linkedIdentity = true, entitledBusinesses = true } = {}) {
  const root = path.resolve(__dirname, '..');
  const documents = new Map();
  function seedEntitlement(id) {
    if (!entitledBusinesses || documents.has(`subscriptions/${id}`)) return;
    documents.set(`subscriptions/${id}`, { businessId:id, product:'whatsappAutomation', plan:'pro', status:'active', startedAt:Timestamp.fromMillis(Date.now()-1000), expiresAt:Timestamp.fromMillis(Date.now()+86400000), updatedAt:Timestamp.now() });
    documents.set(`entitlements/${id}`, { businessId:id, whatsappAutomation:true, campaigns:false, advancedAnalytics:false, aiAssistant:false, updatedAt:Timestamp.now() });
  }
  // Existing flow regressions represent an authenticated/linked customer.
  if (seedFixtures && linkedIdentity) documents.set('whatsapp_identities/919999999999',{phone:'919999999999',uid:'fixture-linked-user',linked:true,linkedAt:Timestamp.now(),lastSeenAt:Timestamp.now()});
  const authTokens = new Map();
  const authChecks = [];
  const fixtures = seedFixtures ? require('./fixtures/business-data.json') : {};
  for (const [vertical, fixture] of Object.entries(fixtures)) {
    seedEntitlement(`demo-${vertical}`);
    for (const item of fixture.catalog) documents.set(`businesses/demo-${vertical}/catalog/${item.id}`, item);
  }
  const writes = [];
  const sends = [];
  const filters = [];
  let counter = 0;
  let clock = Date.now();
  let queue = Promise.resolve();
  const serverMarker = { transform: 'serverTimestamp' };
  const deleteMarker = { transform: 'delete' };
  const clone = (value) => {
    if (value === null || typeof value !== 'object' || value instanceof Timestamp) return value;
    if (Array.isArray(value)) return value.map(clone);
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clone(entry)]));
  };
  const resolve = (value) => {
    assert.notEqual(value, undefined, 'Firestore rejects undefined');
    if (value?.transform === 'serverTimestamp') return Timestamp.fromMillis(++clock);
    if (value?.transform === 'delete') return deleteMarker;
    if (value instanceof Timestamp || value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(resolve);
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, resolve(entry)]));
  };
  const merge = (current, data) => {
    const result = clone(current);
    for (const [key, value] of Object.entries(data)) {
      if (value?.transform === 'delete') delete result[key];
      else if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Timestamp) && Object.keys(value).length && result[key] && typeof result[key] === 'object') result[key] = merge(result[key], value);
      else result[key] = clone(value);
    }
    return result;
  };
  function apply({ kind, ref, data, options }) {
    if (kind === 'delete') { documents.delete(ref.path); writes.push({ kind, path: ref.path }); return; }
    const existing = documents.get(ref.path);
    if (kind === 'create' && existing) throw new Error('Already exists');
    if (kind === 'update' && !existing) throw new Error('Document not found');
    const resolved = resolve(data);
    let next;
    if (kind === 'update') {
      next = { ...clone(existing), ...resolved };
      for (const [key, value] of Object.entries(next)) if (value?.transform === 'delete') delete next[key];
    } else next = options?.merge ? merge(existing ?? {}, resolved) : resolved;
    documents.set(ref.path, next);
    writes.push({ kind, path: ref.path, data: clone(resolved), options });
  }
  function snapshot(ref) {
    let data = documents.get(ref.path);
    if (ref.path.split('/').length === 2 && ref.path.startsWith('businesses/demo-')) {
      const vertical = ref.id.replace('demo-', '');
      const fixture = fixtures[vertical];
      if (fixture) data = { name: `Demo ${vertical}`, vertical, active: true, whatsappPhoneNumberId: 'TEST_PHONE_NUMBER_ID', settings: fixture.settings, ...data };
    }
    return { id: ref.id, exists: !!data, data: () => clone(data) };
  }
  function query(collection, conditions = [], maximum = Infinity) {
    return {
      where(...args) { filters.push({ collection, args }); return query(collection, [...conditions, args], maximum); },
      limit(count) { return query(collection, conditions, count); },
      count() { return { get: async () => { const result = await this.get(); return { data: () => ({ count: result.docs.length }) }; } }; },
      async get() {
        const docs = [...documents.entries()].filter(([key, data]) => key.startsWith(collection + '/') && key.split('/').length === collection.split('/').length + 1 && conditions.every(([field, op, value]) => {
          assert.equal(op, '=='); return data[field] === value;
        })).slice(0, maximum).map(([key]) => snapshot(reference(key)));
        return { empty: !docs.length, docs };
      },
    };
  }
  function reference(fullPath) {
    return {
      path: fullPath, id: fullPath.split('/').at(-1),
      collection(name) { return { ...query(`${fullPath}/${name}`), doc(id = `auto-${++counter}`) { return reference(`${fullPath}/${name}/${id}`); } }; },
      async get() { return snapshot(this); },
      async create(data) { apply({ kind: 'create', ref: this, data }); },
      async set(data, options) { apply({ kind: 'set', ref: this, data, options }); },
      async update(data) { apply({ kind: 'update', ref: this, data }); },
      async delete() { apply({ kind: 'delete', ref: this }); },
    };
  }
  const adminDb = {
    collection(name) { return { ...query(name), doc(id = `auto-${++counter}`) { return reference(`${name}/${id}`); } }; },
    runTransaction(callback) {
      const task = queue.then(async () => {
        const pending = [];
        let hasWrite = false;
        const transaction = {
          async get(ref) { assert.equal(hasWrite, false, 'Transaction reads must precede writes'); return ref.get(); },
        };
        for (const kind of ['set', 'create', 'update', 'delete']) transaction[kind] = (ref, data, options) => {
          hasWrite = true; pending.push({ kind, ref, data, options }); return transaction;
        };
        const result = await callback(transaction);
        // Validate all staged writes before committing, preserving rollback.
        for (const entry of pending) {
          if (entry.kind !== 'delete') resolve(entry.data);
          if (entry.kind === 'create' && documents.has(entry.ref.path)) throw new Error('Already exists');
          if (entry.kind === 'update' && !documents.has(entry.ref.path)) throw new Error('Document not found');
        }
        for (const entry of pending) apply(entry);
        return result;
      });
      queue = task.catch(() => {});
      return task;
    },
  };
  let sendFailure = null;
  const cache = new Map();
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const loadedModule = { exports: {} };
    cache.set(filename, loadedModule);
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 }, fileName: filename,
    }).outputText;
    function localRequire(specifier) {
      if (specifier === 'server-only') return {};
      if (specifier === '@/lib/firebase-admin') return { adminDb, adminAuth: { async verifyIdToken(token, checkRevoked) {
        authChecks.push({token,checkRevoked});
        if (!authTokens.has(token)) throw new Error('Invalid Firebase credential');
        return {uid:authTokens.get(token),firebase:{sign_in_provider:'password'}};
      } } };
      if (specifier === 'firebase-admin/firestore') return {
        Timestamp, FieldValue: { serverTimestamp: () => serverMarker, delete: () => deleteMarker },
      };
      if (specifier === '@/lib/messaging/whatsapp') return { async sendWhatsAppMessage(params) {
        if (sendFailure) { const error = sendFailure; sendFailure = null; throw error; }
        const conversation = documents.get(`conversations/demo-eats_${params.to}`);
        // The conversation must be durable before any external send starts.
        if (conversation && typeof params.reply !== 'string' && params.reply.type !== 'cta_url' && params.reply.body !== 'What would you like to do?') assert.equal(conversation.pendingReply, params.reply.body);
        sends.push(params);
        return { messages: [{ id: `wamid.out-${sends.length}` }] };
      } };
      if (specifier.startsWith('@/')) return load(specifier.slice(2) + '.ts');
      return require(specifier);
    }
    vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename })(localRequire, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  return {
    load, documents, writes, sends, filters, Timestamp, adminDb, authTokens, authChecks,
    read: (key) => clone(documents.get(key)),
    seed: (key, value) => { if (/^businesses\/[^/]+$/.test(key)) seedEntitlement(key.split("/")[1]); return documents.set(key, clone(value)); },
    failNextSend: (code) => { sendFailure = Object.assign(new Error('Mock Meta failure'), code === undefined ? {} : { code }); },
  };
}

const dummyPayload = (id = 'wamid.test') => ({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: {
  metadata: { phone_number_id: 'TEST_PHONE_NUMBER_ID' },
  messages: [{ from: '919999999999', id, timestamp: '1792670400', type: 'text', text: { body: 'hello' } }],
} }] }] });
const demoBusiness = { name: 'Demo Eats', vertical: 'eats', whatsappPhoneNumberId: 'TEST_PHONE_NUMBER_ID', active: true };
function signedWebhookHeaders(payload) {
  const { createHmac } = require('node:crypto');
  process.env.META_APP_SECRET ||= 'fixture-webhook-app-secret';
  const raw = JSON.stringify(payload);
  return { 'Content-Type': 'application/json', 'x-hub-signature-256':
    'sha256=' + createHmac('sha256', process.env.META_APP_SECRET).update(raw, 'utf8').digest('hex') };
}
module.exports = { createHarness, dummyPayload, demoBusiness, signedWebhookHeaders };
