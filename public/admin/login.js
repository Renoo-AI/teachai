import { h, t, clear, state, setLang } from './core.js';

let dispose = () => {};
export function login(app, onSuccess, info = {}) {
  dispose();
  document.title = t('Sign in') + ' · Teach.ai Admin';
  let busy = false, until = 0, timer, controller;
  let active = true;
  dispose = () => { active = false; clearInterval(timer); controller?.abort(); };
  const err = h('p', { id: 'login-error', class: 'login-error', role: 'alert', hidden: true });
  const caps = h('p', { id: 'login-caps', class: 'small login-hint', hidden: true }, t('Caps Lock is on.'));
  const pw = h('input', {
    id: 'admin-password', name: 'password', type: 'password', autocomplete: 'current-password',
    required: true, spellcheck: false, autocapitalize: 'none',
    'aria-describedby': 'login-help login-caps login-error',
    onkeyup: e => { caps.hidden = !e.getModifierState('CapsLock'); },
    onkeydown: e => { caps.hidden = !e.getModifierState('CapsLock'); },
    oninput: () => { pw.removeAttribute('aria-invalid'); if (!until) err.hidden = true; },
  });
  const show = h('button', {
    type: 'button', class: 'login-reveal', 'aria-controls': 'admin-password', 'aria-pressed': 'false',
    onclick: () => {
      const reveal = pw.type === 'password';
      pw.type = reveal ? 'text' : 'password';
      show.textContent = t(reveal ? 'Hide' : 'Show');
      show.setAttribute('aria-pressed', String(reveal));
    },
  }, t('Show'));
  const go = h('button', { class: 'btn primary login-submit', type: 'submit' }, t('Sign in'));
  const error = message => { err.textContent = message; err.hidden = false; };
  const tick = () => {
    const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
    if (left) {
      go.disabled = true;
      error(t('Too many wrong passwords. Try again in {m}:{s}.', { m: Math.floor(left / 60), s: String(left % 60).padStart(2, '0') }));
    } else { until = 0; clearInterval(timer); go.disabled = busy; err.hidden = true; }
  };
  const form = h('form', { class: 'login-card', onsubmit: async e => {
    e.preventDefault();
    if (busy || until > Date.now()) return;
    busy = true; err.hidden = true; go.disabled = true; go.textContent = t('Signing in…');
    form.setAttribute('aria-busy', 'true');
    controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST', credentials: 'same-origin', signal: controller.signal,
        headers: { 'content-type': 'application/json', 'x-admin': '1' },
        body: JSON.stringify({ password: pw.value }),
      });
      const data = await response.json().catch(() => null);
      if (!active) return;
      if (response.ok && data?.ok === true) {
        pw.value = ''; dispose(); onSuccess(data.newDevice); return;
      }
      if (response.status === 429) {
        until = Date.now() + Math.max(1, Math.min(3600, Number(data?.retryAfter) || 900)) * 1000;
        tick(); timer = setInterval(tick, 1000);
      } else if (response.status === 401) {
        pw.setAttribute('aria-invalid', 'true');
        error(data?.left != null ? t('Wrong password. {n} tries left.', { n: data.left }) : t('Wrong password.'));
        pw.focus();
      } else if (data?.disabled) error(t('Admin sign-in is not configured on this server.'));
      else if (response.status === 403 || response.status === 404) error(t('Admin sign-in is unavailable from this address.'));
      else error(t('The server could not complete sign-in. Please try again shortly.'));
    } catch (e) {
      if (active) error(t(e.name === 'AbortError' ? 'Sign-in timed out. Please try again.' : 'No connection to the server. Check your internet and try again.'));
    } finally {
      clearTimeout(timeout); busy = false;
      if (active) {
        form.removeAttribute('aria-busy'); go.disabled = until > Date.now(); go.textContent = t('Sign in');
      }
    }
  } },
  h('div', { class: 'login-heading' }, h('span', { class: 'login-eyebrow' }, t('ADMIN WORKSPACE')),
    h('h1', null, t('Welcome back.')), h('p', { class: 'muted' }, t('Sign in to manage your teaching workspace.'))),
  info.expired ? h('p', { class: 'note warn' }, t('Your session ended. Sign in again.')) : null,
  h('div', { class: 'field' }, h('label', { htmlFor: 'admin-password' }, t('Password')),
    h('div', { class: 'login-password' }, pw, show),
    h('p', { id: 'login-help', class: 'small muted' }, t('Use your administrator password, not an access code.'))),
  caps, err, go,
  h('p', { class: 'login-footnote' }, t('Private access · Administrator only')));
  clear(app).append(h('main', { class: 'login' }, h('div', { class: 'login-wrap' },
    h('a', { class: 'login-brand', href: '/' }, 'Teach.ai', h('span', null, t('Administration'))), form,
    h('footer', { class: 'login-footer' }, h('a', { href: '/' }, t('Back to the site')),
      h('button', { type: 'button', class: 'btn quiet sm', onclick: () => {
        setLang(state.lang === 'en' ? 'fr' : 'en'); login(app, onSuccess, info);
      } }, state.lang === 'en' ? 'Français' : 'English')))));
  pw.focus();
}
