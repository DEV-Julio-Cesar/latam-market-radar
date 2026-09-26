import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../db.js';
test('migração preserva IDs, metas, alertas e referências existentes',()=>{
 const dir=mkdtempSync(join(tmpdir(),'radar-migration-')),file=join(dir,'test.sqlite');let db;
 try{
  db=openDatabase(file);
  db.exec(`INSERT INTO users VALUES(1,'test@example.com','unused','2026-01-01');
    INSERT INTO watches(id,user_id,name,item_id,server,refine,alert_type,target_price,active) VALUES(7,1,'Vale Varmida',NULL,'Freya',NULL,'compra',31000,1);
    INSERT INTO observations(id,user_id,name,item_id,server,refine,price,quantity,observed_at,created_at,source,request_id) VALUES(3,1,'Vale Varmida',NULL,'Freya',NULL,28000,1,'2026-01-01','2026-01-01','browser','test');
    INSERT INTO alerts VALUES(2,1,7,3,'Vale Varmida','Freya','compra',28000,31000,'2026-01-01');
    PRAGMA foreign_keys=OFF;
    CREATE TABLE legacy_watches(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),name TEXT NOT NULL,item_id INTEGER,server TEXT NOT NULL,refine INTEGER,alert_type TEXT NOT NULL,target_price INTEGER NOT NULL CHECK(target_price>0),active INTEGER NOT NULL DEFAULT 1);
    INSERT INTO legacy_watches SELECT id,user_id,name,item_id,server,refine,alert_type,target_price,active FROM watches;DROP TABLE watches;ALTER TABLE legacy_watches RENAME TO watches;`);
  db.close();db=openDatabase(file);
  assert.equal(db.prepare('SELECT target_price FROM watches WHERE id=7').get().target_price,31000);
  db.exec('UPDATE watches SET target_price=NULL WHERE id=7');
  assert.equal(db.prepare('SELECT watch_id FROM alerts WHERE id=2').get().watch_id,7);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
 }finally{db?.close();rmSync(dir,{recursive:true,force:true});}
});
