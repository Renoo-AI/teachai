// Contact form messages: one JSON line each in data/messages.jsonl (TEACHAI_WAITLIST_DIR moves it, like the waiting list),
// or the `messages` table when DATABASE_URL is set. They hold personal data (an email address and free text), so the file
// is git-ignored and covered in the privacy policy.
const fs = require('fs');
const db = require('./db');
const path = require('path');

const LANGS = ['en', 'fr', 'ar'];
const EMAIL = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[^\s@<>"']{2,}$/;

function file() {
  const dir = process.env.TEACHAI_WAITLIST_DIR || path.join(__dirname, '..', 'data');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'messages.jsonl');
}

function rows() {
  try { return fs.readFileSync(file(), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); }
  catch { return []; }
}
const writeRows = (all) => fs.writeFileSync(file(), all.map((x) => JSON.stringify(x)).join('\n') + (all.length ? '\n' : ''));

async function add(input) {
  input = input || {};
  const email = String(input.email || '').trim().toLowerCase();
  const message = String(input.message || '').trim();
  const name = String(input.name || '').trim().slice(0, 100);
  if (email.length > 254 || !EMAIL.test(email) || message.length < 10 || message.length > 4000) {
    return { ok: false, error: 'Enter a valid email and a message of at least 10 characters.' };
  }
  const row = { at: new Date().toISOString(), name, email, message, lang: LANGS.includes(input.lang) ? input.lang : 'en' };
  if (db.enabled()) await db.query('INSERT INTO messages (at, name, email, message, lang) VALUES ($1, $2, $3, $4, $5)', [row.at, row.name, row.email, row.message, row.lang]);
  else fs.appendFileSync(file(), JSON.stringify(row) + '\n');
  return { ok: true };
}

// ---- Admin --- (a message is identified by its timestamp in file mode, by its row id with a database)
async function list() {
  if (db.enabled()) return (await db.query('SELECT id::text AS id, at, name, email, message, lang, COALESCE(done, false) AS done FROM messages ORDER BY id DESC')).rows;
  return rows().map((r) => ({ id: r.at, ...r, done: !!r.done })).reverse();
}

async function setDone(id, done) {
  if (db.enabled()) return (await db.query('UPDATE messages SET done = $2 WHERE id = $1', [Number(id), !!done])).rowCount > 0;
  const all = rows(), r = all.find((x) => x.at === id);
  if (!r) return false;
  r.done = !!done;
  writeRows(all);
  return true;
}

async function remove(id) {
  if (db.enabled()) return (await db.query('DELETE FROM messages WHERE id = $1', [Number(id)])).rowCount > 0;
  const all = rows(), keep = all.filter((x) => x.at !== id);
  if (keep.length === all.length) return false;
  writeRows(keep);
  return true;
}

async function restore(items) {
  let n = 0;
  for (const r of items) {
    if (!r || !EMAIL.test(String(r.email || ''))) continue;
    if (db.enabled()) { await db.query('INSERT INTO messages (at, name, email, message, lang, done) VALUES ($1, $2, $3, $4, $5, $6)', [r.at, r.name, r.email, r.message, r.lang, !!r.done]); n++; }
    else if (!rows().some((x) => x.at === r.at && x.email === r.email)) { fs.appendFileSync(file(), JSON.stringify({ at: r.at, name: r.name, email: r.email, message: r.message, lang: r.lang, done: !!r.done }) + '\n'); n++; }
  }
  return n;
}

module.exports = { add, list, setDone, remove, restore };