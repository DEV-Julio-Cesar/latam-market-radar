import { sqliteAdapter } from "./storage.js";
// Shared persistence contract for the SQLite and PostgreSQL adapters.
export class MarketRepository {
  constructor(db) {
    this.db = db.transaction ? db : sqliteAdapter(db);
  }
  async transaction(fn) { return this.db.transaction(fn); }
  async discord(userId) {
    return await this.db.prepare('SELECT webhook,enabled FROM user_discord WHERE user_id=?').get(userId);
  }
  async saveDiscord(userId, webhook, enabled) {
    return await this.transaction(async () => {
      await this.db.prepare("UPDATE deliveries SET status='disabled',detail='Configuracao Discord alterada.' WHERE channel='discord' AND status='pending' AND alert_id IN (SELECT id FROM alerts WHERE user_id=?)").run(userId);
      await this.db.prepare('INSERT INTO user_discord VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET webhook=excluded.webhook,enabled=excluded.enabled').run(userId, webhook, Number(enabled));
    });
  }
  async createUser(email, hash) {
    const result = await this.db.prepare('INSERT INTO users(email,password_hash,created_at) VALUES(?,?,?)').run(email, hash, new Date().toISOString());
    return await this.userById(Number(result.lastInsertRowid));
  }
  async userByEmail(email) {
    return await this.db.prepare('SELECT * FROM users WHERE email=?').get(email);
  }
  async userById(id) {
    return await this.db.prepare('SELECT id,email FROM users WHERE id=?').get(id);
  }
  async createSession(hash, userId, expires) {
    await this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
    await this.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash, userId, expires);
  }
  async session(hash) {
    return await this.db.prepare('SELECT * FROM sessions WHERE token_hash=? AND expires_at > ?').get(hash, new Date().toISOString());
  }
  async deleteSession(hash) {
    await this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash);
  }
  async watches(userId) {
    return await this.db.prepare('SELECT * FROM watches WHERE user_id=? ORDER BY id DESC').all(userId);
  }
  async watch(userId, id) {
    return await this.db.prepare('SELECT * FROM watches WHERE user_id=? AND id=?').get(userId, id);
  }
  async offers(userId, id) {
    const row = await this.db.prepare('SELECT offers_json,observed_at,pages_read,partial FROM browser_offers WHERE user_id=? AND watch_id=?').get(userId, id);
    return row ? {
      offers: JSON.parse(row.offers_json),
      observed_at: row.observed_at,
      pages_read: row.pages_read,
      partial: Boolean(row.partial)
    } : null;
  }
  async setTarget(userId, id, target) {
    await this.db.prepare('UPDATE watches SET target_price=? WHERE user_id=? AND id=?').run(target, userId, id);
    return await this.watch(userId, id);
  }
  async createWatch(userId, w) {
    const result = await this.db.prepare('INSERT INTO watches(user_id,name,item_id,server,refine,alert_type,target_price,grade) VALUES(?,?,?,?,?,?,?,?)').run(userId, w.name, w.item_id, w.server, w.refine, w.alert_type, w.target_price, w.grade ?? null);
    return await this.watch(userId, Number(result.lastInsertRowid));
  }
  async toggleWatch(userId, id, active) {
    await this.db.prepare('UPDATE watches SET active=? WHERE user_id=? AND id=?').run(Number(active), userId, id);
    return await this.watch(userId, id);
  }
  async observations(userId) {
    return await this.db.prepare('SELECT * FROM observations WHERE user_id=? ORDER BY observed_at ASC,id ASC').all(userId);
  }
  async observationByRequest(userId, requestId) {
    return await this.db.prepare('SELECT * FROM observations WHERE user_id=? AND request_id=?').get(userId, requestId);
  }
  async createObservation(userId, o, source) {
    const result = await this.db.prepare('INSERT INTO observations(user_id,name,item_id,server,refine,price,quantity,observed_at,created_at,source,request_id,grade) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(userId, o.name, o.item_id, o.server, o.refine, o.price, o.quantity, o.observed_at, new Date().toISOString(), source, o.request_id, o.grade ?? null);
    return await this.db.prepare('SELECT * FROM observations WHERE id=?').get(Number(result.lastInsertRowid));
  }
  async createAlert(userId, w, o) {
    const result = await this.db.prepare('INSERT INTO alerts(user_id,watch_id,observation_id,name,server,alert_type,price,target_price,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(userId, w.id, o.id, w.name, w.server, w.alert_type, o.price, w.target_price, new Date().toISOString());
    return await this.db.prepare('SELECT * FROM alerts WHERE id=?').get(Number(result.lastInsertRowid));
  }
  async alerts(userId) {
    return await Promise.all((await this.db.prepare('SELECT * FROM alerts WHERE user_id=? ORDER BY id DESC').all(userId)).map(async a => ({
      ...a,
      deliveries: await this.db.prepare('SELECT channel,status,detail FROM deliveries WHERE alert_id=? ORDER BY id').all(a.id)
    })));
  }
  async createDelivery(alertId, channel, status, detail = '') {
    await this.db.prepare('INSERT INTO deliveries(alert_id,channel,status,detail,updated_at) VALUES(?,?,?,?,?)').run(alertId, channel, status, detail, new Date().toISOString());
  }
  async pendingDeliveries() {
    return await this.db.prepare("SELECT d.id AS delivery_id,d.channel,a.* FROM deliveries d JOIN alerts a ON a.id=d.alert_id WHERE d.status='pending' ORDER BY d.id").all();
  }
  async setDelivery(id, status, detail = '') {
    await this.db.prepare('UPDATE deliveries SET status=?,detail=?,updated_at=? WHERE id=?').run(status, detail, new Date().toISOString(), id);
  }
  async recoverDeliveries() {
    await this.db.prepare("UPDATE deliveries SET status='unknown',detail='Envio interrompido; resultado desconhecido.' WHERE status='sending'").run();
  }
}

// Compatibility for existing local scripts.
export { MarketRepository as SqliteRepository };
