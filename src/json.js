// Tolerant JSON extraction for model replies (ported from the SchoolMemory/Sunbeam agents).
// Models sometimes wrap JSON in prose, code fences or <think> blocks, use smart quotes, or leave trailing commas.

const stripThinking = (text) => String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '');

// Every top-level {...} span in the text, string-aware.
function scanJsonObjects(text) {
  const spans = [];
  let depth = 0, start = -1, inString = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') { if (depth === 0) start = i; depth++; }
    else if (ch === '}' && depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) { spans.push(text.slice(start, i + 1)); start = -1; }
    }
  }
  return spans;
}

// Models write LaTeX like \frac or \times with a single backslash inside JSON strings, where \f and \t are
// valid escapes that would silently corrupt the text (form feed, tab). Double the backslash before known
// LaTeX commands. Already-doubled backslashes are left alone.
const LATEX_CMDS = 'frac|dfrac|tfrac|times|sqrt|cdot|mathrm|mathbf|mathit|vec|circ|rightarrow|Rightarrow|leftarrow|Leftarrow|leftrightarrow|to|leq|geq|le|ge|neq|ne|pi|alpha|beta|gamma|delta|Delta|theta|lambda|mu|nu|omega|Omega|rho|sigma|Sigma|phi|varphi|epsilon|varepsilon|tau|eta|kappa|sum|int|infty|pm|mp|div|approx|equiv|text|overline|underline|hat|bar|left|right|ldots|cdots|degree|in|cup|cap|subset|log|ln|sin|cos|tan|lim|binom|partial|nabla|perp|parallel|angle|triangle|quad|qquad|rm|bf';
const LATEX_RE = new RegExp('(?<!\\\\)\\\\(?=(?:' + LATEX_CMDS + ')(?![a-zA-Z]))', 'g');
const LATEX_SYM_RE = /(?<!\\)\\(?=[,;:!{}%#$_&| ])/g; // \, \; \{ ... are not valid JSON escapes either
function fixLatexEscapes(s) { return String(s).replace(LATEX_RE, '\\\\').replace(LATEX_SYM_RE, '\\\\'); }

function parseJsonObject(text) {
  const raw = fixLatexEscapes(stripThinking(text)).replace(/```(?:json)?/gi, '');
  const repair = (s) => s
    .replace(/[“”]/g, '"')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/,\s*([}\]])/g, '$1');
  for (const source of [raw, repair(raw)]) {
    const spans = scanJsonObjects(source).sort((a, b) => b.length - a.length);
    for (const span of spans) {
      for (const attempt of [span, repair(span)]) {
        try {
          const value = JSON.parse(attempt);
          if (value && typeof value === 'object' && !Array.isArray(value)) return value;
        } catch { /* try the next candidate */ }
      }
    }
  }
  throw new Error('The AI answered in an unexpected format.');
}

// Models sometimes over-escape: a literal backslash followed by n instead of a newline, or two backslashes
// before a LaTeX command. Fix both, but leave real commands such as \neq, \nu, \nabla alone.
function fixModelText(s) {
  return String(s == null ? '' : s)
    .replace(/\\\\(?=[a-zA-Z])/g, '\\')
    .replace(/\\n(?!eq\b|e\b|u\b|abla|otin|ot\b)/g, '\n')
    .trim();
}

module.exports = { fixModelText, parseJsonObject, scanJsonObjects, stripThinking };
