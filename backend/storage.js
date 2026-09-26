import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';
import { readFile } from 'node:fs/promises';

// SQLite operations share one connection; serialize whole transactions, not just queries.
export function sqliteAdapter(raw) {
  const context = new AsyncLocalStorage();
  let queue = Promise.resolve();
  const exclusive = fn => {
    if (context.getStore()) return Promise.resolve().then(fn);
    const result = queue.then(() => context.run(true, fn));
    queue = result.catch(() => {});
    return result;
  };
  return {
    prepare(sql) { return Object.fromEntries(['get','all','run'].map(method => [method, (...args) => exclusive(() => raw.prepare(sql)[method](...args))])); },
    exec: sql => exclusive(() => raw.exec(sql)),
    transaction: fn => exclusive(async () => {
      raw.exec('BEGIN IMMEDIATE');
      try { const result = await fn(); raw.exec('COMMIT'); return result; }
      catch (error) { raw.exec('ROLLBACK'); throw error; }
    }),
    close: () => exclusive(() => raw.close())
  };
}

export function postgresAdapter(pool) {
  const context = new AsyncLocalStorage();
  const query = (sql, params = []) => (context.getStore() || pool).query(sql, params);
  return {
    prepare(sql) {
      let i = 0;
      const statement = sql.replace(/\?/g, () => `$${++i}`);
      return {
        async get(...args) { return (await query(statement, args)).rows[0]; },
        async all(...args) { return (await query(statement, args)).rows; },
        async run(...args) {
          const hasId = /^INSERT INTO (users|watches|observations|alerts|deliveries|browser_read_log)\b/i.test(statement);
          const result = await query(statement + (hasId ? ' RETURNING id' : ''), args);
          return { changes: result.rowCount, lastInsertRowid: result.rows[0]?.id };
        }
      };
    },
    exec: sql => query(sql),
    async transaction(fn) {
      if (context.getStore()) return fn();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const value = await context.run(client, fn);
        await client.query('COMMIT');
        return value;
      } catch(error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
    close: () => pool.end()
  };
}

export async function openPostgres(connectionString) {
  // Domain prices are bounded to 10^12, within JavaScript's safe integer range.
  pg.types.setTypeParser(20, value => Number(value));
  const pool = new pg.Pool({ connectionString, max: 5, connectionTimeoutMillis: 15000 });
  pool.on('error', () => console.error('Conexão com banco interrompida.'));
  const db = postgresAdapter(pool);
  try {
    await db.exec(await readFile(new URL('./postgres-schema.sql', import.meta.url), 'utf8'));
    return db;
  } catch(error) { await pool.end(); throw error; }
}
