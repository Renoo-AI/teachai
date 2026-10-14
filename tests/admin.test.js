const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');

test('admin: sign-in, CSRF header, codes and devices, quotas, features, maintenance, moderation, backup, lock-out', async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'teachai-adm-'));
  const store = fs.mkdtempSync(path.join(os.tmpdir(), 'teachai-admx-'));
  Object.assign(process.env, { PORT: '0', NODE_ENV: 'test', ACCESS_REQUIRED: '1', ACCESS_SECRET: 'test-secret', ADMIN_PASSWORD: 'correct horse battery', TEACHAI_ACCESS_DIR: data, TEACHAI_DATA_DIR: store, TEACHAI_WAITLIST_DIR: data, NVIDIA_API_KEY: '', DEEPSEEK_TOKEN: '', AI_PROVIDER: 'none' });
  delete process.env.ACCESS_API_URL; delete process.env.TEACHAI_COUPONS; delete process.env.ADMIN_IPS; delete process.env.DATABASE_URL;
  const server = require('../src/server');
  if (!server.listening) await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  const raw = (p, { method = 'GET', body, cookie, admin = true } = {}) => fetch(base + p, { method, redirect: 'manual', headers: { 'content-type': 'application/json', accept: 'application/json', ...(admin && method !== 'GET' ? { 'x-admin': '1' } : {}), ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const cookieOf = (r) => (r.headers.get('set-cookie') || '').split(';')[0];
  const lesson = 'Evaporation turns liquid water into water vapour. The sun supplies energy that heats water and causes evaporation. Condensation turns water vapour into liquid droplets. Precipitation returns water to the ground as rain. Rivers carry water towards oceans.';
  const gen = { lesson, options: { counts: { mcq: 1, short: 2 }, tpl: { level: 'b9', subject: 'svt', lang: 'en', exercises: 3 } } };

  try {
    // Nothing works without signing in
    assert.equal((await raw('/api/admin/overview')).status, 401);
    assert.equal((await (await raw('/api/admin/session')).json()).authed, false);
    const page = await raw('/admin'); assert.equal(page.status, 200); assert.match(page.headers.get('x-robots-tag'), /noindex/);
    assert.match(await (await raw('/robots.txt')).text(), /Disallow: \/admin/);

    // Wrong password, then the right one
    const bad = await raw('/api/admin/login', { method: 'POST', body: { password: 'nope' } }); assert.equal(bad.status, 401);
    const ok = await raw('/api/admin/login', { method: 'POST', body: { password: 'correct horse battery' } }); assert.equal(ok.status, 200);
    assert.match(ok.headers.get('set-cookie'), /HttpOnly/); assert.match(ok.headers.get('set-cookie'), /SameSite=Strict/);
    const cookie = cookieOf(ok);
    const A = (p, o = {}) => raw('/api/admin' + p, { cookie, ...o });
    assert.equal((await A('/overview')).status, 200);
    assert.equal((await raw('/api/admin/overview', { cookie: cookie.slice(0, -3) + 'abc' })).status, 401); // tampered cookie
    assert.equal((await A('/settings', { method: 'PUT', body: {}, admin: false })).status, 403);            // writes need the header

    // Codes: create, list, edit, revoke / restore, CSV safety
    const made = await A('/coupons', { method: 'POST', body: { count: 2, note: '=HYPERLINK("http://x")', max: 1 } });
    assert.equal(made.status, 201); const codes = (await made.json()).codes; assert.equal(codes.length, 2);
    const list = await (await A('/coupons')).json(); assert.equal(list.items.length, 2);
    assert.match(list.items[0].note, /#/);
    assert.equal((await A('/coupons/' + codes[0], { method: 'PATCH', body: { note: 'Mrs Ben Ali', max: 2 } })).status, 200);
    const csv = await (await A('/coupons.csv')).text(); assert.match(csv, /'=HYPERLINK/); assert.match(csv, /Mrs Ben Ali/);

    const redeem = (code) => raw('/api/access/redeem', { method: 'POST', body: { code }, admin: false });
    const r1 = await redeem(codes[0]); assert.equal(r1.status, 200);
    const user = cookieOf(r1);
    assert.equal((await raw('/api/access/status', { cookie: user, admin: false })).status, 200);
    const detail = (await (await A('/coupons')).json()).items.find((c) => c.code === codes[0]);
    assert.equal(detail.devices.length, 1); assert.equal(detail.uses, 1);

    // Revoke ends the session at once; restore brings it back; kicking one device ends only that device
    assert.equal((await A(`/coupons/${codes[0]}/revoke`, { method: 'POST', body: {} })).status, 200);
    assert.equal((await (await raw('/api/access/status', { cookie: user, admin: false })).json()).ok, false);
    assert.equal((await A(`/coupons/${codes[0]}/restore`, { method: 'POST', body: {} })).status, 200);
    assert.equal((await (await raw('/api/access/status', { cookie: user, admin: false })).json()).ok, true);
    const r2 = await redeem(codes[0]); assert.equal(r2.status, 200); const user2 = cookieOf(r2); // max is 2 now
    assert.equal((await redeem(codes[0])).status, 401);                                          // third device refused
    const sid = (await (await A('/coupons')).json()).items.find((c) => c.code === codes[0]).devices[0].sid;
    assert.equal((await A(`/coupons/${codes[0]}/kick`, { method: 'POST', body: { sid } })).status, 200);
    assert.equal((await (await raw('/api/access/status', { cookie: user, admin: false })).json()).ok, false);
    assert.equal((await (await raw('/api/access/status', { cookie: user2, admin: false })).json()).ok, true);

    // Per-code quota: one exam a day
    assert.equal((await A('/coupons/' + codes[1], { method: 'PATCH', body: { perDay: 1 } })).status, 200);
    const q = cookieOf(await redeem(codes[1]));
    const first = await raw('/api/exams/generate', { method: 'POST', body: gen, cookie: q, admin: false }); assert.equal(first.status, 201);
    const examId = (await first.json()).id;
    const second = await raw('/api/exams/generate', { method: 'POST', body: gen, cookie: q, admin: false }); assert.equal(second.status, 429);
    assert.equal((await second.json()).quota, 'day');
    const exams = await (await A('/exams')).json(); assert.equal(exams.total, 1); assert.equal(exams.items[0].by, codes[1].replace(/-/g, ''));

    // Features: switch DOCX off for everyone, HTML to beta (this code is not on the list)
    assert.equal((await A('/settings', { method: 'PUT', body: { features: { docx: 'off', html: 'beta' } } })).status, 200);
    const exp = (format) => raw(`/api/exams/${examId}/export`, { method: 'POST', body: { format }, cookie: q, admin: false });
    assert.equal((await exp('docx')).status, 403); assert.equal((await exp('html')).status, 403);
    assert.equal((await A('/settings', { method: 'PUT', body: { features: { html: 'on' }, betaCodes: [codes[1]] } })).status, 200);
    assert.equal((await exp('html')).status, 200);
    await A('/settings', { method: 'PUT', body: { features: { docx: 'on' } } });

    // Settings are clamped, never trusted
    const s = await (await A('/settings', { method: 'PUT', body: { limits: { examsPerHour: 99999, redeemPerHour: -5 }, retentionDays: 'abc', maintenance: { on: false, message: 'x'.repeat(900) } } })).json();
    assert.equal(s.settings.limits.examsPerHour, 1000); assert.equal(s.settings.limits.redeemPerHour, 1); assert.equal(s.settings.retentionDays, 30); assert.equal(s.settings.maintenance.message.length, 400);

    // Moderation: hide, view blocked, show, delete
    assert.equal((await A(`/exams/${examId}/hide`, { method: 'POST', body: { hidden: true } })).status, 200);
    assert.equal((await raw(`/api/exams/${examId}`, { admin: false })).status, 410);
    assert.equal((await A(`/exams/${examId}`)).status, 200); // the admin can still read it
    assert.equal((await A(`/exams/${examId}/hide`, { method: 'POST', body: { hidden: false } })).status, 200);
    assert.equal((await raw(`/api/exams/${examId}`, { admin: false })).status, 200);

    // Maintenance mode: the site shows a notice, the admin keeps working
    await A('/settings', { method: 'PUT', body: { maintenance: { on: true, message: 'Back at noon' } } });
    const m1 = await raw('/', { admin: false }); assert.equal(m1.status, 503); assert.match(await m1.text(), /Back at noon/);
    assert.equal((await raw('/api/access/status', { admin: false })).status, 503);
    assert.equal((await A('/overview')).status, 200); assert.equal((await raw('/admin', { admin: false })).status, 200);
    await A('/settings', { method: 'PUT', body: { maintenance: { on: false } } });
    assert.equal((await raw('/', { admin: false })).status, 200);

    // Announcement bar is escaped HTML on public pages
    await A('/settings', { method: 'PUT', body: { banner: { on: true, text: 'New <b>PDF</b>!', level: 'info' } } });
    const home = await (await raw('/', { admin: false })).text(); assert.match(home, /id="ta-banner"/); assert.ok(home.includes('New &lt;b&gt;PDF&lt;/b&gt;!'));
    await A('/settings', { method: 'PUT', body: { banner: { on: false } } });

    // Blocking an address: the site answers 403, the admin does not
    const hot = (await (await A('/clients')).json()).hot; assert.ok(hot.length >= 1);
    await A('/settings', { method: 'PUT', body: { blockedIps: [hot[0].ip] } });
    assert.equal((await raw('/api/access/status', { admin: false })).status, 403);
    assert.equal((await A('/overview')).status, 200);
    await A('/settings', { method: 'PUT', body: { blockedIps: [] } });
    assert.equal((await raw('/api/access/status', { admin: false })).status, 200);

    // Contact messages and waiting list: list, answer, invite
    await raw('/api/contact', { method: 'POST', body: { email: 'a@b.co', message: 'Please give me a code', name: 'A' }, admin: false });
    const msgs = (await (await A('/messages')).json()).items; assert.equal(msgs.length, 1); assert.equal(msgs[0].done, false);
    assert.equal((await A('/messages/done', { method: 'POST', body: { id: msgs[0].id, done: true } })).status, 200);
    await raw('/api/waitlist', { method: 'POST', body: { email: 'T@Example.com', role: 'teacher', lang: 'fr' }, admin: false });
    const inv = await (await A('/waitlist/invite', { method: 'POST', body: { email: 't@example.com' } })).json(); assert.ok(inv.code);
    assert.equal((await (await A('/waitlist')).json()).items[0].invited, inv.code);

    // Statistics, AI log, health, audit
    const st = await (await A('/stats?days=7')).json(); assert.ok(st.totals.exams >= 1);
    assert.equal((await A('/ai/log')).status, 200);
    const hl = await (await A('/health')).json(); assert.equal(hl.db.enabled, false);
    const audit = (await (await A('/audit')).json()).items.map((x) => x.action);
    for (const a of ['login', 'coupons.create', 'coupons.revoke', 'coupons.kick', 'settings.update', 'exams.hide']) assert.ok(audit.includes(a), a);

    // Backup and restore
    const bk = await (await A('/backup?exams=1')).json(); assert.equal(bk.version, 1); assert.equal(bk.exams.length, 1); assert.equal(Object.keys(bk.coupons).length, 2 + 1);
    await A(`/exams/${examId}`, { method: 'DELETE' });
    assert.equal((await raw(`/api/exams/${examId}`, { admin: false })).status, 404);
    const rs = await (await A('/restore', { method: 'POST', body: bk })).json(); assert.equal(rs.restored.exams, 1);
    assert.equal((await raw(`/api/exams/${examId}`, { admin: false })).status, 200);
    assert.equal((await A('/restore', { method: 'POST', body: { nope: 1 } })).status, 400);

    // Lock-out after five wrong passwords, even for the right one
    await A('/logout', { method: 'POST', body: {} });
    for (let i = 0; i < 5; i++) await raw('/api/admin/login', { method: 'POST', body: { password: 'wrong' + i } });
    const locked = await raw('/api/admin/login', { method: 'POST', body: { password: 'correct horse battery' } });
    assert.equal(locked.status, 429); assert.ok((await locked.json()).retryAfter > 0);
  } finally {
    await require('../src/export').close();
    await new Promise((r) => server.close(r));
    for (const d of [data, store]) fs.rmSync(d, { recursive: true, force: true });
  }
});
