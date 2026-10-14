import { icon, h, t, api, nf, when, tag, empty, toast, fail, dialog, confirmBox, copy, clear, debounce, dur } from './core.js';

const status = (c) => {
  if (c.revoked) return ['revoked', 'bad'];
  if (c.expires && Date.parse(c.expires) < Date.now()) return ['expired', 'warn'];
  if (c.max && (c.uses || 0) >= c.max) return ['full', 'warn'];
  if (!(c.uses > 0)) return ['unused', ''];
  return ['active', 'ok'];
};
const STATUS_LABEL = { revoked: 'Revoked', expired: 'Expired', full: 'All devices used', unused: 'Not used yet', active: 'In use' };
const message = (code) => t('Your Teach.ai access code: {c}\nOpen {u} and enter it once on your phone or computer.', { c: code, u: location.origin + '/access' });

export default {
  id: 'codes', label: 'Access codes',
  async render() {
    let data = await api('GET', '/coupons');
    let filter = 'all', q = '';
    const selected = new Set();
    const root = h('div');
    const list = h('div');
    const bulk = h('div', { class: 'row', hidden: true });

    const reload = async () => { data = await api('GET', '/coupons'); paint(); };

    const visible = () => data.items.filter((c) => {
      const [s] = status(c);
      if (filter !== 'all' && s !== filter) return false;
      return !q || (c.code + ' ' + (c.note || '')).toLowerCase().includes(q);
    }).sort((a, b) => Date.parse(b.created || 0) - Date.parse(a.created || 0));

    function paint() {
      const rows = visible();
      clear(list);
      for (const k of [...selected]) if (!data.items.some((c) => c.key === k)) selected.delete(k);
      bulk.hidden = !selected.size;
      clear(bulk).append(
        h('span', { class: 'small muted' }, t('{n} selected', { n: selected.size })),
        h('button', { class: 'btn sm', type: 'button', onclick: () => copy([...selected].map((k) => data.items.find((c) => c.key === k).code).join('\n'), t('Codes copied')) }, t('Copy codes')),
        h('button', { class: 'btn sm danger', type: 'button', onclick: async () => {
          if (!(await confirmBox({ title: t('Revoke {n} codes?', { n: selected.size }), text: t('They stop working immediately, even for people already inside. You can restore them later.'), ok: t('Revoke'), danger: true }))) return;
          try { for (const k of selected) await api('POST', `/coupons/${k}/revoke`, {}); toast(t('{n} codes revoked', { n: selected.size })); selected.clear(); await reload(); } catch (e) { fail(e); }
        } }, t('Revoke selected')),
        h('button', { class: 'btn sm quiet', type: 'button', onclick: () => { selected.clear(); paint(); } }, t('Clear')));
      if (!data.items.length) { list.append(empty(t('No access codes yet'), t('Create one for each teacher you want to let in.'), h('button', { class: 'btn primary', type: 'button', onclick: newCode }, t('New access code')))); return; }
      if (!rows.length) { list.append(empty(t('Nothing matches'), t('Try another word or filter.'))); return; }
      const all = h('input', { type: 'checkbox', 'aria-label': t('Select all'), checked: rows.every((c) => selected.has(c.key)), onchange: (e) => { rows.forEach((c) => e.target.checked ? selected.add(c.key) : selected.delete(c.key)); paint(); } });
      list.append(h('div', { class: 'ledger', style: '--cols: 28px minmax(150px,1.1fr) minmax(120px,1.4fr) 130px 80px 70px 100px 60px' },
        h('div', { class: 'li head-row' }, all, h('span', null, t('Code')), h('span', null, t('Given to')), h('span', null, t('Status')), h('span', null, t('Devices')), h('span', null, t('Plan')), h('span', null, t('Last used')), h('span', null, t('Exams'))),
        rows.map((c) => {
          const [s, kind] = status(c);
          const box = h('input', { type: 'checkbox', 'aria-label': t('Select {c}', { c: c.code }), checked: selected.has(c.key), onclick: (e) => e.stopPropagation(), onchange: (e) => { e.target.checked ? selected.add(c.key) : selected.delete(c.key); paint(); } });
          return h('div', { class: 'li click', tabindex: '0', role: 'button', 'aria-label': t('Open {c}', { c: c.code }), onclick: () => open(c), onkeydown: (e) => { if (e.key === 'Enter') open(c); } },
            box,
            h('span', { class: 'cell codebox' }, c.code),
            h('span', { class: 'cell', 'data-label': t('Given to') }, c.note || h('span', { class: 'muted' }, '—')),
            h('span', { class: 'cell' }, tag(t(STATUS_LABEL[s]), kind)),
            h('span', { class: 'cell mono', 'data-label': t('Devices') }, `${c.uses || 0}/${c.max || '∞'}`),
            h('span', { class: 'cell small', 'data-label': t('Plan') }, t(({ normal: 'Normal', vip: 'VIP', trial: 'Trial' })[c.tier || 'normal'])),
            h('span', { class: 'cell small', 'data-label': t('Last used') }, c.lastUsed ? when(c.lastUsed) : '—'),
            h('span', { class: 'cell mono', 'data-label': t('Exams') }, nf(c.usage.exams)));
        })));
    }

    // ---- Create ----
    function newCode() {
      const f = {};
      const field = (key, label, el, hint) => { f[key] = el; return h('label', { class: 'field' }, h('span', null, label), el, hint ? h('small', null, hint) : null); };
      const count = h('input', { type: 'number', min: 1, max: 200, value: 1 });
      const custom = h('input', { type: 'text', placeholder: t('Leave empty for a random code'), autocomplete: 'off', maxlength: 40 });
      const customWrap = field('code', t('Code'), custom, t('Letters and numbers, at least 6.'));
      count.addEventListener('input', () => { customWrap.hidden = Number(count.value) > 1; });
      const tier = h('select', null, h('option', { value: 'normal' }, t('Normal')), h('option', { value: 'vip' }, 'VIP'), h('option', { value: 'trial' }, t('Trial')));
      const body = [
        field('note', t('Who is it for?'), h('input', { type: 'text', maxlength: 200, placeholder: t('e.g. Mrs Ben Ali, Lycée Pilote'), autofocus: true }), t('Only you see this. For several codes, a number is added.')),
        h('div', { class: 'grid2' }, field('count', t('How many codes'), count), customWrap),
        h('div', { class: 'grid3' },
          field('max', t('Devices per code'), h('input', { type: 'number', min: 0, max: 1000, value: 1 }), t('0 = unlimited')),
          field('days', t('Valid for (days)'), h('input', { type: 'number', min: 0, max: 3650, value: 0 }), t('0 = no end date')),
          field('tier', t('Plan'), tier, t('Sets the exam limits (Settings)'))),
        h('div', { class: 'grid2' },
          field('perDay', t('Exams per day (optional)'), h('input', { type: 'number', min: 0, placeholder: t('use the plan') })),
          field('perMonth', t('Exams per month (optional)'), h('input', { type: 'number', min: 0, placeholder: t('use the plan') }))),
      ];
      const err = h('p', { class: 'small', style: 'color:var(--bad)', role: 'alert' });
      const create = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
        err.textContent = ''; create.disabled = true;
        const val = (k) => f[k].value;
        try {
          const r = await api('POST', '/coupons', { note: val('note'), count: Number(val('count')) || 1, code: val('code'), max: val('max') === '' ? 1 : Number(val('max')), days: Number(val('days')) || 0, tier: val('tier'), perDay: val('perDay'), perMonth: val('perMonth') });
          d.close(); await reload(); shown(r.codes, val('note'));
        } catch (e) { create.disabled = false; err.textContent = e.message; if (e.data && e.data.codes && e.data.codes.length) { await reload(); } }
      } }, t('Create'));
      const d = dialog({ title: t('New access code'), body: [body, err], footer: [h('button', { class: 'btn', type: 'button', onclick: () => d.close() }, t('Cancel')), create] });
    }

    function shown(codes, note) {
      const text = codes.join('\n');
      const d = dialog({
        title: codes.length === 1 ? t('Code created') : t('{n} codes created', { n: codes.length }),
        body: [h('p', { class: 'muted' }, t('Copy it now and send it to the teacher. You can always find it again in this list.')),
          h('pre', { class: 'panel codebox', style: 'margin:0;white-space:pre-wrap;user-select:all' }, text),
          codes.length === 1 ? h('pre', { class: 'panel small', style: 'margin:0;white-space:pre-wrap;color:var(--ink-2)' }, message(codes[0])) : null],
        footer: [h('button', { class: 'btn', type: 'button', onclick: () => copy(text, t('Code copied')) }, codes.length === 1 ? t('Copy code') : t('Copy all')),
          codes.length === 1 ? h('button', { class: 'btn', type: 'button', onclick: () => copy(message(codes[0]), t('Message copied')) }, t('Copy message')) : null,
          h('button', { class: 'btn primary', type: 'button', onclick: () => d.close() }, t('Done'))],
      });
      void note;
    }

    // ---- One code ----
    function open(c) {
      const exp = c.expires ? c.expires.slice(0, 10) : '';
      const inp = (v, props) => h('input', { value: v == null ? '' : v, ...props });
      const note = inp(c.note, { type: 'text', maxlength: 200 });
      const max = inp(c.max, { type: 'number', min: 0, max: 1000 });
      const expires = inp(exp, { type: 'date' });
      const tier = h('select', null, ['normal', 'vip', 'trial'].map((x) => h('option', { value: x, selected: (c.tier || 'normal') === x }, t(({ normal: 'Normal', vip: 'VIP', trial: 'Trial' })[x]))));
      const perDay = inp(c.perDay, { type: 'number', min: 0, placeholder: t('use the plan') });
      const perMonth = inp(c.perMonth, { type: 'number', min: 0, placeholder: t('use the plan') });
      const [s, kind] = status(c);
      const devices = h('div');
      const paintDevices = () => {
        clear(devices);
        const dv = (c.devices || []).slice().reverse();
        if (!dv.length) { devices.append(h('p', { class: 'muted small' }, c.uses ? t('Older sign-ins have no device details.') : t('No device has used this code yet.'))); return; }
        dv.forEach((x) => devices.append(h('div', { class: 'ledger', style: '--cols: 1fr auto; border-top:0' }, h('div', { class: 'li' },
          h('span', { class: 'cell small' }, h('b', null, (x.ua || t('Unknown device')).replace(/\(.*?\)/, '').trim().slice(0, 48) || t('Unknown device')), h('br'), h('span', { class: 'muted' }, [x.ip || '—', ' · ', t('first seen'), ' ', when(x.first), ' · ', t('active'), ' ', when(x.last)])),
          h('span', { class: 'actions' }, h('button', { class: 'btn sm danger', type: 'button', onclick: async () => {
            if (!(await confirmBox({ title: t('Remove this device?'), text: t('It loses access right away. The teacher can use the code again on a new device.'), ok: t('Remove'), danger: true }))) return;
            try { await api('POST', `/coupons/${c.key}/kick`, { sid: x.sid }); toast(t('Device removed')); d.close(); await reload(); open(data.items.find((y) => y.key === c.key)); } catch (e) { fail(e); }
          } }, t('Remove')))))));
      };
      paintDevices();

      const saveBtn = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
        saveBtn.disabled = true;
        try {
          await api('PATCH', `/coupons/${c.key}`, { note: note.value, max: Number(max.value) || 0, expires: expires.value || null, tier: tier.value, perDay: perDay.value, perMonth: perMonth.value });
          toast(t('Saved')); d.close(); await reload();
        } catch (e) { saveBtn.disabled = false; fail(e); }
      } }, t('Save changes'));

      const act = async (path, okMsg, undoPath) => {
        try { await api('POST', `/coupons/${c.key}/${path}`, {}); d.close(); await reload(); toast(okMsg, undoPath ? { undo: async () => { try { await api('POST', `/coupons/${c.key}/${undoPath}`, {}); await reload(); toast(t('Undone')); } catch (e) { fail(e); } } } : {}); } catch (e) { fail(e); }
      };
      const d = dialog({
        wide: true, title: c.code,
        body: [
          h('div', { class: 'row' }, tag(t(STATUS_LABEL[s]), kind), h('span', { class: 'muted small' }, [t('created'), ' ', when(c.created), c.lastUsed ? [' · ', t('last used'), ' ', when(c.lastUsed)] : '']),
            h('span', { class: 'muted small' }, t('{n} exams · {m} AI calls', { n: nf(c.usage.exams), m: nf(c.usage.ai) }))),
          h('label', { class: 'field' }, h('span', null, t('Who is it for?')), note),
          h('div', { class: 'grid3' },
            h('label', { class: 'field' }, h('span', null, t('Devices allowed')), max, h('small', null, t('0 = unlimited'))),
            h('label', { class: 'field' }, h('span', null, t('Ends on')), expires, h('small', null, t('Empty = never'))),
            h('label', { class: 'field' }, h('span', null, t('Plan')), tier)),
          h('div', { class: 'grid2' }, h('label', { class: 'field' }, h('span', null, t('Exams per day (override)')), perDay), h('label', { class: 'field' }, h('span', null, t('Exams per month (override)')), perMonth)),
          h('div', null, h('h3', { style: 'margin-bottom:6px' }, t('Devices ({a} of {b})', { a: c.uses || 0, b: c.max || '∞' })), devices),
        ],
        footer: [
          h('button', { class: 'btn quiet danger', type: 'button', onclick: async () => {
            if (!(await confirmBox({ title: t('Delete {c} for good?', { c: c.code }), text: t('This cannot be undone. Use Revoke instead if you may want it back.'), ok: t('Delete'), danger: true }))) return;
            try { await api('DELETE', `/coupons/${c.key}`); d.close(); toast(t('Code deleted')); await reload(); } catch (e) { fail(e); }
          } }, icon('trash'), t('Delete')),
          h('span', { class: 'grow' }),
          h('button', { class: 'btn', type: 'button', onclick: () => copy(message(c.code), t('Message copied')) }, t('Copy message')),
          h('button', { class: 'btn', type: 'button', onclick: () => copy(c.code, t('Code copied')) }, icon('copy'), t('Copy code')),
          (c.uses || (c.devices || []).length) ? h('button', { class: 'btn', type: 'button', onclick: async () => { if (await confirmBox({ title: t('Reset devices?'), text: t('All devices are removed and the code can be used again from scratch.'), ok: t('Reset') })) act('reset', t('Devices reset')); } }, t('Reset devices')) : null,
          c.revoked ? h('button', { class: 'btn', type: 'button', onclick: () => act('restore', t('Code restored')) }, t('Restore')) : h('button', { class: 'btn danger', type: 'button', onclick: () => act('revoke', t('Code revoked'), 'restore') }, t('Revoke')),
          saveBtn],
      });
    }

    const search = h('input', { type: 'search', class: 'search', placeholder: t('Search code or name…'), 'aria-label': t('Search'), oninput: debounce((e) => { q = e.target.value.trim().toLowerCase(); paint(); }, 120) });
    const sel = h('select', { 'aria-label': t('Filter by status'), onchange: (e) => { filter = e.target.value; paint(); }, style: 'width:auto' },
      [['all', 'All'], ['active', 'In use'], ['unused', 'Not used yet'], ['full', 'All devices used'], ['revoked', 'Revoked'], ['expired', 'Expired']].map(([v, l]) => h('option', { value: v }, t(l))));
    root.append(
      h('div', { class: 'head' }, h('div', null, h('h1', null, t('Access codes')), h('p', null, t('One code per teacher. They enter it once on each device.'))),
        h('div', { class: 'row' }, h('a', { class: 'btn', href: '/api/admin/coupons.csv', download: 'codes.csv' }, icon('download'), t('Export CSV')), h('button', { class: 'btn primary', type: 'button', onclick: newCode }, icon('plus'), t('New access code')))),
      data.remote ? h('div', { class: 'note warn', style: 'margin-bottom:14px' }, t('Codes are checked by an outside service (ACCESS_API_URL). Codes listed here are ignored while it is set.')) : null,
      data.envOnly ? h('div', { class: 'note', style: 'margin-bottom:14px' }, h('span', null, t('{n} codes live only in the TEACHAI_COUPONS variable. They cannot be limited, counted or revoked until you import them.', { n: data.envOnly })),
        h('button', { class: 'btn sm', type: 'button', onclick: async () => { try { const r = await api('POST', '/coupons-import-env', {}); toast(t('{n} codes imported', { n: r.added })); await reload(); window.go(); } catch (e) { fail(e); } } }, t('Import them'))) : null,
      h('div', { class: 'toolbar' }, search, sel, bulk),
      list);
    paint();
    return root;
  },
};
void dur;
