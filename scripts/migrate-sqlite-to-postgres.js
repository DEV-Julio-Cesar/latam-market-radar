import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { openPostgres } from '../backend/storage.js';

// Run only against an offline SQLite backup. Secrets never appear in output.
const filename = process.argv[2];
if (!filename || !existsSync(filename) || !process.env.DATABASE_URL) {
  console.error('Informe um backup SQLite existente e configure DATABASE_URL no ambiente.');
  process.exit(1);
}
const tables = ['users','sessions','watches','observations','alerts','deliveries','user_discord','browser_connections','browser_snapshots','browser_read_log','browser_offers'];
const generatedIds = ['users','watches','observations','alerts','deliveries','browser_read_log'];
const source = new DatabaseSync(filename,{readOnly:true});
let target;
try {
  target = await openPostgres(process.env.DATABASE_URL);
  await target.transaction(async () => {
    await target.exec(`LOCK TABLE ${tables.join(',')} IN ACCESS EXCLUSIVE MODE`);
    for (const table of tables) {
      if ((await target.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()).count !== 0) throw new Error('Destino não está vazio. Nenhum dado foi sobrescrito.');
    }
    for (const table of tables) {
      const exists = source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
      if (!exists) continue;
      const rows = source.prepare(`SELECT * FROM ${table}`).all();
      for (const row of rows) {
        const columns=Object.keys(row);
        if (columns.some(c=>! /^[a-z_]+$/.test(c))) throw new Error('Coluna inválida no backup.');
        await target.prepare(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).run(...columns.map(c=>row[c]));
      }
      const count = (await target.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()).count;
      if (count !== rows.length) throw new Error('Contagem divergente. Migração revertida.');
    }
    for (const table of generatedIds) {
      await target.exec(`SELECT setval(pg_get_serial_sequence('${table}','id'), COALESCE((SELECT MAX(id) FROM ${table}),1), EXISTS(SELECT 1 FROM ${table}))`);
    }
  });
  console.log('Migração concluída: contas, hashes de senha e dados preservados. Guarde o backup em local privado.');
} catch(error) {
  console.error(error.message?.startsWith('Destino') ? error.message : 'Migração falhou. Nenhum registro parcial foi confirmado. Verifique conexão e compatibilidade do backup.');
  process.exitCode=1;
} finally { source.close(); if(target) await target.close(); }
