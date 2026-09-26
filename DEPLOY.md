# Hospedagem do Radar

O repositório contém uma aplicação Node com SQLite. Hospede a interface e a API no mesmo domínio HTTPS para preservar os cookies e o login existentes. GitHub Pages sozinho não executa o backend.

## Container

O Dockerfile compila o React e inicia somente o servidor Node, como usuário sem privilégios. Não inclui contas locais, banco, dependências de desenvolvimento nem credenciais. Não executa seed.

Configure no provedor:

- Build: Dockerfile da raiz.
- Porta interna: 3001 (ou variável PORT atribuída pelo provedor).
- Health check: `/api/health`.
- APP_ORIGIN: endereço HTTPS final, sem barra no fim.
- COOKIE_SECURE: true.
- Volume persistente, com permissão de escrita para UID 1000, montado em `/app/data`.
- Uma única instância. Não escalar horizontalmente com este SQLite.
- Notificações permanecem desligadas até configurar os destinos.

Crie uma conta nova na interface publicada. Os dados do computador não são enviados automaticamente. Faça backup periódico do volume usando uma ferramenta compatível com SQLite/WAL.

## Limites atuais

A extensão 1.2.0 ainda envia para `http://127.0.0.1:3001`. O domínio definitivo precisa ser configurado e autorizado na extensão antes de a coleta alimentar o servidor online. Não distribua uma extensão com chaves embutidas.

Um serviço com disco temporário apaga o banco ao reiniciar ou reimplantar; não é adequado para conservar contas e histórico. A implantação definitiva depende de uma conta de hospedagem e armazenamento persistente. O Dockerfile é preparação, não confirmação de publicação.
