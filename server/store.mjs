import { randomBytes, randomUUID, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const scrypt = promisify(scryptCallback);
const COST = { N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 };
export const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
export const sessionHash = (token) => createHash('sha256').update(token).digest('hex');
export const publicUser = (row) => row ? { id: row.id, username: row.username, matches: Number(row.matches), wins: Number(row.wins) } : null;

// Bound expensive password jobs globally to avoid memory exhaustion on small hosts.
let passwordJobs = 0;
async function derive(password, salt) {
  if (passwordJobs >= 2) throw Object.assign(new Error('The sign-in server is busy. Please try again shortly.'), { status: 503 });
  passwordJobs++;
  try { return await scrypt(password, salt, 64, COST); }
  finally { passwordJobs--; }
}
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$131072$8$1$${salt}$${(await derive(password, salt)).toString('hex')}`;
}
export async function checkPassword(password, encoded) {
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts.slice(0, 4).join('$') !== 'scrypt$131072$8$1') return false;
  const actual = await derive(password, parts[4]);
  const expected = Buffer.from(parts[5], 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function validateCredentials(body) {
  if (typeof body.username !== 'string' || !/^[a-zA-Z0-9_]{3,20}$/.test(body.username))
    throw Object.assign(new Error('Use a username with 3–20 letters, numbers or underscores.'), { status: 400 });
  if (typeof body.password !== 'string' || body.password.length < 10 || body.password.length > 128)
    throw Object.assign(new Error('Use a password with 10–128 characters.'), { status: 400 });
  return { username: body.username, key: body.username.toLowerCase(), password: body.password };
}

export async function openStore({ databaseUrl = process.env.DATABASE_URL, sqlitePath = process.env.SQLITE_PATH || './data/inkfront.sqlite', production = process.env.NODE_ENV === 'production' } = {}) {
  if (production && !databaseUrl) throw new Error('DATABASE_URL is required in production. Use durable Postgres, not Render’s temporary filesystem.');
  let query, close;
  if (databaseUrl) {
    const { default: pg } = await import('pg');
    // TLS remains certificate-verified if enabled by the URL or PGSSLMODE.
    // Render's internal connection URL stays on its private network.
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 5, connectionTimeoutMillis: 10000 });
    pool.on('error', () => process.stderr.write('Database connection interrupted.\n'));
    query = async (sql, params = []) => (await pool.query(sql, params)).rows;
    close = () => pool.end();
  } else {
    const { DatabaseSync } = await import('node:sqlite');
    if (sqlitePath !== ':memory:') await mkdir(dirname(resolve(sqlitePath)), { recursive: true });
    const db = new DatabaseSync(sqlitePath, { timeout: 5000 });
    db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');
    query = async (sql, params = []) => {
      const statement = db.prepare(sql.replace(/\$\d+/g, '?'));
      return /^\s*(SELECT|INSERT.*RETURNING|UPDATE.*RETURNING)/is.test(sql) ? statement.all(...params) : (statement.run(...params), []);
    };
    close = async () => db.close();
  }
  await query(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, username TEXT NOT NULL, username_key TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL, created_at BIGINT NOT NULL,
    matches INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0)`);
  await query(`CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at BIGINT NOT NULL)`);
  await query('CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)');
  await query('CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at)');
  const store = {
    async health() { await query('SELECT 1'); },
    async byName(key) { return (await query('SELECT * FROM users WHERE username_key=$1', [key]))[0]; },
    async signup(username, key, password) {
      const row = { id: randomUUID(), username, username_key: key, password_hash: await hashPassword(password), created_at: Date.now(), matches: 0, wins: 0 };
      try { await query('INSERT INTO users (id,username,username_key,password_hash,created_at) VALUES ($1,$2,$3,$4,$5)', [row.id, username, key, row.password_hash, row.created_at]); }
      catch (error) {
        if (error.code === '23505' || error.code?.startsWith('SQLITE_CONSTRAINT') || /UNIQUE constraint/.test(error.message))
          throw Object.assign(new Error('That username is taken. Choose another.'), { status: 409 });
        throw error;
      }
      return row;
    },
    async newSession(id) {
      const token = randomBytes(32).toString('base64url');
      await query('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,$3)', [sessionHash(token), id, Date.now() + SESSION_MS]);
      return token;
    },
    async authenticate(token) {
      if (!token || !/^[\w-]{43}$/.test(token)) return null;
      return (await query('SELECT users.*,sessions.expires_at FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=$1 AND expires_at>$2', [sessionHash(token), Date.now()]))[0] || null;
    },
    async logout(token) { if (token) await query('DELETE FROM sessions WHERE token_hash=$1', [sessionHash(token)]); },
    async changePassword(id, password) {
      const encoded = await hashPassword(password);
      await query('UPDATE users SET password_hash=$1 WHERE id=$2', [encoded, id]);
      await query('DELETE FROM sessions WHERE user_id=$1', [id]);
    },
    async recordMatch(id, won) { await query('UPDATE users SET matches=matches+1,wins=wins+$1 WHERE id=$2', [won ? 1 : 0, id]); },
    async prune() { await query('DELETE FROM sessions WHERE expires_at<$1', [Date.now()]); },
    close,
  };
  await store.prune();
  return store;
}
