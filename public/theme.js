/* Theme engine. Load it in <head> (after brand.js) so the right mode and accent are on screen before first paint.
   Mode: light | dark | system. Accent: a preset name or any #RRGGBB.
   Everything derived from the accent (buttons, soft tints, favicon, logo mark) is recomputed here, so picking a
   colour restyles the whole product, including the browser-tab icon. */
window.Theme = (function () {
  var B = window.TeachBrand;
  var MODE_KEY = 'teachai.theme', ACCENT_KEY = 'teachai.accent';
  var ACCENTS = { orange: '#C84B1C', red: '#C23B45', yellow: '#CF9A00', green: '#2E8456', teal: '#0F8B7F', blue: '#2F6FE0', purple: '#6D5BD0', pink: '#C93F77', mono: 'mono' };
  var NAMES = { orange: 'Deep orange', red: 'Red', yellow: 'Yellow', green: 'Green', teal: 'Teal', blue: 'Blue', purple: 'Purple', pink: 'Pink', mono: 'Mono' };
  var DEFAULT_ACCENT = 'orange';
  var W = [255, 255, 255], K = [0, 0, 0];
  var mix = B.mix, rgbHex = B.rgbHex, hexRgb = B.hexRgb, lum = B.lum;

  function read(key, fallback) { try { return localStorage.getItem(key) || fallback; } catch (_) { return fallback; } }
  function write(key, value) { try { localStorage.setItem(key, value); } catch (_) { /* storage can be blocked */ } }

  function contrast(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function normalize(a) {
    var v = String(a || '').trim().toLowerCase();
    if (ACCENTS[v]) return v;
    if (/^#?[0-9a-f]{6}$/.test(v)) return '#' + v.replace('#', '');
    return null;
  }
  function get() { return { mode: read(MODE_KEY, 'light'), accent: normalize(read(ACCENT_KEY, DEFAULT_ACCENT)) || DEFAULT_ACCENT }; }
  function isDark() { var m = get().mode; return m === 'dark' || (m === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches); }

  /* Keeps any accent readable: pale colours darken on light backgrounds, dark ones lighten on dark backgrounds. */
  function resolve(accent, dark) {
    if (accent === 'mono') return dark ? '#F2EFEA' : '#141414';
    var c = hexRgb(ACCENTS[accent] || accent);
    var bg = dark ? [22, 22, 21] : [250, 248, 244], toward = dark ? W : K;
    for (var i = 0; i < 24 && contrast(c, bg) < 2.8; i++) c = mix(c, toward, 0.07);
    return rgbHex(c);
  }

  var markId = 0;
  function paintBrand(hex) {
    var svg = B.iconSvg(hex, { id: 'bm' });
    var link = document.getElementById('fav-svg');
    if (!link) { link = document.createElement('link'); link.id = 'fav-svg'; link.rel = 'icon'; link.type = 'image/svg+xml'; document.head.appendChild(link); }
    link.href = B.dataUri(B.iconSvg(hex, { id: 'fv' }));
    document.querySelectorAll('.brand-mark').forEach(function (el) {
      el.innerHTML = svg.replace(/id="bmg"/, 'id="bmg' + (++markId) + '"').replace(/url\(#bmg\)/, 'url(#bmg' + markId + ')');
    });
  }

  function apply(animate) {
    var dark = isDark(), root = document.documentElement, st = get();
    if (animate) {
      root.classList.add('theme-anim');
      clearTimeout(apply.t);
      apply.t = setTimeout(function () { root.classList.remove('theme-anim'); }, 450);
    }
    root.dataset.theme = dark ? 'dark' : 'light';
    var hex = resolve(st.accent, dark), c = hexRgb(hex);
    var set = function (k, v) { root.style.setProperty(k, v); };
    set('--accent', hex);
    set('--accent-rgb', c.map(Math.round).join(','));
    set('--on-accent', lum(c) > 0.4 ? '#101010' : '#FFFFFF');
    set('--accent-hi', rgbHex(mix(c, W, 0.42)));
    set('--accent-mid', rgbHex(mix(c, W, 0.18)));
    set('--accent-lo', rgbHex(mix(c, K, 0.22)));
    set('--accent-glow', rgbHex(mix(c, W, 0.88)));
    set('--accent-text', rgbHex(dark ? mix(c, W, 0.25) : mix(c, K, 0.22)));
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? '#161615' : '#FAF8F4';
    if (document.head) paintBrand(hex);
    document.dispatchEvent(new Event('themechange'));
  }

  /* opts: { mode?, accent? } */
  function set(opts) {
    var cur = get(), changed = false;
    var mode = opts && ['light', 'dark', 'system'].indexOf(opts.mode) >= 0 ? opts.mode : null;
    var accent = opts && opts.accent ? normalize(opts.accent) : null;
    if (mode && mode !== cur.mode) { write(MODE_KEY, mode); changed = true; }
    if (accent && accent !== cur.accent) { write(ACCENT_KEY, accent); changed = true; }
    if (changed) apply(true);
    return changed;
  }

  apply();
  document.addEventListener('DOMContentLoaded', function () { paintBrand(resolve(get().accent, isDark())); });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { if (get().mode === 'system') apply(true); });
  window.addEventListener('storage', function (e) { if (e.key === MODE_KEY || e.key === ACCENT_KEY) apply(true); });

  return { ACCENTS: ACCENTS, NAMES: NAMES, DEFAULT_ACCENT: DEFAULT_ACCENT, get: get, set: set, apply: apply, resolve: resolve, isDark: isDark, normalize: normalize };
})();

