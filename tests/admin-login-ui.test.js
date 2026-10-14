const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');

test('admin login browser: error states, duplicate prevention, mobile layout and successful sign-in', { timeout: 90000 }, async () => {
  process.env.ADMIN_PASSWORD = 'browser-fixture-password';
  const server = require('../src/server');
  if (!server.listening) await once(server, 'listening');
  const candidates = [process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft/Edge/Application/msedge.exe'),
    '/usr/bin/chromium', '/usr/bin/google-chrome'];
  const executablePath = candidates.find(p => p && fs.existsSync(p));
  let browser;
  try {
    const puppeteer = await import('puppeteer-core');
    browser = await puppeteer.launch({ executablePath, headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    let mode = 'server-error', pending, requests = 0;
    await page.setRequestInterception(true);
    page.on('request', req => {
      if (!req.url().endsWith('/api/admin/login')) return req.continue();
      requests++;
      if (mode === 'pending') { pending = req; return; }
      if (mode === 'real') return req.continue();
      const status = mode === 'wrong' ? 401 : mode === 'locked' ? 429 : 503;
      return req.respond({ status, contentType: 'application/json', body: JSON.stringify({ error: 'fixture', left: 4, retryAfter: 1 }) });
    });
    await page.setViewport({ width: 1280, height: 850 });
    await page.goto(`http://127.0.0.1:${server.address().port}/admin`);
    await page.waitForSelector('#admin-password');
    await page.type('#admin-password', 'browser-fixture-password');
    await page.click('.login-reveal');
    assert.equal(await page.$eval('#admin-password', el => el.type), 'text');
    await page.click('.login-reveal');
    const submit = () => page.$eval('form', form => form.requestSubmit());
    await submit();
    await page.waitForFunction(() => document.querySelector('#login-error').textContent.includes('server could not'));
    assert.equal(await page.$eval('#admin-password', el => el.value), 'browser-fixture-password');
    mode = 'wrong'; await submit();
    await page.waitForFunction(() => document.querySelector('#login-error').textContent.includes('4 tries left'));
    mode = 'pending'; const before = requests; await submit();
    await page.waitForFunction(() => document.querySelector('form').getAttribute('aria-busy') === 'true');
    await submit();
    // Waiting on a browser round trip lets the one request reach interception.
    await page.waitForNetworkIdle({ idleTime: 100, concurrency: 1 });
    assert.equal(requests, before + 1);
    assert.ok(pending);
    await pending.respond({ status: 503, contentType: 'application/json', body: '{}' });
    await page.waitForFunction(() => !document.querySelector('.login-submit').disabled);
    mode = 'locked'; await submit();
    await page.waitForFunction(() => document.querySelector('#login-error').textContent.includes('Too many'));
    await page.waitForFunction(() => !document.querySelector('.login-submit').disabled);
    await page.$eval('#admin-password', el => { el.value = ''; });
    fs.mkdirSync(path.join(__dirname, '../_local'), { recursive: true });
    await page.screenshot({ path: path.join(__dirname, '../_local/admin-login-desktop.png') });
    await page.setViewport({ width: 375, height: 812 });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(__dirname, '../_local/admin-login-mobile.png') });
    await page.type('#admin-password', 'browser-fixture-password');
    mode = 'real'; await submit();
    await page.waitForSelector('.shell');
    assert.equal(await page.$('#admin-password'), null);
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
    await require('../src/export').close();
  }
});
