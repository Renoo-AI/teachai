const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');

test('audit regressions: storage, sessions, quotas, exports, backups and TLS', async (t) => {
  const access = require('../src/access');
  const store = require('../src/store');
  const db = require('../src/db');
  const exporter = require('../src/export');
  const generation = require('../src/generate');
  const fixture = {
    title: 'Fixture', tpl: { lang: 'en', level: 'b9' }, lessonText: 'Private lesson',
    by: 'OWNER', demo: true, options: {}, groups: [{ title: 'Exercise' }],
    questions: [{ id: 'q1', type: 'short', prompt: 'Explain.', points: 20, answer: 'Answer',
      group: 0, topic: 'Topic', flagged: true }],
  };
  const created = await store.create(fixture);
  const cookieReq = token => ({ headers: { cookie: access.setCookie(token, 3600, false).split(';')[0] } });

  await t.test('invalid saves cannot corrupt records or change server-owned fields', async () => {
    for (const questions of [{}, [null], [{ ...fixture.questions[0], choices: {} }], [{ ...fixture.questions[0], points: -1 }]]) {
      await assert.rejects(store.save(created.id, created.editKey, { ...fixture, questions }), { status: 400 });
    }
    assert.deepEqual((await store.read(created.id)).questions, fixture.questions);
    const saved = await store.save(created.id, created.editKey, {
      ...fixture, title: 'Edited', by: 'OTHER', hidden: true, lessonText: 'Overwrite', demo: false,
    });
    assert.equal(saved.status, 200);
    const record = await store.read(created.id);
    assert.equal(record.by, 'OWNER');
    assert.equal(record.hidden, undefined);
    assert.equal(record.lessonText, 'Private lesson');
    assert.equal(record.demo, true);
    assert.equal(record.questions[0].id, 'q1');
    assert.equal(record.questions[0].flagged, true);
    assert.equal(record.questions[0].topic, 'Topic');
    assert.equal((await store.save(created.id, created.editKey, { ...fixture, questions: [] })).status, 200);
    await store.save(created.id, created.editKey, fixture);
  });

  await t.test('imported environment sessions must re-redeem and respect revocation', async () => {
    process.env.ACCESS_REQUIRED = '1';
    process.env.TEACHAI_COUPONS = 'IMPORTTEST';
    const old = cookieReq((await access.redeem('IMPORTTEST')).token);
    assert.equal(access.hasAccess(old), true);
    access.importEnv();
    assert.equal(access.hasAccess(old), false);
    const fresh = cookieReq((await access.redeem('IMPORTTEST')).token);
    assert.equal(access.hasAccess(fresh), true);
    access.revoke('IMPORTTEST');
    assert.equal(access.hasAccess(fresh), false);
    assert.equal(access.hasAccess(old), false);
    access.restore('IMPORTTEST');
    access.reset('IMPORTTEST');
    assert.equal(access.hasAccess(fresh), false);
  });

  await t.test('file-backed last activity persists and is throttled', async () => {
    access.create({ code: 'ACTIVITY' });
    const req = cookieReq((await access.redeem('ACTIVITY')).token);
    const filename = path.join(process.env.TEACHAI_ACCESS_DIR, 'coupons.json');
    const original = Date.now;
    const later = original() + 6 * 60000;
    try {
      Date.now = () => later;
      assert.equal(access.hasAccess(req), true);
      assert.equal(JSON.parse(fs.readFileSync(filename)).ACTIVITY.devices[0].last, later);
      Date.now = () => later + 1000;
      assert.equal(access.hasAccess(req), true);
      assert.equal(JSON.parse(fs.readFileSync(filename)).ACTIVITY.devices[0].last, later);
    } finally { Date.now = original; }
  });

  await t.test('backup reads all 5001 records independently of the admin list', async () => {
    const enabled = db.enabled, query = db.query;
    const rows = Array.from({ length: 5001 }, (_, i) => ({ data: { id: String(i).padStart(10, '0'), editKeyHash: 'fixture' } }));
    try {
      db.enabled = () => true;
      db.query = async sql => {
        assert.equal(sql, 'SELECT data FROM exams ORDER BY id');
        return { rows };
      };
      assert.deepEqual(await store.dumpAll(), rows.map(row => row.data));
    } finally { db.enabled = enabled; db.query = query; }
  });

  await t.test('TLS verifies remote hosts despite URL overrides or misleading credentials', () => {
    for (const url of ['postgres://localhost:secret@db.example/db?sslmode=no-verify',
      'postgres://user:localhost@db.example/db?ssl=false', 'postgres://db.example/db?sslmode=require']) {
      const options = db.connectionOptions({ DATABASE_URL: url });
      assert.equal(options.ssl.rejectUnauthorized, true);
      assert.equal(new URL(options.connectionString).searchParams.size, 0);
      // Verify pg receives the policy after parsing the sanitized URL, without connecting.
      const client = new (require('pg').Client)(options);
      assert.equal(client.connectionParameters.ssl.rejectUnauthorized, true);
    }
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      assert.equal(db.connectionOptions({ DATABASE_URL: `postgres://${host}/db` }).ssl, false);
    }
  });

  const realGenerate = generation.generateQuestions;
  const realRender = exporter.render;
  let writeStarted, finishWrite;
  generation.generateQuestions = async () => {
    writeStarted();
    return await new Promise(resolve => { finishWrite = () => resolve({ questions: fixture.questions, demo: true }); });
  };
  const server = require('../src/server');
  if (!server.listening) await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  const request = (url, body, cookie, key, method = 'POST') => fetch(base + url, {
    method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(key ? { 'x-edit-key': key } : {}) },
    body: JSON.stringify(body),
  });
  const payload = { lesson: 'Water evaporates when heated. '.repeat(12), options: {
    counts: { short: 3 }, tpl: { subject: 'svt', level: 'b9', lang: 'en', exercises: 3 },
  } };
  try {
    await t.test('HTTP saves reject malformed questions with 400', async () => {
      const response = await request('/api/exams/' + created.id, { questions: {} }, '', created.editKey, 'PUT');
      assert.equal(response.status, 400);
    });
    await t.test('pending generations cannot double-spend a coupon quota', async () => {
      access.create({ code: 'QUOTATEST', perDay: 1 });
      const cookie = cookieReq((await access.redeem('QUOTATEST')).token).headers.cookie;
      const started = new Promise(resolve => { writeStarted = resolve; });
      const first = request('/api/exams/generate', payload, cookie);
      await started;
      try {
        assert.equal((await request('/api/exams/generate', payload, cookie)).status, 409);
      } finally { finishWrite(); }
      assert.equal((await first).status, 201);
      assert.equal((await request('/api/exams/generate', payload, cookie)).status, 429);
      access.update('QUOTATEST', { perDay: 0 });
      assert.equal((await request('/api/exams/generate', { lesson: 'short' }, cookie)).status, 400);
      const again = new Promise(resolve => { writeStarted = resolve; });
      const next = request('/api/exams/generate', payload, cookie);
      await again;
      finishWrite();
      assert.equal((await next).status, 201);
    });
    await t.test('exports enforce concurrency, release failed slots and rate-limit public requests', async () => {
      const url = '/api/exams/' + created.id + '/export';
      const releases = [];
      let started;
      const bothStarted = new Promise(resolve => { started = resolve; });
      exporter.render = () => new Promise((resolve, reject) => {
        releases.push({ resolve, reject });
        if (releases.length === 2) started();
      });
      const first = request(url, { format: 'html' });
      const second = request(url, { format: 'html' });
      await bothStarted;
      try { assert.equal((await request(url, { format: 'html' })).status, 429); }
      finally {
        releases[0].resolve('fixture');
        releases[1].reject(Object.assign(new Error('Fixture failure'), { status: 503 }));
      }
      assert.deepEqual((await Promise.all([first, second])).map(r => r.status).sort(), [200, 503]);
      exporter.render = async () => 'fixture';
      for (let i = 0; i < 8; i++) assert.equal((await request(url, { format: 'html' })).status, 200);
      assert.equal((await request(url, { format: 'html' })).status, 429);
    });
  } finally {
    if (finishWrite) finishWrite();
    generation.generateQuestions = realGenerate;
    exporter.render = realRender;
    await new Promise(resolve => server.close(resolve));
    await exporter.close();
  }
});
