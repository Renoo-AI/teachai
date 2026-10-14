/* Teach.ai brand: one logo, any accent colour.
   The mark is an exam sheet with a folded corner and a check. It is built from the accent the user picked,
   so the favicon, the in-page mark and the saved PNG icons all share the same geometry.
   Works in the browser (window.TeachBrand) and in Node (require) for tools/make-brand.js. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TeachBrand = factory();
})(this, function () {
  var DEFAULT_ACCENT = '#C84B1C';

  function hexRgb(h) { h = String(h).replace('#', ''); return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16); }); }
  function rgbHex(c) { return '#' + c.map(function (v) { return Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0'); }).join(''); }
  function mix(a, b, t) { return a.map(function (v, i) { return v + (b[i] - v) * t; }); }
  function lum(c) {
    var l = c.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
  }

  function palette(hex) {
    var c = hexRgb(/^#?[0-9a-f]{6}$/i.test(hex || '') ? hex : DEFAULT_ACCENT);
    return {
      base: rgbHex(c),
      hi: rgbHex(mix(c, [255, 255, 255], 0.16)),
      lo: rgbHex(mix(c, [0, 0, 0], 0.14)),
      ink: rgbHex(mix(c, [0, 0, 0], 0.4)),
      light: lum(c) > 0.42,
    };
  }

  /* opts: { id: unique gradient id, plain: square with no rounding (maskable / apple), size: 'width/height' attribute } */
  function iconSvg(hex, opts) {
    opts = opts || {};
    var p = palette(hex);
    var id = opts.id || 'tb';
    var r = opts.plain ? 0 : 116;
    // Maskable icons keep the art inside the central safe zone.
    var art = opts.plain ? 'translate(51.2 51.2) scale(.8)' : '';
    var size = opts.size ? ' width="' + opts.size + '" height="' + opts.size + '"' : '';
    var check = p.light ? p.ink : p.base;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"' + size + ' role="img" aria-label="Teach.ai">' +
      '<defs>' +
      '<linearGradient id="' + id + 'g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + p.hi + '"/><stop offset=".5" stop-color="' + p.base + '"/><stop offset="1" stop-color="' + p.lo + '"/></linearGradient>' +
      '</defs>' +
      '<rect width="512" height="512" rx="' + r + '" fill="url(#' + id + 'g)"/>' +
      '<g transform="' + art + '">' +
      '<path d="M172 96h146l70 70v234a24 24 0 0 1-24 24H172a24 24 0 0 1-24-24V120a24 24 0 0 1 24-24z" fill="#fff"/>' +
      '<path d="M318 96v46a24 24 0 0 0 24 24h46z" fill="' + p.base + '" opacity=".28"/>' +
      '<rect x="188" y="206" width="112" height="18" rx="9" fill="' + p.base + '" opacity=".32"/>' +
      '<rect x="188" y="246" width="152" height="18" rx="9" fill="' + p.base + '" opacity=".2"/>' +
      '<path d="M192 340l40 40 96-104" fill="none" stroke="' + check + '" stroke-width="38" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</g></svg>';
  }

  function dataUri(svg) { return 'data:image/svg+xml,' + encodeURIComponent(svg); }

  return { DEFAULT_ACCENT: DEFAULT_ACCENT, palette: palette, iconSvg: iconSvg, dataUri: dataUri, hexRgb: hexRgb, rgbHex: rgbHex, mix: mix, lum: lum };
});

