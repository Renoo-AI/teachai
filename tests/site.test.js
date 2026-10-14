const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');

test('public site: pages, SEO copy, blocked partials, 404, robots and sitemap', async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'teachai-site-'));
  const wl = fs.mkdtempSync(path.join(os.tmpdir(), 'teachai-wl-'));
  Object.assign(process.env, { PORT: '0', NODE_ENV: 'test', TEACHAI_DATA_DIR: data, TEACHAI_WAITLIST_DIR: wl, NVIDIA_API_KEY: '', DEEPSEEK_TOKEN: '', AI_PROVIDER: 'none', ACCESS_REQUIRED: '0', SITE_URL: 'https://teach.example/' });
  const server = require('../src/server');
  if (!server.listening) await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  const get = (p, accept = 'text/html') => fetch(base + p, { headers: { accept } });
  const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    for (const p of ['/', '/app', '/access', '/faq', '/about', '/contact', '/privacy', '/terms', '/cookies', '/app/']) {
      const r = await get(p); assert.equal(r.status, 200, p); assert.match(r.headers.get('content-type'), /text\/html/);
      assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    }

    // Shared header and footer are inserted, tokens are replaced, empty copy slots are filled in English.
    const landing = await (await get('/')).text();
    assert.ok(!landing.includes('<!--NAV-->') && !landing.includes('<!--FOOTER-->') && !landing.includes('{{SITE_URL}}'));
    assert.match(landing, /class="nav"/); assert.match(landing, /class="footer"/);
    assert.match(landing, /og:image" content="https:\/\/teach\.example\/brand\/og\.png"/);
    const faq = await (await get('/faq')).text();
    assert.match(faq, /<summary data-s="q1">Do I need an account\?<\/summary>/);
    const ld = JSON.parse(faq.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.equal(ld['@type'], 'FAQPage'); assert.equal(ld.mainEntity.length, 11);

    // Raw partials are not served; the exam editor route and static assets are.
    assert.equal((await get('/partials/nav.html')).status, 403);
    assert.equal((await get('/e/abcdefghij')).status, 200);
    const css = await get('/site.css'); assert.equal(css.status, 200); assert.equal(css.headers.get('cache-control'), 'no-cache');
    const font = await get('/fonts/geist-latin-wght-normal.woff2'); assert.equal(font.status, 200); assert.match(font.headers.get('cache-control'), /max-age/);
    assert.equal((await get('/brand/og.png')).status, 200);

    // Unknown pages: a real 404 page for browsers, JSON for everything else.
    const nf = await get('/does-not-exist'); assert.equal(nf.status, 404); assert.match(await nf.text(), /404/);
    const nfApi = await get('/does-not-exist.js', '*/*'); assert.equal(nfApi.status, 404); assert.match(nfApi.headers.get('content-type'), /json/);

    const robots = await (await get('/robots.txt')).text();
    assert.match(robots, /Disallow: \/e\//); assert.match(robots, /Sitemap: https:\/\/teach\.example\/sitemap\.xml/);
    const sitemap = await (await get('/sitemap.xml')).text();
    for (const p of ['/', '/about', '/faq', '/contact', '/privacy', '/terms', '/cookies']) assert.ok(sitemap.includes('<loc>https://teach.example' + p + '</loc>'), p);
    assert.ok(!sitemap.includes('/app') && !sitemap.includes('/e/') && !sitemap.includes('/access'));

    // The footer links every public page; the about and contact copy is filled in English.
    for (const href of ['/about', '/contact', '/privacy', '/terms', '/cookies']) assert.ok(landing.includes('href=\"' + href + '\"'), href);
    assert.match(await (await get('/about')).text(), /<h2 data-s=\"about\.s1\.t\">The problem<\/h2>/);

    // Contact form: validation, honeypot, stored message.
    assert.equal((await post('/api/contact', { email: 'nope', message: 'A real message here' })).status, 400);
    assert.equal((await post('/api/contact', { email: 'a@b.co', message: 'short' })).status, 400);
    assert.equal((await post('/api/contact', { email: 'bot@example.com', message: 'This is spam text', website: 'x' })).status, 200);
    assert.equal((await post('/api/contact', { name: 'Ms Ben Ali', email: 'Ms@Example.com', message: 'Can I get a code for my school?', lang: 'ar' })).status, 200);
    const msgs = fs.readFileSync(path.join(wl, 'messages.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(msgs.length, 1); assert.equal(msgs[0].email, 'ms@example.com'); assert.equal(msgs[0].lang, 'ar');

    // Waiting list: validation, de-duplication, honeypot, no echo of stored data.
    assert.equal((await post('/api/waitlist', { email: 'nope' })).status, 400);
    assert.equal((await post('/api/waitlist', { email: 'a@b' })).status, 400);
    assert.equal((await post('/api/waitlist', { email: 'Teacher@Example.com', role: 'teacher', lang: 'fr' })).status, 200);
    assert.equal((await post('/api/waitlist', { email: 'teacher@example.com', role: 'school' })).status, 200);
    assert.equal((await post('/api/waitlist', { email: 'bot@example.com', website: 'http://spam' })).status, 200);
    const rows = fs.readFileSync(path.join(wl, 'waitlist.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(rows.length, 1); assert.equal(rows[0].email, 'teacher@example.com'); assert.equal(rows[0].role, 'teacher'); assert.equal(rows[0].lang, 'fr');
    assert.equal((await fetch(base + '/api/waitlist')).status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const dir of [data, wl]) {
      assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep + 'teachai-'));
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('brand: the logo follows the accent colour and every language has the same copy keys', () => {
  const Brand = require('../public/brand.js');
  const svg = Brand.iconSvg('#FF6B4A', { id: 'x' });
  assert.match(svg, /^<svg /); assert.ok(svg.includes('#ff6b4a')); assert.ok(svg.includes('id="xg"') && svg.includes('url(#xg)'));
  assert.ok(!Brand.iconSvg('#FF6B4A', { plain: true }).includes('rx="116"'));
  assert.equal(Brand.palette('not-a-colour').base, Brand.DEFAULT_ACCENT.toLowerCase());
  assert.ok(Brand.palette('#F5B800').light && !Brand.palette('#14B8A6').light);

  const sandbox = { window: {} };
  require('node:vm').runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'site-i18n.js'), 'utf8'), sandbox);
  const D = sandbox.window.SITE_I18N;
  const keys = (l) => Object.keys(D[l]).sort();
  assert.deepEqual(keys('fr'), keys('en')); assert.deepEqual(keys('ar'), keys('en'));
  for (const l of ['en', 'fr', 'ar']) for (const [k, v] of Object.entries(D[l])) assert.ok(String(v).trim(), l + ':' + k);
});
