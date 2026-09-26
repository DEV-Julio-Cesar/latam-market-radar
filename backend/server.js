import { openPostgres } from './storage.js';
import { configFromEnv } from './config.js';
import { openDatabase } from './db.js';
import { SqliteRepository } from './repository.js';
import { createApp } from './app.js';
const config = configFromEnv(),
  db = config.databaseUrl ? await openPostgres(config.databaseUrl) : openDatabase(config.databasePath),
  repo = new SqliteRepository(db);
await repo.recoverDeliveries();
const {
  server,
  notifications
} = createApp(repo, config);
server.listen(config.port, config.host, () => {
  console.log(`Latam Market Radar: http://${config.host}:${config.port}`);
  void notifications.drain().catch(() => console.error('Falha ao recuperar fila.'));
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(async () => {
  await repo.db.close();
  process.exit(0);
}));
