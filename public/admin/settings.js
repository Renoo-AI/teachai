import { h, t, api, toast, fail, confirmBox, setDirty, clear, nf } from './core.js';

const FEATURE_LABEL = { pdf: 'PDF download', docx: 'DOCX download', html: 'HTML download', assistant: 'AI co-worker in the editor', upload: 'Lesson file upload', papers: 'Past papers collection' };
const clone = (o) => JSON.parse(JSON.stringify(o));

export default {
  id: 'settings', label: 'Settings',
  async render() {
    const r = await api('GET', '/settings');
    const clients = await api('GET', '/clients');
    let saved = r.settings;
    let s = clone(saved);
    const root = h('div');
    const bar = h('div', { class: 'savebar', hidden: true });
    const get = (path) => path.split('.').reduce((o, k) => o[k], s);
    const put = (path, v) => { const keys = path.split('.'); const last = keys.pop(); keys.reduce((o, k) => o[k], s)[last] = v; check(); };

    const check = () => {
      const dirty = JSON.stringify(s) !== JSON.stringify(saved);
      setDirty(dirty); bar.hidden = !dirty;
      if (!dirty) return;
      clear(bar).append(h('div', null,
        h('span', null, t('You have unsaved changes.')),
        h('span', { class: 'row' },
          h('button', { class: 'btn', type: 'button', onclick: () => { s = clone(saved); setDirty(false); window.go(); } }, t('Discard')),
          h('button', { class: 'btn primary', type: 'button', onclick: save }, t('Save changes')))));
    };

    async function save() {
      if (!saved.maintenance.on && s.maintenance.on && !(await confirmBox({ title: t('Turn on maintenance mode?'), text: t('As soon as you save, visitors see a notice instead of the site. The admin keeps working.'), ok: t('Save and turn on'), danger: true }))) return;
      if (saved.accessRequired !== false && s.accessRequired === false && !(await confirmBox({ title: t('Switch access codes off?'), text: t('Anyone with the link will be able to create exams and use the AI.'), ok: t('Switch off'), danger: true }))) return;
      try {
        const out = await api('PUT', '/settings', s);
        saved = out.settings; s = clone(saved); setDirty(false); bar.hidden = true; toast(t('Settings saved'));
      } catch (e) { fail(e); }
    }

    // ---- Small field builders bound to the settings object ----
    const text = (path, props) => h('input', { type: 'text', value: get(path), oninput: (e) => put(path, e.target.value), ...props });
    const num = (path, props) => h('input', { type: 'number', value: get(path), oninput: (e) => put(path, e.target.value === '' ? 0 : Number(e.target.value)), ...props });
    const check_ = (path, label) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!get(path), onchange: (e) => { put(path, e.target.checked); } }), label);
    const field = (label, el, hint) => h('label', { class: 'field' }, h('span', null, label), el, hint ? h('small', null, hint) : null);
    const select = (path, options) => h('select', { onchange: (e) => put(path, e.target.value) }, options.map(([v, l]) => h('option', { value: v, selected: String(get(path)) === String(v) }, l)));
    const section = (title, desc, ...kids) => h('section', { class: 'section' }, h('header', null, h('div', null, h('h2', null, title), desc ? h('p', { class: 'muted small' }, desc) : null)), h('div', { class: 'panel stack' }, kids));

    const banner = h('div', { class: 'stack' });
    const blocked = h('textarea', { rows: 4, placeholder: '203.0.113.7', 'aria-label': t('Blocked addresses'), oninput: (e) => put('blockedIps', e.target.value.split(/[\s,]+/).filter(Boolean)) });
    blocked.value = s.blockedIps.join('\n');
    const beta = h('textarea', { rows: 3, placeholder: 'ABCD-EFGH-JKLM', 'aria-label': t('Beta codes'), oninput: (e) => put('betaCodes', e.target.value.split(/[\s,]+/).filter(Boolean)) });
    beta.value = s.betaCodes.join('\n');

    const accessSel = h('select', { onchange: (e) => put('accessRequired', e.target.value === 'env' ? null : e.target.value === 'on') },
      [['env', t('Follow the server setting')], ['on', t('Required: only people with a code')], ['off', t('Off: anyone can create exams')]].map(([v, l]) => h('option', { value: v, selected: (s.accessRequired === null ? 'env' : s.accessRequired ? 'on' : 'off') === v }, l)));

    root.append(
      h('div', { class: 'head' }, h('div', null, h('h1', null, t('Settings')), h('p', null, t('Changes apply to the whole site as soon as you save. No redeploy needed.')))),

      section(t('Site status'), t('Announce something, or take the site offline for a moment.'),
        check_('maintenance.on', t('Maintenance mode')),
        field(t('Message visitors see'), text('maintenance.message', { maxlength: 400, placeholder: t('Teach.ai is being updated. Please come back in a few minutes.') })),
        h('hr', { style: 'border:0;border-top:1px solid var(--line);width:100%' }),
        check_('banner.on', t('Show an announcement bar on every page')),
        h('div', { class: 'grid2' }, field(t('Announcement'), text('banner.text', { maxlength: 300, placeholder: t('New: answer keys in PDF!') })), field(t('Style'), select('banner.level', [['info', t('Information')], ['warn', t('Warning')]]))),
        field(t('Access codes'), accessSel, t('Overrides ACCESS_REQUIRED from the server environment.'))),

      section(t('Features'), t('Switch a feature off for everyone, or test it with a few codes first (Beta).'),
        h('div', { class: 'ledger', style: '--cols: 1fr 180px' }, r.features.map((f) => h('div', { class: 'li' }, h('span', { class: 'cell' }, t(FEATURE_LABEL[f] || f)), select('features.' + f, [['on', t('On for everyone')], ['beta', t('Beta codes only')], ['off', t('Off')]])))),
        field(t('Beta codes (one per line)'), beta, t('Used by every feature set to "Beta codes only".'))),

      section(t('Plans and limits'), t('Exams a code may create. 0 means unlimited. A single code can override its plan in Access codes.'),
        h('div', { class: 'ledger', style: '--cols: 1fr 130px 130px' },
          h('div', { class: 'li head-row' }, h('span', null, t('Plan')), h('span', null, t('Per day')), h('span', null, t('Per month'))),
          r.tiers.map((p) => h('div', { class: 'li' }, h('span', { class: 'cell' }, t(({ normal: 'Normal', vip: 'VIP', trial: 'Trial' })[p])), num(`tiers.${p}.perDay`, { min: 0, 'aria-label': p + ' per day' }), num(`tiers.${p}.perMonth`, { min: 0, 'aria-label': p + ' per month' })))),
        h('h3', null, t('Per device, per hour')),
        h('div', { class: 'grid2' },
          field(t('Exams, regenerations and AI requests'), num('limits.examsPerHour', { min: 1, max: 1000 })),
          field(t('Code attempts'), num('limits.redeemPerHour', { min: 1, max: 1000 })),
          field(t('Waiting-list sign-ups'), num('limits.waitlistPerHour', { min: 1, max: 1000 })),
          field(t('Contact messages'), num('limits.contactPerHour', { min: 1, max: 1000 })))),

      section(t('Storage'), t('How long exams are kept.'),
        field(t('Delete exams not edited for (days)'), num('retentionDays', { min: 0, max: 3650, style: 'max-width:160px' }), t('0 keeps every exam forever. Teachers are told in the editor that exams expire.'))),

      section(t('Blocked devices'), t('A blocked address gets "Access denied" on the whole site, never on the admin.'),
        field(t('Blocked addresses (one per line)'), blocked),
        h('div', null, h('h3', { style: 'margin-bottom:6px' }, t('Busiest devices in the last hour')),
          clients.hot.length ? h('div', { class: 'ledger', style: '--cols: 1fr 90px auto' }, clients.hot.map((c) => h('div', { class: 'li' }, h('span', { class: 'cell mono' }, c.ip), h('span', { class: 'cell small' }, t('{n} requests', { n: nf(c.hits) })),
            h('button', { class: 'btn sm danger', type: 'button', disabled: s.blockedIps.includes(c.ip), onclick: (e) => { if (!s.blockedIps.includes(c.ip)) { put('blockedIps', [...s.blockedIps, c.ip]); blocked.value = s.blockedIps.join('\n'); e.target.disabled = true; } } }, t('Block'))))) : h('p', { class: 'muted small' }, t('Nobody is making many requests right now.')))),
      bar);
    void banner;
    return root;
  },
};
