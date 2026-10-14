// Real Tunisian papers (the Devoir_TN_7_Bac collection) as starting points.
// The folder is found with CORPUS_DIR, or ~/Downloads/Devoir_TN_7_Bac. Layout of the collection:
//   <grade>/[<section>/]Trimestre-N/Devoir-de-controle-N | Devoir-de-synthese-N/<Subject>.pdf
// Papers are listed per class and subject, previewed as PDF, and analysed: the number of exercises, the marks of each,
// the duration, the coefficient, the part titles and the text itself, which the AI then uses as a model of structure
// and style (never as a source of questions).
const fs = require('fs');
const path = require('path');
const os = require('os');
const TPL = require('../public/templates.js');

const CACHE_FILE = path.join(__dirname, '..', 'data', 'papers-cache.json');

function root() {
  const d = process.env.CORPUS_DIR || path.join(os.homedir(), 'Downloads', 'Devoir_TN_7_Bac');
  return fs.existsSync(d) ? d : '';
}

// Our subject ids to the folder names of the collection.
const SUBJECT_DIRS = {
  maths: ['Mathematiques'], physique: ['Physique'], svt: ['Sciences-SVT'], francais: ['Francais'], arabe: ['Arabe'],
  anglais: ['Anglais'], histoire: ['Histoire'], geo: ['Geographie'], histgeo: ['Histoire', 'Geographie'], info: ['Informatique'],
  techno: ['Technologie'], philo: ['Philosophie'], islam: ['Education-Islamique', 'Pensee-islamique'], civique: ['Education-civique'],
  eco: ['Economie'], gestion: ['Gestion'], italien: ['Italien'], allemand: ['Allemand'], espagnol: ['Espagnol'], tic: ['TIC'],
  algo: ['Algorithme-et-programmation'], bdd: ['Bases-de-donnees'], sysres: ['Systeme-dexploitation-et-reseaux-informatiques'],
  artistique: ['Education-artistique'], musique: ['Education-musicale'], theatre: ['Education-theatrale'], eveil: [],
};
const LEVEL_DIRS = {
  b7: ['7'], b8: ['8'], b9: ['9'], s1: ['1s'],
  s2l: ['2s', 'Lettres'], s2s: ['2s', 'Sciences'], s2e: ['2s', 'Economie-et-services'], s2t: ['2s', 'Technologie-de-linformatique'],
  s3l: ['3s', 'Lettres'], s3m: ['3s', 'Mathematiques'], s3s: ['3s', 'Sciences-experimentales'], s3e: ['3s', 'Economie-et-Gestion'],
  s3t: ['3s', 'Sciences-Techniques'], s3i: ['3s', 'Sciences-de-linformatique'],
  s4l: ['bac', 'Lettres'], s4m: ['bac', 'Mathematiques'], s4s: ['bac', 'Sciences-experimentales'], s4e: ['bac', 'Economie-et-Gestion'],
  s4t: ['bac', 'Techniques'], s4i: ['bac', 'Sciences-de-linformatique'],
};

// ---------- Index ----------

let indexCache = null;

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.toLowerCase().endsWith('.pdf')) out.push(p);
  }
}

function buildIndex() {
  const base = root();
  if (!base) return { items: [], byId: new Map(), available: false };
  // who wrote it and when, from the collection's inventory
  const meta = new Map();
  try {
    const rows = parseCsv(fs.readFileSync(path.join(base, 'Inventory.csv'), 'utf8').replace(/^﻿/, ''));
    const head = rows[0] || [];
    const fi = head.indexOf('file'), mi = head.indexOf('school_author_metadata');
    rows.slice(1).forEach((r) => {
      if (fi < 0 || !r[fi]) return;
      const m = r[mi] || '';
      meta.set(r[fi].replace(/\\/g, '/'), {
        author: ((/[—–-]\s*Devoirs?\s*(.*?)\s*[•·]/.exec(m) || [])[1] || '').replace(/\s+/g, ' ').trim(),
        year: ((/[•·]\s*((?:19|20)\d\d(?:\s*[-–]\s*(?:19|20)?\d\d)?)/.exec(m) || [])[1] || '').replace(/\s+/g, ''),
      });
    });
  } catch { /* the inventory is optional */ }

  const files = [];
  walk(base, files);
  const items = [];
  for (const f of files) {
    const parts = path.relative(base, f).split(path.sep);
    const id = parts.join('/');
    const subjectDir = parts[parts.length - 1].replace(/\.pdf$/i, '');
    const tri = parts.findIndex((x) => /^Trimestre-/i.test(x));
    const kindDir = parts.find((x) => /^Devoir-de-(controle|synthese)-\d/i.test(x)) || '';
    const km = /^Devoir-de-(controle|synthese)-(\d)/i.exec(kindDir);
    const grade = parts[0];
    const stream = ['7', '8', '9', '1s'].includes(grade) ? '' : (parts[1] || '');
    const sm = meta.get(id) || {};
    let size = 0;
    try { size = fs.statSync(f).size; } catch { /* ignore */ }
    items.push({
      id, grade, stream, subjectDir,
      kind: km ? km[1].toLowerCase().replace('controle', 'control') : (parts.includes('Bac-national') ? 'bacnational' : 'other'),
      num: km ? parseInt(km[2], 10) : 0,
      trimester: tri >= 0 ? parseInt(parts[tri].replace(/\D/g, ''), 10) || 0 : 0,
      author: sm.author || '', year: sm.year || '', kb: Math.round(size / 1024),
    });
  }
  const byId = new Map(items.map((it) => [it.id, it]));
  return { items, byId, available: true };
}

function index() {
  if (!indexCache) indexCache = buildIndex();
  return indexCache;
}

// Papers of a class and subject, controls then syntheses, by term.
function list(levelId, subjectId) {
  const ix = index();
  if (!ix.available) return { available: false, items: [] };
  const lv = LEVEL_DIRS[levelId];
  const dirs = SUBJECT_DIRS[subjectId] || [];
  if (!lv || !dirs.length) return { available: true, items: [] };
  const out = ix.items.filter((it) => it.grade === lv[0] && (lv[1] ? it.stream === lv[1] : true) && dirs.includes(it.subjectDir));
  out.sort((a, b) => (a.trimester - b.trimester) || (a.kind === b.kind ? a.num - b.num : a.kind === 'control' ? -1 : 1));
  return { available: true, items: out };
}

// Absolute path of an indexed paper, or '' (only papers found in the index can ever be read).
function fileOf(id) {
  const it = index().byId.get(String(id || ''));
  if (!it) return '';
  const abs = path.resolve(root(), it.id);
  return abs.startsWith(path.resolve(root()) + path.sep) ? abs : '';
}

// ---------- Analysis ----------

const memo = new Map();
let diskCache = null;
function loadDisk() {
  if (diskCache) return diskCache;
  try { diskCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch { diskCache = {}; }
  return diskCache;
}
function saveDisk() {
  try { fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true }); fs.writeFileSync(CACHE_FILE, JSON.stringify(diskCache)); } catch { /* cache is optional */ }
}

const num = (s) => parseFloat(String(s).replace(',', '.'));

function cleanTitle(raw) {
  let t = String(raw).replace(/\s+/g, ' ').trim();
  t = t.replace(/[(\[]\s*\d+(?:[.,]\d+)?\s*(?:points?|pts?|pt|p)\s*[)\]]?/gi, '').replace(/\d+(?:[.,]\d+)?\s*(?:points?|pts?)\b/gi, '');
  t = t.replace(/\b(?:n°|N°|N\s)\s*/g, '').replace(/\s*[:：]\s*$/, '').replace(/\s{2,}/g, ' ').trim();
  const m = /^(exercice|problème|probleme|partie|situation)\b\s*(\d+|[IVX]+)?\s*(?::\s*([^:]{2,24}))?/i.exec(t);
  if (m) {
    const kind = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase().replace('probleme', 'problème');
    return kind + (m[2] ? ' ' + m[2] : '') + (m[3] ? ' : ' + m[3].trim() : '');
  }
  return t.slice(0, 50);
}

function extract(text, pages) {
  const t = String(text || '').replace(/\r/g, '');
  const nonSpace = t.replace(/\s/g, '');
  const punct = (nonSpace.match(/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g) || []).length;
  const junk = nonSpace.length ? punct / nonSpace.length : 0;
  const ar = (t.match(/[؀-ۿ]/g) || []).length;
  const lat = (t.match(/[A-Za-zÀ-ÿ]/g) || []).length;
  const fr = (t.match(/\b(le|la|les|des|une|est|dans|pour|que|qui|sur|avec|donc|calculer|déterminer)\b/gi) || []).length;
  const en = (t.match(/\b(the|and|is|are|of|to|in|that|with|write|read|answer)\b/gi) || []).length;
  let lang = ar > lat * 0.6 ? 'ar' : (en > fr * 1.2 && en > 12 ? 'en' : 'fr');
  const garbled = lang === 'fr' && junk > 0.2 && fr < 8;
  if (garbled) lang = 'ar';

  const dur = (/(?:Dur[ée]e|Time|Duration)\s*[:：]?\s*([^\n]{1,22})/i.exec(t) || /(?:المدة|مدة الفرض|الحصة)\s*[:：]?\s*([^\n]{1,22})/.exec(t) || [])[1] || '';
  let minutes = 0;
  const h = /(\d+)\s*(?:h|heure|heures|ساعة|ساعات|س)/i.exec(dur);
  const m = /(\d+)\s*(?:mn|min|minutes|دق)/i.exec(dur);
  if (h) minutes += parseInt(h[1], 10) * 60;
  if (m) minutes += parseInt(m[1], 10);
  if (!minutes && /ساعتان/.test(dur)) minutes = 120;
  const coef = (/(?:Coefficient|Coef\.?)\s*[:：]?\s*(\d(?:[.,]\d)?)/i.exec(t) || /(?:الضارب|المعامل)\s*[:：]?\s*(\d(?:[.,]\d)?)/.exec(t) || [])[1] || '';

  const titles = [];
  let mm;
  const reEx = /^[ \t]*((?:Exercice|EXERCICE|Problème|PROBLEME|PROBLÈME|Partie|PARTIE|Situation)\b[^\n]{0,70})$/gm;
  while ((mm = reEx.exec(t))) titles.push(cleanTitle(mm[1]));
  const reRom = /^[ \t]*(I{1,3}V?|IV|V)\s*[-–.)]\s*([^\n]{3,50})$/gm;
  const roman = [];
  while ((mm = reRom.exec(t))) roman.push(mm[1] + '- ' + cleanTitle(mm[2]).replace(/\s*[:：].*$/, ''));

  const pts = [];
  const rePts = /(?:Exercice|Problème|PROBLEME|EXERCICE|Partie|Part)\b[^\n]{0,60}?\(?\s*(\d+(?:[.,]\d+)?)\s*(?:points?|pts?|pt)\b/gi;
  while ((mm = rePts.exec(t))) pts.push(num(mm[1]));
  const rePtsRom = /^[ \t]*(?:I{1,3}V?|IV|V)\s*[-–.)][^\n]{0,60}?\(\s*(\d+(?:[.,]\d+)?)\s*(?:points?|pts?|marks?)\s*\)/gim;
  const ptsRom = [];
  while ((mm = rePtsRom.exec(t))) ptsRom.push(num(mm[1]));

  // Number bare headings ("Exercice" becomes "Exercice 2") and drop repeated ones.
  const numbered = (list) => {
    const seen = new Set();
    const out = [];
    list.forEach((x, i) => {
      const v = /^(Exercice|Partie|Situation)$/i.test(x) ? x + ' ' + (out.length + 1) : x;
      if (!seen.has(v)) { seen.add(v); out.push(v); }
    });
    return out;
  };
  const exTitles = numbered(titles.length >= 2 ? titles : (roman.length >= 2 ? roman : titles));
  let marks = pts.length >= 2 ? pts : (ptsRom.length >= 2 ? ptsRom : []);
  let split = null;
  const total = marks.reduce((a, b) => a + b, 0);
  if (marks.length >= 2 && marks.length <= 6 && total >= 12 && total <= 45) split = marks.map((p) => Math.round((p / total) * 20 * 4) / 4);
  // keep the sum exact after rounding
  if (split) { const diff = Math.round((20 - split.reduce((a, b) => a + b, 0)) * 4) / 4; if (diff) split[split.length - 1] = Math.round((split[split.length - 1] + diff) * 4) / 4; }

  const has = (re) => (t.match(re) || []).length;
  return {
    pages, lang, garbled, junk: Math.round(junk * 100) / 100, minutes, coef,
    titles: exTitles.slice(0, 6), split, ex: split ? split.length : (exTitles.length >= 2 ? Math.min(exTitles.length, 6) : 0),
    qcm: has(/QCM|Choisir la (?:bonne|seule)|Cocher|Entourer la|اختر الإجابة|اختيار من متعدد/gi) > 0,
    tf: has(/Vrai\s*(?:ou|\/)\s*Faux|vrai-faux|صحيح\s*أو\s*خطأ|True\s*or\s*False/gi) > 0,
    chars: nonSpace.length,
    body: garbled ? '' : t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 6000),
  };
}

async function analyze(id) {
  const key = String(id || '');
  if (memo.has(key)) return memo.get(key);
  const file = fileOf(key);
  if (!file) throw new Error('Paper not found.');
  const disk = loadDisk();
  let out = disk[key];
  if (!out) {
    let text = '', pages = 0;
    try {
      const pdf = require('pdf-parse');
      const data = await Promise.race([pdf(fs.readFileSync(file)), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 30000))]);
      text = data.text || '';
      pages = data.numpages || 0;
    } catch { /* unreadable PDF: reported as not usable */ }
    out = extract(text, pages);
    out.usable = !out.garbled && out.chars >= 300;
    disk[key] = out;
    saveDisk();
  }
  const it = index().byId.get(key) || {};
  const full = { ...out, id: key, kind: it.kind, num: it.num, trimester: it.trimester, year: it.year, author: it.author };
  memo.set(key, full);
  return full;
}

// What the client may see: no paper text.
function publicView(a) {
  const { body, ...rest } = a;
  return { ...rest, hasText: !!body };
}

// What the generator uses when the teacher chose a paper as a model.
function asReference(a, label) {
  if (!a) return null;
  return {
    id: a.id, label: label || a.id, usable: !!a.usable, lang: a.lang, ex: a.ex || 0, split: a.split || null,
    titles: a.titles || [], minutes: a.minutes || 0, coef: a.coef || '', body: a.usable ? a.body : '', qcm: !!a.qcm, tf: !!a.tf,
  };
}

module.exports = { root, list, fileOf, analyze, publicView, asReference, index, LEVEL_DIRS, SUBJECT_DIRS };
