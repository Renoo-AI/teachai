// Tiny document store used by the admin features (coupons, settings, counters, logs).
// Postgres when DATABASE_URL is set (see db.js), otherwise JSON files in data/kv/ (memory only under NODE_ENV=test).
//   docs: get / set / del / all      one JSON value per (namespace, key)
//   logs: push / recent / clear      capped, newest first
const fs = require('fs');
const path = require('path');
const db = require('./db');

const dir = () => process.env.TEACHAI_KV_DIR || (process.env.NODE_ENV === 'test' ? '' : path.join(__dirname, '..', 'data', 'kv'));

const mem = new Map();        // file mode: name -> data, loaded once
const timers = new Map();

function load(name, empty) {
  if (mem.has(name)) return mem.get(name);
  let data = empty;
  const d = dir();
  if (d) { try { data = JSON.parse(fs.readFileSync(path.join(d, name + '.json'), 'utf8')); } catch { /* new file */ } }
  mem.set(name, data);
  return data;
}

function persist(name) {
  const d = dir();
  if (!d || timers.has(name)) return;
  timers.set(name, setTimeout(() => {
    timers.delete(name);
    try { fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, name + '.json'), JSON.stringify(mem.get(name))); }
    catch (e) { console.error('kv write failed:', e.message); }
  }, 150).unref());
}

// Write pending changes now (used before the process exits and by backups).
function flush() {
  const d = dir();
  if (!d) return;
  for (const [name, t] of timers) {
    clearTimeout(t); timers.delete(name);
    try { fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, name + '.json'), JSON.stringify(mem.get(name))); } catch { /* best effort */ }
  }
}

async function get(ns, key, fallback = null) {
  if (db.enabled()) {
    const r = await db.query('SELECT value FROM docs WHERE ns = $1 AND key = $2', [ns, key]);
    return r.rows[0] ? r.rows[0].value : fallback;
  }
  const v = load('docs-' + ns, {})[key];
  return v === undefined ? fallback : v;
}

async function set(ns, key, value) {
  if (db.enabled()) {
    await db.query('INSERT INTO docs (ns, key, value, ts) VALUES ($1, $2, $3, $4) ON CONFLICT (ns, key) DO UPDATE SET value = $3, ts = $4', [ns, key, JSON.stringify(value), Date.now()]);
    return;
  }
  load('docs-' + ns, {})[key] = value;
  persist('docs-' + ns);
}

async function del(ns, key) {
  if (db.enabled()) { await db.query('DELETE FROM docs WHERE ns = $1 AND key = $2', [ns, key]); return; }
  delete load('docs-' + ns, {})[key];
  persist('docs-' + ns);
}

async function all(ns) {
  if (db.enabled()) {
    const r = await db.query('SELECT key, value FROM docs WHERE ns = $1', [ns]);
    return Object.fromEntries(r.rows.map((x) => [x.key, x.value]));
  }
  return { ...load('docs-' + ns, {}) };
}

const pushes = new Map();
async function push(ns, row, cap = 1000) {
  const entry = { ts: Date.now(), ...row };
  if (db.enabled()) {
    await db.query('INSERT INTO logs (ns, ts, row) VALUES ($1, $2, $3)', [ns, entry.ts, JSON.stringify(entry)]);
    const n = (pushes.get(ns) || 0) + 1;
    pushes.set(ns, n);
    if (n % 25 === 0) await db.query('DELETE FROM logs WHERE ns = $1 AND id < (SELECT COALESCE(MIN(id), 0) FROM (SELECT id FROM logs WHERE ns = $1 ORDER BY id DESC LIMIT $2) t)', [ns, cap]);
    return;
  }
  const list = load('log-' + ns, []);
  list.unshift(entry);
  if (list.length > cap) list.length = cap;
  persist('log-' + ns);
}

async function recent(ns, n = 100, offset = 0) {
  if (db.enabled()) {
    const r = await db.query('SELECT row FROM logs WHERE ns = $1 ORDER BY id DESC LIMIT $2 OFFSET $3', [ns, n, offset]);
    return r.rows.map((x) => x.row);
  }
  return load('log-' + ns, []).slice(offset, offset + n);
}

async function clear(ns) {
  if (db.enabled()) { await db.query('DELETE FROM logs WHERE ns = $1', [ns]); return; }
  load('log-' + ns, []).length = 0;
  persist('log-' + ns);
}

module.exports = { get, set, del, all, push, recent, clear, flush };
