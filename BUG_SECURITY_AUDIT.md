# Teach.ai bug and security audit

Date: 2026-10-14. Scope: local working tree; HTTP routes, access/admin controls, storage, generation, upload/export boundaries, browser rendering and deployment configuration. The findings and patch proposals below record the original audit.

## Remediation status — 2026-10-14

All seven findings have now been addressed in the working tree. `npm test` passes all 24 tests, including eight targeted regression subtests and the existing real PDF/DOCX checks. Tests preload isolated configuration and temporary storage; no production services or records were used.

Implementation follows the proposals below, with two additions: database admin listing handles existing non-array question values without throwing, and TLS configuration supports explicit CA/client certificate/key files. Backup completeness was tested with 5,001 mocked database rows; TLS verification policy was checked through the actual pg configuration parser, without a live database connection. No TLS interception or load testing was performed.

Admin sign-in follow-up: login and session checks no longer depend on successful history storage. Regression checks simulate both history read and write failures while verifying successful authentication. The new sign-in form distinguishes credential errors from service errors, prevents duplicate submissions, and provides accessible password visibility, Caps Lock, loading and lockout states. The 24-test suite and an additional browser integration test passed; desktop and mobile screenshots were reviewed. The original production failure was not reproduced with live credentials.

The export limiter and generation serialization are per process, consistent with the existing single-server coupon model. Best-effort analytics remain the quota persistence mechanism. Large-backup buffering, the 15 MiB restore cap and restoration of analytics history remain separate limitations noted in M3. Existing malformed exam contents were not rewritten.

## Results

| ID | Severity | Finding |
|---|---|---|
| H1 | High | Invalid saved question data can disable the database-backed admin exam views and backups |
| H2 | High | Public exports have no request or concurrent-render limit |
| M1 | Medium | Imported environment coupons do not revoke existing environment sessions |
| M2 | Medium | Concurrent generation requests bypass daily/monthly quotas |
| M3 | Medium | Database backups silently omit exams beyond 5,000 |
| M4 | Medium | Remote database connections disable certificate verification |
| L1 | Low | Device activity timestamps are never persisted in file mode |

No Critical finding was established. Severity accounts for prerequisites: H1 requires an exam edit key, H2 requires a valid public exam ID, M1 requires a previously issued session, M4 requires interception of the database connection. These are not claims that a live deployment was compromised.

## Data flow and evidence boundaries

- `src/server.js` accepts JSON bodies up to 15 MiB. Access cookies gate generation, assistant/regeneration, AI tests, upload extraction and the paper library. Public exam links intentionally allow reading and exporting; writes require the separate edit key.
- Generation passes bounded lesson text and options to `src/generate.js` / `src/ai.js`, then persists an exam with a hashed edit key. Autosave replaces editable content through `src/store.js`. Postgres or local files hold persistent state.
- Admin routes require the signed admin cookie and a custom header for writes. Database queries inspected use parameters. Browser math rendering escapes ordinary text and disables KaTeX trust. Export rendering intercepts network requests. Public access to answer keys is consistent with the documented view-link model and is not classified as an authentication bypass.
- `.env` and runtime data are ignored and not tracked in the current index. A targeted credential-pattern scan of source, tests, scripts and example configuration found no matches. This is not a Git-history or comprehensive secret audit; actual secret values were not printed.
- Four isolated checks used disposable files, no HTTP requests, no AI calls and no live database: environment-session revocation, acceptance of invalid saved questions, repeated quota checks, and the capped backup query with a mocked database. All four confirmed the reported mechanisms. Export resource exhaustion and TLS interception were not attempted.
- Existing integration tests were inspected but not executed. They import the server, whose environment loader can load local deployment configuration. Third-party dependency internals and current advisory databases were not comprehensively audited; no unsupported CVE claims are made.

## High

### H1 — Saved exam schema is unchecked

**Locations:** `src/server.js:395–399` (PUT handler), `src/store.js:70–85` (`save`), `src/store.js:117` (`listAll`), `public/exam.js:1355` (initialization).

**Mechanism and impact:** The PUT handler spreads the submitted body into `content`, and `save()` persists it without validating `questions` or whitelisting editable properties. An editor can save a non-array `questions` value. This immediately breaks that exam's browser initialization. In Postgres, `jsonb_array_length(data->'questions')` then throws when listing that record, causing admin exam lists, overview/statistics consumers and backups to fail. Arbitrary fields such as `hidden` can also enter records. The direct store check returned 200 and persisted an object as `questions`.

**Remediation patch:** Add the following helper above `save()` in `src/store.js`. It uses the existing export normalizer for bounded content and safe image data, preserves editor-only fields, and rejects invalid question containers rather than storing them. Empty question arrays remain allowed for the editor's delete-all action.

```js
function editableContent(content, record) {
  const bad = () => { throw Object.assign(new Error('Invalid exam content.'), { status: 400 }); };
  const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (!object(content) || !Array.isArray(content.questions) || content.questions.length > 100) bad();
  if (content.groups != null && (!Array.isArray(content.groups) ||
      content.groups.length > 30 || content.groups.some(g => !object(g)))) bad();
  for (const q of content.questions) {
    if (!object(q) || !['mcq', 'tf', 'short', 'essay'].includes(q.type)) bad();
    if (typeof q.prompt !== 'string' || q.prompt.length > 30000) bad();
    if (typeof q.points !== 'number' || !Number.isFinite(q.points) || q.points < 0 || q.points > 100) bad();
    if (q.choices != null && (!Array.isArray(q.choices) || q.choices.length > 6 ||
        q.choices.some(c => typeof c !== 'string' || c.length > 4000))) bad();
    for (const k of ['answer', 'rubric', 'source', 'topic']) {
      if (q[k] != null && typeof q[k] !== 'string') bad();
    }
  }
  const safe = require('./export').snapshot(content, record);
  safe.showMargin = content.showMargin !== false;
  safe.nbPages = String(content.nbPages ?? '').slice(0, 20);
  const ids = new Set();
  safe.questions.forEach((q, i) => {
    const raw = content.questions[i];
    let id = typeof raw.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(raw.id)
      ? raw.id : crypto.randomBytes(12).toString('hex');
    while (ids.has(id)) id = crypto.randomBytes(12).toString('hex');
    ids.add(id);
    Object.assign(q, { id, topic: String(raw.topic ?? '').slice(0, 1000), flagged: !!raw.flagged });
  });
  return safe;
}
```

In `save()`, replace the `const next = { ... };` initializer with:

```js
  const next = {
    ...record,
    ...editableContent(content, record),
    id,
    editKeyHash: record.editKeyHash,
    createdAt: record.createdAt,
    updatedAt: Date.now(),
  };
```

This keeps server-owned fields from the existing record, including `lessonText`, `options`, `by`, `hidden` and `demo`. Audit existing records separately before rollout; rejecting new malformed writes does not repair old records. The export normalizer bounds/coerces header fields, so confirm normal editor round trips as listed below.

### H2 — Export rendering is unbounded

**Locations:** `src/server.js:244–263` (export route), `src/export.js:120–133` (`pageFor` / `pdf`).

**Mechanism and impact:** Any holder of a public exam ID can repeatedly request PDF/DOCX exports without an access cookie or edit key. Each PDF opens a Chromium page; DOCX can also open browser pages for formulas/images. The route has neither a rate limit nor a global concurrency cap. Existing AI rate limits do not cover it. Concurrent exports can exhaust memory/CPU and interrupt all users. No load test was performed.

**Remediation patch:** Add this code at module scope in `src/server.js`, then replace the single `await exporter.render(...)` call as shown. This preserves intentional public downloads, returns backpressure immediately, and bounds the new limiter's memory.

```js
const exportClients = new Map();
let activeExports = 0;
async function boundedExport(ip, exam, format, mode) {
  const now = Date.now();
  for (const [key, slot] of exportClients) {
    if (slot.until <= now) exportClients.delete(key);
  }
  let slot = exportClients.get(ip);
  if (!slot) {
    if (exportClients.size >= 10000) {
      throw Object.assign(new Error('Exports are busy. Try again shortly.'), { status: 503 });
    }
    slot = { until: now + 60000, count: 0 };
    exportClients.set(ip, slot);
  }
  if (slot.count >= 10 || activeExports >= 2) {
    throw Object.assign(new Error('Too many exports. Try again shortly.'), { status: 429 });
  }
  slot.count++;
  activeExports++;
  try { return await exporter.render(exam, format, mode); }
  finally { activeExports--; }
}
```

Replace:

```js
const data=await exporter.render(exam,b.format,mode);
```

with:

```js
const data=await boundedExport(ip,exam,b.format,mode);
```

The limit is per server process. Multiple instances need a shared limiter or deployment-level capacity control. The existing browser-operation timeouts remain necessary; a promise timeout alone would not stop a running browser job.

## Medium

### M1 — Importing an environment coupon leaves its old sessions outside revocation

**Locations:** `src/access.js:145` (`hasAccess`), `src/access.js:161–163` (`checkQuota`), `src/access.js:220` (`importEnv`).

**Mechanism and impact:** Environment redemptions create tokens with `s: 'env'`. Importing the code creates a managed coupon, but old tokens continue to check only whether the code appears in `TEACHAI_COUPONS`. Managed revocation, expiry, device resets and quotas therefore do not apply to those old sessions. The isolated check redeemed an environment code, imported and revoked it, and `hasAccess()` still returned true. New redemptions correctly respect the managed record, making the old-session bypass easy to miss.

**Remediation patch:** Replace the one-line `p.s === 'env'` check in `hasAccess()` with:

```js
  if (p.s === 'env') {
    // Import transfers authority to managed coupons. Re-redeem for a local session.
    if (Object.hasOwn(loadCoupons(), p.i)) return false;
    if (!String(process.env.TEACHAI_COUPONS || '').split(',').map(normalize).includes(p.i)) return false;
  }
```

This intentionally invalidates old environment sessions as soon as a managed record exists, so fresh redemptions receive device tracking and quotas. Teachers will need to enter their code once after import. Leave the managed record present when revoking; deleting it while retaining the environment value explicitly restores environment-based redemption.

### M2 — Quota checks do not account for in-flight generations

**Locations:** `src/server.js:267–268` (quota check), `src/server.js:315–339` (asynchronous generation and subsequent count), `src/access.js:161–172` (`checkQuota`).

**Mechanism and impact:** The daily/monthly total is checked before awaiting body parsing, paper analysis and AI generation. Usage increments only after creating the exam. Several concurrent requests with the same coupon all see the same remaining quota and proceed. The IP hourly limit reduces volume but does not enforce a one-exam remaining coupon quota, especially across IPs. Two direct checks before recording completion both returned allowed; the concurrent route behavior follows from the intervening awaits.

**Remediation patch:** For this codebase's documented single-server coupon model, serialize generation per code using an immediate busy response. Add at module scope in `src/server.js`:

```js
const generatingCodes = new Set();
```

Immediately after the opening line of the `/api/exams/generate` branch, insert:

```js
    if (codeId && generatingCodes.has(codeId)) {
      return send(res, 409, { error: 'An exam is already being generated for this code.' });
    }
    if (codeId) generatingCodes.add(codeId);
    try {
```

Immediately after its final `return send(res, 201, response);` and before the branch's closing brace, insert:

```js
    } finally {
      if (codeId) generatingCodes.delete(codeId);
    }
```

Keep the existing quota check and usage increment inside that `try` block. This is a complete single-process concurrency fix, releasing on validation failure, cancellation, provider failure and success. It does not make best-effort metrics durable: strict quotas across restarts or multiple replicas require an atomic database quota reservation/counter, independent of analytics.

### M3 — Full database backups stop at 5,000 exams

**Locations:** `src/store.js:117` (`listAll`), `src/store.js:155–160` (`dumpAll`), `src/admin.js:306–316` (backup endpoint).

**Mechanism and impact:** `dumpAll()` obtains IDs from the admin summary query, which ends in `LIMIT 5000`. A database with more records produces a successful backup that excludes older exams without reporting truncation. Restoring that backup cannot recover those omitted records. The mock confirmed that `dumpAll()` uses this capped query. File-mode enumeration does not have this cap.

**Remediation patch:** Replace `dumpAll()` in `src/store.js` with this dedicated backup query. Existing file behavior is preserved.

```js
async function dumpAll() {
  if (db.enabled()) {
    const result = await db.query('SELECT data FROM exams ORDER BY id');
    return result.rows.map(row => row.data);
  }
  const out = [];
  for (const name of fs.readdirSync(DATA_DIR)) {
    if (!/^[a-z0-9]{10}\.json$/.test(name)) continue;
    const record = await read(name.slice(0, -5));
    if (record) out.push(record);
  }
  return out;
}
```

This fixes silent omission, not backup scalability: the current download still buffers the backup, and restore uses the general 15 MiB request cap. Large deployments need streamed/paginated backup and chunked restore. Also, the current restore handler does not consume the backup's `stats` field; do not assume downloading that field restores quota history.

### M4 — Database TLS accepts untrusted certificates

**Location:** `src/db.js:12` (`init`, `Pool` configuration).

**Mechanism and impact:** Remote connections explicitly set `ssl: { rejectUnauthorized: false }`. Where this configuration is effective, encryption does not authenticate the database peer, allowing a network interceptor to impersonate the server. The separate `/localhost|127\.0\.0\.1/` test searches the entire connection string, so text in credentials or query parameters can also accidentally select plaintext. Connection-string SSL options may override explicit configuration, making the final behavior dependent on deployment input.

**Remediation patch:** Replace the `pool = new Pool(...)` line with the following. Parse the hostname, use verified TLS for remote hosts, support a trusted private CA, and prevent connection-string SSL options from overriding the policy.

```js
    const connection = new URL(process.env.DATABASE_URL);
    const local = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(connection.hostname);
    for (const name of [...connection.searchParams.keys()]) {
      if (name.toLowerCase().startsWith('ssl')) connection.searchParams.delete(name);
    }
    const ca = process.env.DATABASE_CA_FILE
      ? require('fs').readFileSync(process.env.DATABASE_CA_FILE, 'utf8') : undefined;
    pool = new Pool({
      connectionString: connection.toString(),
      max: 3,
      connectionTimeoutMillis: 8000,
      idleTimeoutMillis: 30000,
      query_timeout: 15000,
      ssl: local ? false : { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    });
```

A deployment using self-signed certificates must supply its trusted CA. A deployment using client certificates must also explicitly configure `cert` and `key` in the SSL object before applying this policy; removing URL SSL parameters intentionally removes that implicit configuration.

## Low

### L1 — File-backed device activity updates are discarded

**Location:** `src/access.js:142`, inside `hasAccess()`.

**Mechanism and impact:** `localStatus()` loads one coupon object, and `dev.last` mutates that object. `saveCoupons(loadCoupons())` then reloads the old file and saves the old value. Activity therefore remains at its initial timestamp in file mode, and every later authenticated request repeats the write. Database mode shares `memCoupons`, so it does not exhibit this particular lost update.

**Remediation patch:** Replace the single-line timestamp-update branch with:

```js
      if (Date.now() - dev.last > 5 * 60e3) {
        const all = loadCoupons();
        const current = (all[p.i]?.devices || []).find(x => x.sid === p.d);
        if (!current) return false;
        current.last = Date.now();
        saveCoupons(all);
      }
```

## Verification checklist

Use disposable directories, a local database fixture and stubbed providers. Disable `.env` loading or explicitly isolate all configuration before running the existing integration suite. Never point these checks at production data.

- [ ] H1: Invalid question containers, null entries and invalid choices return 400 without changing the stored record. A normal autosave retains IDs, flags, images, lesson text and attribution; attempts to submit `hidden` or `by` do not change those fields. Empty exams still save. Verify admin listing against existing legacy records.
- [ ] H2: With a stub renderer held pending, at most two exports enter it; further requests get 429. Rejects and errors release slots. The per-IP minute limit resets, and regular public PDF/DOCX/HTML downloads still work.
- [ ] M1: Redeem an environment code, import it, and verify its old cookie is rejected. Re-redeem to obtain a local session; revocation, reset, expiry and device removal reject that session.
- [ ] M2: Hold one stub generation pending. A second request for that code gets 409, a different code proceeds, and cancellation/error releases the code. A coupon with one remaining allowance cannot create two exams.
- [ ] M3: Back up 5,001 fixture records and compare every ID. Restore into a separate empty database and verify counts and edit-key hashes. Check backup size against the restore limit and document the separate stats-restoration limitation.
- [ ] M4: Unit-test parsed hostnames and SSL options, including credentials containing the word `localhost`. In a controlled TLS database fixture, a trusted certificate succeeds and an untrusted or mismatched certificate fails. No production interception tests.
- [ ] L1: With a controlled clock, advance beyond five minutes; after access, reload the coupon file and verify `last` advanced. Another immediate check should not write again.
- [ ] Run the existing suite in an isolated environment after applying patches, then smoke-test create → edit → reload → export and admin import → revoke. Review proposed schema bounds and operational limits before deployment.
