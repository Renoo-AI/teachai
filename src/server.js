// Teach.ai server: no accounts, no login.
// Run: npm start  (then open http://localhost:3000)
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
require('./env').load(path.join(__dirname, '..', '.env'));
const store = require('./store');
const TPL = require('../public/templates.js');
const { generateQuestions, regenerateQuestion, hasKey, MODEL, effectivePlan } = require('./generate');
const aiLib = require('./ai');
const assistant = require('./assistant');
const papers = require('./papers');
const { extractText } = require('./extract');
const exporter = require('./export');
const { offTaskRequest, prohibitedContent, scopeReply } = require('./exam-policy');
const waitlist = require('./waitlist');
const contact = require('./contact');
const access = require('./access');
const admin = require('./admin');
const settings = require('./settings');
const metrics = require('./metrics');
const context = require('./context');
const kv = require('./kv');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, '..', 'public');
const MAX_BODY = 15 * 1024 * 1024; // logos and images travel inside the exam JSON

// Settings, coupons and counters load before the first request is served.
// They load in parallel and a failure only logs: the site must stay up even when the database is not reachable.
const ready = Promise.allSettled([settings.init(), metrics.init(), access.init()]).then((rs) => rs.forEach((r) => { if (r.status === 'rejected') console.error('start-up load failed:', r.reason && r.reason.message); }));

const exportClients = new Map();
let activeExports = 0;
async function boundedExport(ip, exam, format, mode) {
  const now = Date.now();
  for (const [key, slot] of exportClients) {
    if (slot.until <= now) exportClients.delete(key);
  }
  let slot = exportClients.get(ip);
  if (!slot) {
    if (exportClients.size >= 10000) {
      throw Object.assign(new Error('Exports are busy. Try again shortly.'), { status: 503 });
    }
    slot = { until: now + 60000, count: 0 };
    exportClients.set(ip, slot);
  }
  if (slot.count >= 10 || activeExports >= 2) {
    throw Object.assign(new Error('Too many exports. Try again shortly.'), { status: 429 });
  }
  slot.count++;
  activeExports++;
  try { return await exporter.render(exam, format, mode); }
  finally { activeExports--; }
}

const generatingCodes = new Set();

const genHits = new Map(); // ip -> [timestamps]

function rateOk(ip) {
  const now = Date.now();
  const hits = (genHits.get(ip) || []).filter((t) => now - t < 3600e3);
  if (hits.length >= settings.get().limits.examsPerHour) { genHits.set(ip, hits); return false; }
  hits.push(now);
  genHits.set(ip, hits);
  return true;
}

const SECURITY = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', 'x-frame-options': 'SAMEORIGIN' };

const waitHits = new Map(); // ip -> [timestamps]
function waitlistRateOk(ip) {
  const now = Date.now();
  const hits = (waitHits.get(ip) || []).filter((t) => now - t < 3600e3);
  if (hits.length >= settings.get().limits.waitlistPerHour) { waitHits.set(ip, hits); return false; }
  hits.push(now);
  waitHits.set(ip, hits);
  return true;
}

const contactHits = new Map(); // ip -> [timestamps]
function contactRateOk(ip) {
  const now = Date.now();
  const hits = (contactHits.get(ip) || []).filter((t) => now - t < 3600e3);
  if (hits.length >= settings.get().limits.contactPerHour) { contactHits.set(ip, hits); return false; }
  hits.push(now);
  contactHits.set(ip, hits);
  return true;
}

function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...SECURITY, ...extra });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

// Public site pages. The app itself lives at /app; the exam editor at /e/<id>.
const PAGES = { '/': 'landing.html', '/app': 'index.html', '/access': 'access.html', '/faq': 'faq.html', '/about': 'about.html', '/contact': 'contact.html', '/privacy': 'privacy.html', '/terms': 'terms.html', '/cookies': 'cookies.html' };
const INDEXABLE = ['/', '/about', '/faq', '/contact', '/privacy', '/terms', '/cookies'];
const PARTIALS = { '<!--NAV-->': 'nav.html', '<!--FOOTER-->': 'footer.html' };

function siteUrl(req) {
  const fixed = String(process.env.SITE_URL || '').replace(/\/+$/, '');
  return fixed || 'http://' + (req.headers.host || 'localhost:' + PORT);
}

// English copy for the public pages (public/site-i18n.js). Empty data-s elements are filled with it on the server,
// so search engines and visitors without JavaScript get the full text; the browser then switches language on its own.
let enCache = { mtime: 0, copy: {} };
function englishCopy() {
  const file = path.join(PUBLIC, 'site-i18n.js');
  const mtime = fs.statSync(file).mtimeMs;
  if (mtime !== enCache.mtime) {
    const sandbox = { window: {} };
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox);
    enCache = { mtime, copy: (sandbox.window.SITE_I18N || {}).en || {} };
  }
  return enCache.copy;
}
const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function fillCopy(html) {
  const en = englishCopy();
  return html.replace(/<(\w+)([^>]*?)\sdata-s(-html)?="([^"]+)"([^>]*)>\s*<\/\1>/g, (whole, tag, before, rich, key, after) =>
    en[key] == null ? whole : `<${tag}${before} data-s${rich || ''}="${key}"${after}>${rich ? en[key] : escapeHtml(en[key])}</${tag}>`);
}

// Pages share one header and footer (public/partials) and need absolute URLs for link previews.
function renderPage(req, res, file, status = 200) {
  fs.readFile(path.join(PUBLIC, file), 'utf8', (err, html) => {
    if (err) return status !== 200 ? send(res, status, status === 404 ? 'Not found' : 'Server error', 'text/plain; charset=utf-8') : notFound(req, res);
    for (const [token, partial] of Object.entries(PARTIALS)) {
      if (html.includes(token)) html = html.split(token).join(fs.readFileSync(path.join(PUBLIC, 'partials', partial), 'utf8'));
    }
    if (html.includes('data-s')) html = fillCopy(html);
    if (html.includes('{{FAQ_JSONLD}}')) {
      const en = englishCopy();
      const items = Array.from({ length: 12 }, (_, i) => i + 1).filter((n) => en['q' + n]).map((n) => ({ '@type': 'Question', name: en['q' + n], acceptedAnswer: { '@type': 'Answer', text: en['a' + n] } }));
      html = html.split('{{FAQ_JSONLD}}').join(JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items }).replace(/</g, '\\u003c'));
    }
    const banner = admin.bannerHtml();           // the announcement bar set in /admin
    if (banner) html = html.replace(/<body[^>]*>/i, (tag) => tag + banner);
    send(res, status, html.split('{{SITE_URL}}').join(siteUrl(req)), 'text/html; charset=utf-8');
  });
}

// The admin page: never indexed, never cached, and no banner.
function adminPage(req, res) {
  fs.readFile(path.join(PUBLIC, 'admin.html'), (err, html) => err ? notFound(req, res) : send(res, 200, html, 'text/html; charset=utf-8', { 'x-robots-tag': 'noindex, nofollow' }));
}

// While maintenance mode is on, visitors see a short notice; the admin and static assets keep working.
function maintenanceBlocks(req, url) {
  if (!settings.get().maintenance.on) return false;
  if (url.pathname.startsWith('/api/admin') || url.pathname === '/admin' || url.pathname === '/admin/') return false;
  if (req.method === 'GET' && /\.(css|js|woff2|png|jpg|svg|ico|webmanifest)$/.test(url.pathname)) return false;
  return true;
}

// Clients with the most requests in the last hour, for the admin's "block" list.
function hotClients() {
  const now = Date.now();
  return [...genHits].map(([ip, t]) => ({ ip, hits: t.filter((x) => now - x < 3600e3).length })).filter((x) => x.hits).sort((a, b) => b.hits - a.hits).slice(0, 20);
}

function notFound(req, res) {
  const wantsPage = !path.extname(req.url.split('?')[0]) && String(req.headers.accept || '').includes('text/html');
  if (!wantsPage) return send(res, 404, { error: 'Not found' });
  renderPage(req, res, '404.html', 404);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('Too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch (_) { reject(Object.assign(new Error('Bad JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};
// Fonts, icons and images change rarely; scripts and styles must always revalidate.
const LONG_CACHE = new Set(['.woff2', '.png', '.jpg', '.ico', '.svg']);

function serveStatic(req, res, file) {
  const full = path.join(PUBLIC, file);
  if (!full.startsWith(PUBLIC + path.sep) || file.startsWith('partials/')) return send(res, 403, { error: 'Forbidden' });
  fs.readFile(full, (err, data) => {
    if (err) return notFound(req, res);
    const ext = path.extname(full);
    send(res, 200, data, MIME[ext] || 'application/octet-stream', LONG_CACHE.has(ext) ? { 'cache-control': 'public, max-age=86400' } : { 'cache-control': 'no-cache' });
  });
}

// What a viewer or editor may see: never the lesson text.
function viewOf(exam) {
  const { lessonText, options, by, hidden, ...rest } = exam;
  if (!options) return rest;
  const ref = options.ref ? { ...options.ref, body: undefined } : undefined;
  return { ...rest, options: { ...options, ref } };
}

// Behind a proxy (Vercel, nginx) the real client address is in x-forwarded-for; only trust it when asked to.
function clientIp(req) {
  const fwd = process.env.TRUST_PROXY === '1' ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
  return fwd || req.socket.remoteAddress || 'unknown';
}
const isHttps = (req) => /^https:/i.test(String(process.env.SITE_URL || '')) || req.headers['x-forwarded-proto'] === 'https';

// Everything that costs AI time or reads the paper collection needs an access code. Viewing and saving an exam
// through its own link, exporting, the waiting list and the access endpoints stay open.
const GATED = [
  ['POST', /^\/api\/exams\/generate$/], ['GET', /^\/api\/papers(\/|$)/], ['POST', /^\/api\/exams\/[a-z0-9]{10}\/assistant$/],
  ['POST', /^\/api\/exams\/[a-z0-9]{10}\/questions\/regenerate$/], ['POST', /^\/api\/ai\/test$/], ['POST', /^\/api\/extract$/],
];

const redeemHits = new Map(); // ip -> [timestamps]
function redeemRateOk(ip) {
  const now = Date.now();
  const hits = (redeemHits.get(ip) || []).filter((t) => now - t < 3600e3);
  if (hits.length >= settings.get().limits.redeemPerHour) { redeemHits.set(ip, hits); return false; }
  hits.push(now); redeemHits.set(ip, hits);
  return true;
}

// Admin routes have their own sign-in; everything else runs with the caller's access code in context (for the AI log and counters).
async function handleApi(req, res, url) {
  if (url.pathname.startsWith('/api/admin/')) return admin.handle(req, res, url, { send, readBody, clientIp, isHttps, hotClients });
  const who = access.identity(req);
  return context.run({ code: who ? who.id : '', ip: clientIp(req) }, () => apiRoutes(req, res, url, who));
}

const featureOff = (res, name) => send(res, 403, { error: `The ${name} feature is switched off for now.`, feature: name });

async function apiRoutes(req, res, url, who) {
  const ip = clientIp(req);
  const codeId = who ? who.id : '';

  if (GATED.some(([method, re]) => req.method === method && re.test(url.pathname)) && !access.hasAccess(req)) {
    return send(res, 401, { error: 'An access code is required. Reload the page and enter your code.', access: 'required' });
  }
  if (url.pathname === '/api/access/status' && req.method === 'GET') return send(res, 200, { required: access.required(), ok: access.hasAccess(req) });
  if (url.pathname === '/api/access/redeem' && req.method === 'POST') {
    if (!redeemRateOk(ip)) return send(res, 429, { error: 'Too many attempts. Try again in an hour.' });
    const b = await readBody(req);
    const out = await access.redeem(b.code, { ua: req.headers['user-agent'], ip });
    if (!out.ok) return send(res, out.unavailable ? 503 : 401, { error: out.unavailable ? 'Code check is unavailable. Try again shortly.' : 'invalid' });
    return send(res, 200, { ok: true }, 'application/json; charset=utf-8', { 'set-cookie': access.setCookie(out.token, out.maxAge, isHttps(req)) });
  }
  if (url.pathname === '/api/access/logout' && req.method === 'POST') return send(res, 200, { ok: true }, 'application/json; charset=utf-8', { 'set-cookie': access.clearCookie(isHttps(req)) });

  const exportMatch=url.pathname.match(/^\/api\/exams\/([a-z0-9]{10})\/export$/);
  if(exportMatch && req.method==='POST') {
    const record=await store.read(exportMatch[1]);
    if(!record||record.hidden)return send(res,404,{error:'Exam not found.'});
    const b=await readBody(req);
    if(!['pdf','docx','html'].includes(b.format))return send(res,400,{error:'Choose PDF or DOCX.'});
    if(!settings.featureOn(b.format,codeId))return featureOff(res,b.format.toUpperCase());
    const editable=store.checkKey(record,req.headers['x-edit-key']);
    if(b.exam&&!editable)return send(res,403,{error:'An edit key is required to export unsaved changes.'});
    const exam=exporter.snapshot(editable&&b.exam?b.exam:record,record);
    const mode=b.mode==='key'?'key':'student';
    const data=await boundedExport(ip,exam,b.format,mode);
    metrics.count(b.format);
    const types={pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',html:'text/html; charset=utf-8'};
    const filename=(exam.title||'exam').replace(/[^a-z0-9]+/gi,'-').slice(0,80)||'exam';
    res.writeHead(200,{'content-type':types[b.format],'cache-control':'no-store','content-disposition':`attachment; filename="${filename}-${mode}.${b.format}"`});
    return res.end(data);
  }

  // Create an exam from a lesson.
  if (req.method === 'POST' && url.pathname === '/api/exams/generate') {
    if (codeId && generatingCodes.has(codeId)) {
      return send(res, 409, { error: 'An exam is already being generated for this code.' });
    }
    if (codeId) generatingCodes.add(codeId);
    try {
      if (!rateOk(ip)) return send(res, 429, { error: 'Too many exams from this device. Try again in an hour.' });
      const quota = access.checkQuota(req);
      if (!quota.ok) return send(res, 429, { error: quota.reason === 'day' ? `This access code has reached its limit of ${quota.limit} exams today. Try again tomorrow.` : `This access code has reached its limit of ${quota.limit} exams this month.`, quota: quota.reason });
      const b = await readBody(req);
      const lesson = String(b.lesson || '').trim();
      if (lesson.length < 200) return send(res, 400, { error: 'The lesson needs at least a few paragraphs of text.' });
      if (lesson.length > 60000) return send(res, 400, { error: 'Use a focused lesson of at most 60,000 characters.' });
      const o = b.options || {};
      const tin = o.tpl || {};
      const lang = Object.keys(TPL.LANGS).includes(tin.lang) ? tin.lang : 'fr';
      const subject = TPL.findSubject(tin.subject);
      const level = TPL.findLevel(tin.level);
      const kind = TPL.KINDS[tin.kind] ? tin.kind : 'control';
      const num = Math.max(0, Math.min(9, parseInt(tin.num, 10) || 0));
      const plan = TPL.plan(subject.id, level.id);
      const nEx = Math.max(1, Math.min(6, parseInt(tin.exercises, 10) || plan.ex));
      const tpl = { subject: subject.id, level: level.id, kind, num, lang, exercises: nEx };
      const options = {
        counts: { mcq: 0, tf: 0, short: 0, essay: 0, ...(o.counts || {}) },
        points: { mcq: 1, tf: 1, short: 2, essay: 5, ...(o.points || {}) },
        choices: [3, 4, 5].includes(+o.choices) ? +o.choices : 4,
        difficulty: String(o.difficulty || 'mixed'),
        topics: Array.isArray(o.topics) ? o.topics.slice(0, 20).map(String) : [],
        tpl,
        total: 20,
        supportText: !!plan.support && b.useSupport !== false,
      };
      for (const type of ['mcq', 'tf', 'short', 'essay']) {
        const count = Number(options.counts[type]);
        const weight = Number(options.points[type]);
        if (!Number.isInteger(count) || count < 0 || count > 30 || !Number.isFinite(weight) || weight <= 0 || weight > 20) return send(res, 400, { error: 'Use 0–30 questions per type and positive question weights up to 20.' });
        options.counts[type] = count; options.points[type] = weight;
      }
      options.counts = Object.fromEntries(['mcq', 'tf', 'short', 'essay'].map((t) => [t, options.counts[t]]));
      const countTotal = Object.values(options.counts).reduce((a, b) => a + b, 0);
      if (countTotal < nEx || countTotal > 40) return send(res, 400, { error: 'Choose at least one question per exercise and no more than 40 questions in total.' });
      options.difficulty = ['easy', 'medium', 'hard', 'mixed'].includes(options.difficulty.toLowerCase()) ? options.difficulty.toLowerCase() : 'mixed';
      if (b.refPaper) {
        try {
          const a = await papers.analyze(String(b.refPaper));
          options.ref = papers.asReference(a, String(b.refLabel || '').slice(0, 160));
        } catch { /* the paper is optional: carry on with the standard template */ }
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(Object.assign(new Error('Writing took too long. Try fewer questions or another model.'),{status:504})), 150000);
      res.on('close', () => { if (!res.writableEnded) controller.abort(); });
      const streaming = url.searchParams.get('stream') === '1';
      const progress = (stage) => { if (streaming && !res.destroyed) res.write(JSON.stringify({ type:'stage', stage }) + '\n'); };
      if (streaming) { res.writeHead(200, {'content-type':'application/x-ndjson; charset=utf-8','cache-control':'no-store','x-accel-buffering':'no'}); progress('drafting'); }
      let generated;
      try { generated = await generateQuestions(lesson, options, b.ai, { signal:controller.signal, onProgress:progress }); controller.signal.throwIfAborted(); }
      finally { clearTimeout(timeout); }
      const { questions, demo } = generated;
      const L = TPL.L[lang];
      const duration = Math.max(15, Math.min(300, parseInt(tin.duration, 10) || (options.ref && options.ref.usable && options.ref.minutes) || plan.dur[kind === 'synthese' ? 'synthese' : 'control']));
      const exam = {
        title: String(b.title || TPL.kindTitle(kind, num, lang)).slice(0, 120),
        tpl,
        groups: effectivePlan(options).titles.map((title) => ({ title })),
        school: String(b.header?.school || '').slice(0, 160), subject: TPL.subjectLabel(subject.id, level.id, lang), className: level[lang] || level.fr,
        examDate: '', teacher: String(b.header?.teacher || '').slice(0, 120), coef: (options.ref && options.ref.usable && options.ref.coef) || plan.coef, year: TPL.schoolYear(),
        duration: TPL.fmtDuration(duration, lang),
        instructions: L.instructions,
        support: plan.support && b.useSupport !== false ? lesson : '',
        design: TPL.DESIGNS.includes(b.design) ? b.design : TPL.defaultDesign(level.id, lang), nbPages: '',
        paper: 'A4', showMargin: true, answerSpace: b.answerSpace !== false, logo: null,
        options, questions, demo,
        lessonText: lesson,
        ...(codeId ? { by: codeId } : {}),
      };
      if (res.destroyed) return;
      const created = await store.create(exam);
      metrics.count('exams'); metrics.count('subj', subject.id); metrics.count('lvl', level.id); metrics.count('lang', lang);
      if (codeId) metrics.count('codes', codeId, { exams: 1 });
      const response = { id: created.id, editKey: created.editKey, exam: viewOf({ ...created.exam, lessonText: undefined }), demo, model: demo ? null : MODEL(b.ai) };
      if (streaming) { progress('complete'); return res.end(JSON.stringify({ type:'complete', ...response })+'\n'); }
      return send(res, 201, response);
    } finally {
      if (codeId) generatingCodes.delete(codeId);
    }
  }

  // Real papers of the collection: list for a class and subject, preview as PDF, analyse the structure.
  if (url.pathname.startsWith('/api/papers') && !settings.featureOn('papers', codeId)) return featureOff(res, 'papers');
  if (req.method === 'GET' && url.pathname === '/api/papers') {
    const r = papers.list(url.searchParams.get('level'), url.searchParams.get('subject'));
    return send(res, 200, { available: r.available, items: r.items });
  }
  if (req.method === 'GET' && url.pathname === '/api/papers/analyze') {
    try { return send(res, 200, papers.publicView(await papers.analyze(url.searchParams.get('id')))); }
    catch (e) { return send(res, 404, { error: e.message }); }
  }
  if (req.method === 'GET' && url.pathname === '/api/papers/file') {
    const file = papers.fileOf(url.searchParams.get('id'));
    if (!file) return send(res, 404, { error: 'Paper not found.' });
    return fs.readFile(file, (err, data) => {
      if (err) return send(res, 404, { error: 'Paper not found.' });
      res.writeHead(200, { 'content-type': 'application/pdf', 'content-disposition': 'inline', 'cache-control': 'private, max-age=3600' });
      res.end(data);
    });
  }

  // The AI co-worker: proposes actions for the editor to apply. Needs the edit key.
  const am = url.pathname.match(/^\/api\/exams\/([a-z0-9]{10})\/assistant$/);
  if (am && req.method === 'POST') {
    if (!settings.featureOn('assistant', codeId)) return featureOff(res, 'assistant');
    const record = await store.read(am[1]);
    if (!record || record.hidden) return send(res, 404, { error: 'Exam not found.' });
    if (!store.checkKey(record, req.headers['x-edit-key'])) return send(res, 403, { error: 'This is a view-only link.' });
    if (!rateOk(ip)) return send(res, 429, { error: 'Too many requests from this device. Try again in an hour.' });
    const b = await readBody(req);
    const message = String(b.message || '').trim().slice(0, 1000);
    if (!message) return send(res, 400, { error: 'Write a request first.' });
    const out = await assistant.run({ message, exam: b.exam || {}, tpl: record.tpl, options: record.options, lessonText: record.lessonText }, b.ai);
    return send(res, 200, out);
  }
  // Read an exam (view link or edit link).
  const m = url.pathname.match(/^\/api\/exams\/([a-z0-9]{10})(\/questions\/regenerate)?$/);
  if (m) {
    const id = m[1];
    const record = await store.read(id);
    if (!record) return send(res, 404, { error: 'Exam not found. It may have been deleted after a long time without edits.' });
    if (record.hidden) return send(res, 410, { error: 'This exam was removed by the site administrator.' });

    if (req.method === 'GET' && !m[2]) {
      return send(res, 200, viewOf(store.publicView(record)));
    }

    const key = req.headers['x-edit-key'];
    if (!store.checkKey(record, key)) return send(res, 403, { error: 'This is a view-only link.' });

    // Save the whole exam (autosave).
    if (req.method === 'PUT' && !m[2]) {
      const b = await readBody(req);
      const content = { ...b, lessonText: record.lessonText, demo: record.demo, options: record.options, tpl: record.tpl };
      const result = await store.save(id, key, content);
      return send(res, result.status, { ...viewOf(result.exam || {}), saved: result.status === 200 });
    }

    // Regenerate one question.
    if (req.method === 'POST' && m[2]) {
      if (!rateOk(ip)) return send(res, 429, { error: 'Too many requests from this device. Try again in an hour.' });
      const b = await readBody(req);
      const idx = Number(b.index);
      const q = record.questions[idx];
      if (!q) return send(res, 400, { error: 'No question at that position.' });
      const instruction = String(b.instruction || '').slice(0, 300);
      if (offTaskRequest(instruction) || prohibitedContent(instruction)) return send(res, 400, { error: scopeReply(record.tpl && record.tpl.lang) });
      const fresh = await regenerateQuestion(record.lessonText, q, record.options, instruction, b.ai);
      return send(res, 200, { question: fresh, demo: !hasKey(b.ai) });
    }
  }

  // Test the AI settings from the Settings panel. Secrets are never echoed back.
  if (req.method === 'POST' && url.pathname === '/api/ai/test') {
    if (!rateOk(ip)) return send(res, 429, { error: 'Too many requests from this device. Try again later.' });
    const b = await readBody(req);
    return send(res, 200, { results: await aiLib.test(b.ai) });
  }

  // What the server itself has configured (names only, no secrets), so the panel can say what is used by default.
  if (req.method === 'GET' && url.pathname === '/api/ai/status') {
    return send(res, 200, { serverDeepseek: !!process.env.DEEPSEEK_TOKEN, serverNvidia: !!process.env.NVIDIA_API_KEY, model: process.env.TEACHAI_MODEL || aiLib.DEFAULT_NVIDIA_MODEL });
  }

  // Early-access waitlist (landing page). A hidden "website" field catches simple bots.
  if (req.method === 'POST' && url.pathname === '/api/waitlist') {
    if (!waitlistRateOk(ip)) return send(res, 429, { error: 'Too many attempts. Try again later.' });
    const b = await readBody(req);
    if (b.website) return send(res, 200, { ok: true });
    const out = await waitlist.add(b);
    return send(res, out.ok ? 200 : 400, out);
  }

  // Contact form. Same protections as the waiting list: rate limit and a hidden field that catches simple bots.
  if (req.method === 'POST' && url.pathname === '/api/contact') {
    if (!contactRateOk(ip)) return send(res, 429, { error: 'Too many messages. Try again later.' });
    const b = await readBody(req);
    if (b.website) return send(res, 200, { ok: true });
    const out = await contact.add(b);
    return send(res, out.ok ? 200 : 400, out);
  }

  // Extract text from an uploaded lesson file.
  if (req.method === 'POST' && url.pathname === '/api/extract') {
    if (!settings.featureOn('upload', codeId)) return featureOff(res, 'upload');
    const b = await readBody(req);
    const text = await extractText(b.name, b.data);
    return send(res, 200, { text: text.slice(0, 200000) });
  }

  return send(res, 404, { error: 'Not found' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    await Promise.race([ready, new Promise((r) => setTimeout(r, 10000))]);

    if (settings.isBlocked(clientIp(req)) && !(url.pathname.startsWith('/api/admin') || url.pathname === '/admin')) return send(res, 403, { error: 'Access denied.' });
    if (maintenanceBlocks(req, url)) {
      return url.pathname.startsWith('/api/') ? send(res, 503, { error: 'Teach.ai is being updated. Try again in a few minutes.', maintenance: true }, 'application/json; charset=utf-8', { 'retry-after': '300' })
        : send(res, 503, admin.maintenanceHtml(), 'text/html; charset=utf-8', { 'retry-after': '300' });
    }

    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);

    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed' });

    const clean = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
    if (clean === '/app' && !access.hasAccess(req)) { res.writeHead(302, { location: '/access?next=/app', 'cache-control': 'no-store' }); return res.end(); }
    if (clean === '/admin/invitations') {
      if (!admin.ipAllowed(clientIp(req))) return notFound(req, res);
      if (!admin.authed(req)) return adminPage(req, res);
      return fs.readFile(path.join(__dirname, '..', 'deliverables', 'vip-invitations.html'), (err, html) => {
        if (err) return send(res, 500, 'Invitation designer unavailable.', 'text/plain; charset=utf-8');
        return send(res, 200, html, 'text/html; charset=utf-8');
      });
    }
    if (clean === '/admin') return admin.ipAllowed(clientIp(req)) ? adminPage(req, res) : notFound(req, res);
    const page = PAGES[clean];
    if (page) { if (clean === '/' || clean === '/app') metrics.count('visits'); return renderPage(req, res, page); }
    if (/^\/e\/[a-z0-9]{10}$/.test(url.pathname)) return renderPage(req, res, 'exam.html');
    if (url.pathname === '/robots.txt') {
      return send(res, 200, `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /e/\nDisallow: /app\nDisallow: /access\nDisallow: /admin\n\nSitemap: ${siteUrl(req)}/sitemap.xml\n`, 'text/plain; charset=utf-8');
    }
    if (url.pathname === '/sitemap.xml') {
      const base = siteUrl(req);
      const urls = INDEXABLE.map((p) => `  <url><loc>${base}${p === '/' ? '/' : p}</loc></url>`).join('\n');
      return send(res, 200, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, 'application/xml; charset=utf-8');
    }
    return serveStatic(req, res, url.pathname.replace(/^\//, ''));
  } catch (err) {
    if (res.destroyed) return;
    if (res.headersSent) {
      console.error('[generate] failed: ' + (err && err.stack || err));
      metrics.error('server', err, req.method + ' ' + String(req.url).split('?')[0]);
      const reason = String(err && err.message || '').slice(0, 200);
      return res.end(JSON.stringify({ type:'error', error:err.status ? err.message : 'The exam could not be created' + (reason ? ' (' + reason + ')' : '') + '. Try again with a focused lesson.' })+'\n');
    }
    const status = err.status || 500;
    if (status === 500) { console.error(err); metrics.error('server', err, req.method + ' ' + String(req.url).split('?')[0]); }
    const isPage = req.method === 'GET' && !String(req.url).startsWith('/api/') && String(req.headers.accept || '').includes('text/html');
    if (status === 500 && isPage) return renderPage(req, res, 'error.html', 500);
    send(res, status, { error: status === 500 ? 'Something went wrong. Try again.' : err.message });
  }
});

ready.then(() => store.sweep()).catch(() => {});
setInterval(() => store.sweep().catch(() => {}), 6 * 3600e3).unref();

// Free hosts stop the process on every deploy: write pending counters and settings first.
if (process.env.NODE_ENV !== 'test') {
  process.on('SIGTERM', () => { metrics.flush().finally(() => { kv.flush(); process.exit(0); }); });
  process.on('unhandledRejection', (e) => { console.error('unhandled rejection:', e); metrics.error('process', e); });
}

server.listen(PORT, () => {
  console.log(`Teach.ai running at http://localhost:${PORT}`);
  console.log(hasKey() ? `AI mode: ${MODEL()}` : 'DEMO mode: set DEEPSEEK_TOKEN or NVIDIA_API_KEY in .env to generate real questions.');
  if (process.env.NODE_ENV !== 'test') exporter.warm();
});
module.exports = server;
