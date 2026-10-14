import { login } from './login.js';
// Admin entry: sign-in, the navigation shell and the hash router.
import { h, t, api, clear, state, setLang, toast, fail, mount, isDirty, setDirty, confirmBox, icon } from './core.js';
import overview from './overview.js';
import codes from './codes.js';
import exams from './exams.js';
import stats from './stats.js';
import ai from './ai.js';
import { waitlist, messages } from './people.js';
import settings from './settings.js';
import system from './system.js';
import audit from './audit.js';

const sections = [overview, codes, exams, stats, ai, waitlist, messages, settings, system, audit];
const app = document.getElementById('app');
let badges = { messages: 0, waitlist: 0 };

state.onSignedOut = () => { showLogin(); };
setLang(state.lang);

function themeCycle() {
  const cur = document.documentElement.dataset.theme || 'auto';
  const next = cur === 'auto' ? 'dark' : cur === 'dark' ? 'light' : 'auto';
  if (next === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = next;
  try { localStorage.setItem('ta_admin_theme', next); } catch { /* ignore */ }
  toast(t('Theme: {x}', { x: next === 'auto' ? t('automatic') : next === 'dark' ? t('dark') : t('light') }), { ms: 1800 });
}

// ---- Sign-in ----
function showLogin(info = {}) { login(app, start, info); }

function showDisabled() {
  clear(app).append(h('div', { class: 'login' }, h('div', { class: 'stack', style: 'max-width:460px' },
    h('h1', null, t('The admin is switched off')),
    h('p', { class: 'muted' }, t('Set the ADMIN_PASSWORD environment variable on the server (in .env locally, or in the Render dashboard), then restart.')),
    h('code', { class: 'panel' }, 'ADMIN_PASSWORD=choose-a-long-passphrase'))));
}

// ---- Shell ----
async function refreshBadges() {
  try { const b = await api('GET', '/badges'); badges = b; paintBadges(); } catch { /* not critical */ }
}
function paintBadges() {
  for (const id of ['messages', 'waitlist']) {
    const el = document.querySelector(`[data-badge="${id}"]`);
    if (el) { el.textContent = badges[id] > 99 ? '99+' : badges[id]; el.hidden = !badges[id]; }
  }
}

function route() {
  const id = (location.hash.replace(/^#\/?/, '') || 'overview').split('?')[0];
  return sections.find((s) => s.id === id) || overview;
}

async function go() {
  const sec = route();
  document.querySelectorAll('.nav a.item').forEach((a) => a.toggleAttribute('aria-current', a.dataset.id === sec.id) || a.removeAttribute('aria-current'));
  document.querySelectorAll('.nav a.item[aria-current]').forEach((a) => a.setAttribute('aria-current', 'page'));
  document.title = t(sec.label) + ' · Teach.ai Admin';
  const main = document.getElementById('main');
  if (!main) return;
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
  await mount(main, () => sec.render({ refreshBadges, go }));
  refreshBadges();
}
window.go = go;

async function start(newDevice) {
  clear(app);
  const nav = h('nav', { class: 'nav', 'aria-label': t('Sections') },
    h('div', { class: 'brand' }, 'Teach.ai', h('span', null, 'admin')),
    h('div', { class: 'items' }, sections.map((s) => h('a', { class: 'item', href: '#/' + s.id, dataset: { id: s.id } }, h('span', { class: 'lead' }, icon(s.id), t(s.label)), s.id === 'messages' || s.id === 'waitlist' ? h('span', { class: 'count', 'data-badge': s.id, hidden: true }) : null))),
    h('div', { class: 'foot' },
      h('div', { class: 'row', style: 'gap:6px;flex-wrap:nowrap' },
        h('button', { class: 'btn sm lang', type: 'button', 'aria-label': t('Language'), onclick: () => { setLang(state.lang === 'en' ? 'fr' : 'en'); start(); } }, icon('globe'), h('span', { class: 'lbl' }, state.lang === 'en' ? 'FR' : 'EN')),
        h('button', { class: 'btn sm', type: 'button', onclick: themeCycle, 'aria-label': t('Change theme'), title: t('Change theme') }, icon('theme'), h('span', { class: 'lbl' }, t('Theme')))),
      h('a', { class: 'btn sm', href: '/', target: '_blank', rel: 'noopener', 'aria-label': t('View site'), title: t('View site') }, icon('external'), h('span', { class: 'lbl' }, t('View site'))),
      h('button', { class: 'btn sm', type: 'button', 'aria-label': t('Sign out'), title: t('Sign out'), onclick: async () => { if (isDirty() && !(await confirmBox({ title: t('Unsaved changes'), text: t('You have unsaved changes. Sign out anyway?'), ok: t('Sign out'), danger: true }))) return; setDirty(false); try { await api('POST', '/logout', {}); } catch { /* ignore */ } showLogin(); } }, icon('logout'), h('span', { class: 'lbl' }, t('Sign out')))));  app.append(h('div', { class: 'shell' }, nav, h('main', { class: 'main', id: 'main', tabindex: '-1' })));
  if (newDevice) toast(t('Signed in from a new device. If that was not you, change ADMIN_PASSWORD now.'), { kind: 'bad', ms: 12000 });
  await go();
}

window.addEventListener('hashchange', async () => {
  if (isDirty()) {
    // Settings has unsaved edits: ask before leaving.
    const stay = !(await confirmBox({ title: t('Unsaved changes'), text: t('Leave this page and lose your changes?'), ok: t('Leave'), danger: true }));
    if (stay) { history.back(); return; }
    setDirty(false);
  }
  if (document.getElementById('main')) go();
});

document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && !document.querySelector('dialog[open]')) {
    const s = document.querySelector('#main input[type=search]');
    if (s) { e.preventDefault(); s.focus(); }
  }
});

(async () => {
  try {
    const r = await fetch('/api/admin/session', { credentials: 'same-origin' });
    const d = await r.json().catch(() => ({}));
    if (d.disabled) return showDisabled();
    if (r.status === 404) { clear(app).append(h('p', { style: 'padding:24px' }, t('Not found'))); return; }
    if (d.authed) return start(false);
    showLogin();
  } catch { clear(app).append(h('div', { class: 'login' }, h('div', { class: 'note bad' }, t('No connection to the server. Check your internet and try again.')))); }
})();
