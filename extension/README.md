# Extensão CRM ABR

A extensão injeta uma barra lateral no WhatsApp Web. Os ícones ficam na borda direita; cada botão abre a ficha, o Kanban, a fila de atendimentos, as tarefas ou as configurações. Não há popup flutuante ao clicar no ícone da extensão.

Com o painel expandido em uma janela com pelo menos 1200 px de largura, a extensão reserva uma coluna de 488 px no lado direito para o CRM. O WhatsApp se ajusta ao espaço restante, a lista de conversas fica mais compacta e o chat continua visível ao lado da ficha. Em janelas menores, o painel sobrepõe o site para preservar uma área utilizável para a conversa. A moldura do navegador (abas e barra de endereço) não pode ser tematizada por esta extensão; os acentos da marca são aplicados ao CRM e à página do WhatsApp.

## Instalação local

1. Inicie a API do CRM na pasta `crm` (`npm run api:dev`).
2. No Chrome, abra `chrome://extensions` e habilite **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione esta pasta `extension`.
4. Atualize a aba do WhatsApp Web.

A API padrão é `https://abr-crm-api.onrender.com`. A conexão pode ser testada e configurada no botão de engrenagem da barra. Configurações antigas que apontavam para `localhost:10000` são migradas para o Render na primeira inicialização após atualizar a extensão.

Na guia **Configurações**, é possível ajustar o endereço da API, o perfil do dispositivo, o telefone local, os valores padrão da ficha e as opções de origem, segmento, departamento, funil, etapa, potencial e temperatura. As configurações ficam no armazenamento local da extensão. O identificador do dispositivo é gerado pelo backend e permanece somente leitura; credenciais administrativas e chaves de serviço não devem ser armazenadas na extensão.

Na ficha, o seletor de cliente/funil/etapa usa os dados retornados por `/v1/cases` e `/v1/funnels`. Ao selecionar uma etapa, a extensão envia o mesmo `stageId` usado pelo Kanban para `POST /v1/cases/:id/stage`; a ficha e o card passam a refletir o mesmo funil e estágio. As etapas anteriores aparecem em cinza escuro e a atual em laranja. A barra lateral usa o logo oficial `brand-logo.png`.
