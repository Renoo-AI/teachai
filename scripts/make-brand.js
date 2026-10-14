// Generates the static brand files in public/brand/ from public/brand.js.
//   node tools/make-brand.js            (default accent)
//   node tools/make-brand.js "#FF6B4A"  (another accent, for a rebrand)
// PNGs are rendered with the same Chrome/Edge that PDF export uses (TEACHAI_BROWSER_PATH to override).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const Brand = require('../public/brand.js');

const OUT = path.join(__dirname, '..', 'public', 'brand');
const FONTS = pathToFileURL(path.join(__dirname, '..', 'public', 'fonts')).href;
const accent = process.argv[2] || Brand.DEFAULT_ACCENT;

function browserPath() {
  const e = process.env;
  const list = [e.TEACHAI_BROWSER_PATH, e.PROGRAMFILES && path.join(e.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
    e['PROGRAMFILES(X86)'] && path.join(e['PROGRAMFILES(X86)'], 'Microsoft/Edge/Application/msedge.exe'),
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  return list.find((p) => p && fs.existsSync(p));
}

// A PNG-in-ICO file (supported by every current browser).
function ico(images) {
  const head = Buffer.alloc(6); head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const dir = images.map(({ size, png }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(png.length, 8); e.writeUInt32LE(offset, 12);
    offset += png.length; return e;
  });
  return Buffer.concat([head, ...dir, ...images.map((i) => i.png)]);
}

function ogHtml(p) {
  const paper = `<svg viewBox="0 0 300 400" width="330" height="440"><rect width="300" height="400" rx="8" fill="#fff"/>
    <rect x="28" y="34" width="120" height="9" rx="4.5" fill="#bbb"/><rect x="190" y="34" width="82" height="9" rx="4.5" fill="#ccc"/>
    <rect x="70" y="72" width="160" height="13" rx="6" fill="#222"/><rect x="104" y="96" width="92" height="9" rx="4.5" fill="#888"/>
    <rect x="28" y="136" width="244" height="3" fill="#333"/>
    <rect x="28" y="158" width="190" height="9" rx="4.5" fill="#444"/>
    ${[0, 1, 2, 3].map((i) => `<circle cx="40" cy="${194 + i * 30}" r="7" fill="none" stroke="#777" stroke-width="2"/><rect x="58" y="${189 + i * 30}" width="${120 + (i * 37) % 70}" height="9" rx="4.5" fill="#d4d4d4"/>`).join('')}
    <circle cx="40" cy="254" r="7" fill="${p.base}"/><path d="M36.5 254l2.6 2.6 5-5.4" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="28" y="326" width="244" height="3" fill="#333"/><rect x="28" y="346" width="150" height="9" rx="4.5" fill="#444"/></svg>`;
  return `<!doctype html><meta charset="utf-8"><style>
  @font-face{font-family:Geist;src:url('${FONTS}/geist-latin-wght-normal.woff2');font-weight:100 900}
  @font-face{font-family:IS;src:url('${FONTS}/instrument-serif-latin-400-italic.woff2');font-style:italic}
  *{box-sizing:border-box;margin:0}
  body{width:1200px;height:630px;background:#F3F0EA;color:#111;font-family:Geist,sans-serif;position:relative;overflow:hidden}
  .brand{position:absolute;left:72px;top:64px;display:flex;align-items:center;gap:16px;font-size:34px;font-weight:800;letter-spacing:-.045em}
  .brand svg{width:54px;height:54px}.brand i{font-style:normal;color:${p.base}}
  h1{position:absolute;left:72px;top:160px;width:640px;font-size:88px;line-height:.98;font-weight:700;letter-spacing:-.055em}
  h1 em{font-family:IS;font-weight:400;font-size:1.1em;letter-spacing:-.02em;color:${p.base}}
  p{position:absolute;left:72px;top:462px;width:560px;font-size:27px;line-height:1.4;color:#4A463F}
  .paper{position:absolute;right:92px;top:86px;transform:rotate(4deg);filter:drop-shadow(0 12px 22px rgba(60,40,20,.22))}
  .tag{position:absolute;left:72px;bottom:52px;font-size:20px;color:#6F6A62;letter-spacing:.01em}
  </style>
  <div class="brand">${Brand.iconSvg(accent, { id: 'og' })}<span>Teach<i>.</i>ai</span></div>
  <h1>Your lesson.<br>A <em>well-made</em> exam.</h1>
  <p>Turn any lesson into an editable, printable exam with its answer key. No login.</p>
  <div class="paper">${paper}</div>
  <div class="tag">French · Arabic · English · PDF and Word export</div>`;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const p = Brand.palette(accent);
  fs.writeFileSync(path.join(OUT, 'icon.svg'), Brand.iconSvg(accent, { id: 'ic' }));
  fs.writeFileSync(path.join(OUT, 'icon-maskable.svg'), Brand.iconSvg(accent, { id: 'im', plain: true }));

  const executablePath = browserPath();
  if (!executablePath) { console.error('No Chrome or Edge found. Set TEACHAI_BROWSER_PATH. SVG files were written; PNG files were skipped.'); process.exit(1); }
  const puppeteer = await import('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    async function icon(svg, size) {
      await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
      await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
      return Buffer.from(await page.screenshot({ type: 'png', omitBackground: true }));
    }
    const round = (s) => icon(Brand.iconSvg(accent, { id: 'r' + s }), s);
    const plain = (s) => icon(Brand.iconSvg(accent, { id: 'p' + s, plain: true }), s);
    fs.writeFileSync(path.join(OUT, 'icon-192.png'), await round(192));
    fs.writeFileSync(path.join(OUT, 'icon-512.png'), await round(512));
    fs.writeFileSync(path.join(OUT, 'icon-maskable-512.png'), await plain(512));
    fs.writeFileSync(path.join(OUT, 'apple-touch-icon.png'), await plain(180));
    fs.writeFileSync(path.join(OUT, 'favicon.ico'), ico([{ size: 32, png: await round(32) }, { size: 48, png: await round(48) }]));

    await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
    const html = path.join(os.tmpdir(), 'teachai-og.html');
    fs.writeFileSync(html, ogHtml(p));
    await page.goto(pathToFileURL(html).href, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    fs.writeFileSync(path.join(OUT, 'og.png'), Buffer.from(await page.screenshot({ type: 'png' })));
  } finally { await browser.close(); }
  console.log('Brand files written to', OUT, 'for accent', accent);
})().catch((e) => { console.error(e); process.exit(1); });
