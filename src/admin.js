// Admin back end: sign-in and the /api/admin/* routes. The page itself is public/admin.html.
// Sign-in is one password (ADMIN_PASSWORD); without it the admin is switched off.
// Safety: signed HttpOnly SameSite=Strict cookie, a custom header on every write (blocks cross-site requests),
// lock-out after repeated wrong passwords, optional ADMIN_IPS allow-list, and an audit trail of every change.
const crypto = require('crypto');
const os = require('os');
const access = require('./access');
const settings = require('./settings');
const metrics = require('./metrics');
const store = require('./store');
const waitlist = require('./waitlist');
const contact = require('./contact');
const aiLib = require('./ai');
const exporter = require('./export');
const db = require('./db');
const kv = require('./kv');

const COOKIE = 'ta_admin';
const SESSION_MS = 8 * 3600e3;
const started = Date.now();

const enabled = () => !!process.env.ADMIN_PASSWORD;
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const key = () => 'admin:' + access.secret();
const mac = (body) => crypto.createHmac('sha256', key()).update(body).digest('base64url');

function sign(payload) { const body = Buffer.from(JSON.stringify(payload)).toString('base64url'); return body + '.' + mac(body); }
function verify(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const want = Buffer.from(mac(body)), got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); return p && p.a === 1 && p.e > Date.now() ? p : null; } catch { return null; }
}
function cookieOf(req) {
  const m = String(req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}
const authed = (req) => enabled() && !!verify(cookieOf(req));

// Optional allow-list: ADMIN_IPS="1.2.3.4,5.6.7.8".
function ipAllowed(ip) {
  const list = String(process.env.ADMIN_IPS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return !list.length || list.includes(ip);
}

// ---- Sign-in with lock-out ----
const fails = new Map(); // ip -> { n, until }
const MAX_FAILS = 5, LOCK_MS = 15 * 60e3;
function lockedFor(ip) { const f = fails.get(ip); return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 1000) : 0; }
function noteFail(ip) {
  const f = fails.get(ip) || { n: 0, until: 0 };
  if (f.until && f.until <= Date.now()) { f.n = 0; f.until = 0; }
  f.n++;
  if (f.n >= MAX_FAILS) f.until = Date.now() + LOCK_MS;
  fails.set(ip, f);
}

const csvCell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;            // a spreadsheet must never run a cell as a formula
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const toCsv = (cols, rows) => '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\r\n') + '\r\n';

const SAMPLE_EXAM = {
  tpl: { lang: 'en', level: 'b9' }, title: 'PDF self-test', school: 'Teach.ai', teacher: 'Admin', className: 'Test', subject: 'Maths', duration: '1 hour', year: '2026/2027', coef: '1',
  design: 'lycee', paper: 'A4', instructions: 'Self-test.', groups: [{ title: 'Exercise 1' }], answerSpace: true,
  questions: [{ type: 'short', prompt: 'Compute $\\frac{3}{4}+\\frac{1}{4}$.', answer: '$1$', points: 20, group: 0 }],
};

// ---- Routes ----
const routes = [];
const route = (method, pattern, fn) => routes.push([method, new RegExp('^' + pattern + '$'), fn]);

route('GET', '/badges', async () => {
  const [wl, msgs] = await Promise.all([waitlist.list(), contact.list()]);
  return [200, { waitlist: wl.filter((x) => !x.invited).length, messages: msgs.filter((x) => !x.done).length }];
});

// Everything below receives ({ req, res, m, url, body, ctx, who }) and returns [status, data] or sends itself.
route('GET', '/overview', async ({ ctx }) => {
  const t0 = Date.now();
  let dbState = { enabled: db.enabled() };
  if (db.enabled()) { try { await db.query('SELECT 1'); dbState.ok = true; dbState.ms = Date.now() - t0; } catch (e) { dbState.ok = false; dbState.error = e.message; } }
  const [exams, wl, msgs, logins, ailog, errs] = await Promise.all([store.listAll(), waitlist.list(), contact.list(), kv.get('admin', 'logins', []), metrics.recent('ailog', 300), metrics.recent('errors', 5)]);
  const codes = access.list();
  const dayAgo = Date.now() - 864e5;
  const ai24 = ailog.filter((x) => x.ts > dayAgo);
  const series = metrics.series(30);
  const s = settings.get();
  const warnings = [];
  if (!aiLib.available()) warnings.push({ id: 'noai', level: 'warn' });
  if (process.env.NODE_ENV === 'production' && !db.enabled()) warnings.push({ id: 'nodb', level: 'warn' });
  if (!process.env.ACCESS_SECRET && process.env.NODE_ENV === 'production') warnings.push({ id: 'nosecret', level: 'warn' });
  if (s.maintenance.on) warnings.push({ id: 'maintenance', level: 'bad' });
  if (!access.required()) warnings.push({ id: 'open', level: 'warn' });
  if (String(process.env.TEACHAI_COUPONS || '').trim()) warnings.push({ id: 'envcodes', level: 'info' });
  return [200, {
    now: Date.now(), uptime: Math.round((Date.now() - started) / 1000), node: process.version, db: dbState,
    counts: {
      exams: exams.length, codes: codes.length, activeCodes: codes.filter((c) => !c.revoked && (!c.expires || Date.parse(c.expires) > Date.now())).length,
      waitlist: wl.length, waitlistNew: wl.filter((x) => !x.invited).length, messages: msgs.length, messagesOpen: msgs.filter((x) => !x.done).length,
    },
    today: series[series.length - 1], series,
    ai: { ok24h: ai24.filter((x) => x.ok).length, fail24h: ai24.filter((x) => !x.ok).length, last: ailog[0] || null },
    errors: errs, logins: logins.slice(0, 5), settingsFlags: { maintenance: s.maintenance.on, banner: s.banner.on, access: access.required() },
    clients: ctx.hotClients().length, warnings,
  }];
});

// -- Codes
route('GET', '/coupons', async () => {
  const env = String(process.env.TEACHAI_COUPONS || '').split(',').map(access.normalize).filter(Boolean);
  const listed = new Set(access.list().map((c) => c.key));
  return [200, { items: access.list(), envOnly: env.filter((c) => !listed.has(c)).length, remote: !!process.env.ACCESS_API_URL, tiers: settings.get().tiers }];
});
route('GET', '/coupons\\.csv', async ({ res, ctx }) => {
  const rows = access.list().map((c) => ({ code: c.code, note: c.note, status: c.revoked ? 'revoked' : c.expires && Date.parse(c.expires) < Date.now() ? 'expired' : 'active', tier: c.tier || 'normal', uses: c.uses || 0, max: c.max || 'unlimited', expires: c.expires || '', created: c.created || '', lastUsed: c.lastUsed || '', exams: c.usage.exams }));
  return ctx.send(res, 200, toCsv(['code', 'note', 'status', 'tier', 'uses', 'max', 'expires', 'created', 'lastUsed', 'exams'], rows), 'text/csv; charset=utf-8', { 'content-disposition': 'attachment; filename="codes.csv"' });
});
route('POST', '/coupons', async ({ body, who }) => {
  const count = Math.max(1, Math.min(200, parseInt(body.count, 10) || 1));
  const out = [];
  try {
    for (let i = 1; i <= count; i++) {
      const note = String(body.note || '').trim();
      out.push(access.create({
        code: count === 1 ? body.code : '', max: body.max == null ? 1 : body.max, days: Number(body.days) || 0, tier: body.tier,
        perDay: body.perDay, perMonth: body.perMonth, note: count > 1 && note ? `${note} #${i}` : note,
      }));
    }
  } catch (e) { return [409, { error: e.message, codes: out }]; }
  metrics.audit(who, 'coupons.create', `${out.length} code(s)${body.note ? ' for ' + String(body.note).slice(0, 60) : ''}`);
  return [201, { codes: out }];
});
route('PATCH', '/coupons/([A-Za-z0-9-]+)', async ({ m, body, who }) => {
  if (!access.update(m[1], body)) return [404, { error: 'No such code.' }];
  metrics.audit(who, 'coupons.update', m[1] + ' ' + Object.keys(body).join(','));
  return [200, { ok: true }];
});
for (const [action, fn] of [['revoke', access.revoke], ['restore', access.restore], ['reset', access.reset]]) {
  route('POST', `/coupons/([A-Za-z0-9-]+)/${action}`, async ({ m, who }) => {
    if (!fn(m[1])) return [404, { error: 'No such code.' }];
    metrics.audit(who, 'coupons.' + action, m[1]);
    return [200, { ok: true }];
  });
}
route('POST', '/coupons/([A-Za-z0-9-]+)/kick', async ({ m, body, who }) => {
  if (!access.kick(m[1], String(body.sid || ''))) return [404, { error: 'No such device.' }];
  metrics.audit(who, 'coupons.kick', m[1] + ' device ' + String(body.sid).slice(0, 12));
  return [200, { ok: true }];
});
route('DELETE', '/coupons/([A-Za-z0-9-]+)', async ({ m, who }) => {
  if (!access.remove(m[1])) return [404, { error: 'No such code.' }];
  metrics.audit(who, 'coupons.delete', m[1]);
  return [200, { ok: true }];
});
route('POST', '/coupons-import-env', async ({ who }) => {
  const n = access.importEnv();
  metrics.audit(who, 'coupons.import-env', n + ' code(s)');
  return [200, { added: n }];
});

// -- Exams
route('GET', '/exams', async ({ url }) => {
  const q = String(url.searchParams.get('q') || '').toLowerCase();
  const f = (k) => url.searchParams.get(k) || '';
  let items = await store.listAll();
  const facets = { subject: [...new Set(items.map((x) => x.subject).filter(Boolean))].sort(), level: [...new Set(items.map((x) => x.level).filter(Boolean))].sort(), lang: [...new Set(items.map((x) => x.lang).filter(Boolean))].sort() };
  if (q) items = items.filter((x) => (x.title + ' ' + x.id + ' ' + x.by).toLowerCase().includes(q));
  for (const k of ['subject', 'level', 'lang']) if (f(k)) items = items.filter((x) => x[k] === f(k));
  if (f('by')) items = items.filter((x) => x.by === access.normalize(f('by')));
  if (f('state') === 'hidden') items = items.filter((x) => x.hidden);
  if (f('state') === 'demo') items = items.filter((x) => x.demo);
  const total = items.length;
  const limit = Math.min(200, parseInt(f('limit'), 10) || 50), offset = Math.max(0, parseInt(f('offset'), 10) || 0);
  return [200, { total, items: items.slice(offset, offset + limit), facets }];
});
route('POST', '/exams-purge', async ({ body, who }) => {
  const days = Math.max(1, Math.min(3650, parseInt(body.days, 10) || 0));
  if (!body.days) return [400, { error: 'Choose a number of days.' }];
  const cutoff = Date.now() - days * 864e5;
  if (body.dryRun) return [200, { count: (await store.listAll()).filter((x) => x.updatedAt < cutoff).length }];
  const n = await store.sweep(days);
  metrics.audit(who, 'exams.purge', `${n} exam(s) older than ${days} days`);
  return [200, { count: n }];
});
route('GET', '/exams/([a-z0-9]{10})', async ({ m }) => {
  const r = await store.read(m[1]);
  if (!r) return [404, { error: 'Exam not found.' }];
  return [200, store.publicView(r)];
});
route('DELETE', '/exams/([a-z0-9]{10})', async ({ m, who }) => {
  if (!(await store.remove(m[1]))) return [404, { error: 'Exam not found.' }];
  metrics.audit(who, 'exams.delete', m[1]);
  return [200, { ok: true }];
});
route('POST', '/exams/([a-z0-9]{10})/hide', async ({ m, body, who }) => {
  if (!(await store.setHidden(m[1], !!body.hidden))) return [404, { error: 'Exam not found.' }];
  metrics.audit(who, body.hidden ? 'exams.hide' : 'exams.unhide', m[1]);
  return [200, { ok: true }];
});

// -- Statistics
route('GET', '/stats', async ({ url }) => {
  const days = Math.max(7, Math.min(120, parseInt(url.searchParams.get('days'), 10) || 30));
  const series = metrics.series(days);
  const sum = (name) => series.reduce((n, d) => n + (d[name] || 0), 0);
  const merge = (name) => { const o = {}; for (const d of series) for (const [k, v] of Object.entries(d[name] || {})) o[k] = (o[k] || 0) + v; return Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 12); };
  const codes = access.list();
  const byCode = metrics.totalsByCode();
  const now = Date.now();
  return [200, {
    days, series,
    totals: { visits: sum('visits'), redeems: sum('redeems'), exams: sum('exams'), pdf: sum('pdf'), docx: sum('docx'), html: sum('html'), aiOk: sum('aiOk'), aiFail: sum('aiFail') },
    subjects: merge('subj'), levels: merge('lvl'), langs: merge('lang'),
    topCodes: Object.entries(byCode).map(([k, v]) => ({ key: k, note: (codes.find((c) => c.key === k) || {}).note || '', ...v })).sort((a, b) => b.exams - a.exams).slice(0, 15),
    dormant: codes.filter((c) => !c.revoked && !(c.uses > 0) && now - Date.parse(c.created || 0) > 7 * 864e5).map((c) => ({ code: c.code, note: c.note, created: c.created })),
  }];
});

// -- AI
route('GET', '/ai', async () => {
  const s = settings.get().ai;
  return [200, {
    deepseek: !!process.env.DEEPSEEK_TOKEN, nvidia: !!process.env.NVIDIA_API_KEY, envProvider: process.env.AI_PROVIDER || 'auto',
    envModel: process.env.TEACHAI_MODEL || aiLib.DEFAULT_NVIDIA_MODEL, override: s, active: aiLib.label() || '',
  }];
});
route('POST', '/ai/test', async ({ who }) => { metrics.audit(who, 'ai.test', ''); return [200, { results: await aiLib.test() }]; });
route('POST', '/ai/console', async ({ body, who }) => {
  const prompt = String(body.prompt || '').trim().slice(0, 4000);
  if (!prompt) return [400, { error: 'Write a prompt first.' }];
  const t0 = Date.now();
  try {
    const reply = await aiLib.complete([{ role: 'user', content: prompt }], { temperature: 0.4, maxTokens: 1200 });
    metrics.audit(who, 'ai.console', prompt.slice(0, 80));
    return [200, { reply, ms: Date.now() - t0 }];
  } catch (e) { return [200, { error: e.message, ms: Date.now() - t0 }]; }
});
route('GET', '/ai/log', async () => [200, { items: await metrics.recent('ailog', 200) }]);

// -- Waiting list and messages
route('GET', '/waitlist', async () => [200, { items: await waitlist.list() }]);
route('GET', '/waitlist\\.csv', async ({ res, ctx }) => ctx.send(res, 200, toCsv(['email', 'role', 'lang', 'at', 'invited'], await waitlist.list()), 'text/csv; charset=utf-8', { 'content-disposition': 'attachment; filename="waitlist.csv"' }));
route('POST', '/waitlist/invite', async ({ body, who }) => {
  const email = String(body.email || '').toLowerCase();
  const code = access.create({ max: 1, days: Number(body.days) || 0, tier: body.tier, note: 'waitlist: ' + email });
  await waitlist.setInvited(email, code);
  metrics.audit(who, 'waitlist.invite', email);
  return [200, { code }];
});
route('DELETE', '/waitlist', async ({ body, who }) => {
  if (!(await waitlist.remove(body.email))) return [404, { error: 'Not found.' }];
  metrics.audit(who, 'waitlist.delete', body.email);
  return [200, { ok: true }];
});
route('GET', '/messages', async () => [200, { items: await contact.list() }]);
route('GET', '/messages\\.csv', async ({ res, ctx }) => ctx.send(res, 200, toCsv(['at', 'name', 'email', 'message', 'lang', 'done'], await contact.list()), 'text/csv; charset=utf-8', { 'content-disposition': 'attachment; filename="messages.csv"' }));
route('POST', '/messages/done', async ({ body }) => (await contact.setDone(body.id, !!body.done)) ? [200, { ok: true }] : [404, { error: 'Not found.' }]);
route('DELETE', '/messages', async ({ body, who }) => {
  if (!(await contact.remove(body.id))) return [404, { error: 'Not found.' }];
  metrics.audit(who, 'messages.delete', String(body.id).slice(0, 40));
  return [200, { ok: true }];
});

// -- Settings, clients, audit
route('GET', '/settings', async () => [200, { settings: settings.get(), defaults: settings.DEFAULTS, features: settings.FEATURES, tiers: settings.TIERS }]);
route('PUT', '/settings', async ({ body, who }) => {
  const before = JSON.stringify(settings.get());
  const next = await settings.update(body);
  const prev = JSON.parse(before);
  const changed = Object.keys(next).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(prev[k]));
  if (changed.length) metrics.audit(who, 'settings.update', changed.join(', '));
  return [200, { settings: next }];
});
route('GET', '/clients', async ({ ctx }) => [200, { hot: ctx.hotClients(), blocked: settings.get().blockedIps }]);
route('GET', '/audit', async ({ url }) => [200, { items: await metrics.recent('audit', 200, Math.max(0, parseInt(url.searchParams.get('offset'), 10) || 0)) }]);

// -- System
route('GET', '/health', async () => {
  const mem = process.memoryUsage();
  const t0 = Date.now();
  const out = {
    uptime: Math.round((Date.now() - started) / 1000), node: process.version, platform: process.platform, env: process.env.NODE_ENV || 'development',
    memory: { rss: mem.rss, heap: mem.heapUsed, total: os.totalmem(), free: os.freemem() }, load: os.loadavg(),
    db: { enabled: db.enabled() }, adminIpList: !!process.env.ADMIN_IPS,
    config: { deepseek: !!process.env.DEEPSEEK_TOKEN, nvidia: !!process.env.NVIDIA_API_KEY, siteUrl: process.env.SITE_URL || '', accessSecret: !!process.env.ACCESS_SECRET, envCodes: String(process.env.TEACHAI_COUPONS || '').split(',').filter((x) => x.trim()).length },
  };
  if (db.enabled()) { try { await db.query('SELECT 1'); out.db.ok = true; out.db.ms = Date.now() - t0; } catch (e) { out.db.ok = false; out.db.error = e.message; } }
  return [200, out];
});
route('POST', '/health/pdf', async ({ who }) => {
  const t0 = Date.now();
  try {
    const exam = exporter.snapshot(SAMPLE_EXAM, SAMPLE_EXAM);
    const pdf = await exporter.render(exam, 'pdf', 'student');
    metrics.audit(who, 'health.pdf', 'ok');
    return [200, { ok: true, ms: Date.now() - t0, bytes: pdf.length }];
  } catch (e) { metrics.audit(who, 'health.pdf', 'failed: ' + e.message.slice(0, 100)); return [200, { ok: false, ms: Date.now() - t0, error: e.message }]; }
});
route('GET', '/errors', async () => [200, { items: await metrics.recent('errors', 200) }]);
route('DELETE', '/errors', async ({ who }) => { await metrics.clear('errors'); metrics.audit(who, 'errors.clear', ''); return [200, { ok: true }]; });

// -- Backup and restore
route('GET', '/backup', async ({ url, res, ctx, who }) => {
  kv.flush();
  const withExams = url.searchParams.get('exams') === '1';
  const data = {
    version: 1, at: new Date().toISOString(), settings: settings.get(), coupons: access.dump(), waitlist: await waitlist.list(), messages: await contact.list(),
    stats: await kv.get('stats', 'daily', {}), ...(withExams ? { exams: await store.dumpAll() } : {}),
  };
  metrics.audit(who, 'backup.download', withExams ? 'with exams' : 'without exams');
  return ctx.send(res, 200, JSON.stringify(data), 'application/json; charset=utf-8', { 'content-disposition': `attachment; filename="teachai-backup-${new Date().toISOString().slice(0, 10)}.json"` });
});
route('POST', '/restore', async ({ body, who }) => {
  if (!body || body.version !== 1) return [400, { error: 'This is not a Teach.ai backup file.' }];
  const done = {};
  if (body.settings) { await settings.update(body.settings); done.settings = true; }
  if (body.coupons) done.coupons = access.restoreCoupons(body.coupons);
  if (Array.isArray(body.waitlist)) done.waitlist = await waitlist.restore(body.waitlist);
  if (Array.isArray(body.messages)) done.messages = await contact.restore(body.messages);
  if (Array.isArray(body.exams)) done.exams = await store.restoreAll(body.exams);
  metrics.audit(who, 'backup.restore', JSON.stringify(done));
  return [200, { restored: done }];
});

// ---- Entry point used by server.js ----
async function handle(req, res, url, ctx) {
  const ip = ctx.clientIp(req);
  const sub = url.pathname.replace(/^\/api\/admin/, '') || '/';
  const json = (status, data) => ctx.send(res, status, data);

  if (!ipAllowed(ip)) return json(404, { error: 'Not found' });
  if (!enabled()) return json(503, { error: 'The admin is switched off. Set ADMIN_PASSWORD on the server to enable it.', disabled: true });

  if (sub === '/session' && req.method === 'GET') {
    const authenticated = authed(req);
    let logins = [];
    if (authenticated) {
      try { logins = await kv.get('admin', 'logins', []); }
      catch (e) { metrics.error('admin.login-history', e); }
    }
    return json(200, { enabled: true, authed: authenticated, lastLogin: logins[0] || null, newDevice: logins[0] ? !!logins[0].newDevice : false });
  }

  if (sub === '/login' && req.method === 'POST') {
    const wait = lockedFor(ip);
    if (wait) return json(429, { error: 'Too many wrong passwords.', retryAfter: wait });
    const body = await ctx.readBody(req);
    if (!body || typeof body.password !== 'string') return json(400, { error: 'Enter your password.' });
    const ok = crypto.timingSafeEqual(sha(body.password), sha(process.env.ADMIN_PASSWORD));
    if (!ok) {
      noteFail(ip);
      metrics.audit('unknown', 'login.failed', `${access.maskIp(ip)} ${String(req.headers['user-agent'] || '').slice(0, 80)}`);
      const w = lockedFor(ip);
      return json(w ? 429 : 401, { error: w ? 'Too many wrong passwords.' : 'Wrong password.', retryAfter: w, left: Math.max(0, MAX_FAILS - (fails.get(ip) || { n: 0 }).n) });
    }
    fails.delete(ip);
    const ua = String(req.headers['user-agent'] || '').slice(0, 160);
    const fp = crypto.createHash('sha256').update(access.maskIp(ip) + '|' + ua).digest('hex').slice(0, 16);
    let newDevice = false;
    // Sign-in history is diagnostic data, not an authentication dependency.
    // A storage outage must not reject a correctly verified password.
    try {
      const logins = await kv.get('admin', 'logins', []);
      newDevice = logins.length > 0 && !logins.some((l) => l.fp === fp);
      logins.unshift({ ts: Date.now(), ip: access.maskIp(ip), ua, fp, newDevice });
      await kv.set('admin', 'logins', logins.slice(0, 30));
    } catch (e) { metrics.error('admin.login-history', e); }
    metrics.audit('admin', newDevice ? 'login.new-device' : 'login', access.maskIp(ip));
    const secure = ctx.isHttps(req) ? '; Secure' : '';
    return ctx.send(res, 200, { ok: true, newDevice }, 'application/json; charset=utf-8', {
      'set-cookie': `${COOKIE}=${encodeURIComponent(sign({ a: 1, e: Date.now() + SESSION_MS }))}; Path=/; Max-Age=${SESSION_MS / 1000}; HttpOnly; SameSite=Strict${secure}`,
    });
  }

  if (sub === '/logout' && req.method === 'POST') {
    return ctx.send(res, 200, { ok: true }, 'application/json; charset=utf-8', { 'set-cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict` });
  }

  if (!authed(req)) return json(401, { error: 'Sign in first.', signin: true });
  if (req.method !== 'GET' && req.headers['x-admin'] !== '1') return json(403, { error: 'Missing request header.' });

  for (const [method, re, fn] of routes) {
    if (method !== req.method) continue;
    const m = sub.match(re);
    if (!m) continue;
    const body = req.method === 'GET' ? {} : await ctx.readBody(req);
    const out = await fn({ req, res, m, url, body, ctx, who: 'admin' });
    if (res.writableEnded || res.headersSent) return;
    return json(out[0], out[1]);
  }
  return json(404, { error: 'Not found' });
}

// ---- Pieces the public server uses ----
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function bannerHtml() {
  const b = settings.get().banner;
  if (!b.on || !b.text) return '';
  const warn = b.level === 'warn';
  return `<div id="ta-banner" role="status" style="position:relative;z-index:50;display:flex;gap:12px;align-items:center;justify-content:center;padding:9px 44px 9px 16px;font:500 14px/1.4 system-ui,sans-serif;text-align:center;background:${warn ? '#FBF1DD' : '#EAF1EC'};color:${warn ? '#84560F' : '#1F4D36'}">${esc(b.text)}<button type="button" aria-label="Close" onclick="this.parentNode.remove()" style="position:absolute;inset-inline-end:10px;top:50%;transform:translateY(-50%);border:0;background:none;color:inherit;font-size:20px;line-height:1;cursor:pointer;padding:4px 8px">&times;</button></div>`;
}

function maintenanceHtml() {
  const msg = settings.get().maintenance.message;
  const fallback = 'Teach.ai is being updated. Please come back in a few minutes.';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Back soon</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#FAF8F4;color:#111;font:16px/1.6 system-ui,sans-serif;padding:24px}main{max-width:460px}h1{font-size:28px;margin:0 0 10px}p{color:#4A463F;margin:0 0 8px}@media(prefers-color-scheme:dark){body{background:#161615;color:#ECE8E0}p{color:#B7B2A8}}</style></head>
<body><main><h1>Back soon</h1><p>${esc(msg || fallback)}</p><p dir="rtl" lang="ar">الموقع قيد التحديث، عد بعد قليل.</p><p lang="fr">Le site est en cours de mise à jour. Revenez dans quelques minutes.</p></main></body></html>`;
}

module.exports = { handle, authed, enabled, ipAllowed, bannerHtml, maintenanceHtml };
