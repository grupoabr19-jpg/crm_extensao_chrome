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
```

## Rodar

```powershell
npm run install:chromium --workspace @abr/whatsapp-bot
npm run bot:whatsapp
```

No primeiro uso, escaneie o QR Code do WhatsApp Web no Chromium aberto pelo bot. A sessao fica em `crm/.local/whatsapp-bot-profile`.
