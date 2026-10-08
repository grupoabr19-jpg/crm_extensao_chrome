# ABR CRM WhatsApp Web MVP

Extensao Chrome para validar o fluxo inicial do CRM ABR sobre o WhatsApp Web.

O painel MVP agora aparece como uma dock lateral fixa na direita do WhatsApp Web, parecida com a barra lateral esquerda do WhatsApp, mas dedicada ao CRM.

A dock:

- testa conexao com a API;
- registra um dispositivo local;
- cria ficha manual com telefone, cidade, necessidade e responsavel;
- mostra qualificacao comercial com completude, temperatura e potencial;
- inclui funil/etapa no estilo CRM/Kommo;
- abre o Kanban externo do CRM em uma nova aba;
- registra origem, segmento, tarefa, valor interno e resumo;
- permite acionar a tela externa para follow-up, nota, transferencia, venda ganha/perdida, KPIs e relatorios;
- gera mensagem de encaminhamento com link `wa.me` e protocolo;
- lista fichas pendentes no destino;
- permite marcar um atendimento como assumido;
- envia snapshots de diagnostico ao backend.

Limites atuais:

- nao envia mensagem automaticamente;
- nao escreve no DOM do WhatsApp;
- nao confirma chegada real sem acao humana;
- funil, nota e tarefa ainda sao superficie MVP; a persistencia completa desses campos vem na proxima camada do backend.

## Rodar API local

No terminal:

```bash
cd abr-crm
npm install
npm run api:dev
```

Healthcheck:

```text
http://127.0.0.1:10000/healthz
```

## Instalar extensao

1. Abra `chrome://extensions`.
2. Ative o modo de desenvolvedor.
3. Clique em **Carregar sem compactacao**.
4. Selecione a pasta `diagnostic-extension`.
5. Abra ou recarregue `https://web.whatsapp.com`.

## Fluxo rapido com dois navegadores

No navegador do numero principal:

1. Na barra lateral direita **ABR**, clique em **Conexao**.
2. Use `http://127.0.0.1:10000`.
3. Escolha modo `Principal`, informe o telefone local e registre o dispositivo.
4. Clique no icone de ficha e preencha cliente, qualificacao, funil, etapa, necessidade e WhatsApp do responsavel.
5. Clique em **Criar ficha + link**.
6. A mensagem de encaminhamento sera copiada; revise antes de enviar manualmente.
7. Clique no icone de Kanban na barra direita para abrir `/crm` e mover o lead no funil.

No navegador do destino:

1. Na barra lateral direita **ABR**, abra **Conexao**.
2. Registre como modo `Destino`.
3. Abra **Fila**, informe o telefone do responsavel e busque pendentes.
4. Clique em **Assumir** quando a ficha aparecer.

## Diagnostico

A aba **Diag** reaproveita `probe.js` para enviar dados estruturais da tela ao backend. Ela continua sem coletar texto de mensagens, nomes ou telefones diretamente; o objetivo e medir capacidades da interface.
