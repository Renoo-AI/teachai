/* Appearance picker: mode (light / dark / auto) and accent colour, in a small popover.
   Mounts into every element marked [data-theme-picker]. Needs theme.js. */
(function () {
  var L = {
    en: { btn: 'Appearance', mode: 'Mode', light: 'Light', dark: 'Dark', auto: 'Auto', accent: 'Accent colour', custom: 'Custom colour', reset: 'Reset', hint: 'The logo and the browser-tab icon follow your colour.' },
    fr: { btn: 'Apparence', mode: 'Mode', light: 'Clair', dark: 'Sombre', auto: 'Auto', accent: 'Couleur dâ€™accent', custom: 'Couleur personnalisÃ©e', reset: 'RÃ©initialiser', hint: 'Le logo et lâ€™icÃ´ne de lâ€™onglet suivent votre couleur.' },
    ar: { btn: 'Ø§Ù„Ù…Ø¸Ù‡Ø±', mode: 'Ø§Ù„ÙˆØ¶Ø¹', light: 'ÙØ§ØªØ­', dark: 'Ø¯Ø§ÙƒÙ†', auto: 'ØªÙ„Ù‚Ø§Ø¦ÙŠ', accent: 'Ù„ÙˆÙ† Ø§Ù„ØªÙ…ÙŠÙŠØ²', custom: 'Ù„ÙˆÙ† Ù…Ø®ØµØµ', reset: 'Ø¥Ø¹Ø§Ø¯Ø© Ø¶Ø¨Ø·', hint: 'ÙŠØªØ¨Ø¹ Ø§Ù„Ø´Ø¹Ø§Ø± ÙˆØ£ÙŠÙ‚ÙˆÙ†Ø© Ø§Ù„ØªØ¨ÙˆÙŠØ¨ Ù„ÙˆÙ†Ùƒ Ø§Ù„Ù…Ø®ØªØ§Ø±.' },
  };
  var ICON = {
    palette: '<svg class="tp-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1" fill="currentColor"/><circle cx="10.5" cy="7.2" r="1" fill="currentColor"/><circle cx="15" cy="7.8" r="1" fill="currentColor"/></svg>',
    light: '<svg class="tp-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    dark: '<svg class="tp-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    auto: '<svg class="tp-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
  };
  var open = null;

  function lang() { return L[document.documentElement.lang] || L.en; }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  function closePop() { if (open) { open.pop.hidden = true; open.btn.setAttribute('aria-expanded', 'false'); open = null; } }

  function build(host) {
    host.textContent = '';
    host.classList.add('tp');
    var t = lang();
    var btn = el('button', 'tp-btn', ICON.palette);
    btn.type = 'button';
    btn.title = t.btn;
    btn.setAttribute('aria-label', t.btn);
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    var dot = el('span', 'tp-dot');
    dot.setAttribute('aria-hidden', 'true');
    btn.appendChild(dot);
    var pop = el('div', 'tp-pop');
    pop.hidden = true;
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', t.btn);

    var modeLab = el('div', 'tp-lab'); modeLab.textContent = t.mode;
    var modes = el('div', 'tp-modes'); modes.setAttribute('role', 'group');
    [['light', t.light], ['dark', t.dark], ['system', t.auto]].forEach(function (m) {
      var b = el('button', 'tp-mode', ICON[m[0] === 'system' ? 'auto' : m[0]] + '<span></span>');
      b.type = 'button'; b.dataset.mode = m[0]; b.lastChild.textContent = m[1];
      b.addEventListener('click', function () { Theme.set({ mode: m[0] }); });
      modes.appendChild(b);
    });

    var accLab = el('div', 'tp-lab'); accLab.textContent = t.accent;
    var sw = el('div', 'tp-swatches'); sw.setAttribute('role', 'group');
    Object.keys(Theme.ACCENTS).forEach(function (k) {
      var b = el('button', 'tp-sw' + (k === 'mono' ? ' mono' : ''));
      b.type = 'button'; b.dataset.accent = k; b.setAttribute('aria-label', Theme.NAMES[k]); b.title = Theme.NAMES[k];
      b.addEventListener('click', function () { Theme.set({ accent: k }); });
      sw.appendChild(b);
    });

    var custom = el('label', 'tp-custom');
    var color = el('input'); color.type = 'color'; color.setAttribute('aria-label', t.custom);
    var customTxt = el('span'); customTxt.textContent = t.custom;
    custom.appendChild(color); custom.appendChild(customTxt);
    color.addEventListener('input', function () { Theme.set({ accent: color.value }); });

    var foot = el('div', 'tp-foot');
    var hint = el('p', 'tp-hint'); hint.textContent = t.hint;
    var reset = el('button', 'tp-reset'); reset.type = 'button'; reset.textContent = t.reset;
    reset.addEventListener('click', function () { Theme.set({ mode: 'system', accent: Theme.DEFAULT_ACCENT }); });
    foot.appendChild(hint); foot.appendChild(reset);

    [modeLab, modes, accLab, sw, custom, foot].forEach(function (n) { pop.appendChild(n); });
    host.appendChild(btn); host.appendChild(pop);

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (open && open.pop === pop) { closePop(); return; }
      closePop();
      pop.hidden = false; btn.setAttribute('aria-expanded', 'true'); open = { pop: pop, btn: btn };
    });
    pop.addEventListener('click', function (e) { e.stopPropagation(); });

    function sync() {
      var st = Theme.get(), dark = Theme.isDark();
      modes.querySelectorAll('.tp-mode').forEach(function (b) { b.classList.toggle('on', b.dataset.mode === st.mode); b.setAttribute('aria-pressed', String(b.dataset.mode === st.mode)); });
      sw.querySelectorAll('.tp-sw').forEach(function (b) {
        var k = b.dataset.accent, on = k === st.accent;
        b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
        if (k !== 'mono') b.style.background = Theme.resolve(k, dark);
      });
      var cur = st.accent === 'mono' ? '#888888' : Theme.resolve(st.accent, dark);
      color.value = /^#[0-9a-f]{6}$/i.test(cur) ? cur : '#c84b1c';
      custom.classList.toggle('on', !Theme.ACCENTS[st.accent]);
    }
    document.addEventListener('themechange', sync);
    sync();
  }

  function mount() { document.querySelectorAll('[data-theme-picker]').forEach(build); }
  document.addEventListener('click', closePop);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePop(); });
  document.addEventListener('uilangchange', mount);
  document.addEventListener('sitelangchange', mount);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  window.ThemePicker = { mount: mount };
})();

