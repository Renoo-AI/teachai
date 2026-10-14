const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');

test('invite-only access: gated routes, one-time codes, reset, revoke, tampering, remote check, rate limit', async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'teachai-acc-'));
  const store = fs.mkdtempSync(path.join(os.tmpdir(), 'teachai-accx-'));
  Object.assign(process.env, { PORT: '0', NODE_ENV: 'test', ACCESS_REQUIRED: '1', ACCESS_SECRET: 'test-secret', TEACHAI_ACCESS_DIR: data, TEACHAI_DATA_DIR: store, TEACHAI_WAITLIST_DIR: data, NVIDIA_API_KEY: '', DEEPSEEK_TOKEN: '', AI_PROVIDER: 'none' });
  delete process.env.ACCESS_API_URL; delete process.env.TEACHAI_COUPONS;
  const access = require('../src/access');
  const server = require('../src/server');
  if (!server.listening) await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  const req = (p, { method = 'GET', body, cookie } = {}) => fetch(base + p, { method, redirect: 'manual', headers: { 'content-type': 'application/json', accept: 'text/html', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const redeem = (code) => req('/api/access/redeem', { method: 'POST', body: { code } });
  const cookieOf = (r) => (r.headers.get('set-cookie') || '').split(';')[0];
  const lesson = 'Evaporation turns liquid water into water vapour. The sun supplies energy that heats water and causes evaporation. Condensation turns water vapour into liquid droplets. Precipitation returns water to the ground as rain. Rivers carry water towards oceans.';
  const gen = { lesson, options: { counts: { mcq: 1, short: 2 }, tpl: { level: 'b9', subject: 'svt', lang: 'en', exercises: 3 } } };
  let remote;
  try {
    // Without a code: the app redirects to the code page; everything that costs AI time is refused.
    const app = await req('/app'); assert.equal(app.status, 302); assert.equal(app.headers.get('location'), '/access?next=/app');
    assert.equal((await req('/access')).status, 200);
    assert.equal((await req('/')).status, 200);
    for (const [p, method] of [['/api/exams/generate', 'POST'], ['/api/ai/test', 'POST'], ['/api/extract', 'POST'], ['/api/papers', 'GET'], ['/api/exams/abcdefghij/assistant', 'POST'], ['/api/exams/abcdefghij/questions/regenerate', 'POST']]) {
      const r = await req(p, { method, body: method === 'POST' ? gen : undefined });
      assert.equal(r.status, 401, p); assert.equal((await r.json()).access, 'required');
    }
    assert.equal((await req('/api/exams/abcdefghij')).status, 404); // a link still opens: not gated

    // Bad and short codes
    assert.equal((await redeem('NOPE-NOPE-NOPE')).status, 401);
    assert.equal((await redeem('A')).status, 401);

    // One teacher, one code, one device
    const code = access.create({ code: 'COUPON1', max: 1, note: 'Teacher X1' });
    assert.equal(code, 'COUP-ON1');
    const ok = await redeem('coupon-1');
    assert.equal(ok.status, 200);
    const set = ok.headers.get('set-cookie'); assert.match(set, /HttpOnly/); assert.match(set, /SameSite=Lax/);
    const cookie = cookieOf(ok);
    assert.equal((await req('/app', { cookie })).status, 200);
    const made = await req('/api/exams/generate', { method: 'POST', body: gen, cookie }); assert.equal(made.status, 201);
    assert.equal((await redeem('COUPON1')).status, 401); // used up: a second device is refused
    assert.equal((await req('/api/access/status', { cookie })).status, 200);

    // Tampered or foreign cookies do not work
    assert.equal((await req('/api/ai/test', { method: 'POST', body: {}, cookie: cookie.slice(0, -3) + 'abc' })).status, 401);
    assert.equal((await req('/api/ai/test', { method: 'POST', body: {}, cookie: 'ta_access=garbage' })).status, 401);

    // Reset lets the same teacher in again; revoke ends sessions immediately
    assert.ok(access.reset('COUPON1'));
    const again = await redeem('COUPON1'); assert.equal(again.status, 200);
    assert.ok(access.revoke('COUPON1'));
    assert.equal((await req('/api/ai/test', { method: 'POST', body: {}, cookie })).status, 401);
    assert.equal((await req('/app', { cookie: cookieOf(again) })).status, 302);
    assert.equal((await redeem('COUPON1')).status, 401);

    // Expired codes
    access.create({ code: 'OLDCODE1', max: 5 });
    const f = path.join(data, 'coupons.json'), all = JSON.parse(fs.readFileSync(f, 'utf8')); all.OLDCODE1.expires = '2020-01-01T00:00:00Z'; fs.writeFileSync(f, JSON.stringify(all));
    assert.equal((await redeem('OLDCODE1')).status, 401);

    // Remote check (for example a Vercel function that owns the coupons)
    remote = http.createServer((q, s) => {
      let b = ''; q.on('data', (c) => { b += c; });
      q.on('end', () => { const { code } = JSON.parse(b); s.setHeader('content-type', 'application/json'); s.end(JSON.stringify(q.headers.authorization === 'Bearer k' && code === 'REMOTEOK1' ? { ok: true, id: 'teacher-7' } : { ok: false })); });
    }).listen(0);
    await once(remote, 'listening');
    Object.assign(process.env, { ACCESS_API_URL: 'http://127.0.0.1:' + remote.address().port, ACCESS_API_KEY: 'k' });
    const viaRemote = await redeem('REMOTE-OK1'); assert.equal(viaRemote.status, 200);
    assert.equal((await req('/api/ai/test', { method: 'POST', body: {}, cookie: cookieOf(viaRemote) })).status !== 401, true);
    assert.equal((await redeem('REMOTE-BAD1')).status, 401);
    await new Promise((r) => remote.close(r)); remote = null;
    assert.equal((await redeem('REMOTE-OK1')).status, 503); // the code service is down: refuse, do not guess
    delete process.env.ACCESS_API_URL;

    // Brute force is limited
    let limited = false;
    for (let i = 0; i < 14 && !limited; i++) limited = (await redeem('GUESS-' + i + '-ZZZZ')).status === 429;
    assert.ok(limited);
  } finally {
    if (remote) remote.close();
    await new Promise((resolve) => server.close(resolve));
    for (const dir of [data, store]) {
      assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep + 'teachai-'));
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});
