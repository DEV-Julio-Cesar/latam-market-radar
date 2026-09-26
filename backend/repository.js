// Persistence boundary. A future PostgreSQL repository must preserve this contract.
export class SqliteRepository {
  constructor(db) { this.db = db; }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  createUser(email, hash) {
    const result = this.db.prepare('INSERT INTO users(email,password_hash,created_at) VALUES(?,?,?)').run(email, hash, new Date().toISOString());
    return this.userById(Number(result.lastInsertRowid));
  }
  userByEmail(email) { return this.db.prepare('SELECT * FROM users WHERE email=?').get(email); }
  userById(id) { return this.db.prepare('SELECT id,email FROM users WHERE id=?').get(id); }
  createSession(hash, userId, expires) {
    this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
    this.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash, userId, expires);
  }
  session(hash) { return this.db.prepare('SELECT * FROM sessions WHERE token_hash=? AND expires_at > ?').get(hash, new Date().toISOString()); }
  deleteSession(hash) { this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash); }
  watches(userId) { return this.db.prepare('SELECT * FROM watches WHERE user_id=? ORDER BY id DESC').all(userId); }
  watch(userId, id) { return this.db.prepare('SELECT * FROM watches WHERE user_id=? AND id=?').get(userId, id); }
  offers(userId,id) {
    const row=this.db.prepare('SELECT offers_json,observed_at,pages_read,partial FROM browser_offers WHERE user_id=? AND watch_id=?').get(userId,id);
    return row?{offers:JSON.parse(row.offers_json),observed_at:row.observed_at,pages_read:row.pages_read,partial:Boolean(row.partial)}:null;
  }
  setTarget(userId,id,target) {this.db.prepare('UPDATE watches SET target_price=? WHERE user_id=? AND id=?').run(target,userId,id);return this.watch(userId,id);}
  createWatch(userId, w) {
    const result = this.db.prepare('INSERT INTO watches(user_id,name,item_id,server,refine,alert_type,target_price,grade) VALUES(?,?,?,?,?,?,?,?)').run(userId, w.name, w.item_id, w.server, w.refine, w.alert_type, w.target_price,w.grade??null);
    return this.watch(userId, Number(result.lastInsertRowid));
  }
  toggleWatch(userId, id, active) { this.db.prepare('UPDATE watches SET active=? WHERE user_id=? AND id=?').run(Number(active), userId, id); return this.watch(userId,id); }
  observations(userId) { return this.db.prepare('SELECT * FROM observations WHERE user_id=? ORDER BY observed_at ASC,id ASC').all(userId); }
  observationByRequest(userId, requestId) { return this.db.prepare('SELECT * FROM observations WHERE user_id=? AND request_id=?').get(userId, requestId); }
  createObservation(userId, o, source) {
    const result = this.db.prepare('INSERT INTO observations(user_id,name,item_id,server,refine,price,quantity,observed_at,created_at,source,request_id,grade) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(userId,o.name,o.item_id,o.server,o.refine,o.price,o.quantity,o.observed_at,new Date().toISOString(),source,o.request_id,o.grade??null);
    return this.db.prepare('SELECT * FROM observations WHERE id=?').get(Number(result.lastInsertRowid));
  }
  createAlert(userId,w,o) {
    const result = this.db.prepare('INSERT INTO alerts(user_id,watch_id,observation_id,name,server,alert_type,price,target_price,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(userId,w.id,o.id,w.name,w.server,w.alert_type,o.price,w.target_price,new Date().toISOString());
    return this.db.prepare('SELECT * FROM alerts WHERE id=?').get(Number(result.lastInsertRowid));
  }
  alerts(userId) {
    return this.db.prepare('SELECT * FROM alerts WHERE user_id=? ORDER BY id DESC').all(userId).map(a => ({...a, deliveries: this.db.prepare('SELECT channel,status,detail FROM deliveries WHERE alert_id=? ORDER BY id').all(a.id)}));
  }
  createDelivery(alertId,channel,status,detail='') {
    this.db.prepare('INSERT INTO deliveries(alert_id,channel,status,detail,updated_at) VALUES(?,?,?,?,?)').run(alertId,channel,status,detail,new Date().toISOString());
  }
  pendingDeliveries() { return this.db.prepare("SELECT d.id AS delivery_id,d.channel,a.* FROM deliveries d JOIN alerts a ON a.id=d.alert_id WHERE d.status='pending' ORDER BY d.id").all(); }
  setDelivery(id,status,detail='') { this.db.prepare('UPDATE deliveries SET status=?,detail=?,updated_at=? WHERE id=?').run(status,detail,new Date().toISOString(),id); }
  recoverDeliveries() { this.db.prepare("UPDATE deliveries SET status='unknown',detail='Envio interrompido; resultado desconhecido.' WHERE status='sending'").run(); }
}
