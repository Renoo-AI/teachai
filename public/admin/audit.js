import { h, t, api, when, empty, clear, debounce, tag } from './core.js';

const PAGE = 100;
const LABEL = {
  login: 'Signed in', 'login.failed': 'Wrong password', 'login.new-device': 'Signed in from a new device',
  'coupons.create': 'Created codes', 'coupons.update': 'Edited a code', 'coupons.revoke': 'Revoked a code', 'coupons.restore': 'Restored a code', 'coupons.reset': 'Reset a code', 'coupons.delete': 'Deleted a code', 'coupons.kick': 'Removed a device', 'coupons.import-env': 'Imported codes',
  'exams.delete': 'Deleted an exam', 'exams.hide': 'Hid an exam', 'exams.unhide': 'Showed an exam', 'exams.purge': 'Cleaned up old exams',
  'settings.update': 'Changed settings', 'waitlist.invite': 'Invited from the waiting list', 'waitlist.delete': 'Removed from the waiting list', 'messages.delete': 'Deleted a message',
  'ai.test': 'Tested the AI', 'ai.console': 'Used the AI console', 'health.pdf': 'Tested PDF export', 'errors.clear': 'Cleared errors', 'backup.download': 'Downloaded a backup', 'backup.restore': 'Restored a backup',
};

export default {
  id: 'audit', label: 'History',
  async render() {
    let items = await api('GET', '/audit');
    items = items.items;
    let more = items.length === 200;
    let q = '';
    const root = h('div'); const list = h('div'); const foot = h('div', { class: 'row', style: 'justify-content:center;margin-top:14px' });
    function paint() {
      clear(list); clear(foot);
      const rows = items.filter((x) => !q || (x.action + ' ' + (x.detail || '') + ' ' + (LABEL[x.action] ? t(LABEL[x.action]) : '')).toLowerCase().includes(q));
      if (!rows.length) return void list.append(empty(t('Nothing recorded yet'), t('Every sign-in and every change made here is listed.')));
      list.append(h('div', { class: 'ledger', style: '--cols: 130px minmax(160px,1fr) minmax(120px,2fr)' }, rows.slice(0, PAGE * 20).map((x) => h('div', { class: 'li' },
        h('span', { class: 'cell small' }, when(x.ts)),
        h('span', { class: 'cell' }, t(LABEL[x.action] || x.action), x.action === 'login.failed' ? [' ', tag(t('alert'), 'bad')] : null),
        h('span', { class: 'cell small muted mono' }, x.detail || '')))));
      if (more) foot.append(h('button', { class: 'btn', type: 'button', onclick: async (e) => { e.target.disabled = true; const r = await api('GET', '/audit?offset=' + items.length); items = items.concat(r.items); more = r.items.length === 200; paint(); } }, t('Show older')));
    }
    root.append(h('div', { class: 'head' }, h('div', null, h('h1', null, t('History')), h('p', null, t('Who did what, newest first. The last 2,000 entries are kept.')))),
      h('div', { class: 'toolbar' }, h('input', { type: 'search', class: 'search', placeholder: t('Filter…'), 'aria-label': t('Search'), oninput: debounce((e) => { q = e.target.value.trim().toLowerCase(); paint(); }, 120) })), list, foot);
    paint();
    return root;
  },
};
