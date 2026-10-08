# Deploy Neon + Render

Este projeto possui uma API MVP inicializavel em `apps/api/src/server.mjs`. Quando `DATABASE_URL` esta configurada, ela usa Neon/Postgres; com `ABR_STORAGE=memory`, usa memoria apenas para teste local.

O CRM web tambem e servido pela API em `/crm`. Esta tela abre fora do WhatsApp e mostra o Kanban dos funis.

## Segredos e acessos

- `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `GROQ_API_KEY` e `AUTH_SIGNING_SECRET` devem existir apenas no backend.
- `API_ADMIN_TOKEN` protege testes administrativos como IA e transferencia de teste. Use o mesmo valor apenas em ambiente seguro para smoke tests.
- `GROQ_MODEL` define o modelo usado no teste da IA. Se ficar vazio ou com placeholder, a API usa `openai/gpt-oss-120b`. `GROQ_BASE_URL` pode ficar em `https://api.groq.com/openai/v1`.
- `ABR_TEST_CUSTOMER_PHONE`, `ABR_TEST_DESTINATION_PHONE` e `ABR_TEST_DESTINATION_NAME` alimentam o smoke test de transferencia sem depender de clientes reais.
- Nunca coloque valores reais em `.env.example`, no build da extensao ou em logs.
- Se algum segredo real foi commitado ou compartilhado, rotacione-o no Neon/Groq antes de usar o ambiente.

## Neon

- Use `DATABASE_URL` com host `-pooler` para o trafego normal da aplicacao.
- Use `DATABASE_URL_UNPOOLED` sem `-pooler` para migrations, `pg_dump`, `pg_restore` e tarefas que precisam de estado de sessao.
- Teste migrations em uma branch Neon antes de aplicar em producao.
- Mantenha as migrations versionadas em `apps/api/migrations`.

## Render

Contas gratuitas do Render podem nao liberar Blueprints. Use o fluxo manual de **Web Service** apontando para o GitHub:

```text
New + -> Web Service
Repository: https://github.com/grupoabr19-jpg/crm_extensao_chrome.git
Name: abr-crm-api
Runtime: Node
Branch: master
Root Directory: abr-crm
Build Command: npm ci
Start Command: npm run api:start
Instance Type: Free
Health Check Path: /healthz
```

Depois do primeiro deploy, abra:

```text
https://SEU-SERVICO.onrender.com/healthz
https://SEU-SERVICO.onrender.com/crm
```

O Web Service unico entrega:

- API CRM (`/v1/*`);
- Kanban web (`/crm`);
- healthcheck (`/healthz`);
- readiness com banco (`/readyz`).

Rode as migrations manualmente pelo Shell do Render, ou localmente apontando para `DATABASE_URL_UNPOOLED`, antes de usar o CRM em producao:

```bash
npm run db:migrate
```

Nao separe em uma API de funil e outra de storage neste momento. O desenho atual mantem um unico backend de autorizacao/regras e o Neon como armazenamento central. Separar servicos passa a fazer sentido quando houver carga, times ou limites de seguranca diferentes.

Antes de producao, ajuste:

- rodar migrations de forma controlada, usando a URL direta, antes de promover uma versao;
- validar `ALLOWED_EXTENSION_IDS` depois de empacotar a extensao;
- adicionar auth real antes de expor dados sensiveis.

## Rotas MVP

- `GET /crm`: Kanban externo do CRM.
- `POST /v1/ai/test`: teste protegido de conectividade com a IA.
- `POST /v1/tests/transfer`: cria um lead de teste e prepara handoff/outbox para validar transferencia entre numeros.
- `GET /v1/funnels`: funis e etapas.
- `GET /v1/funnels/:id/board`: Kanban de um funil.
- `POST /v1/cases/:id/stage`: mover lead de etapa.
- `POST /v1/cases/:id/tasks`: criar follow-up.
- `GET /v1/tasks`: listar follow-ups.
- `POST /v1/cases/:id/notes`: criar nota interna.
- `POST /v1/cases/:id/close`: venda ganha/perdida.
- `POST /v1/cases/:id/transfer`: nova transferencia entre numeros.
- `POST /v1/cases/:id/outbox/handoff-message`: preparar mensagem aprovada no outbox.
- `GET /v1/outbox`: comandos pendentes/incertos.
- `POST /v1/outbox/:id/ack`: confirmar observado/incerto/cancelado/falhou.
- `GET /v1/reports/kpis`: KPIs operacionais.
- `GET /v1/reports/cases.csv`: exportacao CSV.

Comando local da API:

```bash
cd abr-crm
npm install
npm run db:migrate
npm run api:dev
```

Smoke test local ou Render:

```bash
cd abr-crm
ABR_API_BASE_URL=https://SEU-SERVICO.onrender.com npm run smoke:test
```

No Windows PowerShell:

```powershell
cd abr-crm
$env:ABR_API_BASE_URL = "https://SEU-SERVICO.onrender.com"
npm run smoke:test
```
