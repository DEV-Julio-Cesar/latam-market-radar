# Hospedagem do Radar

O repositório contém uma aplicação Node com PostgreSQL na hospedagem e SQLite para uso local. Hospede a interface e a API no mesmo domínio HTTPS para preservar os cookies e o login existentes. GitHub Pages sozinho não executa o backend.

## Container

O Dockerfile compila o React e inicia somente o servidor Node, como usuário sem privilégios. Não inclui contas locais, banco, dependências de desenvolvimento nem credenciais. Não executa seed.

Configure no provedor:

- Build: Dockerfile da raiz.
- Porta interna: 3001 (ou variável PORT atribuída pelo provedor).
- Health check: `/api/health`.
- APP_ORIGIN: endereço HTTPS final, sem barra no fim.
- COOKIE_SECURE: true.
- DATABASE_URL: conexão PostgreSQL privada, com TLS.
- Uma única instância da aplicação para o processamento de notificações.
- Notificações permanecem desligadas até configurar os destinos.

Migre os dados existentes antes da primeira troca de banco, conforme abaixo. Os dados do computador não são enviados automaticamente.

## Limites atuais

A extensão 1.2.0 ainda envia para `http://127.0.0.1:3001`. O domínio definitivo precisa ser configurado e autorizado na extensão antes de a coleta alimentar o servidor online. Não distribua uma extensão com chaves embutidas.

SQLite em disco temporário pode desaparecer ao reiniciar ou reimplantar. No Render use obrigatoriamente PostgreSQL externo. Em outros provedores, SQLite só deve ser usado com volume persistente e backup.

## Banco externo: contas preservadas entre publicações

A aplicação aceita `DATABASE_URL` (PostgreSQL). Sem essa variável usa SQLite **somente no modo local**. No Render, a inicialização exige a variável para impedir novas contas em armazenamento descartável. Não execute seed no servidor de produção.

1. Crie um projeto PostgreSQL no plano gratuito do Neon.
2. Guarde a connection string com TLS (`sslmode=require`) em `DATABASE_URL` nas variáveis privadas do Render. Nunca coloque essa URL no GitHub, frontend ou extensão.
3. **Antes de publicar**, obtenha uma cópia consistente do SQLite antigo. O plano gratuito do Render não oferece shell/disco persistente; sem um backup, não há garantia de recuperar os cadastros do container anterior. Não publique presumindo que esses dados serão copiados automaticamente.
4. Com o destino vazio, migre um backup local privado: `node --env-file=.env scripts/migrate-sqlite-to-postgres.js caminho/backup.sqlite`. Defina a URL no `.env` ignorado pelo Git. O comando preserva IDs, hashes de senha, sessões, alertas e configurações; recusa destino com dados, usa transação e não imprime credenciais.
5. Configure `DATABASE_URL` no Render e publique a versão com PostgreSQL. Verifique login e histórico; faça uma nova publicação de teste para confirmar persistência antes de distribuir.

As tabelas são criadas de forma idempotente; a inicialização não apaga nem recria contas. Erros no PostgreSQL não causam fallback para SQLite. O Neon mantém dados separados do ciclo de vida do Render, mas os limites do plano gratuito continuam valendo. Mantenha backups privados com `pg_dump` e acompanhe armazenamento e uso no painel. Persistência não é uma promessa de retenção eterna.

Se não houver backup do banco antigo, a primeira troca exige uma decisão explícita sobre começar uma base nova. Cadastros existentes no computador local e no site online podem ser diferentes.
