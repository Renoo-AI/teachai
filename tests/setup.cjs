// Preloaded by npm test in every test process: never read deployment configuration.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
require('../src/env').load = () => {};
for (const name of Object.keys(process.env)) {
  if (/^(TEACHAI_|DATABASE_|ACCESS_|ADMIN_|NVIDIA_|DEEPSEEK_|AI_PROVIDER$|SITE_URL$|TRUST_PROXY$|CORPUS_DIR$)/.test(name)) delete process.env[name];
}
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'teachai-suite-'));
Object.assign(process.env, {
  NODE_ENV: 'test', PORT: '0', DATABASE_URL: '', ACCESS_SECRET: 'isolated-test-secret',
  TEACHAI_DATA_DIR: path.join(dir, 'exams'), TEACHAI_ACCESS_DIR: dir,
  TEACHAI_WAITLIST_DIR: dir, TEACHAI_CONTACT_DIR: dir,
  CORPUS_DIR: path.join(dir, 'papers'),
});
process.on('exit', () => {
  if (path.dirname(path.resolve(dir)) === path.resolve(os.tmpdir()) && path.basename(dir).startsWith('teachai-suite-')) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
