// Early-access waitlist: one JSON line per signup in data/waitlist.jsonl (TEACHAI_WAITLIST_DIR to move it),
// or the `waitlist` table when DATABASE_URL is set. It holds personal data (an email address), so the file is
// git-ignored and described in the privacy policy.
const fs = require('fs');
const db = require('./db');
const path = require('path');

const ROLES = ['teacher', 'school', 'other'];
const LANGS = ['en', 'fr', 'ar'];
const EMAIL = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[^\s@<>"']{2,}$/;

function file() {
  const dir = process.env.TEACHAI_WAITLIST_DIR || path.join(__dirname, '..', 'data');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'waitlist.jsonl');
}

function rows(f) {
  try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); }
  catch { return []; }
}

// Returns { ok: true } for a new or repeated address alike, so the form cannot be used to probe who has signed up.
async function add(input) {
  const email = String((input && input.email) || '').trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) return { ok: false, error: 'Enter a valid email address.' };
  const f = db.enabled() ? null : file();
  if (db.enabled() || !rows(f).some((r) => r.email === email)) {
    const row = {
      email,
      role: ROLES.includes(input.role) ? input.role : 'other',
      lang: LANGS.includes(input.lang) ? input.lang : 'en',
      at: new Date().toISOString(),
    };
    if (db.enabled()) await db.query('INSERT INTO waitlist (email, role, lang, at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', [row.email, row.role, row.lang, row.at]);
    else fs.appendFileSync(f, JSON.stringify(row) + '\n');
  }
  return { ok: true };
}

// ---- Admin ----
async function list() {
  if (db.enabled()) return (await db.query('SELECT email, role, lang, at, invited FROM waitlist ORDER BY at DESC')).rows;
  return rows(file()).reverse();
}

async function remove(email) {
  email = String(email).toLowerCase();
  if (db.enabled()) return (await db.query('DELETE FROM waitlist WHERE email = $1', [email])).rowCount > 0;
  const all = rows(file()), keep = all.filter((r) => r.email !== email);
  if (keep.length === all.length) return false;
  fs.writeFileSync(file(), keep.map((r) => JSON.stringify(r)).join('\n') + (keep.length ? '\n' : ''));
  return true;
}

// Remember which code was sent to this person, so nobody is invited twice.
async function setInvited(email, code) {
  email = String(email).toLowerCase();
  if (db.enabled()) return (await db.query('UPDATE waitlist SET invited = $2 WHERE email = $1', [email, code || null])).rowCount > 0;
  const all = rows(file());
  const r = all.find((x) => x.email === email);
  if (!r) return false;
  if (code) r.invited = code; else delete r.invited;
  fs.writeFileSync(file(), all.map((x) => JSON.stringify(x)).join('\n') + '\n');
  return true;
}

async function restore(items) {
  let n = 0;
  for (const r of items) {
    if (!r || !EMAIL.test(String(r.email || ''))) continue;
    if (db.enabled()) n += (await db.query('INSERT INTO waitlist (email, role, lang, at, invited) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING', [r.email, r.role, r.lang, r.at, r.invited || null])).rowCount;
    else if (!rows(file()).some((x) => x.email === r.email)) { fs.appendFileSync(file(), JSON.stringify(r) + '\n'); n++; }
  }
  return n;
}

module.exports = { add, list, remove, setInvited, restore };