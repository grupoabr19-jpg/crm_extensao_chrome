# WhatsApp Bot ABR

Bot local em Chromium/Playwright para operar a conta principal do WhatsApp Web em perfil isolado.

## Modos

- `dry-run`: le mensagens e chama a IA, mas nao digita nada.
- `supervised`: prepara/copiaria a resposta, mas nao envia automaticamente.
- `auto`: digita e envia quando a triagem estiver pronta. Use apenas depois de validar.

## Variaveis

Configure no `.env` da raiz `crm/`:

```env
WHATSAPP_BOT_ENABLED=true
WHATSAPP_BOT_MODE=supervised
WHATSAPP_BOT_HEADLESS=false
WHATSAPP_BOT_CRM_EMAIL=thiago.almeida@grupoabr.com.br
WHATSAPP_BOT_CRM_PASSWORD=sua_senha_do_crm
WHATSAPP_BOT_COMMIT_READY=false
WHATSAPP_BOT_PIETRA_PHONE=+5535998138542
```

## Rodar

```powershell
npm run install:chromium --workspace @abr/whatsapp-bot
npm run bot:whatsapp
```

No primeiro uso, escaneie o QR Code do WhatsApp Web no Chromium aberto pelo bot. A sessao fica em `crm/.local/whatsapp-bot-profile`.

## Treinamento

O roteiro/base de treinamento consumido pelo bot fica em:

```text
crm/apps/whatsapp-bot/training/abr-bot-training.json
```

Esse arquivo define persona, regras comerciais, catalogo basico, perguntas permitidas e comandos de transferencia. O bot usa essa base para qualificar leads, localizar cadastro, abrir ficha no CRM e transferir para o responsavel. Ele pode confirmar categorias basicas de produtos do Grupo ABR, mas nao deve informar especificacoes tecnicas, preco, prazo, estoque, garantia, disponibilidade ou detalhes sobre Vergraf/grafeno.

O bot do WhatsApp roda localmente em Chromium/Playwright e usa o `crm/.env` local. As variaveis `WHATSAPP_BOT_*` nao precisam estar no Render, a menos que o bot seja executado la tambem. No Render ficam apenas os secrets do backend, como banco de dados, autenticacao e chave da IA.
