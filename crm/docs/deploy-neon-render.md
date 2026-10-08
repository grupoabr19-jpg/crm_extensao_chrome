# Deploy Neon + Render

Este projeto possui uma API MVP inicializavel em `apps/api/src/server.mjs`. Quando `DATABASE_URL` esta configurada, ela usa Neon/Postgres; com `ABR_STORAGE=memory`, usa memoria apenas para teste local.

O CRM web tambem e servido pela API em `/crm`. Esta tela abre fora do WhatsApp e mostra o Kanban dos funis.

## Segredos e acessos

- `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `GROQ_API_KEY` e `AUTH_SIGNING_SECRET` devem existir apenas no backend.
- `API_ADMIN_TOKEN` protege testes administrativos como IA e transferencia de teste. Envie-o no cabeçalho `x-api-admin-token`, junto com a sessão de usuário administrador no cabeçalho `Authorization: Bearer ...`.
- `GROQ_MODEL` define o modelo usado no teste da IA. Se ficar vazio ou com placeholder, a API usa `openai/gpt-oss-120b`. `GROQ_BASE_URL` pode ficar em `https://api.groq.com/openai/v1`.
- `GROQ_VISION_MODEL` define o modelo de leitura visual; o padrão é `qwen/qwen3.8-27b`.
- `POST /v1/ai/test` funciona localmente mesmo sem `GROQ_API_KEY`: quando a chave nao existe ou e placeholder, a API devolve um stub seguro `OK` para manter o smoke test e a validação inicial funcionando sem dependência externa.
- `ABR_TEST_CUSTOMER_PHONE`,  `ABR_TEST_DESTINATION_PHONE` e `ABR_TEST_DESTINATION_NAME` alimentam o smoke test de transferencia sem depender de clientes reais.
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
Root Directory: crm
Build Command: npm ci
Start Command: npm start
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
- `POST /v1/ai/vision-test`: teste protegido de OCR/interpretação de uma imagem PNG, JPEG ou WebP (máximo de 4 MiB); não altera fichas nem envia mensagens.
- `POST /v1/tests/transfer`: cria um lead de teste e prepara handoff/outbox para validar transferencia entre numeros.
- `GET /v1/sellers`: vendedores/perfis/rotas de atendimento.
- `POST /v1/sellers`: cadastrar ou atualizar vendedor, funcao comercial e rotas.
- `DELETE /v1/sellers/:id`: retirar colaborador ativo do roteamento.
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
cd crm
npm install
npm run db:migrate
npm run api:dev
```

Smoke test local ou Render:

```bash
cd crm
ABR_API_BASE_URL=https://SEU-SERVICO.onrender.com npm run smoke:test
```

No Windows PowerShell:

```powershell
cd crm
$env:ABR_API_BASE_URL = "https://SEU-SERVICO.onrender.com"
npm run smoke:test
```

Para testar somente a conexão com a IA, entre no CRM como administrador e, no console de desenvolvedor dessa mesma página, execute:

```js
const adminToken = prompt("Informe o API_ADMIN_TOKEN sem compartilhá-lo");
const sessionToken = sessionStorage.getItem("abrCrmSession");
fetch("/v1/ai/test", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "authorization": `Bearer ${sessionToken}`,
    "x-api-admin-token": adminToken
  },
  body: JSON.stringify({ prompt: "Responda somente OK para confirmar o teste tecnico do CRM ABR." })
}).then(async (response) => ({ status: response.status, body: await response.json() }))
  .then(console.log);
```

Uma resposta com `ok: true` e `offline` ausente confirma que o backend chamou a Groq. `offline: true` indica que o backend não recebeu uma chave Groq utilizável. Este teste verifica conectividade e resposta do modelo, não leitura/OCR de conversas do WhatsApp.

Para testar leitura visual, use uma captura fictícia ou anonimizada. O endpoint encaminha a imagem selecionada ao provedor Groq; não envie imagens com dados de clientes sem autorização adequada. Após entrar no CRM como administrador, execute no console do navegador:

```js
const input = document.createElement("input");
input.type = "file";
input.accept = "image/png,image/jpeg,image/webp";
input.onchange = async () => {
  const file = input.files?.[0];
  if (!file || file.size > 4 * 1024 * 1024) {
    console.error("Selecione uma imagem de até 4 MiB.");
    return;
  }
  const image = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const adminToken = prompt("Informe o API_ADMIN_TOKEN");
  const sessionToken = sessionStorage.getItem("abrCrmSession");
  const response = await fetch("/v1/ai/vision-test", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${sessionToken}`,
      "x-api-admin-token": adminToken
    },
    body: JSON.stringify({ image })
  });
  console.log({ status: response.status, result: await response.json() });
};
input.click();
```

O resultado é apenas uma sugestão para conferência humana. O reconhecimento pode errar textos, participantes e horários; não use a saída para encaminhamento automático sem validação adicional.
