# Extensão CRM ABR

A extensão injeta uma barra lateral no WhatsApp Web. Os ícones ficam na borda direita; cada botão abre a ficha, o Kanban, a fila de atendimentos, as tarefas ou as configurações. Não há popup flutuante ao clicar no ícone da extensão.

## Instalação local

1. Inicie a API do CRM na pasta `crm` (`npm run api:dev`).
2. No Chrome, abra `chrome://extensions` e habilite **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione esta pasta `extension`.
4. Atualize a aba do WhatsApp Web.

A API local padrão é `http://127.0.0.1:10000`. A conexão pode ser testada e configurada no botão de engrenagem da barra. O manifesto concede acesso ao WhatsApp Web e às APIs locais em `localhost`/`127.0.0.1`; outros domínios de API exigem adicionar a origem correspondente às permissões do manifesto.
