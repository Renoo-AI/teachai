/* Landing page only: the live lesson-to-exam demo, the "how it works" tabs and the waiting-list form. */
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  /* ---------- Demo ---------- */
  var SAMPLES = [
    { lang: 'fr', dir: 'ltr', file: 'photosynthese.pdf', tags: ['9e année', 'SVT', 'Français'],
      lesson: 'La photosynthèse est le processus par lequel les plantes vertes fabriquent de la matière organique à partir de l’eau, du dioxyde de carbone et de la lumière. Elle se déroule dans les chloroplastes et libère du dioxygène.',
      school: 'Collège …', year: '2026/2027', title: 'Devoir de contrôle N°1', sub: 'Sciences de la vie et de la Terre', student: 'Nom et prénom : ………………', note: 'Note : …/20',
      ex: [
        { t: 'Exercice 1', p: '6 points', q: 'Où se déroule la photosynthèse ?', mcq: ['Les mitochondries', 'Les chloroplastes', 'Le noyau', 'Les vacuoles'], ok: 1, src: 'Source : « Elle se déroule dans les chloroplastes »' },
        { t: 'Exercice 2', p: '6 points', q: 'Vrai ou faux : la photosynthèse libère du dioxygène.', tf: ['Vrai', 'Faux'], ok: 0 },
        { t: 'Exercice 3', p: '8 points', q: 'Citez les trois éléments nécessaires à la photosynthèse.', lines: 2, ans: 'Réponse : l’eau, le dioxyde de carbone, la lumière' },
      ] },
    { lang: 'ar', dir: 'rtl', file: 'التركيب_الضوئي.pdf', tags: ['التاسعة أساسي', 'علوم الحياة والأرض', 'العربية'],
      lesson: 'التركيب الضوئي هو العملية التي تصنع بها النباتات الخضراء مادة عضوية انطلاقًا من الماء وثنائي أكسيد الكربون والضوء. يحدث في البلاستيدات الخضراء ويحرر غاز الأكسجين.',
      school: 'إعدادية …', year: '2026/2027', title: 'فرض مراقبة عدد 1', sub: 'علوم الحياة والأرض', student: 'الاسم واللقب : ………………', note: 'الملاحظة : …/20',
      ex: [
        { t: 'التمرين 1', p: '6 نقاط', q: 'أين يحدث التركيب الضوئي؟', mcq: ['الميتوكوندريا', 'البلاستيدات الخضراء', 'النواة', 'الفجوات'], ok: 1, src: 'المصدر : «يحدث في البلاستيدات الخضراء»' },
        { t: 'التمرين 2', p: '6 نقاط', q: 'صواب أم خطأ: يحرر التركيب الضوئي غاز الأكسجين.', tf: ['صواب', 'خطأ'], ok: 0 },
        { t: 'التمرين 3', p: '8 نقاط', q: 'اذكر العناصر الثلاثة اللازمة للتركيب الضوئي.', lines: 2, ans: 'الإصلاح : الماء وثنائي أكسيد الكربون والضوء' },
      ] },
    { lang: 'en', dir: 'ltr', file: 'photosynthesis.pdf', tags: ['9th year', 'Life sciences', 'English'],
      lesson: 'Photosynthesis is the process by which green plants make organic matter from water, carbon dioxide and light. It takes place in the chloroplasts and releases oxygen.',
      school: 'School …', year: '2026/2027', title: 'Test No. 1', sub: 'Life and Earth Sciences', student: 'Full name: ………………', note: 'Mark: …/20',
      ex: [
        { t: 'Exercise 1', p: '6 points', q: 'Where does photosynthesis take place?', mcq: ['Mitochondria', 'Chloroplasts', 'The nucleus', 'Vacuoles'], ok: 1, src: 'Source: “It takes place in the chloroplasts”' },
        { t: 'Exercise 2', p: '6 points', q: 'True or false: photosynthesis releases oxygen.', tf: ['True', 'False'], ok: 0 },
        { t: 'Exercise 3', p: '8 points', q: 'Name the three things photosynthesis needs.', lines: 2, ans: 'Answer: water, carbon dioxide, light' },
      ] },
  ];

  function buildPaper(S) {
    var blocks = [];
    var add = function (node) { node.classList.add('pp-block'); blocks.push(node); return node; };
    var head = el('div', 'pp-head'); head.appendChild(el('span', '', S.school)); head.appendChild(el('span', '', S.year)); add(head);
    var title = add(el('div', 'pp-title', S.title)), sub = add(el('div', 'pp-sub', S.sub));
    var stu = el('div', 'pp-student'); stu.appendChild(el('span', '', S.student)); stu.appendChild(el('span', '', S.note)); add(stu);
    var out = [head, title, sub, stu];
    S.ex.forEach(function (ex) {
      var h = el('div', 'pp-ex', ex.t); h.appendChild(el('span', '', ex.p)); add(h); out.push(h);
      var q = add(el('div', 'pp-q', ex.q)); out.push(q);
      if (ex.mcq) {
        var ch = el('div', 'pp-ch');
        ex.mcq.forEach(function (c, i) { var s = el('span', i === ex.ok ? 'ok' : ''); s.appendChild(el('i')); s.appendChild(document.createTextNode(String.fromCharCode(97 + i) + ') ' + c)); ch.appendChild(s); });
        out.push(add(ch));
      }
      if (ex.tf) {
        var tf = el('div', 'pp-tf');
        ex.tf.forEach(function (c, i) { var s = el('span', i === ex.ok ? 'ok' : ''); s.appendChild(el('i')); s.appendChild(document.createTextNode(c)); tf.appendChild(s); });
        out.push(add(tf));
      }
      if (ex.lines) { var ln = el('div', 'pp-lines'); for (var k = 0; k < ex.lines; k++) ln.appendChild(el('i')); out.push(add(ln)); }
      if (ex.src) out.push(add(el('div', 'pp-keynote', ex.src)));
      if (ex.ans) out.push(add(el('div', 'pp-keynote ans', ex.ans)));
    });
    return out;
  }

  function demo(root) {
    var lessonEl = root.querySelector('[data-demo-lesson]'), paper = root.querySelector('[data-demo-paper]'),
      btn = root.querySelector('[data-demo-btn]'), btnLabel = root.querySelector('[data-demo-btn-label]'),
      keyChip = root.querySelector('[data-demo-keychip]'), tagsEl = root.querySelector('[data-demo-tags]'),
      fileEl = root.querySelector('[data-demo-file]'), dots = root.querySelectorAll('[data-demo-dots] i');
    var idx = 0, token = 0, visible = true;

    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    async function whileHidden(tk) { while (!visible && tk === token) await sleep(300); }
    var L = function (k) { return (window.SiteLang && window.SiteLang.t(k)) || ''; };

    function setup(S) {
      lessonEl.dir = S.dir; lessonEl.textContent = '';
      paper.dir = S.dir; paper.textContent = ''; paper.classList.remove('keyed');
      keyChip.hidden = true;
      fileEl.textContent = S.file;
      tagsEl.textContent = '';
      S.tags.forEach(function (x, i) { tagsEl.appendChild(el('span', 'chip' + (i === 0 ? ' accent' : ''), x)); });
      dots.forEach(function (d, i) { d.classList.toggle('on', i === idx % SAMPLES.length); });
      btn.classList.add('idle'); btn.classList.remove('busy'); btnLabel.textContent = L('demo.btn');
    }

    function showAll(S) {
      setup(S);
      lessonEl.textContent = S.lesson;
      buildPaper(S).forEach(function (b) { paper.appendChild(b); b.classList.add('in'); });
      paper.classList.add('keyed'); keyChip.hidden = false;
      btn.classList.remove('idle');
    }

    async function play() {
      var tk = ++token, S = SAMPLES[idx % SAMPLES.length];
      setup(S);
      var caret = el('span', 'caret'); lessonEl.appendChild(caret);
      var text = document.createTextNode(''); lessonEl.insertBefore(text, caret);
      for (var i = 1; i <= S.lesson.length; i++) {
        if (tk !== token) return; await whileHidden(tk);
        text.nodeValue = S.lesson.slice(0, i); await sleep(i % 3 ? 14 : 22);
      }
      caret.remove(); await sleep(350); if (tk !== token) return;
      btn.classList.remove('idle'); btn.classList.add('busy'); btnLabel.textContent = L('demo.writing'); await sleep(900); if (tk !== token) return;
      btn.classList.remove('busy'); btnLabel.textContent = L('demo.btn');
      var blocks = buildPaper(S);
      for (var b = 0; b < blocks.length; b++) {
        if (tk !== token) return; await whileHidden(tk);
        paper.appendChild(blocks[b]); void blocks[b].offsetWidth; blocks[b].classList.add('in'); await sleep(210);
      }
      await sleep(900); if (tk !== token) return;
      paper.classList.add('keyed'); keyChip.hidden = false;
      await sleep(4200); if (tk !== token) return;
      idx++; play();
    }

    if ('IntersectionObserver' in window) new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }).observe(root);
    if (reduce) showAll(SAMPLES[0]); else play();
    document.addEventListener('sitelangchange', function () { if (reduce) showAll(SAMPLES[0]); else btnLabel.textContent = L(btn.classList.contains('busy') ? 'demo.writing' : 'demo.btn'); });
  }

  /* ---------- How it works tabs ---------- */
  function tabs() {
    var list = Array.prototype.slice.call(document.querySelectorAll('.how-tab'));
    if (!list.length) return;
    var current = 0, timer = null, stopped = false;
    function select(i, user) {
      current = i;
      list.forEach(function (b, k) {
        b.setAttribute('aria-selected', String(k === i)); b.tabIndex = k === i ? 0 : -1;
        var m = document.getElementById(b.getAttribute('aria-controls')); if (m) m.classList.toggle('on', k === i);
      });
      if (user) { stopped = true; clearInterval(timer); timer = null; }
    }
    list.forEach(function (b, i) {
      b.addEventListener('click', function () { select(i, true); });
      b.addEventListener('keydown', function (e) {
        var n = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
        if (!n) return; e.preventDefault(); var k = (i + n + list.length) % list.length; select(k, true); list[k].focus();
      });
    });
    select(0);
    if (!reduce && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (en) {
        if (en[0].isIntersecting && !timer && !stopped) timer = setInterval(function () { select((current + 1) % list.length); }, 6500);
        if (!en[0].isIntersecting) { clearInterval(timer); timer = null; }
      }, { threshold: 0.4 }).observe(document.querySelector('.how'));
    }
  }

  /* ---------- Waiting list ---------- */
  function waitlist() {
    var form = document.getElementById('waitlist');
    if (!form) return;
    var msg = form.querySelector('.wl-msg'), btn = form.querySelector('button[type="submit"]');
    var L = function (k) { return (window.SiteLang && window.SiteLang.t(k)) || ''; };
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = form.elements.email.value.trim();
      msg.className = 'wl-msg';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { msg.textContent = L('wl.bad'); msg.classList.add('bad'); form.elements.email.focus(); return; }
      btn.disabled = true;
      fetch('/api/waitlist', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email, role: form.elements.role.value, website: form.elements.website.value, lang: window.SiteLang ? window.SiteLang.lang : 'en' }),
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (res.ok) { msg.textContent = L('wl.ok'); msg.classList.add('ok'); form.reset(); }
          else { msg.textContent = res.j && res.j.error && /valid/i.test(res.j.error) ? L('wl.bad') : L('wl.err'); msg.classList.add('bad'); }
        })
        .catch(function () { msg.textContent = L('wl.err'); msg.classList.add('bad'); })
        .then(function () { btn.disabled = false; });
    });
  }

  function init() {
    var d = document.querySelector('[data-demo]'); if (d) demo(d);
    tabs(); waitlist();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
