/* Shared behaviour for the public pages: language, mobile menu, scroll reveal, footer details, draft notice. */
(function () {
  var D = window.SITE_I18N || { en: {} };
  var KEY = 'teachai.ui'; // same key as the app, so the language follows the visitor everywhere
  var cur = 'en';
  try {
    var saved = localStorage.getItem(KEY);
    if (saved && D[saved]) cur = saved;
    else { var nav = (navigator.language || 'en').slice(0, 2); cur = D[nav] ? nav : 'en'; }
  } catch (_) { /* storage can be blocked */ }

  function t(key) { return (D[cur] && D[cur][key]) || D.en[key] || ''; }

  function apply() {
    document.documentElement.lang = cur;
    document.documentElement.dir = cur === 'ar' ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-s]').forEach(function (e) { var v = t(e.getAttribute('data-s')); if (v) e.textContent = v; });
    document.querySelectorAll('[data-s-html]').forEach(function (e) { var v = t(e.getAttribute('data-s-html')); if (v) e.innerHTML = v; });
    document.querySelectorAll('[data-s-aria]').forEach(function (e) { var v = t(e.getAttribute('data-s-aria')); if (v) e.setAttribute('aria-label', v); });
    document.querySelectorAll('[data-s-ph]').forEach(function (e) { var v = t(e.getAttribute('data-s-ph')); if (v) e.placeholder = v; });
    var page = document.body.dataset.page;
    if (page) {
      var title = t('meta.' + page + '.title'), desc = t('meta.' + page + '.desc');
      if (title) document.title = title;
      var m = document.querySelector('meta[name="description"]');
      if (desc && m) m.content = desc;
    }
    renderSwitch();
  }

  function renderSwitch() {
    var host = document.getElementById('langsw');
    if (!host) return;
    host.textContent = '';
    [['fr', 'FR'], ['ar', 'عربي'], ['en', 'EN']].forEach(function (l) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'ls' + (l[0] === cur ? ' on' : ''); b.textContent = l[1]; b.lang = l[0];
      b.setAttribute('aria-pressed', String(l[0] === cur));
      b.addEventListener('click', function () { set(l[0]); });
      host.appendChild(b);
    });
  }

  function set(l) {
    if (!D[l] || l === cur) return;
    cur = l;
    try { localStorage.setItem(KEY, l); } catch (_) { /* ignore */ }
    apply();
    document.dispatchEvent(new CustomEvent('sitelangchange', { detail: l }));
  }

  window.SiteLang = { t: t, set: set, get lang() { return cur; } };

  function ready() {
    apply();
    var site = window.SITE || {};

    document.querySelectorAll('[data-year]').forEach(function (e) { e.textContent = new Date().getFullYear(); });
    document.querySelectorAll('[data-site-mail]').forEach(function (a) { if (site.email) { a.href = 'mailto:' + site.email; a.hidden = false; } });
    // Business details used by the legal pages.
    document.querySelectorAll('[data-site-legal]').forEach(function (e) { if (site.legalName) e.textContent = site.legalName; });
    document.querySelectorAll('[data-site-updated]').forEach(function (e) { if (site.updated) e.textContent = site.updated; });
    if (site.address) {
      document.querySelectorAll('[data-site-address]').forEach(function (e) { e.textContent = site.address; });
      document.querySelectorAll('[data-site-address-wrap]').forEach(function (e) { e.hidden = false; });
    }
    if (site.email) {
      document.querySelectorAll('[data-site-mail-inline]').forEach(function (a) { a.href = 'mailto:' + site.email; a.textContent = site.email; a.hidden = false; });
      document.querySelectorAll('[data-site-mail-missing]').forEach(function (e) { e.hidden = true; });
    }

    // Mobile menu
    var burger = document.getElementById('nav-burger'), links = document.getElementById('nav-links');
    if (burger && links) {
      var close = function () { links.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); };
      burger.addEventListener('click', function (e) { e.stopPropagation(); var o = links.classList.toggle('open'); burger.setAttribute('aria-expanded', String(o)); });
      links.addEventListener('click', function (e) { if (e.target.closest('a')) close(); });
      document.addEventListener('click', function (e) { if (!e.target.closest('#nav')) close(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    }

    // Draft notice on legal pages until the business details are filled in (public/site-config.js).
    var page = document.body.dataset.page;
    if ((page === 'privacy' || page === 'terms') && (!site.legalName || !site.email)) {
      var host = document.querySelector('.prose');
      if (host) {
        var note = document.createElement('div');
        note.className = 'draft-note';
        note.textContent = 'Draft: add the legal entity name and the contact email in public/site-config.js, then have a lawyer in Qatar review this page before launch. This notice disappears once both are set.';
        host.insertBefore(note, host.firstChild);
      }
    }

    // Scroll reveal
    var items = document.querySelectorAll('.rv');
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      items.forEach(function (e) { e.classList.add('in'); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      items.forEach(function (e) { io.observe(e); });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
})();
