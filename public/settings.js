// AI settings panel. Choices live in this browser only (localStorage) and travel with each request.
// They are never saved inside an exam. Anything left empty falls back to the server's .env.
(function () {
  var KEY = 'teachai.ai';
  var T = function (k, v) { return I18N.t(k, v); };
  var MODELS = [
    ['nvidia/nemotron-3-super-120b-a12b', 'Nemotron 3 Super 120B'],
    ['nvidia/nemotron-3.5-lightning-30b-a3b', 'Nemotron 3.5 Lightning 30B (fast)'],
    ['openai/gpt-oss-20b', 'GPT-OSS 20B (fast)'],
    ['deepseek-ai/deepseek-v4.1-flash', 'DeepSeek V4.1 Flash'],
    ['moonshotai/kimi-k3', 'Kimi K3'],
  ];

  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { return {}; } }
  function store(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (_) { /* storage can be blocked */ } }
  function payload() {
    var s = load();
    return { provider: s.provider || 'auto', deepseekToken: s.deepseekToken || '', nvidiaKey: s.nvidiaKey || '', nvidiaModel: s.nvidiaModel || '' };
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function field(labelKey, input, helpKey) {
    var wrap = el('div', 'sf');
    var lab = el('label', 'lbl', T(labelKey));
    wrap.appendChild(lab);
    wrap.appendChild(input);
    if (helpKey) wrap.appendChild(el('p', 'hint', T(helpKey)));
    return wrap;
  }

  var dlg = null;

  function open() {
    if (dlg) dlg.remove();
    dlg = el('dialog', 'dlg');
    dlg.dir = I18N.dir;
    var s = load();
    var state = { provider: s.provider || 'auto' };

    var head = el('div', 'dlg-head');
    head.appendChild(el('h2', '', T('set.title')));
    var x = el('button', 'dlg-x');
    x.innerHTML = window.ICON ? ICON('x') : '×';
    x.type = 'button';
    x.setAttribute('aria-label', T('set.close'));
    x.addEventListener('click', function () { dlg.close(); if (dlg) { dlg.remove(); dlg = null; } });
    head.appendChild(x);
    dlg.appendChild(head);

    // provider switch
    var seg = el('div', 'seg');
    var infoBox = el('p', 'hint set-info');
    function drawSeg() {
      seg.textContent = '';
      [['auto', 'set.auto'], ['deepseek', 'set.ds'], ['nvidia', 'set.nv']].forEach(function (p) {
        var b = el('button', 'seg-b' + (state.provider === p[0] ? ' on' : ''), T(p[1]));
        b.type = 'button';
        b.addEventListener('click', function () { state.provider = p[0]; drawSeg(); drawVisibility(); });
        seg.appendChild(b);
      });
      infoBox.textContent = T('set.info.' + state.provider);
    }
    dlg.appendChild(field('set.provider', seg));
    dlg.appendChild(infoBox);

    // DeepSeek
    var tok = el('input', 'field');
    tok.type = 'password';
    tok.autocomplete = 'off';
    tok.spellcheck = false;
    tok.dir = 'ltr';
    tok.value = s.deepseekToken || '';
    tok.placeholder = T('set.optional');
    var dsBox = field('set.dstoken', tok, 'set.dshelp');
    dlg.appendChild(dsBox);

    // NVIDIA
    var key = el('input', 'field');
    key.type = 'password';
    key.autocomplete = 'off';
    key.spellcheck = false;
    key.dir = 'ltr';
    key.value = s.nvidiaKey || '';
    key.placeholder = 'nvapi-…  (' + T('set.optional') + ')';
    var model = el('select', 'field');
    var known = MODELS.some(function (m) { return m[0] === s.nvidiaModel; });
    var def = el('option', '', T('set.model.default'));
    def.value = '';
    model.appendChild(def);
    MODELS.forEach(function (m) { var o = el('option', '', m[1]); o.value = m[0]; model.appendChild(o); });
    var customOpt = el('option', '', T('set.model.custom'));
    customOpt.value = '__custom';
    model.appendChild(customOpt);
    var custom = el('input', 'field');
    custom.type = 'text';
    custom.dir = 'ltr';
    custom.placeholder = 'vendor/model-name';
    custom.value = !known && s.nvidiaModel ? s.nvidiaModel : '';
    model.value = known ? s.nvidiaModel : (s.nvidiaModel ? '__custom' : '');
    function drawCustom() { custom.hidden = model.value !== '__custom'; }
    model.addEventListener('change', drawCustom);
    var nvBox = el('div', 'sbox');
    nvBox.appendChild(field('set.nvkey', key));
    nvBox.appendChild(field('set.model', model));
    nvBox.appendChild(custom);
    dlg.appendChild(nvBox);

    function drawVisibility() {
      dsBox.hidden = state.provider === 'nvidia';
      nvBox.hidden = state.provider === 'deepseek';
      drawCustom();
    }

    // server defaults
    var server = el('p', 'hint set-server', '');
    dlg.appendChild(server);
    fetch('/api/ai/status').then(function (r) { return r.json(); }).then(function (st) {
      var parts = [];
      if (st.serverDeepseek) parts.push('DeepSeek');
      if (st.serverNvidia) parts.push('NVIDIA (' + st.model + ')');
      server.textContent = parts.length ? T('set.server', { list: parts.join(', ') }) : T('set.server.none');
    }).catch(function () { /* optional info */ });

    // test + save
    var result = el('div', 'set-result');
    result.setAttribute('role', 'status');
    result.setAttribute('aria-live', 'polite');
    var actions = el('div', 'dlg-actions');
    var test = el('button', 'btn quiet', T('set.test'));
    test.type = 'button';
    var save = el('button', 'btn primary', T('set.save'));
    save.type = 'button';

    function collect() {
      var m = model.value === '__custom' ? custom.value.trim() : model.value;
      return { provider: state.provider, deepseekToken: tok.value.trim(), nvidiaKey: key.value.trim(), nvidiaModel: m };
    }

    test.addEventListener('click', function () {
      test.disabled = true;
      result.textContent = T('set.testing');
      result.className = 'set-result';
      fetch('/api/ai/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ai: collect() }) })
        .then(function (r) { return r.json(); })
        .then(function (out) {
          test.disabled = false;
          result.textContent = '';
          (out.results || []).forEach(function (r) {
            var line = el('div', 'set-line ' + (r.ok ? 'ok' : 'bad'));
            line.textContent = (r.ok ? '✓ ' : '✕ ') + (r.label || '') + ' · ' + (r.ok ? r.ms + ' ms' : r.error);
            result.appendChild(line);
          });
          if (out.error) result.textContent = out.error;
        })
        .catch(function (e) { test.disabled = false; result.textContent = T('set.fail', { m: e.message }); result.className = 'set-result bad'; });
    });

    save.addEventListener('click', function () {
      store(collect());
      dlg.close(); if (dlg) { dlg.remove(); dlg = null; }
      document.dispatchEvent(new CustomEvent('aisettingschange'));
    });

    actions.appendChild(test);
    actions.appendChild(save);
    dlg.appendChild(result);
    dlg.appendChild(el('p', 'hint', T('set.note')));
    dlg.appendChild(actions);

    drawSeg();
    drawVisibility();
    document.body.appendChild(dlg);
    dlg.addEventListener('click', function (e) { if (e.target === dlg) { var r = dlg.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dlg.close(); } });
    var self = dlg;
    dlg.addEventListener('close', function () { self.remove(); if (dlg === self) dlg = null; });
    dlg.showModal();
  }

  function attach() {
    document.querySelectorAll('[data-settings]').forEach(function (b) {
      if (b._ai) return;
      b._ai = true;
      b.addEventListener('click', open);
    });
  }

  window.AISettings = { payload: payload, open: open };
  document.addEventListener('DOMContentLoaded', attach);
  if (document.readyState !== 'loading') attach();
})();
