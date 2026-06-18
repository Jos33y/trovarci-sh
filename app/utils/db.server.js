/**
 * Database connection.
 *
 * Uses porsager/postgres. One pool per process. In development, the pool is
 * attached to globalThis so Vite HMR does not leak connections on every file
 * save (each module reload would otherwise create a fresh pool).
 *
 * Pool sizing defaults:
 *   production   max=20  (Hetzner VPS, single app process, PG default is 100)
 *   development  max=5   (local Postgres, single developer)
 *
 * Override with DATABASE_POOL_MAX env var if needed.
 */

import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

function createPool() {
  const isProduction = process.env.NODE_ENV === 'production';
  const defaultMax = isProduction ? 20 : 5;
  const max = Number(process.env.DATABASE_POOL_MAX) || defaultMax;

  return postgres(process.env.DATABASE_URL, {
    max,
    idle_timeout: 20,       // seconds; close idle connections after 20s
    max_lifetime: 60 * 30,  // seconds; recycle connections every 30 minutes
    connect_timeout: 10,    // seconds
    prepare: true,          // prepared statements on (safe with tagged templates)
    onnotice: () => {},     // suppress NOTICE spam in logs
  });
}

let sql;

if (process.env.NODE_ENV === 'production') {
  sql = createPool();
} else {
  if (!globalThis.__trov_sql) {
    globalThis.__trov_sql = createPool();
  }
  sql = globalThis.__trov_sql;
}

export { sql };

/**
 * Graceful shutdown. Call from the server's SIGTERM/SIGINT handler.
 */
export async function closePool() {
  await sql.end({ timeout: 5 });
}
