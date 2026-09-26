
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS watches (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), name TEXT NOT NULL,
      item_id INTEGER, server TEXT NOT NULL, refine INTEGER, alert_type TEXT NOT NULL CHECK(alert_type IN ('compra','venda')),
      target_price BIGINT CHECK(target_price > 0), active INTEGER NOT NULL DEFAULT 1, grade TEXT CHECK(grade IS NULL OR grade IN ('none','D','C','B','A'))
    );
    CREATE TABLE IF NOT EXISTS observations (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), name TEXT NOT NULL,
      item_id INTEGER, server TEXT NOT NULL, refine INTEGER, price BIGINT NOT NULL CHECK(price > 0),
      quantity INTEGER NOT NULL CHECK(quantity > 0), observed_at TEXT NOT NULL, created_at TEXT NOT NULL,
      grade TEXT CHECK(grade IS NULL OR grade IN ('none','D','C','B','A')), source TEXT NOT NULL, request_id TEXT NOT NULL, UNIQUE(user_id, request_id)
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), watch_id INTEGER NOT NULL REFERENCES watches(id),
      observation_id INTEGER NOT NULL REFERENCES observations(id), name TEXT NOT NULL, server TEXT NOT NULL,
      alert_type TEXT NOT NULL, price BIGINT NOT NULL, target_price BIGINT NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(watch_id, observation_id)
    );
    CREATE TABLE IF NOT EXISTS deliveries (
      id SERIAL PRIMARY KEY, alert_id INTEGER NOT NULL REFERENCES alerts(id), channel TEXT NOT NULL,
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
  CREATE TABLE IF NOT EXISTS browser_connections (
      user_id INTEGER PRIMARY KEY REFERENCES users(id),token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,last_read TEXT,status TEXT NOT NULL DEFAULT 'Aguardando extensão'
    ); CREATE TABLE IF NOT EXISTS browser_snapshots (
      user_id INTEGER NOT NULL, watch_id INTEGER NOT NULL, fingerprint TEXT NOT NULL,
      observed_at TEXT NOT NULL, PRIMARY KEY(user_id,watch_id)
    ); CREATE TABLE IF NOT EXISTS browser_read_log (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL,watch_id INTEGER NOT NULL,
      item_name TEXT NOT NULL,status TEXT NOT NULL,reader_version TEXT NOT NULL,
      detail TEXT NOT NULL,received_at TEXT NOT NULL
    );
CREATE TABLE IF NOT EXISTS user_discord (user_id INTEGER PRIMARY KEY REFERENCES users(id), webhook TEXT, enabled INTEGER NOT NULL DEFAULT 0);