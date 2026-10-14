import { icon, h, t, api, nf, when, dur, bytes, tag, empty, toast, fail, dialog, confirmBox, clear, mount } from './core.js';

const row = (k, v) => h('div', { class: 'kv' }, h('dt', null, k), h('dd', null, v));

export default {
  id: 'system', label: 'System',
  async render() {
    const [hl, errs, ov] = await Promise.all([api('GET', '/health'), api('GET', '/errors'), api('GET', '/overview')]);
    const root = h('div');
    const pdfOut = h('span');
    const pdfBtn = h('button', { class: 'btn sm', type: 'button', onclick: async () => {
      pdfBtn.disabled = true; pdfBtn.textContent = t('Rendering…'); clear(pdfOut);
      try {
        const r = await api('POST', '/health/pdf', {});
        pdfOut.append(r.ok ? tag(t('works · {s} s · {k} KB', { s: (r.ms / 1000).toFixed(1), k: Math.round(r.bytes / 1000) }), 'ok') : tag(t('failed: {e}', { e: r.error }), 'bad'));
      } catch (e) { fail(e); }
      pdfBtn.disabled = false; pdfBtn.textContent = t('Test PDF export');
    } }, t('Test PDF export'));

    const errBox = h('div');
    const paintErrs = (items) => {
      clear(errBox);
      if (!items.length) return void errBox.append(h('p', { class: 'muted' }, t('No errors recorded.')));
      errBox.append(h('div', { class: 'ledger', style: '--cols: 120px 90px 1fr' }, items.map((e) => h('div', { class: 'li' }, h('span', { class: 'cell small' }, when(e.ts)), h('span', { class: 'cell small mono' }, e.source), h('span', { class: 'cell small' }, e.message, e.ctx ? h('span', { class: 'muted' }, ' · ' + e.ctx) : null)))));
    };
    paintErrs(errs.items);

    // ---- Backup ----
    const file = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr', id: 'restore-file', onchange: async (e) => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      let data;
      try { data = JSON.parse(await f.text()); } catch { return toast(t('That file is not valid JSON.'), { kind: 'bad' }); }
      if (!data || data.version !== 1) return toast(t('This is not a Teach.ai backup file.'), { kind: 'bad' });
      const parts = [data.settings && t('settings'), data.coupons && t('{n} codes', { n: Object.keys(data.coupons).length }), data.waitlist && t('{n} waiting-list entries', { n: data.waitlist.length }), data.messages && t('{n} messages', { n: data.messages.length }), data.exams && t('{n} exams', { n: data.exams.length })].filter(Boolean);
      if (!(await confirmBox({ title: t('Restore this backup?'), text: t('It contains: {x}. Codes, exams and entries that already exist are kept as they are; the settings in the file replace the current ones.', { x: parts.join(', ') }), ok: t('Restore') }))) return;
      try { const r = await api('POST', '/restore', data); toast(t('Restored: {x}', { x: Object.entries(r.restored).map(([k, v]) => `${k} ${v === true ? '✓' : v}`).join(', ') }), { ms: 9000 }); } catch (er) { fail(er); }
    } });

    const mem = hl.memory;
    root.append(
      h('div', { class: 'head' }, h('div', null, h('h1', null, t('System')), h('p', null, t('Health, errors and backups.')))),
      h('section', null, h('header', null, h('h2', null, t('Health'))),
        h('dl', { style: 'margin:0;border-top:1px solid var(--line-2)' },
          row(t('Server'), t('up {t} · Node {v} · {p}', { t: dur(hl.uptime), v: hl.node.replace(/^v/, ''), p: hl.env })),
          row(t('Memory'), t('{a} used by the app · {b} free on the machine', { a: bytes(mem.rss), b: bytes(mem.free) })),
          row(t('Database'), hl.db.enabled ? (hl.db.ok ? tag(t('connected · {ms} ms', { ms: hl.db.ms }), 'ok') : tag(hl.db.error || t('not reachable'), 'bad')) : [tag(t('not connected: data is kept in files'), 'warn'), h('div', { class: 'small muted' }, t('On a free host these files are erased at every restart. Set DATABASE_URL.'))]),
          row('DeepSeek', hl.config.deepseek ? tag(t('key set'), 'ok') : tag(t('no key'), 'warn')),
          row('NVIDIA', hl.config.nvidia ? tag(t('key set'), 'ok') : tag(t('no key'), 'warn')),
          row('ACCESS_SECRET', hl.config.accessSecret ? tag(t('set'), 'ok') : tag(t('not set'), 'warn')),
          row('SITE_URL', hl.config.siteUrl || tag(t('not set'), 'warn')),
          row(t('Codes in TEACHAI_COUPONS'), nf(hl.config.envCodes)),
          row(t('Admin address list'), hl.adminIpList ? tag(t('restricted by ADMIN_IPS'), 'ok') : tag(t('open to any address (password only)'), '')),
          row(t('PDF export'), h('span', { class: 'row' }, pdfBtn, pdfOut)))),

      h('section', { class: 'section' }, h('header', null, h('h2', null, t('Errors')),
        errs.items.length ? h('button', { class: 'btn sm', type: 'button', onclick: async () => { if (!(await confirmBox({ title: t('Clear the error list?'), text: t('Only this list is emptied.'), ok: t('Clear') }))) return; try { await api('DELETE', '/errors'); paintErrs([]); toast(t('Cleared')); } catch (e) { fail(e); } } }, t('Clear list')) : null), errBox),

      h('section', { class: 'section' }, h('header', null, h('h2', null, t('Backup'))),
        h('div', { class: 'panel stack' },
          h('p', { class: 'muted' }, t('Download everything that is not code: settings, access codes, waiting list, messages and counters. Add exams if you also want teachers\' work. Keep the file private: it contains emails and codes.')),
          h('div', { class: 'row' },
            h('a', { class: 'btn', href: '/api/admin/backup', download: '' }, icon('download'), t('Download backup')),
            h('a', { class: 'btn', href: '/api/admin/backup?exams=1', download: '' }, t('Download backup with exams')),
            h('label', { class: 'btn', for: 'restore-file', tabindex: '0', onkeydown: (e) => { if (e.key === 'Enter') file.click(); } }, icon('upload'), t('Restore from a file…')), file),
          h('p', { class: 'small muted' }, t('Free databases can be lost or paused. A copy every few weeks is a good habit.')))),

      h('section', { class: 'section' }, h('header', null, h('h2', null, t('Admin sign-ins'))),
        ov.logins.length ? h('div', { class: 'ledger', style: '--cols: 130px 140px 1fr' }, ov.logins.map((l) => h('div', { class: 'li' }, h('span', { class: 'cell small' }, when(l.ts)), h('span', { class: 'cell mono small' }, l.ip), h('span', { class: 'cell small muted' }, l.ua.slice(0, 80), l.newDevice ? [' ', tag(t('new device'), 'warn')] : null)))) : h('p', { class: 'muted' }, '—')));
    void mount; void dialog; void empty;
    return root;
  },
};
