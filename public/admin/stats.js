import { h, t, api, nf, when, barChart, hbars, empty, clear, mount } from './core.js';

const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '—');

export default {
  id: 'stats', label: 'Statistics',
  async render() {
    let days = 30;
    const root = h('div');
    const body = h('div');

    const build = async () => {
      const d = await api('GET', '/stats?days=' + days);
      const T = d.totals;
      const exports_ = T.pdf + T.docx + T.html;
      const aiTotal = T.aiOk + T.aiFail;
      const tot = (list) => list.reduce((n, x) => n + x[1], 0);
      const funnel = [[t('Visited the site'), T.visits], [t('Entered a code'), T.redeems], [t('Created an exam'), T.exams], [t('Downloaded a file'), exports_]];
      return h('div', null,
        h('section', null, h('header', null, h('h2', null, t('Exams per day'))),
          T.exams ? barChart(d.series.map((x) => ({ day: x.day, v: x.exams || 0 })), { label: t('Exams per day') }) : empty(t('No exams in this period'))),
        h('section', { class: 'section' }, h('header', null, h('h2', null, t('From visit to download'))),
          h('div', null, funnel.map(([label, v], i) => h('div', { class: 'hbar' }, h('span', null, label), h('div', { class: 'track' }, h('i', { style: `width:${Math.round((v / Math.max(1, funnel[0][1], ...funnel.map((x) => x[1]))) * 100)}%` })), h('span', { class: 'mono' }, nf(v) + (i ? ` · ${pct(v, funnel[i - 1][1])}` : ''))))),
          h('p', { class: 'small muted' }, t('Percentages compare each step with the one before it. Visits count the landing page and the app, once per page load.'))),
        h('section', { class: 'section' }, h('header', null, h('h2', null, t('Downloads'))),
          hbars([['PDF', T.pdf], ['DOCX', T.docx], ['HTML', T.html]], { total: exports_ })),
        h('section', { class: 'section' }, h('header', null, h('h2', null, t('AI calls'))),
          aiTotal ? h('dl', { style: 'margin:0;border-top:1px solid var(--line-2)' },
            h('div', { class: 'kv' }, h('dt', null, t('Worked')), h('dd', null, `${nf(T.aiOk)} · ${pct(T.aiOk, aiTotal)}`)),
            h('div', { class: 'kv' }, h('dt', null, t('Failed')), h('dd', null, `${nf(T.aiFail)} · ${pct(T.aiFail, aiTotal)}`))) : h('p', { class: 'muted' }, t('No AI calls in this period.'))),
        h('div', { class: 'grid3 section' },
          h('section', null, h('header', null, h('h2', null, t('Subjects'))), hbars(d.subjects, { total: tot(d.subjects) })),
          h('section', null, h('header', null, h('h2', null, t('Levels'))), hbars(d.levels, { total: tot(d.levels) })),
          h('section', null, h('header', null, h('h2', null, t('Languages'))), hbars(d.langs.map(([k, v]) => [k.toUpperCase(), v]), { total: tot(d.langs) }))),
        h('section', { class: 'section' }, h('header', null, h('h2', null, t('Who uses the site most')), h('span', { class: 'muted small' }, t('all time, per access code'))),
          d.topCodes.length ? h('div', { class: 'ledger', style: '--cols: minmax(150px,1fr) minmax(120px,1.2fr) 80px 80px 110px' },
            h('div', { class: 'li head-row' }, h('span', null, t('Code')), h('span', null, t('Given to')), h('span', null, t('Exams')), h('span', null, t('AI calls')), h('span', null, t('Text sent to AI'))),
            d.topCodes.map((c) => h('div', { class: 'li' }, h('span', { class: 'cell codebox' }, c.key.match(/.{1,4}/g).join('-')), h('span', { class: 'cell' }, c.note || '—'), h('span', { class: 'cell mono' }, nf(c.exams)), h('span', { class: 'cell mono' }, nf(c.ai)), h('span', { class: 'cell mono small' }, t('{n} k characters', { n: nf(Math.round(c.chars / 1000)) })))))
            : empty(t('No usage per code yet'), t('Numbers appear once teachers sign in with their codes.'))),
        h('section', { class: 'section' }, h('header', null, h('h2', null, t('Codes nobody has used')), h('span', { class: 'muted small' }, t('created more than a week ago'))),
          d.dormant.length ? h('div', { class: 'ledger', style: '--cols: minmax(150px,1fr) minmax(120px,1.2fr) 120px' }, d.dormant.map((c) => h('div', { class: 'li' }, h('span', { class: 'cell codebox' }, c.code), h('span', { class: 'cell' }, c.note || '—'), h('span', { class: 'cell small muted' }, when(c.created)))))
            : h('p', { class: 'muted' }, t('Every code has been used at least once.'))));
    };

    const sel = h('select', { 'aria-label': t('Period'), style: 'width:auto', onchange: (e) => { days = Number(e.target.value); mount(body, build); } },
      [7, 30, 90].map((n) => h('option', { value: n, selected: n === days }, t('Last {n} days', { n }))));
    root.append(h('div', { class: 'head' }, h('div', null, h('h1', null, t('Statistics')), h('p', null, t('Numbers are kept for 120 days. They never include names or lesson text.'))), sel), body);
    await mount(body, build);
    void clear;
    return root;
  },
};
