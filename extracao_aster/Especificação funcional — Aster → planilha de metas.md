# Especificação funcional — Aster → planilha de metas

## Objetivo

Extrair diariamente o relatório **Aster → Vendas → Resumo Comercial** e lançar somente os dados do dia anterior na aba **1 lançamentos diarios**, preservando os lançamentos manuais e a automação existente na planilha.

## Regras de lançamento diário

A rotina deve:

1. Executar uma vez por dia, no horário configurado.
2. Calcular automaticamente a data do dia anterior no fuso horário da operação.
3. Consultar o Resumo Comercial com Data Inicial e Date Final iguais ao dia anterior.
4. Baixar a exportação estruturada CSV/XLSX.
5. Normalizar números brasileiros, incluindo peso e valor monetário.
6. Adicionar os registros ao final da área de dados da aba **1 lançamentos diarios**, sem apagar linhas existentes.
7. Identificar duplicidade por uma chave composta, no mínimo por data + vendedor + tipo + região + segmento, para evitar lançamentos repetidos em caso de reexecução.
8. Não substituir células que já tenham sido preenchidas manualmente.
9. Registrar metadados técnicos em colunas próprias ou em uma aba técnica separada: data de referência, data/hora da execução, origem, quantidade de linhas e status.
10. Permitir que as demais abas continuem consumindo a aba 1 e recalculando seus resultados normalmente.

## Proteção contra conflitos com Apps Script

A automação não deve:

- limpar a aba inteira;
- alterar fórmulas existentes;
- inserir colunas no meio do layout atual;
- modificar intervalos usados pelos Apps Scripts;
- sobrescrever lançamentos manuais;
- criar gatilhos ou scripts dentro da planilha sem auditoria prévia.

Antes da implantação, deve ser levantado o layout atual, as fórmulas, os intervalos nomeados e os Apps Scripts existentes. O sistema deverá escrever somente em um intervalo de entrada previamente validado, preferencialmente em linhas novas ao final de uma tabela.

## Fechamento mensal

Quando a rotina estiver processando o primeiro dia do mês seguinte, ela deve reconhecer que o dia anterior foi o último dia do mês encerrado e executar uma operação idempotente de fechamento:

1. Garantir que todos os registros do último dia estejam lançados na aba 1.
2. Consolidar o mês encerrado na aba **consolidados 12 meses**.
3. Não duplicar o mês se a rotina for reprocessada.
4. Preservar o histórico de 12 meses conforme a regra da planilha.
5. Iniciar o novo mês na aba 1, sem carregar indevidamente dados do mês anterior.
6. Manter as demais abas apontando para a fonte correta após a virada.
7. Registrar o fechamento, o período e a quantidade de linhas consolidadas.

A implementação exata da virada depende de confirmar se **consolidados 12 meses** recebe uma linha/resumo por mês, uma cópia detalhada dos lançamentos ou ambos, e se a aba 1 deve manter somente o mês corrente ou preservar histórico detalhado.

## Dados de origem confirmados

O relatório retorna:

- Vendedor
- Tipo
- Região
- Segmento
- Peso total
- Valor total

Parâmetros:

- Data Inicial
- Date Final

A exportação estruturada observada é CSV UTF-8 com BOM, separador ponto e vírgula e valores no formato brasileiro.

## Bloqueios para implantação

Ainda é necessário autorizar a conta Google com acesso à planilha e inspecionar:

- nomes e ordem exata das colunas da aba 1;
- primeira linha e área segura de escrita;
- fórmulas e intervalos dependentes;
- conteúdo e regra da aba consolidados 12 meses;
- Apps Scripts, gatilhos e intervalos que não podem ser tocados;
- lista e formato dos destinatários de e-mail;
- horário e fuso da execução.

## Horário de execução

A rotina deverá executar diariamente às **05:00**, no fuso `America/Sao_Paulo`, processando somente o dia anterior.

## Modelo de e-mail

O corpo do e-mail deverá seguir este padrão, com dados dinâmicos:

> Olá, pessoal. A tabela Meta Varejo - Tonelada por Dia foi atualizada com os dados mais recentes.
>
> O ranking já está disponível para acompanhamento da evolução individual dos vendedores, considerando o desempenho em tonelagem e o atingimento das respectivas metas.
>
> **Totais do último dia processado**
>
> - Tonelagem total: [valor]
> - Valor total de vendas: [valor]
> - Meta diária de tonelagem: [valor]
> - Atingimento da meta diária: [percentual]
> - Regiões processadas: [quantidade/lista]
>
> **Resultado por vendedor em [data]**
>
> | # | Vendedor | Região | Tonelagem | Meta do dia | Atingimento |
> |---:|---|---|---:|---:|---:|
> | 1 | [vendedor] | [região] | [valor] t | [valor] t | [percentual] |
>
> **Ranking acumulado desde [primeiro dia do mês]**
>
> | # | Vendedor | Região | Tonelagem acumulada | Meta acumulada | Atingimento |
> |---:|---|---|---:|---:|---:|
> | 1 | [vendedor] | [região] | [valor] t | [valor] t | [percentual] |
>
> [Acessar ranking geral]
>
> Atenciosamente,  
> Inteligência de Mercado e Marketing  
> Grupo ABR

O envio deverá incluir todos os vendedores e regiões retornados pelo Resumo Comercial, sem limitar a amostra aos dois ou três primeiros colocados. A rotina também deverá evitar duplicidade de mensagens para a mesma data de referência.

### Cálculos do e-mail

- **Atingimento da meta diária** = tonelagem realizada no dia / meta diária correspondente.
- **Atingimento acumulado** = tonelagem acumulada no mês / meta acumulada até a data processada.
- **Fonte da meta mensal**: a meta será preenchida manualmente pelo usuário na aba **Configurações** da planilha.
- **Meta diária**: será calculada a partir da meta mensal informada em Configurações, dividida pela quantidade de dias úteis do mês.
- **Meta acumulada**: será calculada pela meta diária multiplicada pelos dias úteis transcorridos até a data processada, salvo se a aba Configurações fornecer explicitamente outro parâmetro.
- A automação deverá apenas ler os parâmetros de Configurações e nunca alterá-los.
