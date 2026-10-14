import { h, t, api, nf, when, tag, empty, toast, fail, clear, mount, setDirty } from './core.js';

export default {
  id: 'ai', label: 'AI',
  async render() {
    const [st, set] = await Promise.all([api('GET', '/ai'), api('GET', '/settings')]);
    const root = h('div');
    const cfg = set.settings.ai;

    const provider = h('select', null, [['auto', t('Automatic (DeepSeek first, then NVIDIA)')], ['deepseek', 'DeepSeek'], ['nvidia', 'NVIDIA']].map(([v, l]) => h('option', { value: v, selected: cfg.provider === v }, l)));
    const model = h('input', { type: 'text', value: cfg.model, placeholder: st.envModel, maxlength: 200 });
    const extra = h('textarea', { maxlength: 2000, placeholder: t('e.g. Always write questions in simple language for pupils aged 12–14.') }, cfg.extra || cfg.promptExtra || '');
    extra.value = cfg.promptExtra || '';
    const saved = h('button', { class: 'btn primary', type: 'button', disabled: true, onclick: async () => {
      saved.disabled = true;
      try { await api('PUT', '/settings', { ai: { provider: provider.value, model: model.value, promptExtra: extra.value } }); setDirty(false); toast(t('AI settings saved')); } catch (e) { saved.disabled = false; fail(e); }
    } }, t('Save'));
    for (const el of [provider, model, extra]) el.addEventListener('input', () => { saved.disabled = false; setDirty(true); });

    const results = h('div');
    const testBtn = h('button', { class: 'btn', type: 'button', onclick: async () => {
      testBtn.disabled = true; testBtn.textContent = t('Testing…'); clear(results);
      try {
        const r = await api('POST', '/ai/test', {});
        results.append(h('div', { class: 'ledger', style: '--cols: 1fr auto; margin-top:10px' }, r.results.map((x) => h('div', { class: 'li' },
          h('span', { class: 'cell' }, h('b', null, x.label || '—'), x.error ? h('div', { class: 'small', style: 'color:var(--bad)' }, x.error) : null),
          h('span', { class: 'cell' }, x.ok ? tag(t('works · {ms} ms', { ms: x.ms }), 'ok') : tag(t('failed'), 'bad'))))));
      } catch (e) { fail(e); }
      testBtn.disabled = false; testBtn.textContent = t('Test the providers now');
    } }, t('Test the providers now'));

    const prompt = h('textarea', { placeholder: t('Type a short prompt to see what the AI answers…'), maxlength: 4000 });
    const reply = h('div');
    const ask = h('button', { class: 'btn', type: 'button', onclick: async () => {
      if (!prompt.value.trim()) return prompt.focus();
      ask.disabled = true; ask.textContent = t('Waiting for the AI…'); clear(reply);
      try {
        const r = await api('POST', '/ai/console', { prompt: prompt.value });
        reply.append(r.error ? h('div', { class: 'note bad' }, r.error) : h('div', { class: 'stack' }, h('pre', { class: 'panel', style: 'white-space:pre-wrap;margin:0' }, r.reply), h('p', { class: 'small muted' }, t('answered in {s} s', { s: (r.ms / 1000).toFixed(1) }))));
      } catch (e) { fail(e); }
      ask.disabled = false; ask.textContent = t('Send to the AI');
    } }, t('Send to the AI'));

    const logBox = h('div');
    let failedOnly = false;
    const loadLog = () => mount(logBox, async () => {
      const r = await api('GET', '/ai/log');
      const rows = r.items.filter((x) => !failedOnly || !x.ok);
      return rows.length ? h('div', { class: 'ledger', style: '--cols: 110px minmax(120px,1fr) 100px 90px 120px' },
        h('div', { class: 'li head-row' }, h('span', null, t('When')), h('span', null, t('Provider')), h('span', null, t('Result')), h('span', null, t('Time')), h('span', null, t('Code'))),
        rows.slice(0, 100).map((x) => h('div', { class: 'li' },
          h('span', { class: 'cell small' }, when(x.ts)),
          h('span', { class: 'cell small' }, x.provider, x.error ? h('div', { style: 'color:var(--bad)' }, x.error) : null),
          h('span', { class: 'cell' }, x.ok ? tag(t('ok'), 'ok') : tag(t('failed'), 'bad')),
          h('span', { class: 'cell mono small', 'data-label': t('Time') }, (x.ms / 1000).toFixed(1) + ' s'),
          h('span', { class: 'cell mono small', 'data-label': t('Code') }, x.code ? x.code.slice(0, 4) + '…' : '—')))) : empty(failedOnly ? t('No failed calls') : t('No AI calls recorded yet'));
    });

    root.append(
      h('div', { class: 'head' }, h('div', null, h('h1', null, t('AI')), h('p', null, t('Which model writes the questions, and whether it is working.')))),
      h('section', null, h('header', null, h('h2', null, t('Providers'))),
        h('dl', { style: 'margin:0;border-top:1px solid var(--line-2)' },
          h('div', { class: 'kv' }, h('dt', null, 'DeepSeek'), h('dd', null, st.deepseek ? tag(t('key set on the server'), 'ok') : tag(t('no key'), 'warn'))),
          h('div', { class: 'kv' }, h('dt', null, 'NVIDIA'), h('dd', null, st.nvidia ? tag(t('key set on the server'), 'ok') : tag(t('no key'), 'warn'), ' ', h('span', { class: 'muted small mono' }, st.envModel))),
          h('div', { class: 'kv' }, h('dt', null, t('In use')), h('dd', null, st.active || tag(t('demo mode (no keys)'), 'bad')))),
        h('div', { class: 'row', style: 'margin-top:12px' }, testBtn), results),
      h('section', { class: 'section' }, h('header', null, h('h2', null, t('Change the model without redeploying'))),
        h('div', { class: 'stack panel' },
          h('div', { class: 'grid2' },
            h('label', { class: 'field' }, h('span', null, t('Provider')), provider),
            h('label', { class: 'field' }, h('span', null, t('NVIDIA model')), model, h('small', null, t('Empty = {m}', { m: st.envModel })))),
          h('label', { class: 'field' }, h('span', null, t('Extra instructions for every request')), extra,
            h('small', null, t('Added after the built-in rules. They cannot remove the safety and scope rules, only add to them.'))),
          h('div', { class: 'row end' }, saved))),
      h('section', { class: 'section' }, h('header', null, h('h2', null, t('Try it'))),
        h('div', { class: 'stack' }, prompt, h('div', { class: 'row' }, ask), reply)),
      h('section', { class: 'section' }, h('header', null, h('h2', null, t('Recent calls')),
        h('label', { class: 'check small' }, h('input', { type: 'checkbox', onchange: (e) => { failedOnly = e.target.checked; loadLog(); } }), t('Failed only'))), logBox));
    loadLog();
    void nf;
    return root;
  },
};
