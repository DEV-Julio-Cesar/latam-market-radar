import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDatabase(filename) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS watches (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), name TEXT NOT NULL,
      item_id INTEGER, server TEXT NOT NULL, refine INTEGER, alert_type TEXT NOT NULL CHECK(alert_type IN ('compra','venda')),
      target_price INTEGER CHECK(target_price > 0), active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS observations (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), name TEXT NOT NULL,
      item_id INTEGER, server TEXT NOT NULL, refine INTEGER, price INTEGER NOT NULL CHECK(price > 0),
      quantity INTEGER NOT NULL CHECK(quantity > 0), observed_at TEXT NOT NULL, created_at TEXT NOT NULL,
      source TEXT NOT NULL, request_id TEXT NOT NULL, UNIQUE(user_id, request_id)
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), watch_id INTEGER NOT NULL REFERENCES watches(id),
      observation_id INTEGER NOT NULL REFERENCES observations(id), name TEXT NOT NULL, server TEXT NOT NULL,
      alert_type TEXT NOT NULL, price INTEGER NOT NULL, target_price INTEGER NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(watch_id, observation_id)
    );
    CREATE TABLE IF NOT EXISTS deliveries (
      id INTEGER PRIMARY KEY, alert_id INTEGER NOT NULL REFERENCES alerts(id), channel TEXT NOT NULL,
      status TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL,
      UNIQUE(alert_id, channel)
    );
    CREATE INDEX IF NOT EXISTS idx_observations_user_date ON observations(user_id, observed_at);
    CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id);
    CREATE INDEX IF NOT EXISTS idx_watches_user ON watches(user_id);
    CREATE TABLE IF NOT EXISTS browser_offers (
      user_id INTEGER NOT NULL REFERENCES users(id), watch_id INTEGER NOT NULL REFERENCES watches(id),
      offers_json TEXT NOT NULL, observed_at TEXT NOT NULL, pages_read INTEGER NOT NULL,
      partial INTEGER NOT NULL, PRIMARY KEY(user_id,watch_id)
    );
  `);
  // Rebuild only the legacy table; IDs and referencing alerts remain unchanged.
  if(db.prepare('PRAGMA table_info(watches)').all().find(c=>c.name==='target_price')?.notnull) {
    db.exec('PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE');
    try {
      db.exec(`CREATE TABLE watches_nullable (
        id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), name TEXT NOT NULL,
        item_id INTEGER, server TEXT NOT NULL, refine INTEGER, alert_type TEXT NOT NULL CHECK(alert_type IN ('compra','venda')),
        target_price INTEGER CHECK(target_price > 0), active INTEGER NOT NULL DEFAULT 1
      ); INSERT INTO watches_nullable SELECT * FROM watches;
      DROP TABLE watches; ALTER TABLE watches_nullable RENAME TO watches;
      CREATE INDEX idx_watches_user ON watches(user_id);`);
      if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Falha na integridade da migração.');
      db.exec('COMMIT');
    } catch(error) {db.exec('ROLLBACK');db.close();throw error;}
    db.exec('PRAGMA foreign_keys = ON');
  }
  for(const table of ['watches','observations']) {
    if(!db.prepare(`PRAGMA table_info(${table})`).all().some(c=>c.name==='grade'))db.exec(`ALTER TABLE ${table} ADD COLUMN grade TEXT CHECK(grade IS NULL OR grade IN ('none','D','C','B','A'))`);
  }
  db.exec(`CREATE TABLE IF NOT EXISTS user_discord (user_id INTEGER PRIMARY KEY REFERENCES users(id), webhook TEXT, enabled INTEGER NOT NULL DEFAULT 0); PRAGMA user_version = 4;`);
  return db;
}
