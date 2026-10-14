// Exam page: view, edit (with autosave), print, Word download, share links.
// The edit key is read from the URL fragment (#k=...). Without it the page is view-only.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var LETTERS = 'ABCDEFGH';
  var T = function (k, v) { return I18N.t(k, v); };
  var TYPE_NAME = {};
  ['mcq', 'tf', 'short', 'essay'].forEach(function (k) {
    Object.defineProperty(TYPE_NAME, k, { get: function () { return T('type.' + k + '.long'); } });
  });

  var S = null;            // exam state
  var examId = '';
  var key = '';            // edit key, empty for view-only
  var editable = false;
  var totalEl = null;
  var saveTimer = null;
  var saveChain = Promise.resolve();
  var studentPreview = false;
  var editVersion = 0;
  var savedVersion = 0;

  function rid() { return Math.random().toString(36).slice(2, 10); }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function parseRes(res) {
    return res.json().then(function (j) { return { ok: res.ok, status: res.status, j: j }; });
  }

  // Short messages at the bottom of the screen. A "busy" toast stays until the next one replaces it.
  var busyToast = null;
  function toast(msg, kind) {
    var box = $('toasts');
    if (busyToast) { busyToast.remove(); busyToast = null; }
    if (!msg) return;
    var t = el('div', 'toast ' + (kind || 'info'));
    t.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    t.appendChild(window.ICONS.node({ ok: 'checkcircle', error: 'alert', busy: 'loader', info: 'info' }[kind || 'info'] || 'info', 18));
    t.appendChild(el('span', '', msg));
    box.appendChild(t);
    if (kind === 'busy') { busyToast = t; return; }
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 220); }, kind === 'error' ? 7000 : 3500);
  }
  function showError(msg) {
    $('error').textContent = msg;
    toast(msg, 'error');
  }

  function setSaved(msg, state) {
    if (!editable) return;
    var s = $('saved');
    s.textContent = '';
    s.className = 'saved' + (state === 'err' ? ' err' : '');
    s.appendChild(window.ICONS.node(state === 'err' ? 'alert' : state === 'busy' ? 'loader' : 'cloud', 14));
    s.appendChild(document.createTextNode(msg));
  }
  function exportConfig() {
    return { id: examId, key: editable ? key : '', exam: function () { return S; }, error: showError, toast: toast };
  }

  // Normalise a question from the server so the editor has what it needs.
  function normaliseQ(q) {
    q.choices = Array.isArray(q.choices) ? q.choices.slice() : [];
    if (q.type === 'mcq') {
      if (q.choices.length < 2) q.choices = [0, 1, 2, 3].map(function (j) { return LB().choice(j); });
      var idx = q.choices.indexOf(q.answer);
      q.correctIndex = idx < 0 ? 0 : idx;
      q.answer = q.choices[q.correctIndex];
    } else {
      q.choices = [];
      q.correctIndex = 0;
    }
    if (q.type === 'tf') q.answer = q.answer === 'False' ? 'False' : 'True';
    q.points = Number(q.points) || 0;
    q.image = q.image || null;
    return q;
  }

  function syncAnswer(q) {
    if (q.type === 'mcq') q.answer = q.choices[q.correctIndex] || '';
  }

  function totalPoints() {
    return S.questions.reduce(function (n, q) { return n + (Number(q.points) || 0); }, 0);
  }

  // Editable text. Single-line fields ignore Enter and paste as plain text.
  // With math = true the text is typeset (LaTeX between $...$) while idle and shown as raw text while editing.
  function editableEl(tag, cls, value, onChange, multiline, math) {
    var e = el(tag, cls, math ? '' : (value || ''));
    var raw = value || '';
    if (math) e.innerHTML = MathR.render(raw);
    if (!editable || studentPreview) return e;
    e.contentEditable = 'true';
    e.spellcheck = true;
    e.addEventListener('keydown', function (ev) {
      if (!multiline && ev.key === 'Enter') { ev.preventDefault(); e.blur(); }
    });
    e.addEventListener('paste', function (ev) {
      ev.preventDefault();
      var t = (ev.clipboardData || window.clipboardData).getData('text') || '';
      if (!multiline) t = t.replace(/\s*\n+\s*/g, ' ');
      document.execCommand('insertText', false, t);
    });
    e.addEventListener('input', function () {
      raw = multiline ? e.innerText : e.textContent;
      onChange(raw);
      scheduleSave();
    });
    if (math) {
      e.addEventListener('focus', function () { e.textContent = raw; e.classList.add('editing'); });
      e.addEventListener('blur', function () { e.classList.remove('editing'); e.innerHTML = MathR.render(raw); });
    }
    return e;
  }

  // Static (not editable) text with maths, as a span.
  function mathSpan(text) {
    var sp = el('span');
    sp.innerHTML = MathR.render(text);
    return sp;
  }

  function button(label, onClick, extra) {
    var b = el('button', 'btn small quiet' + (extra ? ' ' + extra : ''), label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  // ---------- Rendering ----------

  function lang() { return (S.tpl && S.tpl.lang) || 'en'; }
  function LB() { return TPL.L[lang()]; }
  function letterOf(j) { return LB().letters[j] + (lang() === 'ar' ? ' -' : '.'); }
  function unitOf() { return LB().pts(2).replace(/^2\s*/, ''); }

  // One labelled header field: "Label : ........" (the value is editable).
  function fieldEl(label, key, cls) {
    var wrap = el('div', 'hf' + (cls ? ' ' + cls : ''));
    wrap.appendChild(el('span', 'hl', label + ' :'));
    var v = editableEl('span', 'fld', S[key], function (val) { S[key] = val; }, false);
    wrap.appendChild(v);
    return wrap;
  }

  var groupPtsEls = [];

  function groupPoints(g) {
    return S.questions.reduce(function (n, q) { return n + (q.group === g ? (Number(q.points) || 0) : 0); }, 0);
  }

  function fmtNum(n) { return String(Math.round(n * 100) / 100); }

  function updateTotal() {
    if (totalEl) totalEl.textContent = fmtNum(totalPoints());
    groupPtsEls.forEach(function (node, g) { if (node) node.textContent = ' (' + LB().pts(fmtNum(groupPoints(g))) + ')'; });
    S.questions.forEach(function (q) { var node = document.getElementById('marks-' + q.id); if (node) node.textContent = LB().pts(fmtNum(q.points)); });
    var warn = $('mark-warning');
    if (warn) { warn.hidden = Math.abs(totalPoints() - 20) < 0.001; warn.textContent = T('studio.markwarning', { n: fmtNum(totalPoints()) }); }
    var mt = $('mark-total');
    if (mt) {
      var off = Math.abs(totalPoints() - 20) >= 0.001;
      mt.classList.toggle('bad', off);
      mt.lastElementChild.textContent = off ? T('studio.markwarning', { n: fmtNum(totalPoints()) }) : T('ed.total', { n: fmtNum(totalPoints()) });
    }
  }

  // ---------- Page designs (modelled on real Tunisian papers) ----------

  function designOf() { return TPL.DESIGNS.indexOf(S.design) >= 0 ? S.design : 'clean'; }

  function logoEl() {
    var logo = el('div', 'logo-slot');
    if (S.logo) {
      var img = el('img');
      img.src = S.logo;
      img.alt = T('logo.ph');
      logo.appendChild(img);
    }
    return logo;
  }

  function schoolEl(cls) {
    var sch = editableEl('div', cls || 'school', S.school, function (v) { S.school = v; }, false);
    sch.setAttribute('data-ph', TPL.schoolPlaceholder((S.tpl && S.tpl.level) || 'b9', lang()));
    return sch;
  }

  function titleEl(cls) {
    return editableEl('div', cls || 'exam-title', S.title, function (v) {
      S.title = v;
      $('doc-name').textContent = v;
    }, false);
  }

  // Name line and the note box out of the total
  function studentRow(L) {
    var stu = el('div', 'tn-student');
    var nm = el('div', 'tn-line');
    nm.appendChild(el('span', 'hl', L.name + ' :'));
    nm.appendChild(el('span', 'blank'));
    nm.appendChild(el('span', 'hl', L.num + ' :'));
    nm.appendChild(el('span', 'blank short'));
    stu.appendChild(nm);
    var note = el('div', 'notebox');
    note.appendChild(el('div', 'nl', L.note));
    var nv = el('div', 'nv');
    nv.appendChild(el('span', 'blank'));
    nv.appendChild(document.createTextNode(' / '));
    totalEl = el('span', '', fmtNum(totalPoints()));
    nv.appendChild(totalEl);
    note.appendChild(nv);
    stu.appendChild(note);
    return stu;
  }

  function pagesStrip(L) {
    var strip = el('div', 'lh-strip');
    strip.appendChild(document.createTextNode(L.pagesA + ' '));
    strip.appendChild(editableEl('span', 'fld pg', S.nbPages, function (v) { S.nbPages = v; }, false));
    strip.appendChild(document.createTextNode(' ' + L.pagesB));
    return strip;
  }

  // Modern, airy layout: school and teacher, boxed title, year and class
  function headerClean(sheet, L) {
    var head = el('div', 'tn-head');
    var left = el('div', 'tn-col');
    var schoolRow = el('div', 'school-block');
    schoolRow.appendChild(logoEl());
    schoolRow.appendChild(schoolEl('school'));
    left.appendChild(schoolRow);
    left.appendChild(fieldEl(L.teacher, 'teacher'));
    head.appendChild(left);
    var mid = el('div', 'tn-col tn-mid');
    mid.appendChild(titleEl('exam-title'));
    mid.appendChild(fieldEl(L.subject, 'subject', 'big'));
    head.appendChild(mid);
    var right = el('div', 'tn-col tn-end');
    right.appendChild(fieldEl(L.year, 'year'));
    right.appendChild(fieldEl(L.classShort, 'className'));
    head.appendChild(right);
    sheet.appendChild(head);
    var meta = el('div', 'tn-meta');
    meta.appendChild(fieldEl(L.duration, 'duration'));
    meta.appendChild(fieldEl(L.coef, 'coef'));
    meta.appendChild(fieldEl(L.date, 'examDate'));
    sheet.appendChild(meta);
    sheet.appendChild(studentRow(L));
  }

  // Lycée: one bordered box, as on real lycée papers (school, title, section and coefficient, subject, teacher / duration / date)
  function headerLycee(sheet, L) {
    var box = el('div', 'lh-box');
    var top = el('div', 'lh-top');
    top.appendChild(logoEl());
    top.appendChild(schoolEl('lh-school'));
    top.appendChild(fieldEl(L.year, 'year', 'lh-year'));
    box.appendChild(top);
    box.appendChild(titleEl('lh-title'));
    var r1 = el('div', 'lh-row');
    r1.appendChild(fieldEl(L.classShort, 'className', 'up'));
    r1.appendChild(fieldEl(L.coef, 'coef'));
    box.appendChild(r1);
    var r2 = el('div', 'lh-row');
    r2.appendChild(fieldEl(L.subject, 'subject', 'up'));
    box.appendChild(r2);
    var r3 = el('div', 'lh-row');
    r3.appendChild(fieldEl(L.teacher, 'teacher'));
    r3.appendChild(fieldEl(L.duration, 'duration'));
    r3.appendChild(fieldEl(L.date, 'examDate'));
    box.appendChild(r3);
    box.appendChild(pagesStrip(L));
    sheet.appendChild(box);
    sheet.appendChild(studentRow(L));
  }

  // Collège: simple header, underlined title, one row of fields
  function headerCollege(sheet, L) {
    var top = el('div', 'ch-top');
    top.appendChild(logoEl());
    top.appendChild(schoolEl('ch-school'));
    top.appendChild(fieldEl(L.year, 'year', 'ch-year'));
    sheet.appendChild(top);
    sheet.appendChild(titleEl('ch-title'));
    sheet.appendChild(fieldEl(L.subject, 'subject', 'ch-sub'));
    var row = el('div', 'ch-row');
    row.appendChild(fieldEl(L.teacher, 'teacher'));
    row.appendChild(fieldEl(L.classShort, 'className'));
    row.appendChild(fieldEl(L.duration, 'duration'));
    row.appendChild(fieldEl(L.date, 'examDate'));
    sheet.appendChild(row);
    sheet.appendChild(studentRow(L));
  }

  // Institut (Arabic papers): coloured band with the institute and year, title in the middle, teacher on the other side
  function headerInstitut(sheet, L) {
    var band = el('div', 'ih-band');
    var a = el('div', 'ih-school');
    a.appendChild(logoEl());
    a.appendChild(schoolEl('ih-name'));
    a.appendChild(editableEl('div', 'ih-year', S.year, function (v) { S.year = v; }, false));
    band.appendChild(a);
    var b = el('div', 'ih-mid');
    b.appendChild(titleEl('ih-title'));
    b.appendChild(fieldEl(L.subject, 'subject', 'ih-line'));
    b.appendChild(fieldEl(L.classShort, 'className', 'ih-line'));
    band.appendChild(b);
    var c = el('div', 'ih-teacher');
    c.appendChild(fieldEl(L.teacher, 'teacher'));
    band.appendChild(c);
    sheet.appendChild(band);
    var meta = el('div', 'ih-meta');
    meta.appendChild(fieldEl(L.duration, 'duration'));
    meta.appendChild(fieldEl(L.coef, 'coef'));
    meta.appendChild(fieldEl(L.date, 'examDate'));
    sheet.appendChild(meta);
    sheet.appendChild(studentRow(L));
  }

  function renderHeader(sheet, L) {
    // The Republic / Ministry heading only appears on national papers, so it is optional.
    if (S.ministry) {
      var gov = el('div', 'tn-gov-line');
      gov.appendChild(el('span', '', L.republic));
      gov.appendChild(el('span', 'sep', '·'));
      gov.appendChild(el('span', '', L.ministry));
      sheet.appendChild(gov);
    }
    var box = el('header', 'paper-header');
    var identity = el('div', 'paper-identity');
    identity.appendChild(logoEl()); identity.appendChild(schoolEl('school'));
    identity.appendChild(fieldEl(L.year, 'year'));
    identity.appendChild(fieldEl(L.teacher, 'teacher'));
    var center = el('div', 'paper-heading');
    center.appendChild(titleEl('paper-title')); center.appendChild(fieldEl(L.subject, 'subject'));
    var meta = el('div', 'paper-meta');
    meta.appendChild(fieldEl(L.classShort, 'className')); meta.appendChild(fieldEl(L.duration, 'duration'));
    meta.appendChild(fieldEl(L.coef, 'coef')); if (S.examDate || editable) meta.appendChild(fieldEl(L.date, 'examDate'));
    box.append(identity, center, meta); sheet.appendChild(box);
    sheet.appendChild(studentRow(L));
    if (S.nbPages) sheet.appendChild(pagesStrip(L));
  }

  function render() {
    var L = LB();
    var sheet = $('sheet');
    sheet.className = 'sheet ' + (S.paper === 'Letter' ? 'letter' : 'a4') + ' d-' + designOf();
    sheet.dir = L.dir;
    sheet.lang = lang();
    sheet.textContent = '';
    groupPtsEls = [];
    setPageSize();
    $('doc-name').textContent = S.title;
    document.title = S.title + ' · Teach.ai';
    $('demo').hidden = !S.demo;
    $('paper').value = S.paper;
    $('show-margin').checked = S.showMargin !== false;
    if ($('show-ministry')) $('show-ministry').checked = !!S.ministry;
    if ($('design-sel')) $('design-sel').value = designOf();
    $('answer-space').checked = S.answerSpace !== false;
    document.body.classList.toggle('hide-margin', S.showMargin === false);

    renderHeader(sheet, L);

    sheet.appendChild(editableEl('p', 'instructions', S.instructions, function (v) { S.instructions = v; }, true));

    if (S.support) {
      var sup = el('div', 'support');
      sup.appendChild(el('div', 'support-title', L.support));
      sup.appendChild(editableEl('div', 'support-body', S.support, function (v) { S.support = v; }, true, true));
      sheet.appendChild(sup);
    }

    // Questions grouped in exercises (or by type for older exams)
    var grouped = Array.isArray(S.groups) && S.groups.length;
    var prev = null;
    var sectionCount = 0;
    var inGroup = 0;
    S.questions.forEach(function (q, i) {
      if (grouped) {
        if (q.group !== prev) {
          prev = q.group;
          inGroup = 0;
          var gi = Math.min(Math.max(q.group || 0, 0), S.groups.length - 1);
          var st = el('div', 'section-title');
          st.appendChild(editableEl('span', 'gtitle', S.groups[gi].title, (function (idx) { return function (v) { S.groups[idx].title = v; }; })(gi), false));
          var pe = el('span', 'gpts');
          groupPtsEls[gi] = pe;
          st.appendChild(pe);
          sheet.appendChild(st);
        }
        inGroup++;
      } else if (q.type !== prev) {
        prev = q.type;
        var st2 = el('div', 'section-title');
        st2.textContent = 'Section ' + String.fromCharCode(65 + sectionCount) + ' ';
        st2.appendChild(el('span', '', TYPE_NAME[q.type]));
        sheet.appendChild(st2);
        sectionCount++;
      }
      sheet.appendChild(questionBlock(q, i, grouped ? inGroup : i + 1));
    });
    updateTotal();

    if (!S.questions.length) {
      sheet.appendChild(el('p', 'hint', T('none.q')));
    }
  }

  function questionBlock(q, i, number) {
    var block = el('div', 'qblock');
    block.id = 'q-' + q.id;
    var row = el('div', 'qrow');
    var main = el('div', 'qmain');

    var head = el('div', 'qhead');
    head.appendChild(el('span', 'qnum', LB().qnum(number)));
    var prompt = editableEl('div', 'qprompt', q.prompt, function (v) { q.prompt = v; }, true, true);
    head.appendChild(prompt);
    main.appendChild(head);
    if (q.flagged && editable && !studentPreview) {
      var flag = el('div', 'qflag edit-only no-print');
      flag.appendChild(window.ICONS.node('flag', 14));
      flag.appendChild(el('span', '', T('ed.flag')));
      var ok = el('button', 'qflag-ok');
      ok.type = 'button';
      ok.appendChild(window.ICONS.node('check', 14));
      ok.appendChild(el('span', '', T('ed.flagok')));
      ok.addEventListener('click', function () { q.flagged = false; render(); scheduleSave(); });
      flag.appendChild(ok);
      main.appendChild(flag);
    }

    if (q.image) {
      var fig = el('figure', 'qimg');
      var im = el('img');
      im.src = q.image;
      im.alt = String(i + 1);
      fig.appendChild(im);
      main.appendChild(fig);
    }

    if (q.type === 'mcq') {
      main.appendChild(choicesEl(q));
    } else if (q.type === 'tf') {
      main.appendChild(tfEl(q));
    } else if (S.answerSpace !== false) {
      var lines = el('div', 'answer-lines' + (q.type === 'essay' ? ' long' : ''));
      for (var k = 0; k < (q.type === 'essay' ? 8 : 3); k++) lines.appendChild(el('div'));
      main.appendChild(lines);
    }

    var mark = el('span', 'question-marks', LB().pts(fmtNum(q.points)));
    mark.id = 'marks-' + q.id;
    head.appendChild(mark);
    row.appendChild(main);
    row.appendChild(marginEl(q, i));
    block.appendChild(row);
    if (editable) block.appendChild(toolsEl(q, i));
    return block;
  }

  function choicesEl(q) {
    var wrap = el('div', 'choices');
    q.choices.forEach(function (c, j) {
      var item = el('div', 'choice' + (j === q.correctIndex ? ' correct' : ''));
      item.appendChild(el('span', 'mark'));
      item.appendChild(el('span', 'letter', letterOf(j)));
      item.appendChild(editableEl('span', 'body', c, function (v) {
        q.choices[j] = v;
        syncAnswer(q);
      }, false, true));
      if (editable) {
        var lab = el('label', 'edit-only hint correct-pick');
        var radio = el('input');
        radio.type = 'radio';
        radio.name = 'correct-' + q.id;
        radio.checked = j === q.correctIndex;
        radio.addEventListener('change', function () {
          q.correctIndex = j;
          syncAnswer(q);
          render();
          scheduleSave();
        });
        lab.appendChild(radio);
        lab.appendChild(document.createTextNode(' ✓'));
        lab.title = T('q.pickcorrect');
        item.appendChild(lab);
      }
      wrap.appendChild(item);
    });
    return wrap;
  }

  function tfEl(q) {
    var wrap = el('div', 'tf-line');
    var L = LB();
    ['True', 'False'].forEach(function (value, idx) {
      var item = el('div', 'choice' + (q.answer === value ? ' correct' : ''));
      item.appendChild(el('span', 'mark tf'));
      item.appendChild(el('span', '', L.tf[idx]));
      wrap.appendChild(item);
    });
    return wrap;
  }

  function answerText(q) {
    if (q.type === 'mcq') {
      var j = q.correctIndex;
      return letterOf(j) + ' ' + (q.choices[j] || '');
    }
    if (q.type === 'tf') return LB().tf[q.answer === 'False' ? 1 : 0];
    return q.answer || '';
  }

  function marginEl(q, i) {
    var L = LB();
    var m = el('div', 'qmargin');
    var pts = el('div', 'pts');
    if (editable) {
      var inp = el('input', 'field small');
      inp.type = 'number';
      inp.min = '0';
      inp.max = '100';
      inp.step = '0.25';
      inp.value = q.points;
      inp.setAttribute('aria-label', T('q.points', { n: i + 1 }));
      inp.addEventListener('input', function () {
        q.points = Number(inp.value) || 0;
        updateTotal();
        scheduleSave();
      });
      pts.appendChild(inp);
      pts.appendChild(document.createTextNode(' ' + unitOf()));
    } else {
      pts.textContent = L.pts(fmtNum(q.points));
    }
    m.appendChild(pts);

    var ans = el('div', 'ans-text');
    ans.appendChild(el('strong', '', L.answer + ' : '));
    ans.appendChild(mathSpan(answerText(q)));
    m.appendChild(ans);

    if (q.rubric) { var rb = el('div', 'ans-text'); rb.appendChild(document.createTextNode(L.rubric + ' : ')); rb.appendChild(mathSpan(q.rubric)); m.appendChild(rb); }
    if (q.source) { var sr = el('div', 'src'); sr.appendChild(document.createTextNode(L.from + ' : ')); sr.appendChild(mathSpan(q.source)); m.appendChild(sr); }
    return m;
  }

  var ICONS = {
    up: '<path d="m18 15-6-6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="1.6"/><path d="m21 15-4.5-4.5L6 21"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
    send: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  };

  function icon(name) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('width', '18');
    s.setAttribute('height', '18');
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '2');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = ICONS[name]; // static strings above, never user input
    return s;
  }

  // Icon button: shows only the icon, grows to show its label on hover or focus.
  function iconBtn(name, label, onClick, extra) {
    var b = el('button', 'ibtn' + (extra ? ' ' + extra : ''));
    b.type = 'button';
    b.title = label;
    b.setAttribute('aria-label', label);
    b.appendChild(icon(name));
    b.appendChild(el('span', 'lab', label));
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }

  function toolsEl(q, i) {
    var t = el('details', 'qtools edit-only no-print');
    var sum = el('summary');
    sum.appendChild(window.ICONS.node('sliders', 14));
    sum.appendChild(el('span', '', T('ed.tools')));
    sum.title = T('studio.qtools', { n: i + 1 });
    t.appendChild(sum);
    t.dir = I18N.dir;
    var row = el('div', 'trow');
    var n = S.questions.length;

    var mv = iconBtn('up', T('q.up'), function () { move(i, -1); });
    mv.disabled = i === 0;
    row.appendChild(mv);
    var md = iconBtn('down', T('q.down'), function () { move(i, 1); });
    md.disabled = i === n - 1;
    row.appendChild(md);

    var typeSel = el('select', 'field small pill');
    ['mcq', 'tf', 'short', 'essay'].forEach(function (tp) {
      var o = el('option', '', TYPE_NAME[tp]);
      o.value = tp;
      if (tp === q.type) o.selected = true;
      typeSel.appendChild(o);
    });
    typeSel.setAttribute('aria-label', T('q.type'));
    typeSel.addEventListener('change', function () { setType(q, typeSel.value); });
    row.appendChild(typeSel);

    if (Array.isArray(S.groups) && S.groups.length) {
      var gSel = el('select', 'field small pill');
      gSel.setAttribute('aria-label', T('q.exercise'));
      S.groups.forEach(function (g, gi) {
        var o = el('option', '', (g.title || LB().exercise(gi + 1)).slice(0, 26));
        o.value = String(gi);
        if (q.group === gi) o.selected = true;
        gSel.appendChild(o);
      });
      var oNew = el('option', '', T('q.newex'));
      oNew.value = 'new';
      gSel.appendChild(oNew);
      gSel.addEventListener('change', function () {
        if (gSel.value === 'new') {
          S.groups.push({ title: LB().exercise(S.groups.length + 1) });
          q.group = S.groups.length - 1;
        } else {
          q.group = Number(gSel.value);
        }
        S.questions = S.questions.map(function (x, k) { return [x, k]; })
          .sort(function (a, b) { return (a[0].group - b[0].group) || (a[1] - b[1]); })
          .map(function (x) { return x[0]; });
        render(); scheduleSave();
      });
      row.appendChild(gSel);
    }

    if (q.type === 'tf') {
      var tfSel = el('select', 'field small pill');
      tfSel.setAttribute('aria-label', T('q.correct', { v: '' }));
      ['True', 'False'].forEach(function (v) {
        var o = el('option', '', T('q.correct', { v: T(v === 'True' ? 'tf.true' : 'tf.false') }));
        o.value = v;
        if (q.answer === v) o.selected = true;
        tfSel.appendChild(o);
      });
      tfSel.addEventListener('change', function () { q.answer = tfSel.value; render(); scheduleSave(); });
      row.appendChild(tfSel);
    }

    if (q.type === 'mcq') {
      if (q.choices.length < (S.options && S.options.choices || 4) + 1 && q.choices.length < 5) {
        row.appendChild(iconBtn('plus', T('q.addchoice'), function () {
          q.choices.push(LB().choice(q.choices.length));
          render(); scheduleSave();
        }));
      }
      if (q.choices.length > 2) {
        row.appendChild(iconBtn('minus', T('q.rmchoice'), function () {
          q.choices.pop();
          if (q.correctIndex >= q.choices.length) q.correctIndex = 0;
          syncAnswer(q);
          render(); scheduleSave();
        }));
      }
    }

    if (q.type === 'essay') {
      var rub = el('input', 'field small ask');
      rub.placeholder = T('q.rubric');
      rub.value = q.rubric || '';
      rub.setAttribute('aria-label', T('q.rubric'));
      rub.addEventListener('input', function () { q.rubric = rub.value; scheduleSave(); });
      row.appendChild(rub);
    }

    var imgLabel = el('label', 'ibtn');
    imgLabel.title = q.image ? T('q.repimg') : T('q.addimg');
    imgLabel.appendChild(icon('image'));
    imgLabel.appendChild(el('span', 'lab', q.image ? T('q.repimg') : T('q.addimg')));
    var imgInput = el('input');
    imgInput.type = 'file';
    imgInput.accept = 'image/png,image/jpeg,image/webp,image/svg+xml';
    imgInput.className = 'sr-only';
    imgInput.setAttribute('aria-label', imgLabel.title);
    imgInput.addEventListener('change', function () {
      var f = imgInput.files && imgInput.files[0];
      if (f) readImage(f, 3, function (data) { q.image = data; render(); scheduleSave(); });
    });
    imgLabel.appendChild(imgInput);
    row.appendChild(imgLabel);
    if (q.image) {
      row.appendChild(iconBtn('trash', T('q.rmimg'), function () { q.image = null; render(); scheduleSave(); }));
    }

    var del = iconBtn('trash', T('q.delete'), function () {
      if (!confirm(T('q.confirmdel', { n: i + 1 }))) return;
      S.questions.splice(i, 1);
      render(); scheduleSave();
    }, 'danger');
    del.classList.add('push');
    row.appendChild(del);
    t.appendChild(row);

    // AI co-worker: quick moves plus a free-text note.
    var ai = el('div', 'ai');
    var who = el('span', 'ai-who');
    who.appendChild(icon('spark'));
    var whoText = el('span', '', T('ai.who'));
    whoText.setAttribute('data-working', T('ai.working'));
    who.appendChild(whoText);
    ai.appendChild(who);
    function run(note) { regenerate(i, note, ai); }
    [[T('ai.easier'), 'Make it easier'], [T('ai.harder'), 'Make it harder'], [T('ai.shorter'), 'Make it shorter and simpler to read'], [T('ai.angle'), 'Ask about a different part of the lesson']].forEach(function (c) {
      var chip = el('button', 'chip', c[0]);
      chip.type = 'button';
      chip.addEventListener('click', function () { run(c[1]); });
      ai.appendChild(chip);
    });
    var ask = el('input', 'ai-input');
    ask.placeholder = T('ai.ph');
    ask.setAttribute('aria-label', T('ai.aria'));
    ask.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); run(ask.value); } });
    ai.appendChild(ask);
    ai.appendChild(iconBtn('send', T('ai.send'), function () { run(ask.value); }, 'go'));
    t.appendChild(ai);
    return t;
  }

  // ---------- Question actions ----------

  function move(i, d) {
    var j = i + d;
    if (j < 0 || j >= S.questions.length) return;
    var tmp = S.questions[i];
    S.questions[i] = S.questions[j];
    S.questions[j] = tmp;
    render(); scheduleSave();
  }

  function setType(q, t) {
    q.type = t;
    var n = Math.min(5, (S.options && S.options.choices) || 4);
    if (t === 'mcq') {
      if (!q.choices || q.choices.length < 2) {
        q.choices = [];
        for (var k = 0; k < n; k++) q.choices.push(LB().choice(k));
      }
      q.correctIndex = 0;
      syncAnswer(q);
    } else if (t === 'tf') {
      q.choices = [];
      q.answer = q.answer === 'False' ? 'False' : 'True';
    } else {
      q.choices = [];
      if (!q.answer || q.answer === 'True' || q.answer === 'False') q.answer = '';
    }
    if (t === 'essay' && !q.rubric) q.rubric = LB().defRubric;
    render(); scheduleSave();
  }

  function addQuestion(type) {
    var n = Math.min(5, (S.options && S.options.choices) || 4);
    var q = {
      id: rid(), type: type, prompt: LB().newQ, choices: [], correctIndex: 0,
      answer: '', rubric: '', source: '', topic: '',
      points: (S.options && S.options.points && S.options.points[type]) || 1,
      image: null, flagged: false,
      group: S.questions.length ? S.questions[S.questions.length - 1].group : 0,
    };
    if (type === 'mcq') {
      for (var k = 0; k < n; k++) q.choices.push(LB().choice(k));
      q.answer = q.choices[0];
    }
    if (type === 'tf') q.answer = 'True';
    if (type === 'essay') q.rubric = LB().defRubric;
    S.questions.push(q);
    render(); scheduleSave();
    var node = $('q-' + q.id);
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function regenerate(i, note, btn) {
    btn.classList.add('busy');
    var old = S.questions[i];
    var requestedVersion = editVersion;
    fetch('/api/exams/' + examId + '/questions/regenerate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-edit-key': key },
      body: JSON.stringify({ index: i, instruction: note || '', ai: AISettings.payload() }),
    })
      .then(parseRes)
      .then(function (out) {
        if (!out.ok) throw new Error(out.j.error || T('err.regen'));
        if (requestedVersion !== editVersion) throw new Error(T('studio.stale'));
        var nq = normaliseQ(out.j.question);
        S.questions[i] = Object.assign(nq, { id: old.id, points: old.points, image: old.image, group: old.group });
        if (out.j.demo) S.demo = true;
        render(); scheduleSave();
      })
      .catch(function (err) {
        btn.classList.remove('busy');
        showError(err.message);
      });
  }

  function readImage(file, maxMB, done) {
    if (file.size > maxMB * 1024 * 1024) {
      showError(T('err.img', { n: maxMB }));
      return;
    }
    var r = new FileReader();
    r.onload = function () { done(String(r.result)); };
    r.onerror = function () { showError(T('err.imgread')); };
    r.readAsDataURL(file);
  }

  // ---------- Saving (autosave, one request at a time) ----------

  function scheduleSave() {
    if (!editable) return;
    editVersion++;
    setSaved(T('save.saving'), 'busy');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(queueSave, 700);
    clearTimeout(histTimer);
    histTimer = setTimeout(histPush, 450);
  }

  function queueSave() {
    saveChain = saveChain.then(doSave, doSave);
  }

  function doSave() {
    var version = editVersion;
    var body = {
      title: S.title, school: S.school, className: S.className, examDate: S.examDate,
      teacher: S.teacher, duration: S.duration, instructions: S.instructions,
      subject: S.subject, coef: S.coef, year: S.year, support: S.support, groups: S.groups,
      paper: S.paper, showMargin: S.showMargin !== false, answerSpace: S.answerSpace !== false, ministry: !!S.ministry, design: S.design, nbPages: S.nbPages, logo: S.logo,
      questions: S.questions.map(function (q) {
        return {
          id: q.id, type: q.type, prompt: q.prompt, choices: q.choices, answer: q.answer,
          rubric: q.rubric, source: q.source, topic: q.topic, points: q.points, group: q.group,
          image: q.image, flagged: !!q.flagged,
        };
      }),
    };
    return fetch('/api/exams/' + examId, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-edit-key': key },
      body: JSON.stringify(body),
    })
      .then(parseRes)
      .then(function (out) {
        if (!out.ok) throw new Error(out.j.error || T('err.save'));
        savedVersion = version;
        if (version === editVersion) setSaved(T('save.saved'));
      })
      .catch(function (err) {
        setSaved(T('save.failed', { m: err.message }), 'err');
      });
  }

  // ---------- Print, Word, share ----------

  function setPageSize() {
    var st = $('pagesize');
    if (!st) {
      st = el('style');
      st.id = 'pagesize';
      document.head.appendChild(st);
    }
    st.textContent = '@page { size: ' + (S.paper === 'Letter' ? 'letter' : 'A4') + '; margin: 16mm; }';
  }

  function printAs(mode) {
    if (!S) return;
    if (document.activeElement && document.activeElement.isContentEditable) document.activeElement.blur();
    closeMenus();
    ExamExport.print(exportConfig(), mode);
  }
  window.addEventListener('afterprint', function () {
    document.body.classList.remove('print-student', 'print-key');
  });

  function safeName(s) {
    return (s || 'exam').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'exam';
  }

  function download(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function downloadWord() {
    if (S) { closeMenus(); ExamExport.save(exportConfig(), 'docx', 'student', $('word')); }
  }

  function closeMenus(except) {
    document.querySelectorAll('details.menu[open]').forEach(function (d) { if (d !== except) d.open = false; });
  }

  function copyField(id, btn) {
    var input = $(id);
    var done = function () { toast(T('ed.copied'), 'ok'); };
    try {
      navigator.clipboard.writeText(input.value).then(done, function () { input.select(); document.execCommand('copy'); done(); });
    } catch (_) {
      input.select();
      document.execCommand('copy');
      done();
    }
  }

  function fillShare() {
    var base = location.origin;
    $('view-link').value = base + '/e/' + examId;
    $('edit-link').value = base + '/e/' + examId + '#k=' + encodeURIComponent(key);
    $('edit-share').hidden = !editable;
  }

  function fillDesigns() {
    var sel = $('design-sel');
    sel.textContent = '';
    TPL.DESIGNS.forEach(function (d) { var o = el('option', '', T('design.' + d)); o.value = d; sel.appendChild(o); });
    if (S) sel.value = designOf();
  }

  function bindControls() {
    fillDesigns();
    document.addEventListener('uilangchange', fillDesigns);
    // Menus (share, print, export): one open at a time, closed by a click outside or Escape.
    document.querySelectorAll('details.menu').forEach(function (d) {
      d.addEventListener('toggle', function () { if (d.open) { closeMenus(d); if (d.id === 'share-menu') fillShare(); } });
    });
    document.addEventListener('click', function (e) { if (!e.target.closest('details.menu')) closeMenus(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenus(); });
    document.querySelectorAll('[data-copy]').forEach(function (b) {
      b.addEventListener('click', function () { copyField(b.getAttribute('data-copy') === 'view-link' ? 'view-link' : 'edit-link', b); });
    });
    $('print-student').addEventListener('click', function () { printAs('student'); });
    $('print-key').addEventListener('click', function () { printAs('key'); });
    $('word').addEventListener('click', downloadWord);
    $('pdf').addEventListener('click', function () { if (S) { closeMenus(); ExamExport.save(exportConfig(), 'pdf', 'student', $('pdf')); } });

    document.querySelectorAll('[data-add]').forEach(function (b) {
      b.addEventListener('click', function () { addQuestion(b.getAttribute('data-add')); });
    });
    $('logo-input').addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (f) readImage(f, 2, function (data) { S.logo = data; render(); scheduleSave(); });
    });
    $('logo-remove').addEventListener('click', function () { S.logo = null; render(); scheduleSave(); });
    $('paper').addEventListener('change', function () { S.paper = this.value; render(); scheduleSave(); });
    $('design-sel').addEventListener('change', function () {
      S.design = this.value;
      render(); histPush(); scheduleSave();
    });
    $('show-ministry').addEventListener('change', function () {
      S.ministry = this.checked;
      render(); histPush(); scheduleSave();
    });
    $('show-margin').addEventListener('change', function () {
      S.showMargin = this.checked;
      document.body.classList.toggle('hide-margin', !this.checked);
      scheduleSave();
    });
  }

  // ---------- Undo / redo ----------
  // Each change (typing, a button, or an AI action) ends up as one snapshot of the whole exam.

  var hist = [];
  var hi = -1;
  var histTimer = null;
  var applying = false;
  var imgPool = []; // images are stored once and referenced by index, so history stays small

  function imgRef(d) {
    if (!d) return -1;
    var k = imgPool.indexOf(d);
    if (k < 0) { imgPool.push(d); k = imgPool.length - 1; }
    return k;
  }

  function snapshot() {
    return JSON.stringify({
      title: S.title, school: S.school, className: S.className, examDate: S.examDate, teacher: S.teacher,
      duration: S.duration, instructions: S.instructions, subject: S.subject, coef: S.coef, year: S.year,
      support: S.support, groups: S.groups, ministry: !!S.ministry, design: S.design, nbPages: S.nbPages,
      paper: S.paper, showMargin: S.showMargin, answerSpace: S.answerSpace,
      questions: S.questions.map(function (q) { var c = Object.assign({}, q); c.image = imgRef(q.image); return c; }),
    });
  }

  function updateHist() {
    var u = $('undo'), r = $('redo');
    if (u) u.disabled = hi <= 0;
    if (r) r.disabled = hi >= hist.length - 1;
  }

  function histPush() {
    clearTimeout(histTimer);
    if (applying || !S) return;
    var s = snapshot();
    if (hist[hi] === s) { updateHist(); return; }
    hist = hist.slice(0, hi + 1);
    hist.push(s);
    if (hist.length > 80) hist.shift();
    hi = hist.length - 1;
    updateHist();
  }

  function histRestore(i) {
    var o = JSON.parse(hist[i]);
    o.questions.forEach(function (q) { q.image = q.image >= 0 ? imgPool[q.image] : null; });
    applying = true;
    Object.keys(o).forEach(function (k) { S[k] = o[k]; });
    render();
    scheduleSave();
    applying = false;
    updateHist();
  }

  function undo() {
    histPush(); // capture edits that are still waiting for their snapshot
    if (hi > 0) { hi--; histRestore(hi); }
  }
  function redo() {
    clearTimeout(histTimer);
    if (hi < hist.length - 1) { hi++; histRestore(hi); }
  }

  // ---------- AI co-worker: acts on the whole exam ----------

  var asBusy = false;

  function compactExam() {
    return {
      title: S.title, subject: S.subject, class: S.className, language: lang(),
      groups: (S.groups || []).map(function (g, i) { return { n: i + 1, title: g.title }; }),
      support: S.support ? S.support.slice(0, 1500) : '',
      header: { school: S.school, teacher: S.teacher, date: S.examDate, duration: S.duration, coef: S.coef, year: S.year, instructions: S.instructions },
      questions: S.questions.map(function (q, i) {
        return { q: i + 1, type: q.type, exercise: (q.group || 0) + 1, points: q.points, prompt: q.prompt, choices: q.choices, answer: q.answer, rubric: q.rubric };
      }),
    };
  }

  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function replaceCount(str, find, rep, cs) {
    var n = 0;
    var out = String(str == null ? '' : str).replace(new RegExp(escRe(find), cs ? 'g' : 'gi'), function () { n++; return rep; });
    return { text: out, n: n };
  }

  function newQuestionFrom(a) {
    var q = {
      id: rid(), type: a.type, prompt: a.prompt || LB().newQ, choices: (a.choices || []).slice(), answer: a.answer || '',
      rubric: a.rubric || '', source: '', topic: '', correctIndex: 0, image: null, flagged: false,
      points: a.points != null ? a.points : ((S.options && S.options.points && S.options.points[a.type]) || 1),
      group: Math.min(Math.max((a.exercise || 1) - 1, 0), Math.max((S.groups || []).length - 1, 0)),
    };
    if (a.type === 'mcq' && q.choices.length < 2) q.choices = [0, 1, 2, 3].map(function (j) { return LB().choice(j); });
    return normaliseQ(q);
  }

  // Which questions would these actions delete? (used to ask before big deletions)
  function deleteTargets(actions, origin) {
    var set = [];
    function add(q) { if (q && set.indexOf(q) < 0) set.push(q); }
    actions.forEach(function (a) {
      if (a.op === 'delete_all_questions') origin.forEach(add);
      if (a.op === 'delete_questions') (a.q || []).forEach(function (n) { add(origin[n - 1]); });
      if (a.op === 'delete_where') {
        origin.forEach(function (q) {
          if (a.type && q.type !== a.type) return;
          if (a.exercise != null && (q.group || 0) + 1 !== a.exercise) return;
          if (a.contains && (q.prompt || '').toLowerCase().indexOf(a.contains.toLowerCase()) < 0) return;
          add(q);
        });
      }
    });
    return set;
  }

  function applyActions(actions) {
    var origin = S.questions.slice();
    var counts = { del: 0, edit: 0, add: 0, rewrite: 0, other: 0, all: false };
    var removed = deleteTargets(actions, origin);
    counts.all = removed.length > 0 && removed.length === origin.length && origin.length > 1;
    var qOf = function (n) { return origin[Math.round(n) - 1]; };

    actions.forEach(function (a) {
      try {
        if (a.op === 'edit_text') {
          var fields = a.fields && a.fields.length ? a.fields : ['prompt', 'choices', 'answer', 'rubric'];
          var targets = a.q != null ? [qOf(a.q)] : origin;
          targets.forEach(function (q) {
            if (!q || S.questions.indexOf(q) < 0) return;
            fields.forEach(function (f) {
              if (f === 'choices') {
                q.choices = q.choices.map(function (c) { var r = replaceCount(c, a.find, a.replace, a.case_sensitive); counts.edit += r.n; return r.text; });
                syncAnswer(q);
              } else if (typeof q[f] === 'string') {
                var r2 = replaceCount(q[f], a.find, a.replace, a.case_sensitive);
                counts.edit += r2.n; q[f] = r2.text;
              }
            });
            if (q.type === 'mcq' && fields.indexOf('answer') >= 0) {
              var ai = q.choices.indexOf(q.answer);
              if (ai >= 0) q.correctIndex = ai;
            }
          });
          if (a.include_header) {
            ['title', 'support', 'instructions'].forEach(function (f) { var r = replaceCount(S[f], a.find, a.replace, a.case_sensitive); counts.edit += r.n; S[f] = r.text; });
            (S.groups || []).forEach(function (g) { var r = replaceCount(g.title, a.find, a.replace, a.case_sensitive); counts.edit += r.n; g.title = r.text; });
          }
        } else if (a.op === 'delete_questions' || a.op === 'delete_where' || a.op === 'delete_all_questions') {
          var gone = deleteTargets([a], origin);
          S.questions = S.questions.filter(function (q) { return gone.indexOf(q) < 0; });
          counts.del += gone.length;
        } else if (a.op === 'delete_choice') {
          var dq = qOf(a.q);
          if (dq && dq.type === 'mcq' && dq.choices.length > 2 && a.choice >= 1 && a.choice <= dq.choices.length) {
            var wasCorrect = dq.correctIndex === a.choice - 1;
            dq.choices.splice(a.choice - 1, 1);
            if (wasCorrect || dq.correctIndex >= dq.choices.length) dq.correctIndex = 0;
            else if (dq.correctIndex > a.choice - 1) dq.correctIndex--;
            syncAnswer(dq);
            counts.other++;
          }
        } else if (a.op === 'add_choice') {
          var cq = qOf(a.q);
          if (cq && cq.type === 'mcq' && cq.choices.length < 6) { cq.choices.push(a.text); counts.other++; }
        } else if (a.op === 'set_question') {
          var sq = qOf(a.q);
          if (!sq) return;
          if (a.prompt != null) sq.prompt = a.prompt;
          if (a.rubric != null) sq.rubric = a.rubric;
          if (a.points != null) sq.points = a.points;
          if (a.choices && sq.type === 'mcq' && a.choices.length >= 2) {
            sq.choices = a.choices.slice();
            var wanted = a.answer != null ? a.answer : sq.answer;
            var wi = sq.choices.indexOf(wanted);
            sq.correctIndex = wi >= 0 ? wi : 0;
            syncAnswer(sq);
          } else if (a.answer != null) {
            if (sq.type === 'mcq') { var xi = sq.choices.indexOf(a.answer); if (xi >= 0) { sq.correctIndex = xi; syncAnswer(sq); } }
            else if (sq.type === 'tf') sq.answer = /^(false|faux|خطأ)/i.test(a.answer) ? 'False' : 'True';
            else sq.answer = a.answer;
          }
          counts.rewrite++;
        } else if (a.op === 'add_question') {
          var nq = newQuestionFrom(a);
          var lastIdx = -1;
          S.questions.forEach(function (q, k) { if (q.group === nq.group) lastIdx = k; });
          if (lastIdx >= 0) S.questions.splice(lastIdx + 1, 0, nq); else S.questions.push(nq);
          counts.add++;
        } else if (a.op === 'move_question') {
          var mq = qOf(a.q);
          if (!mq) return;
          var from = S.questions.indexOf(mq);
          if (from < 0) return;
          S.questions.splice(from, 1);
          S.questions.splice(Math.min(Math.max(a.to - 1, 0), S.questions.length), 0, mq);
          counts.other++;
        } else if (a.op === 'set_points') {
          if (a.q === 'all') S.questions.forEach(function (q) { q.points = a.points; });
          else { var pq = qOf(a.q); if (pq) pq.points = a.points; }
          counts.other++;
        } else if (a.op === 'scale_total') {
          var sum = totalPoints();
          if (sum > 0) {
            S.questions.forEach(function (q) { q.points = Math.max(0.25, Math.round((q.points / sum) * a.total * 4) / 4); });
            counts.other++;
          }
        } else if (a.op === 'set_header') {
          var map = { date: 'examDate', class: 'className' };
          S[map[a.field] || a.field] = a.value;
          counts.other++;
        } else if (a.op === 'rename_exercise') {
          if (S.groups && S.groups[a.n - 1]) { S.groups[a.n - 1].title = a.title; counts.other++; }
        }
      } catch (err) { /* skip a bad action, keep the rest */ }
    });
    return counts;
  }

  function summarise(c) {
    var parts = [];
    if (c.all) parts.push(T('as.what.all'));
    else if (c.del) parts.push(T('as.what.delq', { n: c.del }));
    if (c.edit) parts.push(T('as.what.edit') + ' (' + c.edit + ')');
    if (c.add) parts.push(T('as.what.add', { n: c.add }));
    if (c.rewrite) parts.push(T('as.what.rewrite', { n: c.rewrite }));
    return parts.join(', ');
  }

  function asLog(kind, text, undoable) {
    var log = $('as-log');
    var row = el('div', 'as-msg ' + kind);
    row.appendChild(el('span', 'as-text', text));
    if (undoable) {
      var u = el('button', 'as-undo', T('as.undo'));
      u.type = 'button';
      u.addEventListener('click', function () { undo(); u.remove(); });
      row.appendChild(u);
    }
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
    return row;
  }

  function asSend(text) {
    var input = $('as-input');
    var msg = String(text != null ? text : input.value).trim();
    if (!msg || asBusy) return;
    input.value = '';
    asLog('me', msg);
    var wait = asLog('wait', T('as.thinking'));
    asBusy = true;
    $('as-send').disabled = true;
    var requestedVersion = editVersion;
    fetch('/api/exams/' + examId + '/assistant', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-edit-key': key },
      body: JSON.stringify({ message: msg, exam: compactExam(), ai: AISettings.payload() }),
    })
      .then(parseRes)
      .then(function (out) {
        if (!out.ok) throw new Error(out.j.error || T('err.regen'));
        if (editVersion !== requestedVersion) throw new Error(T('studio.stale'));
        wait.remove();
        var j = out.j;
        var acts = j.actions || [];
        if (acts.length === 1 && acts[0].op === 'undo') { undo(); asLog('ai', j.reply || T('as.applied', { what: T('top.undo') })); return; }
        if (acts.length === 1 && acts[0].op === 'redo') { redo(); asLog('ai', j.reply || T('as.applied', { what: T('top.redo') })); return; }
        acts = acts.filter(function (a) { return a.op !== 'undo' && a.op !== 'redo'; });
        if (!acts.length) { asLog('ai', j.reply || T('as.none')); return; }

        var removed = deleteTargets(acts, S.questions);
        if (removed.length >= 3) {
          var what = removed.length === S.questions.length ? T('as.what.all') : T('as.what.delq', { n: removed.length });
          if (!confirm(T('as.confirm', { what: what }))) { asLog('ai', T('as.none')); return; }
        }
        clearTimeout(histTimer);
        histPush(); // make sure the state before the AI acts is in the history
        var counts = applyActions(acts);
        render();
        scheduleSave();
        clearTimeout(histTimer);
        histPush(); // one undo step for the whole command
        var sum = summarise(counts);
        asLog('ai', (j.reply || T('as.applied', { what: sum })) + (sum && j.reply ? '  · ' + sum : ''), true);
      })
      .catch(function (err) {
        wait.remove();
        asLog('err', T('as.err', { m: err.message }));
      })
      .then(function () { asBusy = false; $('as-send').disabled = false; });
  }

  function renderAsChips() {
    var box = $('as-chips');
    if (!box) return;
    box.textContent = '';
    [1, 2, 3, 4].forEach(function (n) {
      var c = el('button', 'chip', T('as.c' + n));
      c.type = 'button';
      c.addEventListener('click', function () { asSend(T('as.c' + n + '.msg')); });
      box.appendChild(c);
    });
  }

  function bindAssistant() {
    if (!editable) return;
    renderAsChips();
    $('as-send').addEventListener('click', function () { asSend(); });
    $('as-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); asSend(); }
    });
    $('undo').addEventListener('click', undo);
    $('redo').addEventListener('click', redo);
    document.addEventListener('keydown', function (e) {
      var mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      var a = document.activeElement;
      if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return; // let typing use its own undo
      var k = String(e.key).toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    });
    document.addEventListener('uilangchange', renderAsChips);
  }

  // ---------- Start ----------

  function init() {
    var m = location.pathname.match(/^\/e\/([a-z0-9]{10})$/);
    if (!m) { $('sheet').textContent = T('err.badlink'); return; }
    examId = m[1];
    var fr = /k=([^&]+)/.exec(location.hash);
    key = fr ? decodeURIComponent(fr[1]) : '';
    editable = !!key;
    document.body.classList.toggle('viewer', !editable);
    $('viewonly').hidden = editable;
    bindControls();
    bindAssistant();
    $('answer-space').addEventListener('change', function () { if (!S || !editable) return; S.answerSpace = this.checked; render(); scheduleSave(); });
    ['edit', 'student'].forEach(function (mode) {
      $('mode-' + mode).addEventListener('click', function () {
        if (!S) return;
        studentPreview = mode === 'student';
        document.body.classList.toggle('student-preview', studentPreview);
        ['edit', 'student'].forEach(function (m) { $('mode-' + m).classList.toggle('on', m === mode); $('mode-' + m).setAttribute('aria-pressed', String(m === mode)); });
        render();
      });
    });
    var warning = el('div', 'mark-warning no-print'); warning.id = 'mark-warning'; warning.hidden = true;
    $('sheet').before(warning);

    fetch('/api/exams/' + examId)
      .then(parseRes)
      .then(function (out) {
        if (!out.ok) throw new Error(out.j.error || T('err.notfound'));
        S = out.j;
        S.questions = (S.questions || []).map(normaliseQ);
        if (Array.isArray(S.groups) && S.groups.length) {
          S.questions.forEach(function (q) { q.group = Number.isInteger(q.group) ? Math.min(Math.max(q.group, 0), S.groups.length - 1) : 0; });
        }
        S.options = S.options || {};
        render();
        histPush();
      })
      .catch(function (err) {
        $('sheet').textContent = err.message;
        $('sheet').className = 'sheet';
        $('doc-name').textContent = T('nf.title');
      });
  }

  document.addEventListener('uilangchange', function () { if (S) render(); });
  window.addEventListener('beforeunload', function (e) {
    if (editable && editVersion !== savedVersion) { e.preventDefault(); e.returnValue = ''; }
  });

  init();
})();
