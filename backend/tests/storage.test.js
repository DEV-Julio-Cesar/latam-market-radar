import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { newDb } from 'pg-mem';
import { postgresAdapter, sqliteAdapter } from '../storage.js';
import { openDatabase } from '../db.js';
import { SqliteRepository } from '../repository.js';
import { MarketService } from '../service.js';
import { NotificationService } from '../notifications.js';
import { configFromEnv } from '../config.js';
import { BrowserCollector } from '../browser-collector.js';
import { hashPassword, verifyPassword } from '../security.js';

test('PostgreSQL: conta, sessão, preços grandes, alertas e conexão sobrevivem à recriação do serviço', async () => {
  const engine = newDb();
  const { Pool } = engine.adapters.createPg();
  const pool = new Pool();
  let db = postgresAdapter(pool);
  await db.exec(await readFile(new URL('../postgres-schema.sql', import.meta.url), 'utf8'));
  let repo = new SqliteRepository(db);
  const config = configFromEnv({});
  const notifications = new NotificationService(repo, config);
  const service = new MarketService(repo, notifications);
  const collector = new BrowserCollector(repo, notifications);
  const user = await repo.createUser('persist@example.invalid', await hashPassword('PersistenceTest123!'));
  await repo.createSession('test-session-hash',user.id,'2099-01-01');
  const watch = await service.createWatch(user,{name:'Vale Varmida',server:'Freya',alert_type:'compra',target_price:31000});
  const pairing = await collector.pair(user);
  const result = await service.record(user,{name:'Vale Varmida',server:'Freya',price:28000,quantity:1,observed_at:new Date().toISOString(),request_id:'8daa3e73-658f-4776-ab4d-979ab1da03b7'});
  assert.equal(result.alerts.length,1);
  await repo.saveDiscord(user.id,null,false);
  await service.createWatch(user,{name:'Arma',server:'Freya',alert_type:'venda',target_price:999999999999,grade:'C'});
  // A new application instance reuses external data; it does not reseed or reset it.
  db = postgresAdapter(pool);
  repo = new SqliteRepository(db);
  assert.equal(await verifyPassword('PersistenceTest123!', (await repo.userByEmail(user.email)).password_hash),true);
  assert.equal((await repo.session('test-session-hash')).user_id,user.id);
  assert.equal((await repo.watches(user.id)).length,2);
  assert.equal((await repo.watches(user.id))[0].target_price,999999999999);
  assert.equal((await repo.alerts(user.id)).length,1);
  assert.equal((await repo.observations(user.id)).length,1);
  assert.equal((await repo.watch(user.id,watch.id)).target_price,31000);
  assert.equal((await new BrowserCollector(repo,new NotificationService(repo,config)).user(pairing.token)).id,user.id);
  await db.close();
});

test('SQLite: transação com falha não afeta escrita concorrente', async () => {
  const db=sqliteAdapter(openDatabase(':memory:'));
  const repo=new SqliteRepository(db);
  const failure=repo.transaction(async()=>{
    await repo.createUser('rollback@example.invalid','test');
    await new Promise(resolve=>setTimeout(resolve,15));
    throw new Error('rollback');
  });
  const success=repo.createUser('keep@example.invalid','test');
  await assert.rejects(failure,/rollback/);
  await success;
  assert.equal(await repo.userByEmail('rollback@example.invalid'),undefined);
  assert.ok(await repo.userByEmail('keep@example.invalid'));
  await db.close();
});

