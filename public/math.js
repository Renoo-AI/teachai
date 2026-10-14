// Maths and physics typesetting. Text may contain LaTeX between single dollar signs: $x^2$, $q_{noy} = 27{,}2 \times 10^{-19}\,\mathrm{C}$.
// Rendering uses KaTeX when it is loaded. Plain notation such as "10^-19" or "q_noy" (no dollar signs) is rescued
// automatically, so older exams and AI replies that forgot the dollar signs still look right.
(function (root) {
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  var SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', 'n': 'ⁿ', 'i': 'ⁱ' };
  var SUB = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎', 'a': 'ₐ', 'e': 'ₑ', 'o': 'ₒ', 'x': 'ₓ', 'i': 'ᵢ', 'n': 'ₙ' };
  var GREEK = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ', theta: 'θ', lambda: 'λ', mu: 'μ', nu: 'ν', pi: 'π', rho: 'ρ', sigma: 'σ', Sigma: 'Σ', tau: 'τ', phi: 'φ', varphi: 'φ', omega: 'ω', Omega: 'Ω', epsilon: 'ε', varepsilon: 'ε', eta: 'η', kappa: 'κ' };
  var SYM = { times: '×', cdot: '·', div: '÷', pm: '±', mp: '∓', leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', equiv: '≡', infty: '∞', to: '→', rightarrow: '→', Rightarrow: '⇒', leftarrow: '←', leftrightarrow: '↔', circ: '°', degree: '°', in: '∈', cup: '∪', cap: '∩', subset: '⊂', ldots: '…', cdots: '⋯', sum: 'Σ', int: '∫', partial: '∂', nabla: '∇', perp: '⊥', parallel: '∥', angle: '∠' };

  function mapChars(s, table) {
    var out = '';
    for (var i = 0; i < s.length; i++) { var c = s.charAt(i); out += table[c] != null ? table[c] : c; }
    return out;
  }

  // Reads one {group} or one character after a ^ or _.
  function group(s, i) {
    if (s.charAt(i) === '{') {
      var depth = 0;
      for (var j = i; j < s.length; j++) {
        if (s.charAt(j) === '{') depth++;
        else if (s.charAt(j) === '}' && --depth === 0) return [s.slice(i + 1, j), j + 1];
      }
      return [s.slice(i + 1), s.length];
    }
    if (s.charAt(i) === '\\') {
      var m = /^\\[a-zA-Z]+/.exec(s.slice(i));
      if (m) return [m[0], i + m[0].length];
    }
    return [s.charAt(i), i + 1];
  }

  // LaTeX to readable Unicode text. Used for Word export and when KaTeX is not available.
  function texToUnicode(tex) {
    var s = String(tex);
    s = s.replace(/\\(?:mathrm|mathbf|mathit|text|rm|bf|operatorname)\s*\{([^{}]*)\}/g, '$1');
    s = s.replace(/\\(?:d|t)?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)');
    s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)').replace(/\\sqrt\s*([0-9a-zA-Z])/g, '√$1');
    s = s.replace(/\\vec\s*\{([^{}]*)\}/g, '$1⃗').replace(/\\overrightarrow\s*\{([^{}]*)\}/g, '$1⃗');
    s = s.replace(/\\(?:overline|bar)\s*\{([^{}]*)\}/g, '$1̅').replace(/\\hat\s*\{([^{}]*)\}/g, '$1̂');
    s = s.replace(/\\(?:left|right)\s*([()|\[\]]|\\[{}])/g, '$1').replace(/\\(?:left|right)\./g, '');
    s = s.replace(/\\[,;:! ]/g, ' ').replace(/\\(?:quad|qquad)/g, '  ');
    s = s.replace(/\\([a-zA-Z]+)/g, function (m, name) { return GREEK[name] || SYM[name] || name; });
    s = s.replace(/\{,\}/g, ',');
    // powers and indices
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (c === '^' || c === '_') {
        var g = group(s, i + 1);
        var txt = texToUnicode(g[0]);
        var mapped = mapChars(txt, c === '^' ? SUP : SUB);
        var ok = c === '^' ? /^[0-9+\-−=()ni]+$/.test(txt) : /^[0-9+\-=()aeoxin]+$/.test(txt);
        var plainWord = /^[A-Za-z0-9]+$/.test(txt);
        out += ok ? mapped : (c === '^' ? '^' : '_') + (txt.length > 1 && !plainWord ? '(' + txt + ')' : txt);
        i = g[1] - 1;
      } else out += c;
    }
    return out.replace(/[{}]/g, '').replace(/ {2,}/g, ' ');
  }

  // Wrap bare scientific notation in $...$ so it gets typeset. Only runs when the text has no dollar signs.
  function plainToMath(s) {
    if (s.indexOf('$') >= 0) return s;
    var out = s;
    out = out.replace(/(\d+(?:[.,]\d+)?)\s*[×x*·]\s*10\^\(?([+\-−]?\d+)\)?/g, function (m, n, e) {
      return '$' + n.replace(',', '{,}').replace('.', '{,}') + ' \\times 10^{' + e.replace('−', '-') + '}$';
    });
    out = out.replace(/(^|[^\w$\\{])10\^\(?([+\-−]?\d+)\)?/g, function (m, pre, e) { return pre + '$10^{' + e.replace('−', '-') + '}$'; });
    out = out.replace(/(^|[^\w$\\{])([A-Za-z])\^(\([^)]+\)|[+\-−]?\d+)/g, function (m, pre, x, e) {
      return pre + '$' + x + '^{' + e.replace(/^\(|\)$/g, '').replace('−', '-') + '}$';
    });
    out = out.replace(/(^|[^\w$\\{])([A-Za-z])_([A-Za-z0-9]+)(?![\w])/g, function (m, pre, x, sub) { return pre + '$' + x + '_{' + sub + '}$'; });
    out = out.replace(/\bsqrt\(([^()]+)\)/g, '$\\sqrt{$1}$');
    return out;
  }

  function renderTex(tex) {
    if (root.katex) {
      try { return root.katex.renderToString(tex, { throwOnError: false, strict: false, output: 'html', trust: false }); } catch (_) { /* fall through */ }
    }
    return '<span class="mx">' + esc(texToUnicode(tex)) + '</span>';
  }

  // Raw text (with optional $...$ math) to safe HTML. Newlines are kept by CSS (white-space: pre-wrap).
  function render(raw) {
    var s = plainToMath(String(raw == null ? '' : raw));
    var out = '';
    var last = 0;
    var re = /\$([^$\n]+?)\$/g;
    var m;
    while ((m = re.exec(s))) {
      out += esc(s.slice(last, m.index)) + renderTex(m[1]);
      last = m.index + m[0].length;
    }
    return out + esc(s.slice(last));
  }

  // Raw text to plain text with Unicode maths (Word export, copy).
  function toText(raw) {
    var s = plainToMath(String(raw == null ? '' : raw));
    return s.replace(/\$([^$\n]+?)\$/g, function (m, tex) { return texToUnicode(tex); });
  }

  var api = { render: render, toText: toText, plainToMath: plainToMath, texToUnicode: texToUnicode };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MathR = api;
})(typeof window !== 'undefined' ? window : globalThis);
