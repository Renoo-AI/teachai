import { h, t, api, nf, when, tag, empty, toast, fail, dialog, confirmBox, clear, debounce } from './core.js';

const PAGE = 50;
const KINDS = { control: 'Control test', synthese: 'Synthesis test', exam: 'Exam' };

export default {
  id: 'exams', label: 'Exams',
  async render() {
    const f = { q: '', subject: '', level: '', lang: '', state: '', by: '' };
    const root = h('div');
    const list = h('div');
    const more = h('div', { class: 'row', style: 'justify-content:center;margin-top:14px' });
    const count = h('span', { class: 'muted small' });
    let items = [], total = 0, facets = { subject: [], level: [], lang: [] };

    async function load(append = false) {
      const p = new URLSearchParams({ ...f, limit: PAGE, offset: append ? items.length : 0 });
      const r = await api('GET', '/exams?' + p);
      items = append ? items.concat(r.items) : r.items; total = r.total; facets = r.facets;
      paint();
    }

    function paint() {
      clear(list); clear(more);
      count.textContent = t('{n} exams', { n: nf(total) });
      if (!items.length) { list.append(empty(t('No exams found'), f.q || f.subject || f.level || f.lang || f.state ? t('Try removing a filter.') : t('Exams appear here as soon as teachers create them.'))); return; }
      list.append(h('div', { class: 'ledger', style: '--cols: minmax(160px,2fr) minmax(110px,1fr) 70px minmax(110px,1fr) 110px' },
        h('div', { class: 'li head-row' }, h('span', null, t('Title')), h('span', null, t('Subject · level')), h('span', null, t('Questions')), h('span', null, t('Created by code')), h('span', null, t('Last edit'))),
        items.map((x) => h('div', { class: 'li click', tabindex: '0', role: 'button', onclick: () => open(x), onkeydown: (e) => { if (e.key === 'Enter') open(x); } },
          h('span', { class: 'cell' }, h('b', null, x.title || t('Untitled')), ' ', x.hidden ? tag(t('hidden'), 'warn') : null, x.demo ? tag(t('demo'), '') : null),
          h('span', { class: 'cell small', 'data-label': t('Subject · level') }, [x.subject || '—', ' · ', x.level || '—', ' · ', (x.lang || '').toUpperCase()]),
          h('span', { class: 'cell mono', 'data-label': t('Questions') }, x.questions),
          h('span', { class: 'cell mono small', 'data-label': t('Code') }, x.by ? h('a', { href: '#/codes', onclick: (e) => e.stopPropagation() }, x.by.match(/.{1,4}/g).join('-')) : h('span', { class: 'muted' }, '—')),
          h('span', { class: 'cell small', 'data-label': t('Last edit') }, when(x.updatedAt))))));
      if (items.length < total) more.append(h('button', { class: 'btn', type: 'button', onclick: async (e) => { e.target.disabled = true; try { await load(true); } catch (er) { fail(er); } } }, t('Show more ({n} left)', { n: total - items.length })));
    }

    async function open(x) {
      let rec;
      try { rec = await api('GET', '/exams/' + x.id); } catch (e) { return fail(e); }
      const lesson = rec.lessonText || '';
      const body = h('div', { class: 'stack' },
        h('div', { class: 'row' }, tag(rec.hidden ? t('Hidden from everyone') : t('Visible'), rec.hidden ? 'warn' : 'ok'), rec.demo ? tag(t('demo questions (no AI)')) : null,
          h('span', { class: 'muted small' }, [t('created'), ' ', when(rec.createdAt), ' · ', t('edited'), ' ', when(rec.updatedAt)])),
        h('dl', { style: 'margin:0' },
          [[t('School'), rec.school], [t('Teacher'), rec.teacher], [t('Class'), rec.className], [t('Subject'), rec.subject], [t('Type'), KINDS[rec.tpl && rec.tpl.kind] ? t(KINDS[rec.tpl.kind]) : (rec.tpl && rec.tpl.kind) || ''], [t('Duration'), rec.duration], [t('Created with code'), rec.by ? rec.by.match(/.{1,4}/g).join('-') : '']]
            .filter(([, v]) => v).map(([k, v]) => h('div', { class: 'kv' }, h('dt', null, k), h('dd', null, v)))),
        h('h3', null, t('Questions ({n})', { n: (rec.questions || []).length })),
        h('ol', { style: 'margin:0;padding-inline-start:22px;display:grid;gap:10px' }, (rec.questions || []).map((q) => h('li', null, h('span', { class: 'muted small' }, `[${q.type}] `), q.prompt, q.answer ? h('div', { class: 'small muted' }, [t('Answer: '), String(q.answer).slice(0, 300)]) : null))),
        lesson ? h('details', null, h('summary', { style: 'cursor:pointer;font-weight:500' }, t('Lesson text the teacher pasted ({n} characters)', { n: nf(lesson.length) })), h('pre', { class: 'panel small', style: 'white-space:pre-wrap;max-height:260px;overflow:auto;margin-top:8px' }, lesson)) : null);
      const d = dialog({
        wide: true, title: rec.title || t('Untitled'), body,
        footer: [
          h('button', { class: 'btn quiet danger', type: 'button', onclick: async () => {
            if (!(await confirmBox({ title: t('Delete this exam?'), text: t('The teacher\'s link stops working for good.'), ok: t('Delete'), danger: true }))) return;
            try { await api('DELETE', '/exams/' + rec.id); d.close(); toast(t('Exam deleted')); await load(); } catch (e) { fail(e); }
          } }, t('Delete')),
          h('span', { class: 'grow' }),
          h('a', { class: 'btn', href: '/e/' + rec.id, target: '_blank', rel: 'noopener' }, t('Open view link')),
          h('button', { class: 'btn' + (rec.hidden ? '' : ' danger'), type: 'button', onclick: async () => {
            try { await api('POST', `/exams/${rec.id}/hide`, { hidden: !rec.hidden }); d.close(); await load(); toast(rec.hidden ? t('Exam is visible again') : t('Exam hidden'), rec.hidden ? {} : { undo: async () => { try { await api('POST', `/exams/${rec.id}/hide`, { hidden: false }); await load(); } catch (e) { fail(e); } } }); } catch (e) { fail(e); }
          } }, rec.hidden ? t('Show again') : t('Hide from everyone')),
          h('button', { class: 'btn primary', type: 'button', onclick: () => d.close() }, t('Close'))],
      });
    }

    function purge() {
      const days = h('input', { type: 'number', min: 1, max: 3650, value: 90, style: 'width:110px' });
      const out = h('p', { class: 'muted' }, t('Choose how old, then check how many would go.'));
      let counted = null;
      const check = h('button', { class: 'btn', type: 'button', onclick: async () => {
        try { const r = await api('POST', '/exams-purge', { days: Number(days.value), dryRun: true }); counted = r.count; out.textContent = r.count ? t('{n} exams were not edited for {d} days or more.', { n: r.count, d: days.value }) : t('No exam is that old.'); go.disabled = !r.count; } catch (e) { fail(e); }
      } }, t('Count them'));
      const go = h('button', { class: 'btn danger solid', type: 'button', disabled: true, onclick: async () => {
        if (!(await confirmBox({ title: t('Delete {n} exams for good?', { n: counted }), text: t('Their links stop working. This cannot be undone.'), ok: t('Delete'), danger: true, type: t('DELETE') }))) return;
        try { const r = await api('POST', '/exams-purge', { days: Number(days.value) }); d.close(); toast(t('{n} exams deleted', { n: r.count })); await load(); } catch (e) { fail(e); }
      } }, t('Delete them'));
      days.addEventListener('input', () => { go.disabled = true; counted = null; });
      const d = dialog({ title: t('Clean up old exams'), body: [h('label', { class: 'field' }, h('span', null, t('Not edited for at least (days)')), h('div', { class: 'row' }, days, check)), out, h('p', { class: 'small muted' }, t('Exams are also removed automatically after the retention period set in Settings.'))],
        footer: [h('button', { class: 'btn', type: 'button', onclick: () => d.close() }, t('Cancel')), go] });
    }

    const opt = (label, list) => [h('option', { value: '' }, label), ...list.map((v) => h('option', { value: v }, v))];
    const mkSel = (key, label) => { const s = h('select', { 'aria-label': label, style: 'width:auto', onchange: (e) => { f[key] = e.target.value; load().catch(fail); } }); s.dataset.k = key; return s; };
    const selSubject = mkSel('subject', t('Subject')), selLevel = mkSel('level', t('Level')), selLang = mkSel('lang', t('Language'));
    const selState = h('select', { 'aria-label': t('State'), style: 'width:auto', onchange: (e) => { f.state = e.target.value; load().catch(fail); } },
      [['', 'Any state'], ['hidden', 'Hidden only'], ['demo', 'Demo only']].map(([v, l]) => h('option', { value: v }, t(l))));
    const fillFacets = () => { for (const [s, k, l] of [[selSubject, 'subject', t('All subjects')], [selLevel, 'level', t('All levels')], [selLang, 'lang', t('All languages')]]) { const cur = f[k]; clear(s).append(...opt(l, facets[k])); s.value = cur; } };

    root.append(
      h('div', { class: 'head' }, h('div', null, h('h1', null, t('Exams')), h('p', null, t('Everything teachers have created. You can read, hide or delete any exam.'))),
        h('button', { class: 'btn', type: 'button', onclick: purge }, t('Clean up old exams'))),
      h('div', { class: 'toolbar' },
        h('input', { type: 'search', class: 'search', placeholder: t('Search title, id or code…'), 'aria-label': t('Search'), oninput: debounce((e) => { f.q = e.target.value.trim(); load().catch(fail); }) }),
        selSubject, selLevel, selLang, selState, count),
      list, more);
    await load();
    fillFacets();
    const oldPaint = paint;
    void oldPaint;
    return root;
  },
};
