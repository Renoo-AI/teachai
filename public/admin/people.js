// Waiting list and contact messages.
import { h, t, api, nf, when, tag, empty, toast, fail, dialog, confirmBox, copy, clear, debounce } from './core.js';

const MAIL = {
  en: (code, url) => ({ subject: 'Your Teach.ai access code', body: `Hello,\n\nThank you for your interest in Teach.ai. Here is your access code:\n\n${code}\n\nOpen ${url} and enter it once on your phone or computer.\n\nBest regards` }),
  fr: (code, url) => ({ subject: 'Votre code d\'accès Teach.ai', body: `Bonjour,\n\nMerci de votre intérêt pour Teach.ai. Voici votre code d'accès :\n\n${code}\n\nOuvrez ${url} et saisissez-le une fois sur votre téléphone ou ordinateur.\n\nCordialement` }),
  ar: (code, url) => ({ subject: 'رمز الدخول إلى Teach.ai', body: `مرحبًا،\n\nشكرًا لاهتمامك بـ Teach.ai. هذا هو رمز الدخول الخاص بك:\n\n${code}\n\nافتح ${url} وأدخله مرة واحدة على هاتفك أو حاسوبك.\n\nمع التحية` }),
};
const mailto = (email, m) => `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}`;
const ROLE = { teacher: 'Teacher', school: 'School', other: 'Other' };

export const waitlist = {
  id: 'waitlist', label: 'Waiting list',
  async render({ refreshBadges }) {
    let items = (await api('GET', '/waitlist')).items;
    let q = '', onlyNew = false;
    const root = h('div'); const list = h('div');
    const reload = async () => { items = (await api('GET', '/waitlist')).items; paint(); refreshBadges(); };
    const visible = () => items.filter((x) => (!onlyNew || !x.invited) && (!q || x.email.includes(q)));

    function invite(x) {
      const tier = h('select', null, h('option', { value: 'normal' }, t('Normal')), h('option', { value: 'trial' }, t('Trial')), h('option', { value: 'vip' }, 'VIP'));
      const days = h('input', { type: 'number', min: 0, max: 3650, value: 0 });
      const go = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
        go.disabled = true;
        try {
          const r = await api('POST', '/waitlist/invite', { email: x.email, tier: tier.value, days: Number(days.value) || 0 });
          d.close(); await reload();
          const m = (MAIL[x.lang] || MAIL.en)(r.code, location.origin + '/access');
          const d2 = dialog({ title: t('Code created for {e}', { e: x.email }), body: [h('pre', { class: 'panel codebox', style: 'margin:0;user-select:all' }, r.code), h('p', { class: 'muted small' }, t('The message is written in {l}, the language they signed up with.', { l: ({ en: 'English', fr: 'Français', ar: 'العربية' })[x.lang] || 'English' })), h('pre', { class: 'panel small', style: 'margin:0;white-space:pre-wrap', dir: x.lang === 'ar' ? 'rtl' : 'ltr' }, m.body)],
            footer: [h('button', { class: 'btn', type: 'button', onclick: () => copy(m.body, t('Message copied')) }, t('Copy message')), h('a', { class: 'btn primary', href: mailto(x.email, m) }, t('Open in my email app')), h('button', { class: 'btn', type: 'button', onclick: () => d2.close() }, t('Done'))] });
        } catch (e) { go.disabled = false; fail(e); }
      } }, t('Create code'));
      const d = dialog({ title: t('Invite {e}', { e: x.email }), body: [h('p', { class: 'muted' }, t('This creates a one-device access code and marks the person as invited.')), h('div', { class: 'grid2' }, h('label', { class: 'field' }, h('span', null, t('Plan')), tier), h('label', { class: 'field' }, h('span', null, t('Valid for (days)')), days, h('small', null, t('0 = no end date'))))],
        footer: [h('button', { class: 'btn', type: 'button', onclick: () => d.close() }, t('Cancel')), go] });
    }

    function paint() {
      clear(list);
      const rows = visible();
      if (!items.length) return void list.append(empty(t('Nobody on the waiting list yet'), t('People who sign up on the landing page appear here.')));
      if (!rows.length) return void list.append(empty(t('Nothing matches')));
      list.append(h('div', { class: 'ledger', style: '--cols: minmax(180px,2fr) 90px 60px 110px minmax(150px,auto)' },
        h('div', { class: 'li head-row' }, h('span', null, 'Email'), h('span', null, t('Role')), h('span', null, t('Language')), h('span', null, t('Signed up')), h('span')),
        rows.map((x) => h('div', { class: 'li' },
          h('span', { class: 'cell' }, h('a', { href: 'mailto:' + x.email }, x.email), ' ', x.invited ? tag(t('invited'), 'ok') : null),
          h('span', { class: 'cell small', 'data-label': t('Role') }, t(ROLE[x.role] || 'Other')),
          h('span', { class: 'cell small mono', 'data-label': t('Language') }, (x.lang || '').toUpperCase()),
          h('span', { class: 'cell small', 'data-label': t('Signed up') }, when(x.at)),
          h('span', { class: 'cell actions' },
            h('button', { class: 'btn sm' + (x.invited ? '' : ' primary'), type: 'button', onclick: () => invite(x) }, x.invited ? t('Invite again') : t('Invite')),
            h('button', { class: 'btn sm quiet danger', type: 'button', onclick: async () => {
              if (!(await confirmBox({ title: t('Remove {e}?', { e: x.email }), text: t('They are deleted from the list. This cannot be undone.'), ok: t('Remove'), danger: true }))) return;
              try { await api('DELETE', '/waitlist', { email: x.email }); toast(t('Removed')); await reload(); } catch (e) { fail(e); }
            } }, t('Remove')))))));
    }
    root.append(
      h('div', { class: 'head' }, h('div', null, h('h1', null, t('Waiting list')), h('p', null, t('{n} people asked for access.', { n: nf(items.length) }))),
        h('div', { class: 'row' },
          h('button', { class: 'btn', type: 'button', onclick: () => { const e = items.filter((x) => !x.invited).map((x) => x.email); e.length ? copy(e.join(', '), t('{n} emails copied', { n: e.length })) : toast(t('Everyone is invited already')); } }, t('Copy emails not invited yet')),
          h('a', { class: 'btn', href: '/api/admin/waitlist.csv', download: 'waitlist.csv' }, t('Export CSV')))),
      h('div', { class: 'toolbar' },
        h('input', { type: 'search', class: 'search', placeholder: t('Search email…'), 'aria-label': t('Search'), oninput: debounce((e) => { q = e.target.value.trim().toLowerCase(); paint(); }, 120) }),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', onchange: (e) => { onlyNew = e.target.checked; paint(); } }), t('Not invited yet'))),
      list);
    paint();
    return root;
  },
};

export const messages = {
  id: 'messages', label: 'Messages',
  async render({ refreshBadges }) {
    let items = (await api('GET', '/messages')).items;
    let show = 'open', q = '';
    const root = h('div'); const list = h('div');
    const reload = async () => { items = (await api('GET', '/messages')).items; paint(); refreshBadges(); };
    const visible = () => items.filter((m) => (show === 'all' || (show === 'open') === !m.done) && (!q || (m.email + ' ' + m.name + ' ' + m.message).toLowerCase().includes(q)));

    function paint() {
      clear(list);
      const rows = visible();
      if (!rows.length) return void list.append(empty(show === 'open' ? t('No messages waiting for an answer') : t('No messages'), show === 'open' && items.length ? t('Everything has been answered.') : t('Messages from the contact page appear here.')));
      list.append(h('div', { class: 'ledger', style: '--cols: 1fr' }, rows.map((m) => h('article', { class: 'li', style: 'align-items:start' },
        h('div', { class: 'stack', style: 'gap:6px' },
          h('div', { class: 'row' }, h('b', null, m.name || t('No name')), h('a', { href: 'mailto:' + m.email }, m.email), tag((m.lang || 'en').toUpperCase()), m.done ? tag(t('answered'), 'ok') : tag(t('waiting'), 'warn'), h('span', { class: 'muted small' }, when(m.at))),
          h('p', { style: 'white-space:pre-wrap;overflow-wrap:anywhere' }, m.message),
          h('div', { class: 'row' },
            h('a', { class: 'btn sm primary', href: `mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent('Re: your message to Teach.ai')}`, onclick: async () => { if (!m.done) { try { await api('POST', '/messages/done', { id: m.id, done: true }); await reload(); } catch { /* optional */ } } } }, t('Reply by email')),
            h('button', { class: 'btn sm', type: 'button', onclick: async () => { try { await api('POST', '/messages/done', { id: m.id, done: !m.done }); await reload(); } catch (e) { fail(e); } } }, m.done ? t('Mark as waiting') : t('Mark as answered')),
            h('button', { class: 'btn sm quiet danger', type: 'button', onclick: async () => {
              if (!(await confirmBox({ title: t('Delete this message?'), text: t('This cannot be undone.'), ok: t('Delete'), danger: true }))) return;
              try { await api('DELETE', '/messages', { id: m.id }); toast(t('Message deleted')); await reload(); } catch (e) { fail(e); }
            } }, t('Delete'))))))));
    }
    root.append(
      h('div', { class: 'head' }, h('div', null, h('h1', null, t('Messages')), h('p', null, t('From the contact page. Replying opens your own email app.'))),
        h('a', { class: 'btn', href: '/api/admin/messages.csv', download: 'messages.csv' }, t('Export CSV'))),
      h('div', { class: 'toolbar' },
        h('input', { type: 'search', class: 'search', placeholder: t('Search messages…'), 'aria-label': t('Search'), oninput: debounce((e) => { q = e.target.value.trim().toLowerCase(); paint(); }, 120) }),
        h('select', { 'aria-label': t('Show'), style: 'width:auto', onchange: (e) => { show = e.target.value; paint(); } }, [['open', 'Waiting for an answer'], ['done', 'Answered'], ['all', 'All']].map(([v, l]) => h('option', { value: v }, t(l))))),
      list);
    paint();
    return root;
  },
};
