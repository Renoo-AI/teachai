// Run-time numbers for the admin: daily counters, an audit trail, the AI call log and recent errors.
// Everything here is best effort: a failure to record must never break a request.
const kv = require('./kv');

const day = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const KEEP_DAYS = 120;

let daily = {};        // { 'YYYY-MM-DD': { exams, pdf, ..., subj: {}, lvl: {}, lang: {}, codes: { CODE: { exams, ai, chars } } } }
let timer = null;

async function init() {
  try { daily = (await kv.get('stats', 'daily', {})) || {}; } catch (e) { console.error('metrics: could not load:', e.message); }
}

function save() {
  if (timer) return;
  timer = setTimeout(async () => {
    timer = null;
    const cutoff = day(Date.now() - KEEP_DAYS * 864e5);
    for (const d of Object.keys(daily)) if (d < cutoff) delete daily[d];
    try { await kv.set('stats', 'daily', daily); } catch (e) { console.error('metrics: save failed:', e.message); }
  }, 4000);
  timer.unref();
}

const today = () => (daily[day()] ||= {});

// count('exams'), count('subj', 'maths'), count('ai', 'CODE', { chars: 1200 }) for per-code numbers.
function count(name, label, extra) {
  try {
    const d = today();
    if (name === 'codes') {
      const c = ((d.codes ||= {})[label] ||= { exams: 0, ai: 0, chars: 0 });
      for (const [k, v] of Object.entries(extra || {})) c[k] = (c[k] || 0) + v;
    } else if (label != null) {
      const m = (d[name] ||= {});
      m[label] = (m[label] || 0) + 1;
    } else d[name] = (d[name] || 0) + 1;
    save();
  } catch { /* ignore */ }
}

// Last `n` days, oldest first, with empty days filled in.
function series(n = 30) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) { const k = day(Date.now() - i * 864e5); out.push({ day: k, ...(daily[k] || {}) }); }
  return out;
}

// Exams a code has created today and this month, for the per-code limits.
function codeUsage(code) {
  const now = new Date(); const month = day().slice(0, 7);
  let d = 0, m = 0;
  for (const [k, v] of Object.entries(daily)) {
    const n = v.codes && v.codes[code] ? v.codes[code].exams || 0 : 0;
    if (k === day()) d += n;
    if (k.startsWith(month)) m += n;
  }
  void now;
  return { day: d, month: m };
}

function totalsByCode() {
  const out = {};
  for (const v of Object.values(daily)) for (const [c, x] of Object.entries(v.codes || {})) {
    const o = (out[c] ||= { exams: 0, ai: 0, chars: 0 });
    o.exams += x.exams || 0; o.ai += x.ai || 0; o.chars += x.chars || 0;
  }
  return out;
}

// Write the counters now (called when the server is told to stop).
async function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  try { await kv.set('stats', 'daily', daily); } catch { /* best effort */ }
}

const safe = (p) => p.catch((e) => console.error('metrics:', e.message));
const audit = (actor, action, detail) => safe(kv.push('audit', { actor, action, detail: detail == null ? '' : detail }, 2000));
const aiCall = (row) => safe(kv.push('ailog', row, 500));
const error = (source, err, ctx) => safe(kv.push('errors', { source, message: String((err && err.message) || err).slice(0, 400), ctx: ctx || '' }, 300));

module.exports = { init, flush, count, series, codeUsage, totalsByCode, audit, aiCall, error, day, recent: (ns, n, o) => kv.recent(ns, n, o), clear: (ns) => kv.clear(ns) };
