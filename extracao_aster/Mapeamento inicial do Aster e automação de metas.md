# Mapeamento inicial do Aster e automação de metas

## Escopo confirmado

O portal acessado foi `https://aster.gruposps.com.br/`, ambiente identificado como **ABR**. O usuário autenticado possui acesso à área de trabalho e aos módulos Administração, Compras, CRM, Estoque, Parceiro de Negócios, Relatórios, Transporte e Vendas.

A primeira extração necessária para a planilha de metas será feita em **Vendas → Resumo Comercial**.

## Mapa estrutural identificado

### Administração

- Filial Padrão

### Parceiro de Negócios

- Atividades
- Parceiro de Negócio por CNPJ
- Parceiros de Negócios

### CRM

- Atividades
- Oportunidade de Vendas
- Oportunidade de Vendas Kanban
- Pedido de Venda
- Cotação de Venda

### Estoque

- Detalhes de Lote
- Itens
- Detalhes de N° de Série
- Estoque
- Estoque Disponível
- Estrutura de Produto
- Estoque URIFER
- Estoque WMS
- Power BI - Envelhecimento Estoque

### Compras

- Disp. de Vendas (Importação)

### Relatórios

- ABR - Contas a Receber - PN

### Vendas

- Pedido de Devolução
- Nota Fiscal de Saída
- Oportunidade de Vendas
- Oportunidade de Vendas Kanban
- Pedido de Venda
- Cotação de Venda
- ABR - Analise de Vendas por Item
- ABR - Vendas Por Indicação
- Mapa de relação
- Resumo Comercial
- Último preço de venda
- Segmentação de Lead
- Power BI - Inadimplência

### Transporte

- Ordem de Despacho
- Ocorrências
- Materiais em Transito

## Relatório Resumo Comercial

### Parâmetros

O relatório possui dois parâmetros obrigatórios:

- Data Inicial
- Date Final

O formato aceito na interface é `dd/mm/aaaa`.

### Colunas retornadas

A tabela exibida e o arquivo exportado possuem as mesmas seis colunas:

1. Vendedor
2. Tipo
3. Região
4. Segmento
5. Peso total
6. Valor total

### Exportação

O relatório disponibiliza exportação visual em PDF e exportação tabular em **CSV/XLSX**. A exportação tabular observada foi um CSV UTF-8 com BOM, separado por ponto e vírgula, com valores monetários em formato brasileiro.

A amostra de 01/09/2026 a 10/09/2026 produziu **22 registros**.

### Exemplo de registro

| Vendedor | Tipo | Região | Segmento | Peso total | Valor total |
|---|---|---|---|---:|---:|
| ATF - LARISSA TERRA | ATACADO | SP - CAPITAL | INTERNO | 70.979,00 | R$ 443.190,13 |

## Desenho recomendado da automação

1. Autenticar no Aster com uma conta de serviço/usuário dedicado de somente leitura, sempre que possível.
2. Abrir o relatório Resumo Comercial.
3. Definir Data Inicial e Date Final conforme a configuração da rotina.
4. Executar o relatório.
5. Preferir baixar a exportação CSV/XLSX em vez de copiar a tabela da tela.
6. Normalizar separadores, acentuação, peso e moeda para valores estruturados.
7. Gravar os dados em uma aba de dados brutos da planilha de metas.
8. Preservar histórico por período e registrar data/hora da execução, parâmetros usados e quantidade de registros.
9. Atualizar abas de consolidação ou metas sem apagar histórico.
10. Enviar e-mail automático com resumo, período processado, quantidade de registros e link/arquivo conforme a configuração.
11. Registrar falhas de login, relatório vazio, mudança de layout, erro de download e falha de escrita na planilha.

## Pontos ainda pendentes

- Autorizar a conta Google que possui a planilha `10XOSE1z8HucS0_5K_8iX8VFg6s0ASZJwDAMfo0uacIA`; o link foi fornecido, mas a sessão atual ainda não possui credenciais do Google Workspace.
- Confirmar a aba e o layout de destino dentro da planilha.
- Definir a periodicidade e o intervalo padrão do relatório.
- Definir destinatários, assunto, corpo do e-mail e se o envio terá CSV/XLSX anexado ou apenas link.
- Fazer o mapeamento detalhado de cada um dos demais relatórios para formar um catálogo de extrações futuras. A área de trabalho já fornece o inventário de menus; o detalhamento de filtros, colunas e exportações deve ser levantado relatório por relatório.

## Observação de segurança

Nenhum dado foi alterado no Aster. A exploração realizada foi de leitura e a execução do relatório serviu apenas para validar parâmetros, estrutura e exportação.
