// Guided creation: three steps, a live paper preview, and the waiting screen while the exam is written.
// home.js owns the form state (hidden selects and inputs); this file only drives what is shown.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var T = function (key, vars) { return I18N.t(key, vars); };
  var form = $('make'), step = 0, busy = false;
  var panes = Array.prototype.slice.call(document.querySelectorAll('[data-pane]'));
  var stepBtns = Array.prototype.slice.call(document.querySelectorAll('[data-goto]'));
  var MIN = 200, MAX = 60000;

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

  function setStatus(message, kind) {
    var s = $('status');
    s.className = 'status' + (kind ? ' ' + kind : '');
    s.textContent = '';
    if (message) { s.appendChild(ICONS.node(kind === 'error' ? 'alert' : 'info', 16)); s.appendChild(document.createTextNode(message)); }
  }

  function lessonLength() { return $('lesson').value.trim().length; }
  function validLesson() {
    if (document.querySelector('.file-row.reading')) { setStatus(T('studio.reading'), 'error'); return false; }
    var n = lessonLength();
    if (n < MIN) { setStatus(T('err.lesson'), 'error'); show(0, true); return false; }
    if (n > MAX) { setStatus(T('studio.countlimit'), 'error'); show(0, true); return false; }
    return true;
  }

  function show(i, force) {
    if (busy || i < 0 || i > 2) return;
    if (i > 0 && !force && !validLesson()) return;
    step = i;
    if (!force) setStatus('');
    panes.forEach(function (p, idx) { p.hidden = idx !== step; });
    stepBtns.forEach(function (b, idx) {
      b.classList.toggle('on', idx === step); b.classList.toggle('done', idx < step);
      if (idx === step) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    $('back').hidden = step === 0; $('next').hidden = step === 2; $('go').hidden = step !== 2;
    updatePreview(); summaries();
  }
  stepBtns.forEach(function (b) { b.addEventListener('click', function () { show(+b.getAttribute('data-goto')); }); });
  $('back').addEventListener('click', function () { show(step - 1); });
  $('next').addEventListener('click', function () { show(step + 1); });

  // ---------- Lesson length meter ----------
  function meter() {
    var n = lessonLength(), bar = $('meter-bar'), label = $('lessonstatus');
    var pct = n >= MIN ? 100 : Math.round((n / MIN) * 100);
    bar.style.width = Math.min(100, pct) + '%';
    bar.parentNode.className = 'meter' + (n > MAX ? ' over' : n >= MIN ? ' ok' : '');
    label.textContent = n ? (n > MAX ? T('studio.countlimit') : n >= MIN ? T('lesson.chars', { n: n.toLocaleString() }) : T('ui.more', { n: (MIN - n).toLocaleString() })) : '';
    summaries();
  }
  document.addEventListener('lessonchange', meter);

  // ---------- One-line summary under each step ----------
  function summaries() {
    var n = lessonLength(), files = document.querySelectorAll('.file-row.ok').length;
    $('sum-0').textContent = n >= MIN ? (files ? T('ui.files', { n: files }) + ' · ' : '') + T('ui.chars', { n: n.toLocaleString() }) : T('ui.todo');
    var lv = TPL.findLevel($('level').value);
    $('sum-1').textContent = (lv[I18N.lang] || lv.fr) + ' · ' + TPL.subjectLabel($('subject').value, lv.id, I18N.lang);
    var q = ['mcq', 'tf', 'short', 'essay'].reduce(function (s, t) { return s + (parseInt($('n-' + t).value, 10) || 0); }, 0);
    $('sum-2').textContent = T('ui.qex', { q: q, e: $('exercises').value });
  }

  // ---------- Live structure preview ----------
  var paper = $('live-paper');
  function text(tag, cls, value) { return el(tag, cls, value); }
  function updatePreview() {
    var lang = $('lang').value, L = TPL.L[lang], lv = TPL.findLevel($('level').value);
    if (!L) return;
    var count = Number($('exercises').value), titles = TPL.groupTitles($('subject').value, lv.id, lang, count);
    var plan = TPL.plan($('subject').value, lv.id), split = TPL.splitFor($('subject').value, lv.id, count);
    var state = window.ExamSetup.preview(), reference = state.reference;
    if (reference && reference.usable && reference.ex === count) {
      if (reference.split && reference.split.length === count) split = reference.split;
      if (reference.lang === lang && reference.titles && reference.titles.length >= count) titles = reference.titles.slice(0, count);
    }
    paper.className = 'mini-paper mini-' + state.design; paper.dir = L.dir; paper.lang = lang; paper.replaceChildren();
    var header = el('div', 'mini-header');
    header.append(text('div', 'mini-school', $('school-name').value || TPL.schoolPlaceholder(lv.id, lang)), text('div', 'mini-year', TPL.schoolYear()));
    header.append(text('h3', 'mini-title', $('title').value), text('div', 'mini-subject', TPL.subjectLabel($('subject').value, lv.id, lang)));
    var meta = el('div', 'mini-meta');
    meta.append(text('span', '', lv[lang] || lv.fr), text('span', '', TPL.fmtDuration(reference && reference.usable && reference.minutes || plan.dur[$('kind').value === 'synthese' ? 'synthese' : 'control'], lang)));
    header.append(meta);
    if ($('teacher-name').value) header.append(text('div', 'mini-teacher', L.teacher + ' : ' + $('teacher-name').value));
    paper.append(header, text('div', 'mini-student', L.name + ' : ...................................     /20'));
    titles.forEach(function (title, i) {
      var group = el('div', 'mini-group'); group.append(text('strong', '', title));
      if (split) group.append(text('span', '', L.pts(split[i])));
      paper.append(group);
      var lines = el('div', 'mini-lines'); lines.setAttribute('aria-hidden', 'true');
      for (var j = 0; j < 3; j++) lines.append(el('i'));
      paper.append(lines);
    });
  }
  form.addEventListener('input', function () { updatePreview(); summaries(); });
  form.addEventListener('change', function () { updatePreview(); summaries(); });
  form.addEventListener('click', function () { requestAnimationFrame(function () { updatePreview(); summaries(); }); });
  document.addEventListener('uilangchange', function () { updatePreview(); meter(); providerChip(); tip(); });
  document.addEventListener('examplanchange', function () { updatePreview(); summaries(); });

  // Submit only from the last step, after a final check.
  form.addEventListener('submit', function (e) {
    if (step !== 2 || !validLesson()) { e.preventDefault(); e.stopImmediatePropagation(); if (step !== 2 && validLesson()) show(step + 1); return; }
    var n = ['mcq', 'tf', 'short', 'essay'].reduce(function (sum, t) { return sum + Number($('n-' + t).value); }, 0);
    if (!Number.isInteger(n) || n < Number($('exercises').value) || n > 40) { e.preventDefault(); e.stopImmediatePropagation(); setStatus(T('studio.countlimit'), 'error'); }
  }, true);
  // Enter in a text field must not jump to creation.
  form.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault(); });

  // "More options" sits at the bottom of the last step: bring it into view when it opens.
  var more = document.querySelector('details.more');
  more.addEventListener('toggle', function () {
    if (more.open) setTimeout(function () { more.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 30);
  });

  // ---------- AI provider chip ----------
  var aiReady = null;
  function providerChip() {
    var chip = $('provider'), state = $('ai-state');
    if (aiReady === null) return;
    chip.textContent = '';
    chip.className = 'provider ' + (aiReady ? 'ready' : 'demo');
    chip.appendChild(el('span', 'led'));
    chip.appendChild(document.createTextNode(T(aiReady ? 'studio.ready' : 'studio.demo')));
    state.classList.toggle('demo', !aiReady);
  }
  function refreshProvider() {
    var s = AISettings.payload(), local = !!(s.deepseekToken || s.nvidiaKey);
    fetch('/api/ai/status').then(function (r) { return r.json(); })
      .then(function (st) { aiReady = local || !!(st.serverDeepseek || st.serverNvidia); providerChip(); })
      .catch(function () { aiReady = local; providerChip(); });
  }
  document.addEventListener('aisettingschange', refreshProvider);

  // ---------- Waiting screen ----------
  var gen = $('gen'), timer = null, started = 0, tipTimer = null, tipIndex = 0, writeTimer = null;
  var TIPS = ['ui.tip1', 'ui.tip2', 'ui.tip3', 'ui.tip4'];
  function tip() { var t = $('gen-tip'); t.textContent = ''; t.appendChild(ICONS.node('info', 14)); t.appendChild(document.createTextNode(T(TIPS[tipIndex % TIPS.length]))); }
  function stage(name) {
    var order = ['drafting', 'checking', 'complete'], index = name === 'drafting' ? 0 : name === 'complete' ? 2 : 1;
    gen.querySelectorAll('.gen-stages li').forEach(function (li, i) {
      li.classList.toggle('active', i === index); li.classList.toggle('done', i < index);
      var ico = li.querySelector('.gs-ico'); ico.textContent = '';
      ico.appendChild(ICONS.node(i < index ? 'check' : i === index ? 'loader' : 'clock', 16));
    });
    $('gs-check').textContent = T(name === 'repairing' ? 'create.repairing' : 'create.checking');
    // The bar follows the real stages; inside a stage it creeps forward slowly so the screen never looks frozen.
    gen.dataset.stage = order[index];
  }
  function tick() {
    var s = Math.floor((Date.now() - started) / 1000), base = { drafting: 5, checking: 70, complete: 96 }[gen.dataset.stage] || 5;
    var cap = { drafting: 66, checking: 92, complete: 100 }[gen.dataset.stage] || 66;
    var bar = $('gen-bar'), cur = parseFloat(bar.style.width) || 0;
    bar.style.width = Math.max(base, Math.min(cap, cur + (cap - cur) * 0.035)) + '%';
    $('gen-time').textContent = '';
    $('gen-time').appendChild(ICONS.node('clock', 14));
    $('gen-time').appendChild(document.createTextNode(T('create.elapsed', { n: s })));
  }
  // The little paper on the waiting screen fills with lines, the way a teacher writes a paper.
  function writeLines() {
    var body = gen.querySelector('.gp-body');
    if (body.childElementCount > 13) body.textContent = '';
    var kind = body.childElementCount % 5 === 0 ? 'h' : 'l';
    var line = el('i', kind); line.style.setProperty('--w', (kind === 'h' ? 42 : 58 + Math.round(Math.random() * 38)) + '%');
    body.appendChild(line);
  }
  document.addEventListener('generationstart', function () {
    busy = true; form.setAttribute('aria-busy', 'true');
    gen.hidden = false; document.body.classList.add('generating');
    $('gen-cancel').disabled = false; $('gen-bar').style.width = '4%';
    gen.querySelector('.gp-body').textContent = '';
    var lv = TPL.findLevel($('level').value);
    $('gen-sub').textContent = TPL.subjectLabel($('subject').value, lv.id, I18N.lang) + ' · ' + (lv[I18N.lang] || lv.fr) + ' · ' + $('sum-2').textContent;
    started = Date.now(); stage('drafting'); tick(); tipIndex = 0; tip();
    timer = setInterval(tick, 500);
    tipTimer = setInterval(function () { tipIndex++; tip(); }, 6000);
    writeTimer = setInterval(writeLines, 650);
    $('gen-cancel').focus();
  });
  document.addEventListener('generationstage', function (e) { stage(e.detail); tick(); });
  document.addEventListener('generationend', function () {
    busy = false; clearInterval(timer); clearInterval(tipTimer); clearInterval(writeTimer); form.removeAttribute('aria-busy');
    gen.hidden = true; document.body.classList.remove('generating');
    show(step, true);
  });
  $('gen-cancel').addEventListener('click', function () { this.disabled = true; document.dispatchEvent(new CustomEvent('cancelgeneration')); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && busy) $('gen-cancel').click(); });

  // home.js writes errors into #status; give them the error look and bring the user back to see them.
  new MutationObserver(function () {
    var s = $('status');
    if (s.classList.contains('error') && !s.querySelector('svg')) { var m = s.textContent; setStatus(m, 'error'); }
  }).observe($('status'), { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  I18N.apply(document); ICONS.hydrate(document);
  refreshProvider(); meter(); show(0, true);
})();
