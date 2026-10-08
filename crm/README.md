# CRM Grupo ABR — extensão Chrome sobre WhatsApp Web

**Estado: CRM MVP em evolução.** A API HTTP, o painel web e a extensão integrada ao WhatsApp estão ativos; a automação de mensagens continua desabilitada e o sistema deve ser validado em cada ambiente.

## Rodar
```bash
npm install
npm test            # 56 testes (domínio, migration em Postgres real via PGlite, extensão-esqueleto)
npm run typecheck   # tsc --strict
```

## Acesso de operadores

O CRM web e a extensão exigem autenticação antes de carregar dados. O login consulta usuários ativos da organização no banco e valida a senha contra o hash gravado em `users.password_hash`; nomes de usuário sem domínio são resolvidos como `@grupoabr.com.br`. A migration `0004_real_users_admin.sql` provisiona os perfis iniciais e a senha provisória solicitada, armazenada como hash.

Todas as rotas `/v1/*`, exceto `POST /v1/auth/login`, exigem `Authorization: Bearer <token>`. A sessão dura 12 horas. O CRM web mantém o token apenas na aba atual; a extensão o mantém no armazenamento privado da extensão. Defina `AUTH_SIGNING_SECRET` no serviço da API com um segredo aleatório estável; sem ele, a API usa uma chave aleatória por processo e sessões ativas deixam de funcionar após reinicialização. Troque a senha provisória compartilhada dos operadores assim que houver fluxo de troca de senha disponível.

## O que existe e foi verificado
| Parte | Evidência |
|---|---|
| `packages/domain`: telefone E.164 (sem mexer no 9º dígito, DDD ≠ cidade), protocolo aleatório, link `wa.me` + template aprovado | testes unitários |
| Roteamento determinístico (carteira+exceções, especialista × fallback, pergunta antes de adivinhar, empate/sem regra → supervisão, rodízio/menor fila, vigência, destino inelegível) | testes unitários |
| Correspondência no destino (telefone, protocolo, telefone divergente, compartilhado, várias fichas, expirada, sem vazamento de existência) | testes unitários |
| Estados da transferência por eventos (link observado ≠ chegada, incerto, associação pendente, substituída) | testes unitários |
| Guarda da saída da IA (schema estrito, evidência obrigatória, catálogo, texto livre nunca sai, humano/baixa confiança → neutro) | testes unitários |
| Outbox: revalidação pré-envio (lease/fencing, contexto, rascunho, digitação, tomada humana, conta), queda → `uncertain` sem reenvio | testes unitários |
| Proveniência (humano > IA atrasada), elegibilidade (grupo/status/própria/mídia), deduplicação | testes unitários |
| `0001_core.sql` + seeds de referência (20 segmentos, 5 funis, etapas VAREJO, canais, motivos) | aplicada em PostgreSQL real (PGlite) + restrições testadas |
| Extensão: manifest MV3 mínimo (só WhatsApp Web + backend), adaptador nulo que recusa envio | testes |

## Verificado só em fixture/unidade — NÃO em WhatsApp real
- **Nenhum seletor do WhatsApp Web foi escrito ou validado.** `selectors.ts` está vazio de propósito; o adaptador reporta capacidades `false` e a automação permanece desabilitada com motivo explícito.
- A migration foi validada em PGlite (Postgres em WASM), **não** em Neon. Rodar em Neon é passo seu (credenciais).
- Fingerprint de mensagem sem ID verificável tem risco documentado (`dedup.ts`): duas mensagens idênticas no mesmo minuto dependem do ordinal na tela.

## Matriz dos 30 casos de aceitação (seção 18)
Coberto por teste nesta etapa: **1, 2, 3, 4, 5, 6, 7\*, 8, 9, 11, 12, 13, 14, 15, 16\*\*, 17, 18, 19, 20\*\*\*, 23, 24, 25, 26, 27**.
Parcial/pendente: **7\*** (guarda impede resposta livre; falta o prompt/fluxo Groq real) · **16\*\*** (fencing validado na regra; falta o lease transacional na API) · **20\*\*\*** (revalidação cancela envio; falta a transação "assumir").
**Pendentes (exigem API/UI/jobs):** 10 (ficha salva antes do link, visível na fila), 21 (reinício do service worker), 22 (backend/Groq/WhatsApp offline), 28 (reatribuição e caches), 29 (relatórios, null ≠ 0), 30 (taxa de chegada por coorte).

## Decisões registradas
- Precedência de regras: **maior `priority` vence; empate = supervisão**. Regra de maior precedência ainda indefinida por falta de dado gera pergunta (nunca palpite).
- Menor fila: desempate por atribuição mais antiga, depois `userId`. Só contam estados definidos na API (a definir).
- Atacado modelado como **canal**, não região. Revendedores ≠ Revendas preservados. Estágios de IA: só Novo Lead/Contato/Qualificação.
- Protocolo `ABR-XXXX-XXXX` (40 bits aleatórios) **não é credencial**: acesso sempre passa por autorização.
- Papéis simplificados em `users.role` (a tabela `roles/memberships` do prompt entra com a autorização).

## Próximos passos (ordem da seção 17)
1. API Fastify: auth/refresh, devices, lease com fencing, `/v1/observations`, `/v1/handoffs/match`, `/v1/routing/simulate` (cada rota reaproveita `@abr/domain`).
2. Extensão: service worker + content script + painel Shadow DOM; **validar seletores em sessão real autorizada com duas contas de teste** antes de qualquer automação.
3. Groq em modo supervisionado (chamada só no backend, saída por `guardTriage`).
4. Fila de jobs (`FOR UPDATE SKIP LOCKED`), SSE, admin, relatórios, `render.yaml`.

## Variáveis (`.env.example`)
`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `GROQ_API_KEY`, `GROQ_MODEL`, `AUTH_SIGNING_SECRET`, `ADMIN_ORIGIN`, `ALLOWED_EXTENSION_IDS`, `LOG_LEVEL`, `PORT` — todos só no backend.
