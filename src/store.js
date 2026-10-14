// Exam store. No accounts: each exam has a random id and a secret edit key (stored as a SHA-256 hash).
// Exams live in Postgres when DATABASE_URL is set (see db.js), otherwise as JSON files in data/exams.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const settings = require('./settings');

const DATA_DIR = process.env.TEACHAI_DATA_DIR || path.join(__dirname, '..', 'data', 'exams');


if (!db.enabled()) fs.mkdirSync(DATA_DIR, { recursive: true });

const ID_RE = /^[a-z0-9]{10}$/;

function hash(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function newId() {
  return crypto.randomBytes(8).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '').padEnd(10, 'x').slice(0, 10);
}

function fileFor(id) {
  if (!ID_RE.test(id)) return null;
  return path.join(DATA_DIR, id + '.json');
}

// Returns false if the id is already taken.
async function insert(record) {
  if (db.enabled()) {
    const r = await db.query('INSERT INTO exams (id, data, updated_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [record.id, record, record.updatedAt]);
    return r.rowCount === 1;
  }
  if (fs.existsSync(fileFor(record.id))) return false;
  fs.writeFileSync(fileFor(record.id), JSON.stringify(record));
  return true;
}

async function create(exam) {
  const editKey = crypto.randomBytes(18).toString('base64url');
  for (;;) {
    const id = newId();
    const record = { ...exam, id, editKeyHash: hash(editKey), createdAt: Date.now(), updatedAt: Date.now() };
    if (await insert(record)) return { id, editKey, exam: publicView(record) };
  }
}

async function read(id) {
  if (!ID_RE.test(id)) return null;
  if (db.enabled()) {
    const r = await db.query('SELECT data FROM exams WHERE id = $1', [id]);
    return r.rows[0] ? r.rows[0].data : null;
  }
  const f = fileFor(id);
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

function publicView(record) {
  const { editKeyHash, ...rest } = record;
  return rest;
}

function checkKey(record, key) {
  return !!key && hash(key) === record.editKeyHash;
}

// Replace the editable content of an exam. Keeps id, key and createdAt.
function editableContent(content, record) {
  const bad = () => { throw Object.assign(new Error('Invalid exam content.'), { status: 400 }); };
  const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (!object(content) || !Array.isArray(content.questions) || content.questions.length > 100) bad();
  if (content.groups != null && (!Array.isArray(content.groups) ||
      content.groups.length > 30 || content.groups.some(g => !object(g)))) bad();
  for (const q of content.questions) {
    if (!object(q) || !['mcq', 'tf', 'short', 'essay'].includes(q.type)) bad();
    if (typeof q.prompt !== 'string' || q.prompt.length > 30000) bad();
    if (typeof q.points !== 'number' || !Number.isFinite(q.points) || q.points < 0 || q.points > 100) bad();
    if (q.choices != null && (!Array.isArray(q.choices) || q.choices.length > 6 ||
        q.choices.some(c => typeof c !== 'string' || c.length > 4000))) bad();
    for (const k of ['answer', 'rubric', 'source', 'topic']) {
      if (q[k] != null && typeof q[k] !== 'string') bad();
    }
  }
  const safe = require('./export').snapshot(content, record);
  safe.showMargin = content.showMargin !== false;
  safe.nbPages = String(content.nbPages ?? '').slice(0, 20);
  const ids = new Set();
  safe.questions.forEach((q, i) => {
    const raw = content.questions[i];
    let id = typeof raw.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(raw.id)
      ? raw.id : crypto.randomBytes(12).toString('hex');
    while (ids.has(id)) id = crypto.randomBytes(12).toString('hex');
    ids.add(id);
    Object.assign(q, { id, topic: String(raw.topic ?? '').slice(0, 1000), flagged: !!raw.flagged });
  });
  return safe;
}

async function save(id, key, content) {
  const record = await read(id);
  if (!record) return { status: 404 };
  if (!checkKey(record, key)) return { status: 403 };
  const next = {
    ...record,
    ...editableContent(content, record),
    id,
    editKeyHash: record.editKeyHash,
    createdAt: record.createdAt,
    updatedAt: Date.now(),
  };
  if (db.enabled()) await db.query('UPDATE exams SET data = $2, updated_at = $3 WHERE id = $1', [id, next, next.updatedAt]);
  else fs.writeFileSync(fileFor(id), JSON.stringify(next));
  return { status: 200, exam: publicView(next) };
}

// Delete exams not edited for days days (default: the retention in the settings, 0 keeps everything). Returns how many.
async function sweep(days = settings.get().retentionDays) {
  if (!days) return 0;
  const RETENTION_MS = days * 864e5;
  const now = Date.now();
  let removed = 0;
  if (db.enabled()) {
    try { removed = (await db.query('DELETE FROM exams WHERE updated_at < $1', [now - RETENTION_MS])).rowCount; } catch (e) { console.error('sweep failed:', e.message); }
    return removed;
  }
  for (const name of fs.readdirSync(DATA_DIR)) {
    const f = path.join(DATA_DIR, name);
    try {
      const rec = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (now - rec.updatedAt > RETENTION_MS) { fs.unlinkSync(f); removed++; }
    } catch (_) { /* skip unreadable files */ }
  }
  return removed;
}

// ---- Admin ----
const summaryCache = new Map(); // file mode: id -> { mtime, summary }
function summarize(r) {
  const t = r.tpl || {};
  return { id: r.id, title: r.title || '', subject: t.subject || '', level: t.level || '', lang: t.lang || '', kind: t.kind || '', questions: (r.questions || []).length, demo: !!r.demo, hidden: !!r.hidden, by: r.by || '', createdAt: r.createdAt || 0, updatedAt: r.updatedAt || 0 };
}

async function listAll() {
  if (db.enabled()) {
    const r = await db.query("SELECT id, data->>'title' AS title, data->'tpl' AS tpl, CASE WHEN jsonb_typeof(data->'questions') = 'array' THEN jsonb_array_length(data->'questions') ELSE 0 END AS questions, (data->>'demo') = 'true' AS demo, (data->>'hidden') = 'true' AS hidden, data->>'by' AS by, (data->>'createdAt')::bigint AS created, updated_at FROM exams ORDER BY updated_at DESC LIMIT 5000");
    return r.rows.map((x) => { const t = x.tpl || {}; return { id: x.id, title: x.title || '', subject: t.subject || '', level: t.level || '', lang: t.lang || '', kind: t.kind || '', questions: Number(x.questions), demo: !!x.demo, hidden: !!x.hidden, by: x.by || '', createdAt: Number(x.created) || 0, updatedAt: Number(x.updated_at) }; });
  }
  const out = [];
  for (const name of fs.readdirSync(DATA_DIR)) {
    if (!name.endsWith('.json')) continue;
    const f = path.join(DATA_DIR, name);
    try {
      const mtime = fs.statSync(f).mtimeMs;
      const c = summaryCache.get(name);
      if (c && c.mtime === mtime) { out.push(c.summary); continue; }
      const summary = summarize(JSON.parse(fs.readFileSync(f, 'utf8')));
      summaryCache.set(name, { mtime, summary });
      out.push(summary);
    } catch (_) { /* skip unreadable files */ }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

async function remove(id) {
  if (!ID_RE.test(id)) return false;
  if (db.enabled()) return (await db.query('DELETE FROM exams WHERE id = $1', [id])).rowCount === 1;
  const f = fileFor(id);
  if (!fs.existsSync(f)) return false;
  fs.unlinkSync(f);
  return true;
}

async function setHidden(id, hidden) {
  const rec = await read(id);
  if (!rec) return false;
  if (hidden) rec.hidden = true; else delete rec.hidden;
  if (db.enabled()) await db.query('UPDATE exams SET data = $2 WHERE id = $1', [id, rec]);
  else fs.writeFileSync(fileFor(id), JSON.stringify(rec));
  return true;
}

// Whole records for a backup (editKeyHash included, so a restored exam keeps its edit link).
async function dumpAll() {
  if (db.enabled()) {
    const result = await db.query('SELECT data FROM exams ORDER BY id');
    return result.rows.map(row => row.data);
  }
  const out = [];
  for (const name of fs.readdirSync(DATA_DIR)) {
    if (!/^[a-z0-9]{10}\.json$/.test(name)) continue;
    const record = await read(name.slice(0, -5));
    if (record) out.push(record);
  }
  return out;
}
async function restoreAll(records) {
  let n = 0;
  for (const r of records) {
    if (!r || !ID_RE.test(String(r.id)) || !r.editKeyHash) continue;
    if (await insert(r)) n++;
  }
  return n;
}

module.exports = { create, read, save, checkKey, publicView, sweep, listAll, remove, setHidden, dumpAll, restoreAll };
