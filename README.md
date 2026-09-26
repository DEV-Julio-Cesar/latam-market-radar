# Latam Market Radar

Aplicação web em **JavaScript, Node.js 24+, React e SQLite** para organizar observações pessoais do mercado de Ragnarok Online LATAM. Interface em português, responsiva. Modo manual e modo experimental de leitura da página pública pelo navegador. Sem integração com o cliente do jogo. O servidor Node não consulta GNJOY diretamente.

## Rodar localmente

Instale o **Node.js 24 ou superior**, que inclui o módulo `node:sqlite`. Abra o terminal na pasta deste projeto.

```powershell
npm install
Copy-Item .env.example .env
npm run seed
npm run build
npm start
```

No macOS/Linux, substitua `Copy-Item .env.example .env` por `cp .env.example .env`.

Abra **http://127.0.0.1:3001**. Use exatamente esse endereço; `localhost` é outra origem. O Node serve a API e o React compilado no mesmo endereço.

Conta de demonstração, criada somente pelo comando seed:

- Email: `demo@radar.local`
- Senha: `RadarDemo!2026`

O seed cria 4 itens monitorados, 56 observações fictícias e 1 alerta, **sem enviar notificações**. Pode ser executado novamente: se o email já existe, não altera dados. As variáveis `DEMO_EMAIL` e `DEMO_PASSWORD` personalizam a conta antes de criá-la. Você também pode cadastrar uma conta vazia na interface.

O banco é criado em `data/radar.sqlite`. Para manter seus dados, preserve esse arquivo. Não inclua `.env` ou arquivos do banco no controle de versão. Pare o servidor antes de copiar o banco para backup, ou use uma ferramenta de backup do SQLite que considere o WAL.

### Desenvolvimento com atualização automática

Defina `APP_ORIGIN=http://127.0.0.1:5173` no `.env`. Em dois terminais na pasta do projeto:

```powershell
# Terminal 1: API em 3001
npm run dev
```

```powershell
# Terminal 2: React em 5173
npm run dev:ui
```

Abra http://127.0.0.1:5173. O Vite encaminha `/api` para o backend. Se alterar a porta do backend, atualize também `frontend/vite.config.js`. Para voltar ao modo compilado, restaure `APP_ORIGIN=http://127.0.0.1:3001`.

## Funcionalidades

- Cadastro e login por email/senha; logout revoga a sessão.
- Dashboard com contagens, últimos preços, gráfico e alertas recentes.
- Monitoramento por nome, ID opcional, servidor, refino opcional, tipo compra/venda e preço-alvo; pausa e reativação.
- Observação manual com preço **unitário**, quantidade e data/hora local, convertida para UTC.
- Histórico por item monitorado e estatísticas: média, mediana, mínimo, máximo e variação.
- Alertas persistidos e fila de notificações com resultado por canal.
- Discord webhook e WhatsApp Cloud API por adaptadores independentes.
- Todos os registros são privados e isolados por conta. Não existe base comunitária neste MVP.

### Regras do radar

1. Compra dispara quando `preço observado ≤ preço-alvo`; venda quando `preço observado ≥ preço-alvo`.
2. Só novas observações avaliadas por um monitoramento ativo geram alertas. Criar ou reativar um monitoramento não dispara alertas retroativos.
3. Com ID no monitoramento, a observação precisa fornecer o mesmo ID. Sem ID, o nome é comparado ignorando maiúsculas e espaços repetidos. O servidor deve coincidir.
4. Refino em branco no monitoramento aceita qualquer refino. Refino `0` exige `0`; não é igual a refino desconhecido. A interface informa quando as estatísticas combinam refinos.
5. Média e mediana usam cada observação uma vez, sem ponderação por quantidade. Variação = `(último preço / primeiro preço − 1) × 100`, pela data observada. Datas iguais são ordenadas pelo ID de registro. Uma única observação tem variação zero; sem dados, os valores são nulos.
6. Uma observação histórica também é avaliada ao ser cadastrada. O alerta não garante que a oferta ainda exista. No modo manual, a aplicação **não detecta novas lojas sozinha**. O modo navegador percorre até 5 páginas públicas por consulta e registra mudanças do menor preço encontrado, com meta de 5 minutos por item.
7. O formulário envia um UUID de idempotência. Repetir a mesma solicitação não duplica observações ou alertas; reutilizar a chave com outros dados retorna conflito. Um novo formulário gera uma nova observação, mesmo com preço igual.

## Notificações

Por padrão, os canais ficam desativados. Os alertas internos funcionam sem configuração adicional.

No `.env`, configure:

```dotenv
NOTIFICATIONS_ENABLED=true
NOTIFICATION_OWNER_EMAIL=seu-email-cadastrado@exemplo.com
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/ID/TOKEN
```

O webhook precisa ser de um canal que você administra. A aplicação desativa menções automáticas no Discord. Para WhatsApp:

```dotenv
WHATSAPP_ACCESS_TOKEN=seu-token
WHATSAPP_PHONE_NUMBER_ID=seu-id-numerico
WHATSAPP_RECIPIENT=5511999999999
WHATSAPP_API_VERSION=v23.0
WHATSAPP_TEMPLATE_NAME=nome_do_template_aprovado
WHATSAPP_TEMPLATE_LANGUAGE=pt_BR
```

É necessário um remetente configurado na Meta, destinatário autorizado a receber mensagens e um **template aprovado com exatamente um parâmetro de texto no corpo**, que receberá a mensagem do alerta. A versão da API é configurável; ajuste à versão habilitada em sua conta. Tokens nunca são enviados ao frontend. Reinicie o servidor após modificar `.env`.

Os destinos globais só recebem alertas de `NOTIFICATION_OWNER_EMAIL`. Outras contas têm alertas internos, mas não enviam mensagens a esse destino. Configuração individual de canais por usuário fica para uma próxima etapa.

A observação, o alerta e a fila são gravados numa transação. O envio ocorre depois, sem bloquear a resposta de cadastro. A fila pendente é recuperada ao iniciar o servidor. Falhas e timeouts ficam registrados, **sem repetição automática** para evitar mensagens duplicadas. Um envio interrompido fica com resultado desconhecido. “Aceito pelo provedor” significa sucesso da solicitação HTTP, não confirmação de entrega ao celular. Use “Atualizar status” na tela de alertas para consultar o resultado.

Os testes usam transporte simulado: **nenhuma mensagem real foi enviada**. Valide os dois provedores com suas credenciais antes do uso real.

## Arquitetura

```text
frontend/src/       React: navegação, formulários, tabelas, gráfico SVG
backend/app.js     API HTTP REST, autenticação, validação de origem, arquivos estáticos
backend/security.js    Senhas scrypt, tokens opacos e cookies
backend/domain.js      Validação, correspondência de itens, cálculos e regras de alerta
backend/service.js     Casos de uso do radar
backend/sources.js     Adaptador de entrada manual
backend/repository.js  Fronteira de persistência SQLite
backend/db.js          Schema versionado em user_version=1, índices e transações
backend/notifications.js  Adaptadores Discord e WhatsApp + fila persistente
backend/seed.js        Demonstração idempotente sem envio externo
backend/tests/         Testes com o runner nativo do Node
```

O backend usa as bibliotecas nativas de HTTP, SQLite e criptografia do Node; não precisa de dependências npm de servidor. React e Vite são instalados via workspace. O lockfile fixa as versões resolvidas; use `npm ci` para reproduzir a instalação.

Uma futura **API autorizada** pode implementar `normalize(payload)` e fornecer observações ao `MarketService`, preservando identidade do usuário, data, origem e chave de idempotência. A extensão em `extension/` lê o DOM público em uma aba dedicada, com pareamento por token restrito. Não utiliza endpoints internos, cookies exportados ou solução de desafios. Veja os limites e a validação pendente no guia da extensão.

**PostgreSQL não está implementado neste MVP.** A separação do repositório facilita a migração, mas não basta trocar uma variável de ambiente: será necessário implementar o contrato de persistência, tornar os casos de uso assíncronos e criar migrações equivalentes. O modo inicial suportado é SQLite, em um único processo.

## API REST

Todas as respostas são JSON, com erros em `{ "error": "mensagem" }`. Rotas privadas exigem cookie de sessão. POST/PATCH exigem `Content-Type: application/json`. Corpo limitado a 16 KB.

| Método | Rota | Uso |
|---|---|---|
| GET | `/api/health` | Estado do servidor, público |
| POST | `/api/auth/register` | `{email,password}`; cria conta e sessão |
| POST | `/api/auth/login` | `{email,password}`; abre sessão |
| GET | `/api/auth/me` | Usuário autenticado |
| POST | `/api/auth/logout` | Corpo `{}`; revoga sessão |
| GET | `/api/dashboard` | Contagens, itens e resumos |
| GET / POST | `/api/watches` | Listar ou cadastrar monitoramento |
| PATCH | `/api/watches/:id` | `{active:true/false}` |
| GET | `/api/watches/:id/history` | Observações correspondentes e estatísticas |
| GET / POST | `/api/observations` | Listar ou registrar observação |
| GET | `/api/alerts` | Alertas e resultados dos canais |
| GET | `/api/settings` | Estado dos canais, sem segredos |

Exemplo de monitoramento:

```json
{"name":"Carta Raydric","item_id":4133,"server":"Freya","refine":null,"alert_type":"compra","target_price":15000000}
```

Exemplo de observação (gere um novo UUID a cada novo registro):

```json
{"name":"Carta Raydric","item_id":4133,"server":"Freya","refine":null,"price":14800000,"quantity":1,"observed_at":"2026-09-24T18:30:00-03:00","request_id":"a3b4a501-128b-4f91-8e6d-123456789abc"}
```

## Testes e limites de implantação

```powershell
npm test
npm run build
```

Os testes cobrem autenticação, revogação de sessão, isolamento entre contas, validação de entrada, origem, limite de login, regras de compra/venda, identidade/refino, estatísticas, idempotência, atomicidade da transação, fila e payloads dos adaptadores.

Este MVP foi projetado para execução local. Para expor na internet: use HTTPS e `COOKIE_SECURE=true`, ajuste `APP_ORIGIN` para a URL exata, use credenciais próprias, configure backup e TLS no proxy. Sessões expiram em 24 horas por padrão; senhas usam scrypt com sal individual, e somente o hash dos tokens de sessão é persistido. Há limite de 20 tentativas de autenticação por IP a cada 15 minutos, em memória; um proxy exige configuração adequada antes de escalar esse mecanismo.

Não inclui recuperação de senha, confirmação de email, gerenciamento de usuários, paginação de grandes históricos ou trabalhador distribuído de notificações. Para bases grandes, acrescente paginação e agregações no banco. Novas versões de schema precisarão de migrações incrementais; o schema atual cria o banco inicial.


## Leitura pelo navegador (experimental)

Consulte [extension/README.md](extension/README.md) e a tela **Conexão**. A extensão precisa ser instalada no Chrome/Edge. O ciclo completo instalado ainda não foi validado. Não confunda este modo com sincronização oficial ou cobertura de todas as lojas.


## Atualização 1.2.0 — metas opcionais e ofertas

- Preço-alvo opcional tanto em compra quanto em venda. Em branco significa acompanhar sem alertas de preço; zero continua inválido.
- Em **Itens monitorados → Alterar meta**, é possível adicionar ou remover a meta existente.
- Em **Histórico de preços → Ofertas encontradas**, veja a última lista coletada com preço, quantidade, vendedor e loja, ordenada por preço. A meta nunca filtra essa lista.
- O histórico continua representando mudanças do menor preço observado. A lista de ofertas é substituída a cada coleta válida, inclusive quando só o estoque muda. Um erro ou bloqueio conserva a lista anterior com sua data; resultado vazio substitui por uma lista vazia.
- Meta de cinco minutos por item; leitura em fila, até cinco páginas e 500 ofertas por consulta, sujeita ao orçamento local de navegações e à suspensão do computador. A interface informa cobertura parcial. Não há garantia de todas as ofertas do mercado.
- Migração automática preserva monitoramentos, IDs, observações e alertas. A versão anterior da extensão permanece compatível, mas só envia seu menor preço; a lista completa das páginas lidas exige a extensão 1.2.0.
- Validação: testes locais de API, migração, metas opcionais, isolamento, fila e paginação simulada. A nova extensão deve ser recarregada e validada no Chrome do usuário.

## Filtro de grau

Monitoramentos e observações aceitam grade: null (qualquer grau no monitoramento; desconhecido na observação), none (sem grau), D, C, B ou A. O filtro é independente de refino e respeitado por histórico, estatísticas e alertas. Dados antigos permanecem com grau desconhecido. A extensão atual não identifica grau: monitoramentos com grau específico ficam fora da fila automática até validação do leitor com uma oferta real.
