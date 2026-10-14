# Teach.ai

Turn a lesson into an editable, printable exam with an answer key. Teachers need no login.

## Site, brand and theme

- **Pages:** `/` landing page, `/about`, `/faq`, `/contact` (a form that stores messages in `data/messages.jsonl`), `/access` (code entry), `/app` the exam creator, `/e/<id>` the editor, `/privacy`, `/terms`, `/cookies`, a 404 page and a 500 error page, plus `robots.txt` and `sitemap.xml`. The landing, about, contact and FAQ pages come in English, French and Arabic (`public/site-i18n.js`); the legal pages are English only. Header and footer are shared (`public/partials/`), and empty copy slots are filled in English on the server so search engines see the full text.
- **Before launch:** fill in `public/site-config.js` (legal entity name, address, contact email) and set `SITE_URL` (for example `https://teach.ai`) so link previews, the sitemap and canonical URLs are absolute. Until the entity name and email are set, the privacy and terms pages show a draft notice. Have a lawyer in Qatar review both pages.
- **Brand:** one logo (an exam sheet with a check) generated from any accent colour in `public/brand.js`. The favicon, in-page mark and PNG icons share it. `npm run brand` regenerates `public/brand/` (SVG, PNG icons, `favicon.ico`, share image); pass another colour to rebrand: `node scripts/make-brand.js "#FF6B4A"`.
- **Theme:** light, dark or automatic, plus any accent colour, chosen with the palette icon in the top bar and kept in the browser (`public/theme.js`, `theme-ui.js`). The logo, favicon and the whole interface follow the accent. The printed paper stays white in every mode. App styles are in `public/theme.css` on top of `app.css`, marketing styles in `public/site.css`. Fonts (Geist, Instrument Serif, Noto Sans Arabic) are self-hosted under `public/fonts/`.
- **Waiting list:** the landing page collects emails (for an access code and for school plans) into `data/waitlist.jsonl` (git-ignored; `TEACHAI_WAITLIST_DIR` moves it). It holds personal data and is covered in the privacy policy.

## Invite-only access

The app is closed by default. Creating exams and everything that uses the AI (generation, the editor assistant, regenerating a question, file extraction, the real-paper library, the AI test) need an access code. Open exam links, saving through an edit link, exports, the waiting list and the public pages stay open. Visiting `/app` without a code redirects to `/access`.

- **How it works:** a code is redeemed on the `/access` page. The server answers with a signed, HttpOnly cookie (`ta_access`, up to 30 days, SameSite=Lax, Secure on https) and every protected API route checks it. Redeeming is rate limited (10 tries an hour per address).
- **One teacher, one code, one device:** codes are single-use by default.
  ```bash
  npm run coupon -- create --for "Teacher X1"              # random one-time code
  npm run coupon -- create --code COUPON1 --for "X1"        # a code you choose
  npm run coupon -- create --for "X2" --max 2 --days 30     # two devices, expires in 30 days
  npm run coupon -- list
  npm run coupon -- reset COUPON1                           # same teacher, new phone or cleared cookies
  npm run coupon -- revoke COUPON1                          # stops it now, even for someone already inside
  ```
  Codes are stored in `data/coupons.json` (git-ignored). `TEACHAI_COUPONS="A,B"` adds static codes with no limits. `ACCESS_REQUIRED=0` turns the gate off (local development).
- **Waiting list:** people who join it get nothing automatically. Read `data/waitlist.jsonl`, create a code for each person you approve and send it to them.
- **Your own coupon service (for example on Vercel):** set `ACCESS_API_URL` and `ACCESS_API_KEY`. The server then sends `POST {"code":"ABCD1234"}` with `Authorization: Bearer <key>` and expects `{"ok":true,"id":"teacher-7","expires":"2026-12-31T00:00:00Z"}` (`id` and `expires` are optional) or `{"ok":false}`. Your service owns one-time use and revocation; a session lasts until the code's `expires` date or 30 days. If your service is unreachable the visitor gets a 503, never access.
- **Hosting note:** this server stores exams, coupons and the waiting list as files and exports PDFs with a local Chrome or Edge. That needs a host with a persistent disk (a VPS, Render, Railway, Fly). Vercel serverless functions have no persistent disk, so use Vercel for the small coupon and token service and keep this app on a persistent host, or move the storage to a database first.

## Admin page (`/admin`)

One password (`ADMIN_PASSWORD`, set it in `.env` or in the host's environment; the page is off without it). English and French, light and dark, works on a phone.

| Section | What you can do |
|---|---|
| Overview | Health at a glance, warnings, 30-day chart, maintenance mode in one click |
| Access codes | Create one or many, edit, revoke or restore (with undo), reset or remove single devices, plans, per-code daily and monthly exam limits, CSV export, import codes from `TEACHAI_COUPONS` |
| Exams | Search and filter, read the questions and the lesson text, hide from everyone, delete, clean up old ones |
| Statistics | Exams per day, visit to download funnel, downloads, AI success rate, subjects, levels, languages, usage per code, codes nobody used |
| AI | Provider status, test, switch provider or model without redeploying, extra instructions, a prompt console, call log |
| Waiting list and Messages | Invite someone (creates a code and a ready email in their language), mark messages answered, export CSV |
| Settings | Maintenance mode, announcement bar, switch access codes on or off, feature switches (PDF, DOCX, HTML, co-worker, upload, papers) with a beta list, plans and limits, retention, blocked addresses |
| System | Health, PDF self-test, error log, backup download and restore |
| History | Every sign-in and every change |

Safety: signed `SameSite=Strict` cookie, a header on every write, five wrong passwords lock the address for 15 minutes, an optional `ADMIN_IPS` allow-list, and a new-device warning. Settings, codes and counters are stored in the database when `DATABASE_URL` is set, otherwise in `data/kv/` and `data/coupons.json`.
## Run it

Requires Node.js 22.12 or newer.

```bash
npm install          # optional: enables PDF and Word (.docx) upload
npm start            # http://localhost:3000 (landing page; the app is at /app)
```

The creation screen guides teachers through lesson entry, class and subject, then paper customisation, with a live structure preview. Upload and paste are available together. Generation reports the actual writing, checking and correction stages and can be cancelled without losing the lesson on the page.

PDF and DOCX downloads are generated on the server from the current exam snapshot, including unsaved edits for authorised editors. PDF generation needs an installed Chrome, Edge or Chromium browser; Windows Edge is detected automatically. On another host, set `TEACHAI_BROWSER_PATH` to its browser executable. Print preview uses a separate document with embedded fonts and no editor UI. Native printing opens a separate copy so its dialog does not block the editor; embedded browsers that block popups can use Download PDF.

DOCX is a real OOXML Word document. Formulas are embedded as rendered images, while question and answer text remains editable. Fonts and KaTeX used by the editor and exported paper are local assets.

The AI has a shared exam-only role, treats lesson and reference content as untrusted data, and rejects code and unsupported actions. Generated questions must pass structural and source-quote validation after at most one correction attempt. This checks structure and quotations, not factual correctness; teachers should review the final paper. Lesson input is limited to 60,000 characters and generation to 40 questions. Browser cancellation also aborts the provider request.

Run `npm test` for AI-boundary, scoring, API, PDF and DOCX checks. `TEACHAI_DATA_DIR` can point an isolated test server at a disposable exam directory.

### AI providers

Copy `.env.example` to `.env` and fill in one or both. `.env` is git-ignored, so keys never get pushed.

| Provider | Setting | Notes |
| --- | --- | --- |
| DeepSeek web chat (free) | `DEEPSEEK_TOKEN` | Your personal `userToken` from chat.deepseek.com (DevTools, Application, Local Storage). This is DeepSeek's web chat, not its API, so it is unofficial: DeepSeek can change or limit it at any time. The proof-of-work solver and client come from the SchoolMemory/Sunbeam project (`src/deepseek/`). |
| NVIDIA NIM | `NVIDIA_API_KEY`, optional `TEACHAI_MODEL` | OpenAI-compatible endpoint with a free tier. |

Providers are tried in that order, and if one fails (expired token, rate limit, timeout) the next one answers.
Set `AI_PROVIDER=deepseek` or `nvidia` to force one. With neither set the app runs in **demo mode**:
questions are placeholders built from the lesson's sentences, and the exam page says so.

How the AI is prompted (`src/generate.js`): a system prompt with a narrow role, 12 numbered hard rules and a strict JSON
contract; a spec block with the paper, class, subject style, language, counts and exercise titles; then the lesson.
Every reply is validated (counts per type, number of choices, the answer must be one of the choices, every exercise has
a question). If something is wrong, the model gets one targeted correction message listing the problems. Replies are
parsed tolerantly (code fences, `<think>` blocks, smart quotes, trailing commas). The correct choice is shuffled on the
server so it does not always land on B or C, and marks are scaled to add up to 20.
### Templates built from real papers

The templates are not one shape for everything. They come from reading 524 real papers (collÃ¨ge to Bac, from the
Devoir_TN_7_Bac collection of devoir.tn papers) and are stored in `public/templates.js` (`PLANS`). For every subject and
class group (collÃ¨ge, 1Ã¨re, 2Ã¨me, 3Ã¨me, Bac) a blueprint sets the usual duration (contrÃ´le and synthÃ¨se), the number of
exercises, how the 20 marks are split between them (for example Bac Maths 4 / 5 / 11 ending in a ProblÃ¨me, Bac Physics
2.5 / 4.5 / 7.5 / 5.5 with two chemistry and two physics exercises, Bac SVT 10 / 10), the titles of the parts (FranÃ§ais:
ComprÃ©hension / Langue / Essai, English: Reading / Language / Writing, Italian: Comprensione / Lessico / Grammatica / Fonetica),
the usual coefficient and the language of the paper. CollÃ¨ge sciences are mostly in Arabic, lycÃ©e sciences in French.
The subjects offered for each class and section follow the collection, completed with the curriculum.
Exam languages: French, Arabic, English, Italian, German, Spanish. The header follows real school papers (school,
teacher, class, year, duration, coefficient, name line, note out of 20); the Republic / Ministry heading is optional.
### Real papers as a starting point

Point the app at your collection of real papers with `CORPUS_DIR` in `.env` (default: `~/Downloads/Devoir_TN_7_Bac`):
folders `class/[section]/Trimestre-N/Devoir-de-controle-N/Subject.pdf`. On the home page, "Choose a real paper" lists the
papers of the chosen class and subject, previews the PDF, and reads its structure (number of exercises, marks per exercise,
duration, coefficient, part titles, language). "Use as a model" applies that structure and sends the paper's text to the AI
as a model of style and difficulty, with the rule never to copy its questions. Papers can only be read through the index of
the collection. Paper text is omitted from browser API responses and is sent to the configured AI provider when used as a generation reference.

Double-click `scripts\start.bat` to start the server and open the app.
### Settings, AI co-worker, maths

- **AI settings** (gear icon, top right): choose Automatic, DeepSeek only or NVIDIA only, paste a DeepSeek token or an NVIDIA key, pick the NVIDIA model, and test the connection. Values live in this browser (localStorage) and travel with each request. They are never saved inside an exam. Empty fields fall back to `.env`.
- **AI co-worker** (top of the editor sidebar): type what you want. It can change a word everywhere, delete a question, all true/false or everything, rewrite or make questions easier, add questions or choices, move questions, change marks, header fields and exercise titles. The model only proposes actions from a fixed list (`src/assistant.js`); the editor applies them as one step. Deleting 3 or more questions asks first.
- **Undo / redo**: the arrows in the top bar, Ctrl+Z / Ctrl+Y outside text fields. Every AI action and every edit is a history step.
- **Maths and physics**: LaTeX between dollar signs is typeset with KaTeX (`$q_{noy} = 27{,}2 \times 10^{-19}\,\mathrm{C}$`). Plain notation such as `10^-19` or `q_noy` is typeset automatically too. Click a formula to edit its source. Word export converts formulas to Unicode text (xÂ², Hâ‚‚O, âˆš).
## What it does

- **Create:** paste a lesson, or upload .txt, .md, .pdf or .docx. Choose the number
  of multiple choice, true/false, short answer and essay questions, points per type,
  choices per question, difficulty, grade and language.
- **Edit:** change any text inline, pick the correct answer, reorder, add, delete,
  change a question's type, regenerate one question (with an optional note), add a
  question image, upload a school logo, and edit the header fields.
- **Co-workers without login:** each exam gets two links.
  - **Edit link** (`/e/<id>#k=<key>`): anyone with it can change the exam. Changes autosave.
  - **View link** (`/e/<id>`): read-only.
- **Print:** "Print exam" gives the student copy (no answers, no margin notes).
  "Print answer key" adds the margin with answers and sources. Both use the browser's
  print dialog, so choose "Save as PDF" to get a PDF file.
- **Downloads:** "Download PDF" saves a print-ready student copy. "Download DOCX" saves an editable Word document. The print-preview dialog also offers a PDF of the answer key.
- **Retention:** exams not edited for 30 days are deleted automatically.

## Project layout

```
src/server.js          HTTP server and API routes
src/generate.js    Prompts, validation and question generation (or demo mode)
src/ai.js          AI providers with fallback (DeepSeek web, NVIDIA)
src/deepseek/      DeepSeek web client and proof-of-work solver (from SchoolMemory)
src/json.js        Tolerant JSON parsing of model replies
src/extract.js     Text extraction for uploaded files
src/store.js       File-based exam storage with hashed edit keys
public/            landing.html (site), index.html + home.js (create), exam.html + exam.js (edit/view), faq / privacy / terms / 404,
                   theme.js + theme.css (accent and dark mode), brand.js + brand/ (logo, icons), site.css + site.js (public pages)
scripts/make-brand.js Regenerates the PNG icons, favicon and share image
data/exams/        Saved exams (created at runtime)
```

## API

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/exams/generate` | Body: `{ lesson, title, options }`. Returns `{ id, editKey, exam }`. Rate limited to 20 per hour per device. |
| GET | `/api/exams/:id` | Exam without lesson text. Public (view link). |
| PUT | `/api/exams/:id` | Save the exam. Requires header `x-edit-key`. |
| POST | `/api/exams/:id/questions/regenerate` | Body: `{ index, instruction }`. Requires `x-edit-key`. |
| POST | `/api/extract` | Body: `{ name, data }` (base64). Returns `{ text }`. |
| POST | `/api/waitlist` | Body: `{ email, role, lang }`. Rate limited, de-duplicated, never reveals whether an address is already listed. |

## Known limits in this build

- No live presence: the editor does not show who else is editing. Saves are last-write-wins.
- Scanned PDFs and photos need OCR, which is not included. Text-based PDFs work.
- PowerPoint (.pptx) upload is not supported yet. Paste the text instead.
- Arabic papers use right-to-left layout, including PDF and DOCX output.
- The lesson text is stored with the exam so single questions can be regenerated.
  It is removed from every response, but it stays on the server until the exam is deleted.
  Decide whether this is acceptable before launch.
- Data is stored in local JSON files. Use a database before running this for many users.
