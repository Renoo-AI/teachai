// Optional Postgres (Neon, Supabase...). Set DATABASE_URL to keep exams, the waiting list and contact
// messages in a free hosted database instead of data/ files, which free hosts wipe on every restart.
let pool = null;
let ready = null;

const enabled = () => !!process.env.DATABASE_URL;

function connectionOptions(env = process.env) {
  const connection = new URL(env.DATABASE_URL);
  const local = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(connection.hostname);
  // URL SSL parameters must not override certificate verification.
  for (const name of [...connection.searchParams.keys()]) {
    if (name.toLowerCase().startsWith('ssl')) connection.searchParams.delete(name);
  }
  const ssl = { rejectUnauthorized: true };
  for (const [option, variable] of [['ca', 'DATABASE_CA_FILE'], ['cert', 'DATABASE_CERT_FILE'], ['key', 'DATABASE_KEY_FILE']]) {
    if (env[variable]) ssl[option] = require('fs').readFileSync(env[variable], 'utf8');
  }
  return { connectionString: connection.toString(), ssl: local ? false : ssl };
}

function init() {
  if (!ready) {
    const { Pool } = require('pg');
    // Timeouts matter: a database that does not answer must produce an error, never a request that hangs for ever.
    pool = new Pool({ ...connectionOptions(), max: 3, connectionTimeoutMillis: 8000, idleTimeoutMillis: 30000, query_timeout: 15000 });
    pool.on('error', (e) => console.error('database connection error:', e.message));
    ready = pool.query(`
      CREATE TABLE IF NOT EXISTS exams (id text PRIMARY KEY, data jsonb NOT NULL, updated_at bigint NOT NULL);
      CREATE TABLE IF NOT EXISTS waitlist (email text PRIMARY KEY, role text, lang text, at text);
      CREATE TABLE IF NOT EXISTS messages (id serial PRIMARY KEY, at text, name text, email text, message text, lang text, done boolean DEFAULT false);
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS done boolean DEFAULT false;
      ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS invited text;
      CREATE TABLE IF NOT EXISTS docs (ns text NOT NULL, key text NOT NULL, value jsonb NOT NULL, ts bigint NOT NULL, PRIMARY KEY (ns, key));
      CREATE TABLE IF NOT EXISTS logs (id bigserial PRIMARY KEY, ns text NOT NULL, ts bigint NOT NULL, row jsonb NOT NULL);
      CREATE INDEX IF NOT EXISTS logs_ns_id ON logs (ns, id);
      -- Supabase exposes every table through its public API. With row-level security on and no policies, that API
      -- (and the publishable key) can read nothing; this server connects as the table owner and is not affected.
      ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
      ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
      ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
      ALTER TABLE docs ENABLE ROW LEVEL SECURITY;
      ALTER TABLE logs ENABLE ROW LEVEL SECURITY;
    `);
    ready.catch((e) => { console.error('database setup failed:', e.message); ready = null; });
  }
  return ready;
}

async function query(text, params) {
  await init();
  return pool.query(text, params);
}

module.exports = { enabled, query, connectionOptions };
