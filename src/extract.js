// Pulls plain text out of uploaded lesson files.
// .txt/.md work with no extra packages. .pdf and .docx need the optional
// packages pdf-parse and mammoth (installed by default via optionalDependencies).
// .pptx and scanned images need OCR/parsing that is not in this build.

async function extractText(name, base64) {
  const buf = Buffer.from(base64, 'base64');
  const lower = String(name || '').toLowerCase();

  if (lower.endsWith('.txt') || lower.endsWith('.md')) {
    return buf.toString('utf8');
  }

  if (lower.endsWith('.pdf')) {
    let pdfParse;
    try { pdfParse = require('pdf-parse'); } catch (_) {
      throw new Error('PDF support is not installed. Run npm install, or paste the text.');
    }
    const out = await pdfParse(buf);
    return out.text;
  }

  if (lower.endsWith('.docx')) {
    let mammoth;
    try { mammoth = require('mammoth'); } catch (_) {
      throw new Error('Word support is not installed. Run npm install, or paste the text.');
    }
    const out = await mammoth.extractRawText({ buffer: buf });
    return out.value;
  }

  throw new Error('This file type is not supported yet. Use PDF, Word (.docx), .txt, .md, or paste the text.');
}

module.exports = { extractText };
