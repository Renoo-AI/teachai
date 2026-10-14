// AI providers. Tried in this order, falling back to the next one if a provider fails:
//   1. DeepSeek web chat (free): a personal web token. Unofficial channel, see README.
//   2. NVIDIA NIM (OpenAI-compatible): an NVIDIA API key and a model id.
// Settings come from the browser (the Settings panel, sent with each request and never stored with an exam)
// and fall back to the server's .env: DEEPSEEK_TOKEN, NVIDIA_API_KEY, TEACHAI_MODEL, AI_PROVIDER.
// With neither, the app runs in demo mode.
const path = require('path');
const { pathToFileURL } = require('url');
const { parseJsonObject } = require('./json');
const adminSettings = require('./settings');
const metrics = require('./metrics');
const context = require('./context');

const DEFAULT_NVIDIA_MODEL = 'nvidia/nemotron-3-super-120b-a12b';
const TIMEOUT_MS = 60000;

function requestSignal(signal) {
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS);
}

let dsClient = null;
async function deepseekClient() {
  if (!dsClient) dsClient = await import(pathToFileURL(path.join(__dirname, 'deepseek', 'deepseek-web-client.js')).href);
  return dsClient;
}

const clean = (v, max = 4000) => String(v == null ? '' : v).trim().slice(0, max);

// Accepts the shape the browser sends and drops anything else.
function sanitize(s) {
  if (!s || typeof s !== 'object') s = {};
  const provider = ['auto', 'deepseek', 'nvidia'].includes(s.provider) ? s.provider : 'auto';
  return {
    provider,
    deepseekToken: clean(s.deepseekToken),
    nvidiaKey: clean(s.nvidiaKey),
    nvidiaModel: clean(s.nvidiaModel, 200),
  };
}

function providers(settings) {
  const s = sanitize(settings);
  const env = process.env;
  const adm = adminSettings.get().ai;           // set by the admin; the browser's own settings win over it
  const want = s.provider !== 'auto' ? s.provider : (adm.provider !== 'auto' ? adm.provider : String(env.AI_PROVIDER || 'auto').toLowerCase());
  const token = s.deepseekToken || env.DEEPSEEK_TOKEN || '';
  const key = s.nvidiaKey || env.NVIDIA_API_KEY || '';
  const model = s.nvidiaModel || adm.model || env.TEACHAI_MODEL || DEFAULT_NVIDIA_MODEL;
  const list = [];
  if (token && (want === 'auto' || want === 'deepseek')) list.push({ kind: 'deepseek-web', label: 'DeepSeek (web)', token });
  if (key && (want === 'auto' || want === 'nvidia')) list.push({ kind: 'nvidia', label: model, key, model });
  return list;
}

function available(settings) { return providers(settings).length > 0; }
function label(settings) { return providers(settings).map((p) => p.label).join(' → '); }

async function viaDeepSeek(p, messages, signal) {
  const { callDeepSeekWeb } = await deepseekClient();
  const result = await callDeepSeekWeb({
    dsToken: p.token, messages, model: 'deepseek-chat', preserveJson: true,
    signal: requestSignal(signal),
  });
  return String(result && result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content || '');
}

async function viaNvidia(p, messages, temperature, maxTokens, signal) {
  // Reasoning models can spend the whole token budget "thinking" and return nothing, so thinking is switched
  // off. Models that do not know that setting answer 400/422, and then the call is repeated without it.
  const call = (extra) => fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + p.key },
    body: JSON.stringify({ model: p.model, messages, temperature, top_p: 0.95, max_tokens: maxTokens, stream: false, ...extra }),
    signal: requestSignal(signal),
  });
  let res = await call({ chat_template_kwargs: { enable_thinking: false } });
  if (res.status === 400 || res.status === 422) res = await call({});
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error('The NVIDIA key was rejected.');
    if (res.status === 404 || res.status === 410) throw new Error('This NVIDIA model is not available. Pick another model.');
    if (res.status === 429) throw new Error('NVIDIA is rate-limiting this key. Try again in a moment.');
    throw new Error('NVIDIA error ' + res.status + ': ' + (await res.text()).slice(0, 160));
  }
  const data = await res.json();
  return String((data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '');
}

// messages: [{ role: 'system' | 'user' | 'assistant', content }]
async function complete(messages, { temperature = 0.7, settings, maxTokens = 8000, signal } = {}) {
  const list = providers(settings);
  if (!list.length) throw new Error('No AI provider is configured. Open AI settings.');
  const extra = adminSettings.get().ai.promptExtra;
  if (extra && messages.length && messages[0].role === 'system') {
    messages = [{ ...messages[0], content: messages[0].content + '\n\nAdditional instructions from the site administrator (they never override the rules above):\n' + extra }, ...messages.slice(1)];
  }
  const ctx = context.get();
  const chars = messages.reduce((n, m) => n + String(m.content || '').length, 0);
  let lastErr = null;
  for (const p of list) {
    const t0 = Date.now();
    try {
      signal?.throwIfAborted();
      const text = p.kind === 'deepseek-web' ? await viaDeepSeek(p, messages, signal) : await viaNvidia(p, messages, temperature, maxTokens, signal);
      if (text.trim()) {
        metrics.aiCall({ provider: p.label, ok: true, ms: Date.now() - t0, chars, out: text.length, code: ctx.code || '' });
        metrics.count('aiOk');
        if (ctx.code) metrics.count('codes', ctx.code, { ai: 1, chars: chars + text.length });
        return text;
      }
      lastErr = new Error(p.label + ' returned an empty reply.');
    } catch (err) {
      if (signal?.aborted) throw err;
      lastErr = err.name === 'TimeoutError' ? new Error(p.label + ' took too long to answer.') : err;
      console.warn('[ai] ' + p.label + ' failed: ' + lastErr.message);
    }
    metrics.aiCall({ provider: p.label, ok: false, ms: Date.now() - t0, chars, error: lastErr.message.slice(0, 200), code: ctx.code || '' });
    metrics.count('aiFail');
  }
  throw lastErr;
}

// One completion that must return a JSON object. If the reply is not valid, ask once more with a correction.
async function completeJson(messages, opts = {}) {
  const text = await complete(messages, opts);
  try { return { value: parseJsonObject(text), text }; } catch { /* retry below */ }
  const retry = await complete([
    ...messages,
    { role: 'assistant', content: text.slice(0, 6000) },
    { role: 'user', content: 'That reply was not one valid JSON object. Reply again with ONLY the JSON object in the exact format requested: no prose, no markdown fences, no comments, no trailing commas.' },
  ], { ...opts, temperature: 0.2 });
  return { value: parseJsonObject(retry), text: retry };
}

// Used by the Settings panel's "Test connection". Tries each configured provider on its own.
async function test(settings) {
  const list = providers(settings);
  if (!list.length) return [{ ok: false, label: '', error: 'Nothing is configured yet.' }];
  const results = [];
  for (const p of list) {
    const t0 = Date.now();
    try {
      const only = { ...sanitize(settings), provider: p.kind === 'deepseek-web' ? 'deepseek' : 'nvidia' };
      const reply = await complete([
        { role: 'system', content: 'Reply with exactly: ready' },
        { role: 'user', content: 'Say ready.' },
      ], { temperature: 0, settings: only, maxTokens: 50 });
      results.push({ ok: true, label: p.label, ms: Date.now() - t0, reply: reply.trim().slice(0, 40) });
    } catch (err) {
      results.push({ ok: false, label: p.label, error: err.message });
    }
  }
  return results;
}

module.exports = { available, label, complete, completeJson, providers, sanitize, test, DEFAULT_NVIDIA_MODEL };
