import { icon, h, t, api, nf, when, dur, barChart, tag, empty, toast, fail, confirmBox } from './core.js';

const WARNINGS = {
  noai: () => ['warn', t('No AI key is set, so the site runs in demo mode. Add DEEPSEEK_TOKEN or NVIDIA_API_KEY on the server.'), '#/ai'],
  nodb: () => ['warn', t('No database is connected. On a free host, exams and codes disappear at every restart. Set DATABASE_URL.'), '#/system'],
  nosecret: () => ['warn', t('ACCESS_SECRET is not set. Visitors are signed out whenever the server restarts.'), null],
  maintenance: () => ['bad', t('Maintenance mode is ON: visitors see a notice instead of the site.'), '#/settings'],
  open: () => ['warn', t('Access codes are switched off: anyone can create exams.'), '#/settings'],
  envcodes: () => ['info', t('Some codes live in the TEACHAI_COUPONS variable. Import them in Codes to limit, count or revoke them.'), '#/codes'],
};

const stat = (label, value, hint) => h('div', { class: 'kv' }, h('dt', null, label), h('dd', null, value, hint ? h('span', { class: 'muted small' }, '  ' + hint) : null));

export default {
  id: 'overview', label: 'Overview',
  async render({ refreshBadges }) {
    const d = await api('GET', '/overview');
    const sum = (k) => d.series.reduce((n, x) => n + (x[k] || 0), 0);
    const today = d.today || {};
    const root = h('div');
    const maint = h('button', { class: 'btn' + (d.settingsFlags.maintenance ? ' danger' : ''), type: 'button', onclick: async () => {
      const turnOn = !d.settingsFlags.maintenance;
      if (turnOn && !(await confirmBox({ title: t('Turn on maintenance mode?'), text: t('Visitors will see a notice instead of the site until you turn it off. The admin keeps working.'), ok: t('Turn on'), danger: true }))) return;
      try { await api('PUT', '/settings', { maintenance: { on: turnOn, message: '' } }); toast(turnOn ? t('Maintenance mode is on') : t('Site is back online')); window.go(); } catch (e) { fail(e); }
    } }, d.settingsFlags.maintenance ? t('Turn maintenance off') : t('Maintenance mode'));

    root.append(
      h('div', { class: 'head' }, h('div', null, h('h1', null, t('Overview')), h('p', null, t('How the site is doing right now.'))),
        h('div', { class: 'row' }, h('a', { class: 'btn primary', href: '#/codes' }, icon('plus'), t('New access code')), maint)),
      d.warnings.length ? h('div', { class: 'stack', style: 'margin-bottom:22px' }, d.warnings.map((w) => {
        const [kind, text, link] = WARNINGS[w.id] ? WARNINGS[w.id]() : ['info', w.id, null];
        return h('div', { class: 'note ' + (kind === 'info' ? '' : kind) }, h('span', null, text), link ? h('a', { class: 'btn sm', href: link }, t('Open')) : null);
      })) : h('div', { class: 'note ok', style: 'margin-bottom:22px' }, t('Everything looks healthy.')),
      h('section', null,
        h('header', null, h('h2', null, t('Exams created, last 30 days')), h('span', { class: 'muted small' }, t('{n} in total', { n: nf(sum('exams')) }))),
        d.series.some((x) => x.exams) ? barChart(d.series.map((x) => ({ day: x.day, v: x.exams || 0 })), { label: t('Exams per day') }) : empty(t('No exams yet'), t('They will appear here as teachers create them.'))),
      h('section', { class: 'section' }, h('header', null, h('h2', null, t('Right now'))),
        h('dl', { style: 'margin:0;border-top:1px solid var(--line-2)' },
          stat(t('Exams today'), nf(today.exams), t('{n} visits', { n: nf(today.visits) })),
          stat(t('Stored exams'), nf(d.counts.exams)),
          stat(t('Access codes'), t('{a} active of {n}', { a: nf(d.counts.activeCodes), n: nf(d.counts.codes) })),
          stat(t('Waiting list'), h('a', { href: '#/waitlist' }, nf(d.counts.waitlist)), d.counts.waitlistNew ? t('{n} not invited yet', { n: d.counts.waitlistNew }) : ''),
          stat(t('Messages'), h('a', { href: '#/messages' }, nf(d.counts.messages)), d.counts.messagesOpen ? t('{n} waiting for an answer', { n: d.counts.messagesOpen }) : t('all answered')),
          stat(t('AI, last 24 hours'), d.ai.ok24h + d.ai.fail24h ? h('span', null, tag(t('{n} worked', { n: d.ai.ok24h }), 'ok'), ' ', d.ai.fail24h ? tag(t('{n} failed', { n: d.ai.fail24h }), 'bad') : null) : t('no calls'), d.ai.last ? [t('last: '), when(d.ai.last.ts)] : ''),
          stat(t('Database'), d.db.enabled ? (d.db.ok ? tag(t('connected · {ms} ms', { ms: d.db.ms }), 'ok') : tag(t('not reachable'), 'bad')) : tag(t('files on disk'), 'warn')),
          stat(t('Server'), t('up {t} · Node {v}', { t: dur(d.uptime), v: d.node.replace(/^v/, '') })),
          d.clients ? stat(t('Active visitors'), t('{n} devices created exams in the last hour', { n: d.clients }), h('a', { href: '#/settings' }, t('see list'))) : null)),
      h('section', { class: 'section' }, h('header', null, h('h2', null, t('Recent errors')), h('a', { href: '#/system', class: 'small' }, t('All errors'))),
        d.errors.length ? h('div', { class: 'ledger', style: '--cols: 110px 1fr' }, d.errors.map((e) => h('div', { class: 'li' }, h('span', { class: 'cell muted small' }, when(e.ts)), h('span', { class: 'cell' }, e.message, e.ctx ? h('span', { class: 'muted small' }, '  ' + e.ctx) : null))))
          : h('p', { class: 'muted' }, t('No errors recorded.'))),
      d.logins.length ? h('section', { class: 'section' }, h('header', null, h('h2', null, t('Recent admin sign-ins'))),
        h('div', { class: 'ledger', style: '--cols: 130px 140px 1fr' }, d.logins.map((l) => h('div', { class: 'li' }, h('span', { class: 'cell small' }, when(l.ts)), h('span', { class: 'cell mono small' }, l.ip), h('span', { class: 'cell small muted' }, l.ua.slice(0, 70), l.newDevice ? [' ', tag(t('new device'), 'warn')] : null))))) : null
    );
    refreshBadges();
    return root;
  },
};
