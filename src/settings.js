// Site settings the admin can change at run time (no redeploy). Read synchronously from memory on every request;
// writes go through update(), which validates, saves (kv.js) and returns the new values.
const kv = require('./kv');

const FEATURES = ['pdf', 'docx', 'html', 'assistant', 'upload', 'papers'];
const TIERS = ['normal', 'vip', 'trial'];

const DEFAULTS = {
  maintenance: { on: false, message: '' },
  banner: { on: false, text: '', level: 'info' },
  accessRequired: null,                  // null = follow ACCESS_REQUIRED from the environment
  features: { pdf: 'on', docx: 'on', html: 'on', assistant: 'on', upload: 'on', papers: 'on' }, // 'on' | 'off' | 'beta'
  betaCodes: [],                         // access codes that can use features set to 'beta'
  limits: { examsPerHour: 20, waitlistPerHour: 6, contactPerHour: 5, redeemPerHour: 10 },
  tiers: { normal: { perDay: 0, perMonth: 0 }, vip: { perDay: 0, perMonth: 0 }, trial: { perDay: 5, perMonth: 15 } }, // 0 = unlimited
  retentionDays: 30,                     // exams not edited for this long are deleted; 0 keeps them forever
  ai: { provider: 'auto', model: '', promptExtra: '' },
  blockedIps: [],
};

let cur = clone(DEFAULTS);
function clone(o) { return JSON.parse(JSON.stringify(o)); }

const int = (v, min, max, fallback) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback; };
const text = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

// Keeps only known keys with sane values, so a bad request can never break the site.
function normalize(input, base) {
  const o = clone(base);
  const s = input || {};
  if (s.maintenance) o.maintenance = { on: !!s.maintenance.on, message: text(s.maintenance.message, 400) };
  if (s.banner) o.banner = { on: !!s.banner.on, text: text(s.banner.text, 300), level: s.banner.level === 'warn' ? 'warn' : 'info' };
  if ('accessRequired' in s) o.accessRequired = s.accessRequired === null || s.accessRequired === 'env' ? null : !!s.accessRequired;
  if (s.features) for (const f of FEATURES) if (['on', 'off', 'beta'].includes(s.features[f])) o.features[f] = s.features[f];
  if (Array.isArray(s.betaCodes)) o.betaCodes = [...new Set(s.betaCodes.map((c) => String(c).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 40)).filter(Boolean))].slice(0, 200);
  if (s.limits) {
    const l = s.limits;
    o.limits = {
      examsPerHour: int(l.examsPerHour, 1, 1000, o.limits.examsPerHour), waitlistPerHour: int(l.waitlistPerHour, 1, 1000, o.limits.waitlistPerHour),
      contactPerHour: int(l.contactPerHour, 1, 1000, o.limits.contactPerHour), redeemPerHour: int(l.redeemPerHour, 1, 1000, o.limits.redeemPerHour),
    };
  }
  if (s.tiers) for (const t of TIERS) if (s.tiers[t]) o.tiers[t] = { perDay: int(s.tiers[t].perDay, 0, 10000, o.tiers[t].perDay), perMonth: int(s.tiers[t].perMonth, 0, 100000, o.tiers[t].perMonth) };
  if ('retentionDays' in s) o.retentionDays = int(s.retentionDays, 0, 3650, o.retentionDays);
  if (s.ai) o.ai = { provider: ['auto', 'deepseek', 'nvidia'].includes(s.ai.provider) ? s.ai.provider : 'auto', model: text(s.ai.model, 200), promptExtra: text(s.ai.promptExtra, 2000) };
  if (Array.isArray(s.blockedIps)) o.blockedIps = [...new Set(s.blockedIps.map((x) => text(x, 64)).filter(Boolean))].slice(0, 500);
  return o;
}

async function init() {
  try { cur = normalize(await kv.get('settings', 'main', {}), DEFAULTS); } catch (e) { console.error('settings: could not load, using defaults:', e.message); }
}

const get = () => cur;

async function update(patch) {
  const next = normalize(patch, cur);
  await kv.set('settings', 'main', next);
  cur = next;
  return cur;
}

// 'on' for everyone, 'beta' for the listed codes only, 'off' for nobody.
function featureOn(name, codeId) {
  const v = cur.features[name];
  if (v === 'on' || v === undefined) return true;
  if (v === 'beta') return !!codeId && cur.betaCodes.includes(String(codeId).toUpperCase().replace(/[^A-Z0-9]/g, ''));
  return false;
}

const isBlocked = (ip) => cur.blockedIps.includes(ip);

module.exports = { init, get, update, normalize, featureOn, isBlocked, DEFAULTS, FEATURES, TIERS };
