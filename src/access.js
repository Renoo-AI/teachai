// Invite-only access. Nobody can create exams or call the AI without a valid access code ("coupon").
// A code is redeemed once per device: the server answers with a signed, HttpOnly cookie, and every
// protected API route checks it. Codes come from one of three places (all read at request time):
//   1. a remote service (ACCESS_API_URL), for example a small Vercel function that owns the coupons;
//   2. the managed list: data/coupons.json (or the database when DATABASE_URL is set), edited in /admin
//      or with `npm run coupon`;
//   3. TEACHAI_COUPONS="CODE1,CODE2" in the environment (static codes, no limits).
// ACCESS_REQUIRED=0 turns the gate off (local development, tests); the admin can override it at run time.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const kv = require('./kv');
const settings = require('./settings');
const metrics = require('./metrics');

const COOKIE = 'ta_access';
const DAY = 86400e3;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I to avoid misreading a code

const required = () => {
  const o = settings.get().accessRequired;           // the admin can override the environment
  return o === null ? String(process.env.ACCESS_REQUIRED == null ? '1' : process.env.ACCESS_REQUIRED) !== '0' : o;
};
const dataDir = () => process.env.TEACHAI_ACCESS_DIR || path.join(__dirname, '..', 'data');
const couponsFile = () => path.join(dataDir(), 'coupons.json');
const normalize = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 40);
const pretty = (n) => (n.match(/.{1,4}/g) || []).join('-');

// With a database the codes are kept in memory (one server) and written through; without one they live in data/coupons.json.
let memCoupons = {};
async function init() { if (db.enabled()) memCoupons = (await kv.get('coupons', 'all', {})) || {}; }
function loadCoupons() {
  if (db.enabled()) return memCoupons;
  try { return JSON.parse(fs.readFileSync(couponsFile(), 'utf8')) || {}; } catch { return {}; }
}
function saveCoupons(all) {
  if (db.enabled()) { memCoupons = all; kv.set('coupons', 'all', all).catch((e) => console.error('coupons: save failed:', e.message)); return; }
  fs.mkdirSync(dataDir(), { recursive: true }); fs.writeFileSync(couponsFile(), JSON.stringify(all, null, 2));
}

function secret() {
  if (process.env.ACCESS_SECRET) return process.env.ACCESS_SECRET;
  const f = path.join(dataDir(), '.access-secret');
  try { return fs.readFileSync(f, 'utf8').trim(); } catch { /* create below */ }
  const s = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(f, s);
  return s;
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const mac = (body) => crypto.createHmac('sha256', secret()).update(body).digest('base64url');
function sign(payload) { const body = b64(payload); return body + '.' + mac(body); }
function verify(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const want = Buffer.from(mac(body)), got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); return p && p.e > Date.now() ? p : null; } catch { return null; }
}

function cookieValue(req) {
  const m = String(req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}

// Local coupon state: { CODE: { max, uses, expires (ISO), revoked, note, created, tier, perDay, perMonth, devices } }
function localStatus(norm) {
  const c = loadCoupons()[norm];
  if (!c) return { ok: false };
  if (c.revoked) return { ok: false };
  if (c.expires && Date.parse(c.expires) < Date.now()) return { ok: false };
  return { ok: true, coupon: c };
}

async function remoteCheck(norm) {
  const res = await fetch(process.env.ACCESS_API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(process.env.ACCESS_API_KEY ? { authorization: 'Bearer ' + process.env.ACCESS_API_KEY } : {}) },
    body: JSON.stringify({ code: norm }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return { ok: false };
  const j = await res.json().catch(() => ({}));
  return j && j.ok === true ? { ok: true, id: String(j.id || norm).slice(0, 60), expires: j.expires } : { ok: false };
}

function maskIp(ip) {
  const s = String(ip || '');
  if (s.includes(':')) return s.split(':').slice(0, 3).join(':') + ':*';
  const p = s.split('.');
  return p.length === 4 ? p.slice(0, 3).join('.') + '.*' : '';
}

// Redeems a code. Returns { ok: true, token, maxAge } (seconds) or { ok: false }.
// `meta` ({ ua, ip }) is kept with the device so the admin can tell devices apart (the address is truncated).
async function redeem(code, meta = {}) {
  const norm = normalize(code);
  if (norm.length < 6) return { ok: false };
  const ttl = 30 * DAY;
  let source = null, id = null, sid = null, expiresAt = Date.now() + ttl;

  if (process.env.ACCESS_API_URL) {
    let r;
    try { r = await remoteCheck(norm); } catch { return { ok: false, unavailable: true }; }
    if (!r.ok) return { ok: false };
    source = 'remote'; id = r.id;
    if (r.expires && Date.parse(r.expires)) expiresAt = Math.min(expiresAt, Date.parse(r.expires));
  } else {
    const env = String(process.env.TEACHAI_COUPONS || '').split(',').map(normalize).filter(Boolean);
    const s = localStatus(norm);
    if (s.ok) {
      const all = loadCoupons(), c = all[norm];
      if (c.max && (c.uses || 0) >= c.max) return { ok: false };
      c.uses = (c.uses || 0) + 1; c.lastUsed = new Date().toISOString();
      sid = crypto.randomBytes(6).toString('hex');
      (c.devices ||= []).push({ sid, ua: String(meta.ua || '').slice(0, 160), ip: maskIp(meta.ip), first: Date.now(), last: Date.now() });
      if (c.devices.length > 20) c.devices.splice(0, c.devices.length - 20);
      saveCoupons(all);
      source = 'local'; id = norm;
      if (c.expires) expiresAt = Math.min(expiresAt, Date.parse(c.expires));
    } else if (env.includes(norm) && !loadCoupons()[norm]) { source = 'env'; id = norm; }
    else return { ok: false };
  }
  if (expiresAt <= Date.now()) return { ok: false };
  metrics.count('redeems');
  return { ok: true, token: sign({ s: source, i: id, e: expiresAt, ...(sid ? { d: sid } : {}) }), maxAge: Math.floor((expiresAt - Date.now()) / 1000) };
}

function hasAccess(req) {
  if (!required()) return true;
  const p = verify(cookieValue(req));
  if (!p) return false;
  // A revoked or expired local coupon ends its sessions immediately.
  if (p.s === 'local') {
    const s = localStatus(p.i);
    if (!s.ok) return false;
    if (p.d) {                                    // a device removed by the admin loses access at once
      const dev = (s.coupon.devices || []).find((x) => x.sid === p.d);
      if (!dev) return false;
      if (Date.now() - dev.last > 5 * 60e3) { dev.last = Date.now(); saveCoupons(loadCoupons()); }
    }
  }
  if (p.s === 'env' && !String(process.env.TEACHAI_COUPONS || '').split(',').map(normalize).includes(p.i)) return false;
  return true;
}

function setCookie(token, maxAge, secure) {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}
const clearCookie = (secure) => `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;

// Who is calling: the code behind the access cookie, if any.
function identity(req) {
  const p = verify(cookieValue(req));
  return p ? { source: p.s, id: p.i, device: p.d || null } : null;
}

// Per-code exam limits (set by tier in the settings, or on the code itself). 0 means unlimited.
function checkQuota(req) {
  const who = identity(req);
  if (!who || who.source !== 'local') return { ok: true };
  const c = loadCoupons()[who.id];
  if (!c) return { ok: true };
  const tier = settings.get().tiers[c.tier || 'normal'] || {};
  const perDay = c.perDay != null ? c.perDay : tier.perDay || 0;
  const perMonth = c.perMonth != null ? c.perMonth : tier.perMonth || 0;
  const used = metrics.codeUsage(who.id);
  if (perDay && used.day >= perDay) return { ok: false, reason: 'day', limit: perDay };
  if (perMonth && used.month >= perMonth) return { ok: false, reason: 'month', limit: perMonth };
  return { ok: true };
}

// ---- Admin and scripts/coupon.js ----
// One teacher, one code, one device by default (max = 1). The label says who the code was given to.
function create({ code, max = 1, days = 0, note = '', tier = 'normal', perDay = null, perMonth = null } = {}) {
  const all = loadCoupons();
  let norm = normalize(code);
  if (!norm) { do { norm = Array.from(crypto.randomBytes(12), (b) => ALPHABET[b % ALPHABET.length]).join(''); } while (all[norm]); }
  if (all[norm]) throw new Error('That code already exists.');
  const limit = (v) => (v == null || v === '' ? null : Math.max(0, Number(v) || 0));
  all[norm] = {
    max: Number(max) || 0, uses: 0, expires: days > 0 ? new Date(Date.now() + days * DAY).toISOString() : null, revoked: false,
    note: String(note).slice(0, 200), created: new Date().toISOString(),
    tier: settings.TIERS.includes(tier) ? tier : 'normal', perDay: limit(perDay), perMonth: limit(perMonth),
  };
  saveCoupons(all);
  return pretty(norm);
}
function revoke(code) { const all = loadCoupons(), n = normalize(code); if (!all[n]) return false; all[n].revoked = true; saveCoupons(all); return true; }
function restore(code) { const all = loadCoupons(), n = normalize(code); if (!all[n]) return false; all[n].revoked = false; saveCoupons(all); return true; }
// Lets the same teacher redeem again (new phone, cleared cookies) without issuing a new code.
function reset(code) { const all = loadCoupons(), n = normalize(code); if (!all[n]) return false; all[n].uses = 0; all[n].devices = []; saveCoupons(all); return true; }
function remove(code) { const all = loadCoupons(), n = normalize(code); if (!all[n]) return false; delete all[n]; saveCoupons(all); return true; }
function update(code, patch) {
  const all = loadCoupons(), c = all[normalize(code)];
  if (!c) return false;
  const limit = (v) => (v === null || v === '' ? null : Math.max(0, Number(v) || 0));
  if ('note' in patch) c.note = String(patch.note || '').slice(0, 200);
  if ('max' in patch) c.max = Math.max(0, Math.min(1000, Number(patch.max) || 0));
  if ('expires' in patch) c.expires = patch.expires && Date.parse(patch.expires) ? new Date(patch.expires).toISOString() : null;
  if ('tier' in patch && settings.TIERS.includes(patch.tier)) c.tier = patch.tier;
  for (const k of ['perDay', 'perMonth']) if (k in patch) c[k] = limit(patch[k]);
  saveCoupons(all);
  return true;
}
// Removes one device; the code can then be used on a new one.
function kick(code, sid) {
  const all = loadCoupons(), c = all[normalize(code)];
  if (!c || !c.devices) return false;
  const before = c.devices.length;
  c.devices = c.devices.filter((d) => d.sid !== sid);
  if (c.devices.length === before) return false;
  c.uses = Math.max(0, (c.uses || 1) - 1);
  saveCoupons(all);
  return true;
}
// Copies codes from TEACHAI_COUPONS into the managed list (so they can be limited, revoked and counted).
function importEnv() {
  const all = loadCoupons();
  let added = 0;
  for (const norm of String(process.env.TEACHAI_COUPONS || '').split(',').map(normalize).filter(Boolean)) {
    if (all[norm]) continue;
    all[norm] = { max: 0, uses: 0, expires: null, revoked: false, note: 'imported from environment', created: new Date().toISOString(), tier: 'normal', perDay: null, perMonth: null };
    added++;
  }
  if (added) saveCoupons(all);
  return added;
}
function list() {
  const totals = metrics.totalsByCode();
  return Object.entries(loadCoupons()).map(([n, c]) => ({ code: pretty(n), key: n, ...c, usage: totals[n] || { exams: 0, ai: 0, chars: 0 } }));
}

// Backups: the raw coupon table, and a merge that never overwrites a code that already exists.
const dump = () => JSON.parse(JSON.stringify(loadCoupons()));
function restoreCoupons(obj) {
  const all = loadCoupons();
  let n = 0;
  for (const [k, v] of Object.entries(obj || {})) if (!all[normalize(k)] && v && typeof v === 'object') { all[normalize(k)] = v; n++; }
  if (n) saveCoupons(all);
  return n;
}

module.exports = { init, required, redeem, hasAccess, setCookie, clearCookie, normalize, identity, checkQuota, create, revoke, restore, reset, remove, update, kick, importEnv, list, dump, restoreCoupons, secret, maskIp, COOKIE };
