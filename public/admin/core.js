// Shared helpers for the admin: DOM builder, translation, API calls, toasts, dialogs, formatting, charts.
import { FR } from './i18n.js';

export const state = { lang: 'en', onSignedOut: () => {} };
try { const s = localStorage.getItem('ta_admin_lang'); state.lang = s === 'fr' || s === 'en' ? s : (navigator.language || '').toLowerCase().startsWith('fr') ? 'fr' : 'en'; } catch { /* default */ }

export function setLang(l) {
  state.lang = l;
  try { localStorage.setItem('ta_admin_lang', l); } catch { /* ignore */ }
  document.documentElement.lang = l;
}

// t('English text', { n: 3 }) -> French when the language is French and a translation exists.
export function t(s, vars) {
  let out = (state.lang === 'fr' && FR[s]) || s;
  if (vars) out = out.replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null ? '' : vars[k]));
  return out;
}

// h('div', { class: 'x', onclick: fn }, 'text', childNode, [more...]) builds DOM without innerHTML (no injection).
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'value') el.value = v;
    else if (k in el && k !== 'list' && k !== 'form') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = (c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.append(c.nodeType ? c : document.createTextNode(String(c)));
  };
  kids.forEach(add);
  // Later el.append(...) calls may pass null / false / arrays (conditional parts); the native method would print "null".
  el.append = (...more) => { Element.prototype.append.apply(el, more.flat(Infinity).filter((x) => x != null && x !== false)); };
  return el;
}

// Line icons (24x24, drawn with currentColor). Static strings only, so innerHTML is safe here.
const ICONS = {
  overview: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  codes: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3 21 2M16 7l3 3M14 9l2 2"/>',
  exams: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
  stats: '<path d="M3 3v18h18"/><path d="M8 17v-6M13 17V7M18 17v-9"/>',
  ai: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 3v4M17 5h4M5 17v4M3 19h4"/>',
  waitlist: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3c2.2.7 3.5 2.6 3.5 5.7"/>',
  messages: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  system: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  audit: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  theme: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M4 4h16"/>',
};
export function icon(name) {
  const el = document.createElement('span');
  el.className = 'ico';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[name] || ''}</svg>`;
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

// ---- API ----
export async function api(method, path, body) {
  let res;
  try {
    res = await fetch('/api/admin' + path, {
      method, credentials: 'same-origin',
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), 'x-admin': '1' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch { throw Object.assign(new Error(t('No connection to the server. Check your internet and try again.')), { offline: true }); }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && data.signin) { state.onSignedOut(); throw Object.assign(new Error(t('Your session ended. Sign in again.')), { signedOut: true }); }
  if (!res.ok) throw Object.assign(new Error(data.error || t('Something went wrong.')), { status: res.status, data });
  return data;
}

// ---- Toasts ----
export function toast(message, { kind = '', undo = null, ms = 4500 } = {}) {
  const box = document.getElementById('toasts');
  const el = h('div', { class: 'toast ' + kind, role: kind === 'bad' ? 'alert' : 'status' }, h('span', null, message));
  const close = () => el.remove();
  if (undo) el.append(h('button', { type: 'button', onclick: () => { close(); undo(); } }, t('Undo')));
  box.append(el);
  setTimeout(close, undo ? Math.max(ms, 7000) : ms);
}
export const fail = (e) => { if (!e.signedOut) toast(e.message || t('Something went wrong.'), { kind: 'bad', ms: 7000 }); };

// ---- Dialogs ----
// dialog({ title, body, actions: [{ label, kind, onclick }], wide }) -> Promise resolved when closed
export function dialog({ title, body, footer, wide = false, onclose }) {
  const dlg = h('dialog', { class: wide ? 'wide' : '' });
  const shell = h('div', { class: 'dlg' }, h('h2', null, title), h('div', { class: 'body' }, body), footer ? h('footer', null, footer) : null);
  dlg.append(shell);
  const close = (v) => { try { dlg.close(); } catch { /* closed */ } dlg.remove(); if (onclose) onclose(v); };
  dlg.addEventListener('cancel', () => { dlg.remove(); if (onclose) onclose(undefined); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(undefined); });
  document.body.append(dlg);
  dlg.showModal();
  return { el: dlg, close };
}

// confirmBox({ title, text, ok, danger, type }) -> Promise<boolean>. `type` makes the user type a word to confirm.
export function confirmBox({ title, text, ok = t('Confirm'), danger = false, type = '' }) {
  return new Promise((resolve) => {
    let input = null;
    const go = h('button', { class: 'btn ' + (danger ? 'danger solid' : 'primary'), type: 'button', disabled: !!type, onclick: () => d.close(true) }, ok);
    if (type) input = h('input', { type: 'text', autocomplete: 'off', 'aria-label': t('Type {w} to confirm', { w: type }), oninput: () => { go.disabled = input.value.trim().toUpperCase() !== type.toUpperCase(); } });
    const d = dialog({
      title,
      body: [h('p', { class: 'muted' }, text), type ? h('label', { class: 'field' }, h('span', null, t('Type {w} to confirm', { w: type })), input) : null],
      footer: [h('button', { class: 'btn', type: 'button', onclick: () => d.close(false) }, t('Cancel')), go],
      onclose: (v) => resolve(v === true),
    });
    (input || go).focus();
  });
}

export async function copy(text, done) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = h('textarea', { value: text, style: 'position:fixed;opacity:0' }); document.body.append(ta); ta.select();
    try { document.execCommand('copy'); } catch { /* ignore */ } ta.remove();
  }
  toast(done || t('Copied'));
}

// ---- Formatting ----
export const nf = (n) => new Intl.NumberFormat(state.lang).format(n || 0);
export function when(ts) {
  if (!ts) return '—';
  const d = new Date(typeof ts === 'string' ? Date.parse(ts) : ts);
  if (isNaN(d)) return '—';
  const diff = (Date.now() - d.getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(state.lang, { numeric: 'auto' });
  const abs = Math.abs(diff);
  let text;
  if (abs < 60) text = rtf.format(-Math.round(diff), 'second');
  else if (abs < 3600) text = rtf.format(-Math.round(diff / 60), 'minute');
  else if (abs < 86400) text = rtf.format(-Math.round(diff / 3600), 'hour');
  else if (abs < 86400 * 45) text = rtf.format(-Math.round(diff / 86400), 'day');
  else text = d.toLocaleDateString(state.lang, { year: 'numeric', month: 'short', day: 'numeric' });
  return h('time', { datetime: d.toISOString(), title: d.toLocaleString(state.lang) }, text);
}
export const dur = (sec) => { const d = Math.floor(sec / 86400), hh = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60); return d ? `${d}d ${hh}h` : hh ? `${hh}h ${m}m` : `${m}m`; };
export const bytes = (n) => n > 1e9 ? (n / 1e9).toFixed(1) + ' GB' : n > 1e6 ? (n / 1e6).toFixed(0) + ' MB' : Math.round(n / 1e3) + ' KB';

// ---- Reusable pieces ----
export const loading = () => h('div', { 'aria-busy': 'true', 'aria-label': t('Loading') }, h('div', { class: 'skel', style: 'width:40%' }), h('div', { class: 'skel' }), h('div', { class: 'skel', style: 'width:85%' }), h('div', { class: 'skel', style: 'width:60%' }));
export const empty = (title, text, action) => h('div', { class: 'empty' }, h('b', null, title), text ? h('p', null, text) : null, action ? h('div', { style: 'margin-top:12px' }, action) : null);
export const tag = (text, kind = '') => h('span', { class: 'tag ' + kind }, text);

export function failed(e, retry) {
  return h('div', { class: 'note bad', role: 'alert' }, h('span', null, e.message), retry ? h('button', { class: 'btn sm', type: 'button', onclick: retry }, t('Try again')) : null);
}

// Runs `load()` into `box` with a loading state and a retry on failure.
export async function mount(box, load) {
  clear(box).append(loading());
  try { const node = await load(); clear(box).append(node); }
  catch (e) { if (e.signedOut) return; clear(box).append(failed(e, () => mount(box, load))); }
}

// Bars for a daily series: values [{ day, v }]
export function barChart(points, { label = '' } = {}) {
  const W = 600, H = 110, pad = 14, n = points.length || 1;
  const max = Math.max(1, ...points.map((p) => p.v));
  const bw = (W - pad * 2) / n;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H + 16}`); svg.setAttribute('class', 'chart'); svg.setAttribute('role', 'img'); svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-label', label);
  points.forEach((p, i) => {
    const bh = Math.max(p.v ? 2 : 1, (p.v / max) * H);
    const r = document.createElementNS(ns, 'rect');
    r.setAttribute('x', pad + i * bw + 1); r.setAttribute('y', H - bh); r.setAttribute('width', Math.max(1, bw - 2)); r.setAttribute('height', bh); r.setAttribute('rx', 1.5);
    r.setAttribute('class', p.v ? 'bar' : 'bar dim');
    const title = document.createElementNS(ns, 'title'); title.textContent = `${p.day}: ${p.v}`; r.append(title);
    svg.append(r);
  });
  [0, n - 1].forEach((i) => {
    if (!points[i]) return;
    const tx = document.createElementNS(ns, 'text');
    tx.setAttribute('x', i === 0 ? pad : W - pad); tx.setAttribute('y', H + 13); tx.setAttribute('text-anchor', i === 0 ? 'start' : 'end'); tx.textContent = points[i].day.slice(5);
    svg.append(tx);
  });
  return svg;
}

export function hbars(entries, { total } = {}) {
  const max = Math.max(1, ...entries.map((e) => e[1]));
  if (!entries.length) return h('p', { class: 'muted small' }, t('No data yet.'));
  return h('div', null, entries.map(([k, v]) => h('div', { class: 'hbar' }, h('span', null, k), h('div', { class: 'track' }, h('i', { style: `width:${Math.round((v / max) * 100)}%` })), h('span', { class: 'mono' }, nf(v) + (total ? ` · ${Math.round((v / total) * 100)}%` : '')))));
}

// A filterable, sortable-by-server list helper: debounce for search boxes.
export const debounce = (fn, ms = 250) => { let id; return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); }; };

// Unsaved-changes guard for forms.
let dirty = false;
export const setDirty = (v) => { dirty = v; };
window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
export const isDirty = () => dirty;
