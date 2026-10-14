// Home page: add a lesson, choose options, create an exam.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var T = function (k, v) { return I18N.t(k, v); };
  var nm = function (o) { return o[I18N.lang] || o.fr; };

  var lessonEl = $('lesson');
  var lessonStatus = $('lessonstatus');
  var status = $('status');
  var go = $('go');
  var zone = $('zone');
  var chips = $('chips');
  var fileInput = $('file');
  var files = []; // { id, name, text, state: 'reading' | 'ok' | 'error', note, noteKey }
  var nextId = 1;
  var generationController = null;
  document.addEventListener('cancelgeneration', function () { if (generationController) generationController.abort(); });

  function countLesson() {
    var n = lessonEl.value.trim().length;
    lessonStatus.textContent = n ? T('lesson.chars', { n: n.toLocaleString() }) : '';
    document.dispatchEvent(new CustomEvent('lessonchange', { detail: n }));
  }
  lessonEl.addEventListener('input', countLesson);

  // Upload and paste sit side by side, so "showing" the paste box only moves the focus there.
  function showTab(name) {
    if (name === 'text') lessonEl.focus();
  }

  function extOf(name) { var m = /\.([a-z0-9]+)$/i.exec(name); return m ? m[1].toLowerCase() : ''; }

  function addText(text) {
    var cur = lessonEl.value.trim();
    lessonEl.value = cur ? cur + '\n\n' + text : text;
    countLesson();
  }

  function renderChips() {
    chips.textContent = '';
    zone.classList.toggle('compact', files.length > 0);
    files.forEach(function (f) {
      var li = document.createElement('li');
      li.className = 'file-row ' + f.state;
      var badge = document.createElement('span');
      badge.className = 'badge';
      badge.appendChild(ICONS.node(f.state === 'error' ? 'alert' : 'filetext', 18));
      var ext = document.createElement('b');
      ext.textContent = (extOf(f.name) || 'file').toUpperCase();
      badge.appendChild(ext);
      var name = document.createElement('span');
      name.className = 'fname';
      name.textContent = f.name;
      name.dir = 'auto';
      var meta = document.createElement('span');
      meta.className = 'fmeta';
      if (f.state === 'ok') meta.appendChild(ICONS.node('checkcircle', 14));
      meta.appendChild(document.createTextNode(f.state === 'reading' ? T('file.reading')
        : f.state === 'error' ? (f.noteKey ? T(f.noteKey) : f.note)
        : T('file.chars', { n: f.text.length.toLocaleString() })));
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-btn tiny';
      del.setAttribute('aria-label', T('file.remove', { name: f.name }));
      del.title = T('file.remove', { name: f.name });
      del.appendChild(ICONS.node('x', 16));
      del.addEventListener('click', function () {
        if (f.state === 'ok' && f.text) lessonEl.value = lessonEl.value.replace(f.text, '').replace(/\n{3,}/g, '\n\n').trim();
        files = files.filter(function (x) { return x.id !== f.id; });
        countLesson();
        renderChips();
      });
      li.appendChild(badge); li.appendChild(name); li.appendChild(meta); li.appendChild(del);
      chips.appendChild(li);
    });
  }

  function readOne(file) {
    var entry = { id: nextId++, name: file.name, text: '', state: 'reading', note: '', noteKey: '' };
    files.push(entry);
    renderChips();
    var ext = extOf(file.name);
    var finish = function (text) { if (files.indexOf(entry) < 0) return; entry.text = text.trim(); entry.state = 'ok'; addText(entry.text); renderChips(); };
    var fail = function (msg, isKey) { entry.state = 'error'; if (isKey) entry.noteKey = msg; else entry.note = msg; renderChips(); };
    if (file.size > 10 * 1024 * 1024) return fail('file.toobig', true);
    if (['pdf', 'docx', 'txt', 'md'].indexOf(ext) < 0) return fail('file.unsupported', true);

    if (ext === 'txt' || ext === 'md') {
      var r = new FileReader();
      r.onload = function () { var text = String(r.result || ''); if (!text.trim()) return fail('file.empty', true); finish(text); };
      r.onerror = function () { fail('file.readfail', true); };
      r.readAsText(file);
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var base64 = String(reader.result).split(',')[1] || '';
      fetch('/api/extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: file.name, data: base64 }),
      })
        .then(function (res) { return res.json().then(function (j) { return { ok: res.ok, j: j }; }); })
        .then(function (out) {
          if (!out.ok) throw new Error(out.j.error || T('file.readfail'));
          if (!(out.j.text || '').trim()) throw new Error(T('file.nontext'));
          finish(out.j.text);
        })
        .catch(function (err) { fail(err.message); });
    };
    reader.onerror = function () { fail('file.readfail', true); };
    reader.readAsDataURL(file);
  }

  function addFiles(list) {
    Array.prototype.slice.call(list || []).forEach(readOne);
    fileInput.value = '';
  }

  fileInput.addEventListener('change', function (e) { addFiles(e.target.files); });

  // Drag and drop on the whole card
  var card = $('dropcard');
  var depth = 0;
  card.addEventListener('dragenter', function (e) { e.preventDefault(); depth++; zone.classList.add('drag'); showTab('files'); });
  card.addEventListener('dragover', function (e) { e.preventDefault(); });
  card.addEventListener('dragleave', function () { depth = Math.max(0, depth - 1); if (!depth) zone.classList.remove('drag'); });
  card.addEventListener('drop', function (e) {
    e.preventDefault();
    depth = 0;
    zone.classList.remove('drag');
    addFiles(e.dataTransfer && e.dataTransfer.files);
  });
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('drop', function (e) { e.preventDefault(); });

  // Paste anywhere: files from the clipboard, or plain text into the lesson
  window.addEventListener('paste', function (e) {
    if (document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    var cd = e.clipboardData;
    if (!cd) return;
    if (cd.files && cd.files.length) { addFiles(cd.files); return; }
    var text = cd.getData('text');
    if (text && text.trim()) { addText(text.trim()); showTab('text'); }
  });

  // ---------- Template state (hidden selects) ----------
  var levelEl = $('level'), subjectEl = $('subject'), kindEl = $('kind'), numEl = $('num');
  var langEl = $('lang'), exEl = $('exercises'), titleEl = $('title'), supportEl = $('support');
  var titleTouched = false;
  var langTouched = false;
  var showAll = false;
  var built = false;

  function opt(value, text) { var o = document.createElement('option'); o.value = value; o.textContent = text; return o; }

  TPL.LEVELS.forEach(function (g) {
    var og = document.createElement('optgroup');
    og.label = g.group.fr;
    g.items.forEach(function (l) { og.appendChild(opt(l.id, l.fr)); });
    levelEl.appendChild(og);
  });
  levelEl.value = 'b9';
  TPL.SUBJECTS.forEach(function (s) { subjectEl.appendChild(opt(s.id, s.fr)); });
  Object.keys(TPL.KINDS).forEach(function (k) { kindEl.appendChild(opt(k, TPL.KINDS[k].fr)); });
  Object.keys(TPL.LANGS).forEach(function (l) { langEl.appendChild(opt(l, TPL.LANGS[l])); });
  for (var n = 1; n <= 6; n++) exEl.appendChild(opt(String(n), String(n)));

  function fillNums() {
    var nums = TPL.KINDS[kindEl.value].nums;
    var prev = numEl.value;
    numEl.textContent = '';
    nums.forEach(function (x) { numEl.appendChild(opt(String(x), x ? String(x) : '–')); });
    if (nums.map(String).indexOf(prev) >= 0) numEl.value = prev;
    numEl.disabled = nums.length === 1 && nums[0] === 0;
  }

  function refreshTitle() {
    if (titleTouched) return;
    titleEl.value = TPL.kindTitle(kindEl.value, parseInt(numEl.value, 10) || 0, langEl.value);
  }

  // Every class and subject has its own blueprint (counts, exercises, language, marks, duration).
  function applySubject() {
    var p = TPL.plan(subjectEl.value, levelEl.value);
    ['mcq', 'tf', 'short', 'essay'].forEach(function (t) { $('n-' + t).value = p.counts[t]; });
    exEl.value = String(p.ex);
    if (!langTouched) langEl.value = p.lang;
    supportEl.checked = !!p.support;
    $('support-row').hidden = !p.support;
    refreshTitle();
    syncUI();
  }

  // When the class changes, keep the subject if that class has it; otherwise pick its first subject.
  function onLevelChange() {
    if (typeof clearRef === 'function') clearRef();
    var ids = TPL.subjectIdsFor(levelEl.value);
    if (ids.indexOf(subjectEl.value) < 0 && !showAll) {
      subjectEl.value = ids[0];
      langTouched = false;
      applySubject();
      return;
    }
    applySubject();
  }

  titleEl.addEventListener('input', function () { titleTouched = true; });
  subjectEl.addEventListener('change', function () { langTouched = false; if (typeof clearRef === 'function') clearRef(); applySubject(); });
  levelEl.addEventListener('change', onLevelChange);
  kindEl.addEventListener('change', function () { fillNums(); refreshTitle(); });
  numEl.addEventListener('change', refreshTitle);
  langEl.addEventListener('change', refreshTitle);
  fillNums();
  numEl.value = '1';
  subjectEl.value = TPL.subjectIdsFor(levelEl.value)[0];

  // ---------- Visual pickers (drive the hidden selects) ----------
  var CYCLES = ['primary', 'base', 'sec'];

  function setSelect(sel, value) {
    sel.value = value;
    sel.dispatchEvent(new Event('change'));
  }

  function btn(cls, text, active, onClick, icon) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = cls + (active ? ' on' : '');
    b.setAttribute('aria-pressed', String(!!active));
    if (icon) b.appendChild(ICONS.node(icon, cls === 'tile' ? 20 : 16));
    if (typeof text === 'string') { var s = document.createElement('span'); s.textContent = text; b.appendChild(s); b.title = text; }
    else if (text) b.appendChild(text);
    b.addEventListener('click', onClick);
    return b;
  }
  var CYCLE_ICON = { primary: 'pencil', base: 'book', sec: 'cap' };

  function segFor(container, sel, labelOf) {
    container.textContent = '';
    Array.prototype.forEach.call(sel.options, function (o) {
      container.appendChild(btn('seg-b', labelOf(o), sel.value === o.value, function () { setSelect(sel, o.value); }));
    });
  }

  function allLevels() {
    return TPL.LEVELS.map(function (g) { return g.items; }).reduce(function (a, b) { return a.concat(b); }, []);
  }
  function yearOf(id) { return id.charAt(0) === 's' ? id.charAt(1) : ''; }

  // Short label for a class chip, in the interface language only.
  function shortLevel(l) {
    return nm(l)
      .replace(' année de base', '').replace(' année primaire', '')
      .replace(' أساسي', '').replace(' ابتدائي', '')
      .replace(' (basic)', '');
  }
  function sectionName(l) {
    return nm(l)
      .replace(/^\d+ème /, '').replace(/^(الأولى|الثانية|الثالثة|الرابعة) /, '').replace(/^\d(?:st|nd|rd|th) /, '')
      .replace(/ \((?:Bac|باك)\)$/, '');
  }

  function syncUI() {
    if (!built) return;
    var lv = TPL.findLevel(levelEl.value);

    // cycle
    var cs = $('cycle-seg');
    cs.textContent = '';
    CYCLES.forEach(function (c) {
      cs.appendChild(btn('seg-b', T('cycle.' + c), lv.cycle === c, function () {
        var inC = allLevels().filter(function (l) { return l.cycle === c; });
        setSelect(levelEl, (c === 'sec' ? inC[0] : inC[2]).id);
      }, CYCLE_ICON[c]));
    });

    // years (lycée only) and class chips
    var inCycle = allLevels().filter(function (l) { return l.cycle === lv.cycle; });
    var ys = $('year-seg');
    var lc = $('level-chips');
    ys.textContent = '';
    lc.textContent = '';
    if (lv.cycle === 'sec') {
      ys.hidden = false;
      ['1', '2', '3', '4'].forEach(function (y) {
        ys.appendChild(btn('seg-b', T('year.' + y), yearOf(lv.id) === y, function () {
          setSelect(levelEl, inCycle.filter(function (l) { return yearOf(l.id) === y; })[0].id);
        }));
      });
      var sections = inCycle.filter(function (l) { return yearOf(l.id) === yearOf(lv.id); });
      if (sections.length > 1) {
        sections.forEach(function (l) {
          lc.appendChild(btn('chip', sectionName(l), lv.id === l.id, function () { setSelect(levelEl, l.id); }));
        });
      }
    } else {
      ys.hidden = true;
      inCycle.forEach(function (l) {
        lc.appendChild(btn('chip', shortLevel(l), lv.id === l.id, function () { setSelect(levelEl, l.id); }));
      });
    }
    lc.hidden = !lc.childNodes.length;

    // subjects: only this class's subjects, unless "all" is on
    var ids = showAll ? TPL.SUBJECTS.map(function (s) { return s.id; }) : TPL.subjectIdsFor(levelEl.value);
    var grid = $('subject-grid');
    grid.textContent = '';
    // Main subjects first, then the optional languages under their own heading.
    ids = ids.filter(function (id) { return !TPL.isOption(id); }).concat(ids.filter(TPL.isOption));
    ids.forEach(function (id) {
      var s = TPL.findSubject(id);
      if (TPL.isOption(id) && !grid.querySelector('.opt-head')) {
        var head = document.createElement('div');
        head.className = 'opt-head';
        head.appendChild(ICONS.node('lang', 15));
        head.appendChild(document.createTextNode(T('ui.options')));
        grid.appendChild(head);
      }
      grid.appendChild(btn('tile', TPL.subjectLabel(s.id, levelEl.value, I18N.lang), subjectEl.value === s.id, function () { setSelect(subjectEl, s.id); }, ICONS.subject(s.id)));
    });
    $('subj-toggle').textContent = showAll ? T('subj.fewer') : T('subj.all');
    if (typeof drawDesigns === 'function') drawDesigns();
    var p = TPL.plan(subjectEl.value, levelEl.value);
    var minutes = p.dur[kindEl.value === 'synthese' ? 'synthese' : 'control'];
    var sum = T('plan.sum', { dur: TPL.fmtDuration(minutes, I18N.lang), ex: p.ex, split: p.split.join(' / ') });
    sum += p.n ? T('plan.from', { n: p.n }) : T('plan.generic');
    if (ref && ref.a && ref.a.usable && ref.a.ex) {
      sum = T('ref.chosenSum', { ex: ref.a.ex, split: ref.a.split ? ' (' + ref.a.split.join(' / ') + ')' : '' });
    }
    $('plan-sum').textContent = sum;

    segFor($('kind-seg'), kindEl, function (o) { return T('kind.' + o.value); });
    segFor($('num-seg'), numEl, function (o) { return o.value === '0' ? '–' : T('num.no', { n: o.textContent }); });
    $('num-seg').hidden = numEl.disabled;
    segFor($('lang-seg'), langEl, function (o) { return o.textContent; });
    segFor($('diff-seg'), $('difficulty'), function (o) { return T('diff.' + o.value); });
    segFor($('choices-seg'), $('choices'), function (o) { return o.textContent; });
    $('ex-val').textContent = exEl.value;
    sumQuestions();
    document.dispatchEvent(new CustomEvent('examplanchange'));
  }

  function sumQuestions() {
    var n = ['mcq', 'tf', 'short', 'essay'].reduce(function (t, k) { return t + (parseInt($('n-' + k).value, 10) || 0); }, 0);
    $('qsum').textContent = T('q.sum', { n: n });
  }

  function buildPickers() {
    built = true;
    document.querySelectorAll('[data-step]').forEach(function (b) {
      b.addEventListener('click', function () {
        var inp = $(b.getAttribute('data-step'));
        var max = parseInt(inp.max, 10) || 30;
        inp.value = Math.max(0, Math.min(max, (parseInt(inp.value, 10) || 0) + parseInt(b.getAttribute('data-d'), 10)));
        sumQuestions();
      });
    });
    ['mcq', 'tf', 'short', 'essay'].forEach(function (k) { $('n-' + k).addEventListener('input', sumQuestions); });
    $('ex-minus').addEventListener('click', function () { setSelect(exEl, String(Math.max(1, parseInt(exEl.value, 10) - 1))); });
    $('ex-plus').addEventListener('click', function () { setSelect(exEl, String(Math.min(6, parseInt(exEl.value, 10) + 1))); });
    $('subj-toggle').addEventListener('click', function () { showAll = !showAll; syncUI(); });
    langEl.addEventListener('change', function () { langTouched = true; });
    [subjectEl, kindEl, numEl, langEl, exEl, levelEl].forEach(function (s) { s.addEventListener('change', syncUI); });
    applySubject();
  }

  function num(id, fallback) {
    var v = parseInt($(id).value, 10);
    return isNaN(v) ? fallback : Math.max(0, v);
  }

  $('make').addEventListener('submit', function (e) {
    e.preventDefault();
    status.className = 'status';
    var lesson = lessonEl.value.trim();
    if (lesson.length < 200) {
      status.className = 'status error';
      status.textContent = T('err.lesson');
      return;
    }
    var counts = { mcq: num('n-mcq', 0), tf: num('n-tf', 0), short: num('n-short', 0), essay: num('n-essay', 0) };
    var points = { mcq: num('p-mcq', 1), tf: num('p-tf', 1), short: num('p-short', 2), essay: num('p-essay', 5) };
    if (!Object.keys(counts).some(function (k) { return counts[k] > 0; })) {
      status.className = 'status error';
      status.textContent = T('err.noq');
      return;
    }

    go.disabled = true;
    generationController = new AbortController();
    document.dispatchEvent(new CustomEvent('generationstart'));
    status.textContent = T('go.status');

    fetch('/api/exams/generate?stream=1', {
      method: 'POST',
      signal: generationController.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        lesson: lesson,
        title: titleEl.value.trim() || TPL.kindTitle(kindEl.value, parseInt(numEl.value, 10) || 0, langEl.value),
        useSupport: supportEl.checked,
        design: currentDesign(),
        header: { school: $('school-name') ? $('school-name').value.trim() : '', teacher: $('teacher-name') ? $('teacher-name').value.trim() : '' },
        answerSpace: !$('create-answer-space') || $('create-answer-space').checked,
        refPaper: ref ? ref.id : undefined,
        refLabel: ref ? ref.label : undefined,
        ai: AISettings.payload(),
        options: {
          counts: counts,
          points: points,
          choices: parseInt($('choices').value, 10),
          difficulty: $('difficulty').value,
          tpl: {
            level: levelEl.value, subject: subjectEl.value, kind: kindEl.value,
            num: parseInt(numEl.value, 10) || 0, lang: langEl.value, exercises: parseInt(exEl.value, 10),
          },
        },
      }),
    })
      .then(async function (res) {
        if (!res.ok || !res.body || !(res.headers.get('content-type') || '').includes('ndjson')) return { ok: res.ok, j: await res.json() };
        var reader = res.body.getReader(), decoder = new TextDecoder(), buffer = '', result;
        function line(value) {
          if (!value.trim()) return;
          var event = JSON.parse(value);
          if (event.type === 'stage') document.dispatchEvent(new CustomEvent('generationstage', { detail: event.stage }));
          if (event.type === 'error') throw new Error(event.error);
          if (event.type === 'complete') result = event;
        }
        while (true) { var chunk = await reader.read(); if (chunk.done) break; buffer += decoder.decode(chunk.value, { stream: true }); var lines = buffer.split('\n'); buffer = lines.pop(); lines.forEach(line); }
        buffer += decoder.decode(); if (buffer.trim()) line(buffer);
        if (!result) throw new Error(T('err.generic'));
        return { ok: true, j: result };
      })
      .then(function (out) {
        if (!out.ok) throw new Error(out.j.error || T('err.generic'));
        // The edit key lives in the URL fragment, so it is never sent to the server by the browser.
        window.location.href = '/e/' + out.j.id + '#k=' + encodeURIComponent(out.j.editKey);
      })
      .catch(function (err) {
        go.disabled = false;
        document.dispatchEvent(new CustomEvent('generationend'));
        status.className = 'status error';
        status.textContent = err.name === 'AbortError' ? T('create.cancelled') : err.message;
      });
  });

  document.addEventListener('uilangchange', function () {
    syncUI();
    renderChips();
    countLesson();
    if (status.textContent && !go.disabled) status.textContent = '';
  });

  // ---------- A real paper as the starting point ----------
  var ref = null; // { id, label, a: analysis }

  function elx(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // ---------- Page design (auto by class and language, or chosen) ----------
  var designPick = '';
  function currentDesign() { return designPick || TPL.defaultDesign(levelEl.value, langEl.value); }

  function thumb(d) {
    var t = elx('span', 'thumb thumb-' + d);
    t.setAttribute('aria-hidden', 'true');
    var parts = {
      lycee: ['box', 'ln c', 'ln', 'ln w', 'strip', 'ln s', 'ln s'],
      college: ['top', 'ttl', 'ln c', 'rule', 'ln s', 'ln s'],
      institut: ['band', 'ln s r', 'ln s r', 'frame', 'ln s r', 'ln s r'],
      clean: ['ttlbox', 'ln c', 'ln s', 'ln s', 'ln s'],
    }[d];
    parts.forEach(function (c) { t.appendChild(elx('i', c)); });
    return t;
  }

  function drawDesigns() {
    var box = $('design-tiles');
    if (!box) return;
    box.textContent = '';
    var cur = currentDesign();
    TPL.DESIGNS.forEach(function (d) {
      var b = elx('button', 'dtile' + (cur === d ? ' on' : ''));
      b.type = 'button';
      b.setAttribute('aria-pressed', String(cur === d));
      b.appendChild(thumb(d));
      b.appendChild(elx('span', 'dname', T('design.' + d)));
      b.addEventListener('click', function () { designPick = d; drawDesigns(); });
      box.appendChild(b);
    });
  }

  // ---------- A small PDF page viewer (pdf.js), so previews work in every browser ----------
  var pdfLoading = null;
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (pdfLoading) return pdfLoading;
    pdfLoading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = function () {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve(window.pdfjsLib);
      };
      s.onerror = function () { pdfLoading = null; reject(new Error('pdf.js')); };
      document.head.appendChild(s);
    });
    return pdfLoading;
  }

  function pdfViewer(url) {
    var wrap = elx('div', 'pv');
    var bar = elx('div', 'pv-bar');
    var prev = elx('button', 'pv-b', '‹');
    var next = elx('button', 'pv-b', '›');
    prev.type = 'button'; next.type = 'button';
    var label = elx('span', 'pv-n', '');
    bar.appendChild(prev); bar.appendChild(label); bar.appendChild(next);
    var scroll = elx('div', 'pv-scroll');
    var canvas = document.createElement('canvas');
    canvas.className = 'pv-canvas';
    scroll.appendChild(canvas);
    wrap.appendChild(bar);
    wrap.appendChild(scroll);
    var doc = null, page = 1, token = 0;

    function draw() {
      if (!doc) return;
      var my = ++token;
      label.textContent = T('ref.page', { i: page, n: doc.numPages });
      prev.disabled = page <= 1;
      next.disabled = page >= doc.numPages;
      doc.getPage(page).then(function (p) {
        var width = Math.max(320, scroll.clientWidth - 8);
        var vp0 = p.getViewport({ scale: 1 });
        var vp = p.getViewport({ scale: (width / vp0.width) * (window.devicePixelRatio > 1 ? 1.5 : 1.2) });
        if (my !== token) return;
        canvas.width = vp.width;
        canvas.height = vp.height;
        canvas.style.width = width + 'px';
        canvas.style.height = (vp.height / vp.width) * width + 'px';
        return p.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      }).catch(function () { /* a cancelled render is fine */ });
    }

    prev.addEventListener('click', function () { if (page > 1) { page--; draw(); } });
    next.addEventListener('click', function () { if (doc && page < doc.numPages) { page++; draw(); } });
    label.textContent = T('ref.loading');
    loadPdfJs().then(function (lib) { return lib.getDocument(url).promise; })
      .then(function (d) { doc = d; draw(); })
      .catch(function () { label.textContent = T('ref.unreadable'); });
    return wrap;
  }

  function paperLabel(it) {
    var kind = (it.kind === 'control' || it.kind === 'synthese')
      ? T('kind.' + it.kind) + (it.num ? ' ' + T('num.no', { n: it.num }) : '')
      : T('ref.other');
    var bits = [kind];
    if (it.trimester) bits.push(T('ref.term', { n: it.trimester }));
    if (it.year) bits.push(it.year);
    if (it.author) bits.push(it.author);
    return bits.join(' · ');
  }

  function drawRef() {
    var chip = $('ref-chip');
    chip.hidden = !ref;
    var rb = $('ref-btn'), rl = rb.querySelector('.lab') || rb.appendChild(document.createElement('span'));
    rl.className = 'lab';
    rl.textContent = ref ? T('ref.change') : T('ref.choose');
    if (ref) {
      $('ref-label').textContent = ref.label;
      $('ref-note').textContent = ref.a && ref.a.usable ? T('ref.hint') : T('ref.unreadable');
    } else {
      $('ref-note').textContent = T('ref.hint');
    }
  }

  function clearRef() { ref = null; drawRef(); syncUI(); }
  $('ref-clear').addEventListener('click', clearRef);

  function analysisCard(a) {
    var box = elx('div', 'pp-card');
    if (!a.usable) { box.appendChild(elx('p', 'bad', T('ref.unreadable'))); return box; }
    var bits = [];
    if (a.ex) bits.push(T('ref.ex', { n: a.ex }));
    if (a.split) bits.push(a.split.join(' / ') + ' ' + T('ref.marks'));
    if (a.minutes) bits.push(TPL.fmtDuration(a.minutes, I18N.lang));
    if (a.coef) bits.push(T('ref.coef', { c: a.coef }));
    bits.push(TPL.LANGS[a.lang] || a.lang);
    box.appendChild(elx('p', '', bits.join(' · ')));
    if (a.titles && a.titles.length) box.appendChild(elx('p', 'hint', a.titles.slice(0, 5).join(' | ')));
    return box;
  }

  function useRef(it, a) {
    ref = { id: it.id, label: paperLabel(it), a: a };
    if (a.usable) {
      if (a.ex >= 1) exEl.value = String(Math.min(6, a.ex));
      if (TPL.LANGS[a.lang]) { langEl.value = a.lang; langTouched = true; }
    }
    if (it.kind === 'control' || it.kind === 'synthese') {
      kindEl.value = it.kind;
      kindEl.dispatchEvent(new Event('change'));
      if (it.num && Array.prototype.some.call(numEl.options, function (o) { return o.value === String(it.num); })) {
        numEl.value = String(it.num);
        numEl.dispatchEvent(new Event('change'));
      }
    }
    refreshTitle();
    drawRef();
    syncUI();
  }

  function openPapers() {
    var dlg = elx('dialog', 'dlg wide');
    dlg.dir = I18N.dir;
    var head = elx('div', 'dlg-head');
    head.appendChild(elx('h2', '', T('ref.title')));
    var x = elx('button', 'dlg-x');
    x.appendChild(ICONS.node('x'));
    x.type = 'button';
    x.setAttribute('aria-label', T('set.close'));
    x.addEventListener('click', function () { dlg.close(); dlg.remove(); });
    head.appendChild(x);
    dlg.appendChild(head);

    var sub = TPL.subjectLabel(subjectEl.value, levelEl.value, I18N.lang);
    var lvl = nm(TPL.findLevel(levelEl.value));
    dlg.appendChild(elx('p', 'hint', lvl + ' · ' + sub));

    var grid = elx('div', 'pp');
    var listBox = elx('div', 'pp-list');
    var view = elx('div', 'pp-view');
    view.appendChild(elx('p', 'hint pp-empty', T('ref.pick')));
    grid.appendChild(listBox);
    grid.appendChild(view);
    dlg.appendChild(grid);
    document.body.appendChild(dlg);
    dlg.addEventListener('click', function (e) { if (e.target === dlg) { dlg.close(); dlg.remove(); } });
    dlg.addEventListener('close', function () { dlg.remove(); });
    dlg.showModal();

    function select(it, btnEl) {
      listBox.querySelectorAll('.pp-item').forEach(function (b) { b.classList.remove('on'); });
      btnEl.classList.add('on');
      view.textContent = '';
      view.appendChild(elx('p', 'hint', T('ref.loading')));
      fetch('/api/papers/analyze?id=' + encodeURIComponent(it.id))
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (out) {
          view.textContent = '';
          var a = out.ok ? out.j : { usable: false };
          view.appendChild(analysisCard(a));
          var use = elx('button', 'btn primary', T('ref.use'));
          use.type = 'button';
          use.addEventListener('click', function () { useRef(it, a); dlg.close(); dlg.remove(); });
          view.appendChild(use);
          view.appendChild(pdfViewer('/api/papers/file?id=' + encodeURIComponent(it.id)));
        })
        .catch(function () { view.textContent = ''; view.appendChild(elx('p', 'bad', T('ref.unreadable'))); });
    }

    fetch('/api/papers?level=' + encodeURIComponent(levelEl.value) + '&subject=' + encodeURIComponent(subjectEl.value))
      .then(function (r) { return r.json(); })
      .then(function (out) {
        listBox.textContent = '';
        if (!out.available) { listBox.appendChild(elx('p', 'hint', T('ref.nodir'))); return; }
        if (!out.items.length) { listBox.appendChild(elx('p', 'hint', T('ref.none'))); return; }
        out.items.forEach(function (it) {
          var b = elx('button', 'pp-item');
          b.type = 'button';
          var t1 = elx('span', 'pp-t', paperLabel(it));
          t1.dir = 'auto';
          b.appendChild(t1);
          b.appendChild(elx('span', 'pp-s', it.kb + ' KB'));
          b.addEventListener('click', function () { select(it, b); });
          listBox.appendChild(b);
        });
      })
      .catch(function () { listBox.textContent = ''; listBox.appendChild(elx('p', 'hint', T('ref.nodir'))); });
  }
  $('ref-btn').addEventListener('click', openPapers);
  drawRef();

  window.ExamSetup = { preview: function () { return { reference: ref && ref.a, design: currentDesign() }; } };
  buildPickers();
})();
