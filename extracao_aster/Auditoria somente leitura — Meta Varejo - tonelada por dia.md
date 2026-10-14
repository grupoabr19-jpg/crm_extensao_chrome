# Auditoria somente leitura — Meta Varejo - tonelada por dia

**ID:** `10XOSE1z8HucS0_5K_8iX8VFg6s0ASZJwDAMfo0uacIA`  
**Título:** Meta Varejo - tonelada  por dia   
**Fuso:** `America/Sao_Paulo`  
**Locale:** `pt_BR`  
**Recálculo:** `ON_CHANGE`  

## Limites da auditoria

Nenhuma operação de escrita foi executada. A API autorizada permitiu leitura de metadados, valores e fórmulas. O conteúdo de Apps Script vinculado e os gatilhos não são expostos pelo escopo atual do Google Sheets CLI; eles precisam ser auditados separadamente pelo código do projeto ou por uma autorização/API própria.

## Inventário das abas

| # | Aba | Oculta | Dimensão | Fórmulas | Erros de fórmula | Filtro | Mesclagens | Observações |
|---:|---|:---:|---:|---:|---:|:---:|---:|---|
| 0 | 1_Lançamentos Diários | não | 2017 × 7 | 2016 | 0 | sim | 0 | entrada operacional; fórmulas na coluna E |
| 1 | 2_Totais | não | 60 × 12 | 21 | 0 | não | 12 |  |
| 2 | _Snapshots Acumulados | sim | 1000 × 26 | 0 | 0 | não | 0 | oculta |
| 3 | _Historico de Cargas | sim | 1000 × 26 | 0 | 0 | não | 0 | oculta |
| 4 | 2_Ranking por Vendedor | não | 120 × 32 | 914 | 0 | não | 4 |  |
| 5 | 3_Ranking por Região | não | 40 × 33 | 155 | 0 | não | 3 |  |
| 6 | 4_Metas | não | 1000 × 9 | 34 | 0 | sim | 0 |  |
| 7 | 5_Configurações | não | 100 × 5 | 3 | 0 | não | 0 |  |
| 8 | 6_Consolidado 12M e Ano | não | 80 × 30 | 674 | 0 | não | 11 |  |
| 9 | 7_Upload Resumo Comercial | não | 1000 × 10 | 0 | 0 | sim | 0 | layout de carga manual existente |
| 10 | 7_Base Original (preservada) | sim | 1000 × 36 | 9 | 0 | não | 75 | oculta |

## Conteúdo observado por aba

### 1_Lançamentos Diários

- Linhas com valores retornadas: 97  
- Células não vazias: 582  
- Arquivo bruto local: `/home/ubuntu/planilha-auditoria-values/1_Lan_amentos_Di_rios.json`

Amostra inicial:

| Data | Vendedor | Peso do dia (kg) | Observação | Região (automática) | Faturamento (R$) |
| 01/09/2026 | ARIANE | 2.296,69 | ASTER - saldo de 01/09/2026 | MICRO | R$ 12.806,95 |
| 01/09/2026 | BRUNA | 2.550,48 | ASTER - saldo de 01/09/2026 | VARGINHA | R$ 17.636,08 |
| 01/09/2026 | CAMILA | 203,40 | ASTER - saldo de 01/09/2026 | POÇOS | R$ 1.291,50 |
| 01/09/2026 | EDMILA | 1.586,61 | ASTER - saldo de 01/09/2026 | MICRO | R$ 13.428,20 |
| 01/09/2026 | GABRIELA | 1.513,12 | ASTER - saldo de 01/09/2026 | ITAJUBÁ | R$ 11.859,92 |
| 01/09/2026 | HELOÁ | 10.347,39 | ASTER - saldo de 01/09/2026 | BRAG. PTA. | R$ 65.190,20 |
| 01/09/2026 | INAYARA | 1.629,27 | ASTER - saldo de 01/09/2026 | EXTREMA | R$ 14.088,33 |

| --- | --- | --- | --- | --- | --- |
| Data | Vendedor | Peso do dia (kg) | Observação | Região (automática) | Faturamento (R$) |
| 01/09/2026 | ARIANE | 2.296,69 | ASTER - saldo de 01/09/2026 | MICRO | R$ 12.806,95 |
| 01/09/2026 | BRUNA | 2.550,48 | ASTER - saldo de 01/09/2026 | VARGINHA | R$ 17.636,08 |

Fórmulas detectadas: **2016**; erros retornados pela API: **0**.

### 2_Totais

- Linhas com valores retornadas: 15  
- Células não vazias: 44  
- Arquivo bruto local: `/home/ubuntu/planilha-auditoria-values/2_Totais.json`

Amostra inicial:

| VISÃO GERAL — TOTAIS E DESAFIOS |
| Data-base | 09/09/2026 |  | Mês | 01/09/2026 |  | Meta base | 1.665,00 t |  | Desafios | configuráveis em 5_Configurações |
|  |
| TOTAL VENDIDO |  |  | FATURAMENTO (R$) |  |  | % META BASE |  |  | FALTA PARA META |
| 390,68 t |  |  | R$ 2.815.648,02 |  |  | 23,5% |  |  | 1.274,32 t |
|  |
|  |
| METAS E DESAFIOS |

| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| VISÃO GERAL — TOTAIS E DESAFIOS |
| Data-base | 09/09/2026 |  | Mês | 01/09/2026 |  | Meta base | 1.665,00 t |  | Desafios | configuráveis em 5_Configurações |
|  |

Fórmulas detectadas: **21**; erros retornados pela API: **0**.

### _Snapshots Acumulados

- Linhas com valores retornadas: 64  
- Células não vazias: 384  
- Arquivo bruto local: `/home/ubuntu/planilha-auditoria-values/Snapshots_Acumulados.json`

Amostra inicial:

| Data de referência | Vendedor | Acumulado (kg) | Fonte | Carregado em | Arquivo |
| 01/09/2026 | ARIANE | 2.296,69 | MANUAL | 04/09/2026 13:04:41 | Resumo Comercial 01-09.csv |
| 01/09/2026 | BRUNA | 2.550,48 | MANUAL | 04/09/2026 13:04:41 | Resumo Comercial 01-09.csv |
| 01/09/2026 | CAMILA | 203,40 | MANUAL | 04/09/2026 13:04:41 | Resumo Comercial 01-09.csv |
| 01/09/2026 | EDMILA | 1.586,61 | MANUAL | 04/09/2026 13:04:41 | Resumo Comercial 01-09.csv |
| 01/09/2026 | GABRIELA | 1.513,12 | MANUAL | 04/09/2026 13:04:41 | Resumo Comercial 01-09.csv |
| 01/09/2026 | HELOÁ | 10.347,39 | MANUAL | 04/09/2026 13:04:41 | Resumo Comercial 01-09.csv |
| 01/09/2026 | INAYARA | 1.629,27 | MANUAL | 04/09/2026 13:04:41 | Resumo Comercial 01-09.csv |

| --- | --- | --- | --- | --- | --- |
| Data de referência | Vendedor | Acumulado (kg) | Fonte | Carregado em | Arquivo |
| 01/09/2026 | ARIANE | 2.296,69 | MANUAL | 04/09/2026 13:04:41 | Resumo Comercial 01-09.csv |
| 01/09/2026 | BRUNA | 2.550,48 | MANUAL | 04/09/2026 13:04:41 | Resumo Comercial 01-09.csv |

Fórmulas detectadas: **0**; erros retornados pela API: **0**.

### _Historico de Cargas

- Linhas com valores retornadas: 33  
- Células não vazias: 322  
- Arquivo bruto local: `/home/ubuntu/planilha-auditoria-values/Historico_de_Cargas.json`

Amostra inicial:

| ID | Executado em | Data de referência | Fonte | Modo | Situação | Linhas | Peso total (kg) | Arquivo | Mensagem |
| b79633c4-2322-457e-94f9-7098bce2eebd | 04/09/2026 11:43:11 | 04/09/2026 | MANUAL | cumulative_by_seller | SUCESSO | 16 | 67.181,37 | Resumo Comercial (1).csv | Snapshot acumulado processado e mês reconstruído. |
| 1c030195-f93a-4ad2-9bf8-feabd7320f90 | 04/09/2026 11:43:16 | 04/09/2026 | MANUAL | cumulative_by_seller | SUCESSO | 16 | 67.181,37 | Resumo Comercial (1).csv | Snapshot acumulado processado e mês reconstruído. |
| 349a77f3-8fb3-4db5-9cd3-c8a4ed27d161 | 04/09/2026 12:03:10 | 01/09/2026 | MANUAL | cumulative_by_seller | SUCESSO | 31 | 37.078,64 | Resumo Comercial 01-09.csv | Snapshot acumulado processado e mês reconstruído. |
| 93602854-7eeb-4336-8e7e-848d8ce7ad04 | 04/09/2026 12:03:22 | 02/09/2026 | MANUAL | cumulative_by_seller | SUCESSO | 47 | 70.632,14 | Resumo Comercial 02-09.csv | Snapshot acumulado processado e mês reconstruído. |
| 90cc6320-5938-4c90-b069-4f4db310a870 | 04/09/2026 12:03:41 | 03/09/2026 | MANUAL | cumulative_by_seller | SUCESSO | 47 | 67.181,37 | Resumo Comercial 03-09.csv | Snapshot acumulado processado e mês reconstruído. |
| 34af8386-fc3a-41bb-a463-25fe0320e919 | 04/09/2026 12:07:16 | 03/09/2026 | MANUAL | cumulative_by_seller | SUCESSO | 47 | 67.181,37 | Resumo Comercial (2).csv | Snapshot acumulado processado e mês reconstruído. |
| 107faed5-af99-4804-8c2a-3283491cb179 | 04/09/2026 13:04:43 | 01/09/2026 | MANUAL | cumulative_by_seller | SUCESSO | 47 | 37.078,64 | Resumo Comercial 01-09.csv | Snapshot acumulado processado e mês reconstruído. |

| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ID | Executado em | Data de referência | Fonte | Modo | Situação | Linhas | Peso total (kg) | Arquivo | Mensagem |
| b79633c4-2322-457e-94f9-7098bce2eebd | 04/09/2026 11:43:11 | 04/09/2026 | MANUAL | cumulative_by_seller | SUCESSO | 16 | 67.181,37 | Resumo Comercial (1).csv | Snapshot acumulado processado e mês reconstruído. |
| 1c030195-f93a-4ad2-9bf8-feabd7320f90 | 04/09/2026 11:43:16 | 04/09/2026 | MANUAL | cumulative_by_seller | SUCESSO | 16 | 67.181,37 | Resumo Comercial (1).csv | Snapshot acumulado processado e mês reconstruído. |

Fórmulas detectadas: **0**; erros retornados pela API: **0**.

### 2_Ranking por Vendedor

- Linhas com valores retornadas: 22  
- Células não vazias: 453  
- Arquivo bruto local: `/home/ubuntu/planilha-auditoria-values/2_Ranking_por_Vendedor.json`

Amostra inicial:

| RANKING INDIVIDUAL DE VENDAS — VAREJO |
| Data | 09/09/2026 |  | Mês | setembro/2026 |  | Critério | % da meta mensal atingida |
| Meta mês | 1.665.003,00 kg |  | Venda do dia | 56.523,75 kg |  | Acumulado | 390.682,51 kg |  | Total atingido | 23,5% |  |  |  |  | 0,8212530458 |
| Fonte de vendas: 1_Lançamentos Diários, alimentada pelo Python. Fonte das metas: 4_Metas. Ranking = vendas acumuladas do vendedor ÷ meta mensal individual. |
| Posição | Vendedor | Região | Segmento | Meta mês (kg) | Meta diária (kg) | Vendas no dia (kg) | % meta diária | Acumulado no mês (kg) | % meta mensal — ranking | Status do ritmo |
| 1 | TAINARA | EXTREMA | VCORP | 77.555,00 kg | 3.693,10 kg | 12.666,52 kg | 343,0% | 65.674,27 kg | 84,7% | No ritmo / acima |  |  |  |  |  | JOSIANE | JUNDIAÍ | VARE | 83.246,00 | 3.964,10 | 300,6 | 0,07583067054 | 4524,29 | 0,05434843716 | 23784,57143 | 0,1902195301 | 15835,015 | 78.721,71 | Abaixo do ritmo |
| 2 | MILENA | POÇOS | VARE | 85.666,00 kg | 4.079,33 kg | 1.276,24 kg | 31,3% | 34.597,15 kg | 40,4% | No ritmo / acima |  |  |  |  |  | KAYLANE | JUNDIAÍ | VCORP | 83.700,00 | 3.985,71 | 347,34 | 0,08714623656 | 10721,64 | 0,1280960573 | 23914,28571 | 0,4483362007 | 37525,74 | 72.978,36 | Abaixo do ritmo |
| 3 | HELOÁ | BRAG. PTA. | VCORP | 90.576,00 kg | 4.313,14 kg | 2.304,16 kg | 53,4% | 31.654,93 kg | 34,9% | No ritmo / acima |  |  |  |  |  | LEIZ | BRAG. PTA. | VARE | 109.598,00 | 5.218,95 | 1799,12 | 0,3447281885 | 35623,7 | 0,3250396905 | 31313,71429 | 1,137638917 | 124682,95 | 73.974,30 | No ritmo / acima |

| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RANKING INDIVIDUAL DE VENDAS — VAREJO |
| Data | 09/09/2026 |  | Mês | setembro/2026 |  | Critério | % da meta mensal atingida |
| Meta mês | 1.665.003,00 kg |  | Venda do dia | 56.523,75 kg |  | Acumulado | 390.682,51 kg |  | Total atingido | 23,5% |  |  |  |  | 0,8212530458 |

Fórmulas detectadas: **914**; erros retornados pela API: **0**.

### 3_Ranking por Região

- Linhas com valores retornadas: 13  
- Células não vazias: 137  
- Arquivo bruto local: `/home/ubuntu/planilha-auditoria-values/3_Ranking_por_Regi_o.json`

Amostra inicial:

| RANKING DE EQUIPES POR REGIÃO — VAREJO |
| Data | 09/09/2026 |  | Mês | setembro/2026 |  | Critério | % meta mensal |
| Vendas: 1_Lançamentos Diários (Python). Metas e composição das equipes: 4_Metas. Posição = vendas acumuladas da região ÷ meta mensal regional. |
| RANKING REGIONAL — CRITÉRIO: PERCENTUAL DA META MENSAL |
| Posição | Região | Meta mês (kg) | Acumulado no mês (kg) | % da meta — ranking | Vendas no dia (kg) | Meta acumulada (kg) | Ritmo acumulado |
| 1 | EXTREMA | 185.213,00 kg | 83.872,21 kg | 45,3% | 15.504,87 kg | 52.918,00 kg | 158,5% |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | JUNDIAÍ | 166946 | 15245,93 | 0,09132252345 | 647,94 | 47698,85714 | 0,3196288321 |
| 2 | BRAG. PTA. | 200.174,00 kg | 67.278,63 kg | 33,6% | 4.103,28 kg | 57.192,57 kg | 117,6% |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | BRAG. PTA. | 200174 | 67278,63 | 0,3361007424 | 4103,28 | 57192,57143 | 1,176352598 |
| 3 | POÇOS | 201.515,00 kg | 60.249,01 kg | 29,9% | 6.023,84 kg | 57.575,71 kg | 104,6% |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | EXTREMA | 185213 | 83872,21 | 0,4528419171 | 15504,87 | 52918 | 1,58494671 |

| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RANKING DE EQUIPES POR REGIÃO — VAREJO |
| Data | 09/09/2026 |  | Mês | setembro/2026 |  | Critério | % meta mensal |
| Vendas: 1_Lançamentos Diários (Python). Metas e composição das equipes: 4_Metas. Posição = vendas acumuladas da região ÷ meta mensal regional. |

Fórmulas detectadas: **155**; erros retornados pela API: **0**.

### 4_Metas

- Linhas com valores retornadas: 18  
- Células não vazias: 162  
- Arquivo bruto local: `/home/ubuntu/planilha-auditoria-values/4_Metas.json`

Amostra inicial:

| Mês de referência | Região | Líder regional | Segmento | Vendedor | Meta mensal (kg) | Dias úteis | Meta diária (kg) | Observação |
| setembro/2026 | JUNDIAÍ | DYONAVA | VARE | JOSIANE | 83.246,00 | 21 | 3.964,10 | Migrado da estrutura original |
| setembro/2026 | JUNDIAÍ | DYONAVA | VCORP | KAYLANE | 83.700,00 | 21 | 3.985,71 | Migrado da estrutura original |
| setembro/2026 | BRAG. PTA. | ALESSANDRO | VARE | LEIZ | 109.598,00 | 21 | 5.218,95 | Migrado da estrutura original |
| setembro/2026 | BRAG. PTA. | ALESSANDRO | VCORP | HELOÁ | 90.576,00 | 21 | 4.313,14 | Migrado da estrutura original |
| setembro/2026 | EXTREMA | GUSTAVO | VARE | INAYARA | 107.658,00 | 21 | 5.126,57 | Migrado da estrutura original |
| setembro/2026 | EXTREMA | GUSTAVO | VCORP | TAINARA | 77.555,00 | 21 | 3.693,10 | Migrado da estrutura original |
| setembro/2026 | MICRO | JULIANO | VARE | EDMILA | 111.100,00 | 21 | 5.290,48 | Migrado da estrutura original |

| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Mês de referência | Região | Líder regional | Segmento | Vendedor | Meta mensal (kg) | Dias úteis | Meta diária (kg) | Observação |
| setembro/2026 | JUNDIAÍ | DYONAVA | VARE | JOSIANE | 83.246,00 | 21 | 3.964,10 | Migrado da estrutura original |
| setembro/2026 | JUNDIAÍ | DYONAVA | VCORP | KAYLANE | 83.700,00 | 21 | 3.985,71 | Migrado da estrutura original |

Fórmulas detectadas: **34**; erros retornados pela API: **0**.

### 5_Configurações

- Linhas com valores retornadas: 9  
- Células não vazias: 24  
- Arquivo bruto local: `/home/ubuntu/planilha-auditoria-values/5_Configura_es.json`

Amostra inicial:

| Parâmetro | Valor |  | Feriados | Descrição |
| Data de referência atual | 09/09/2026 |
| Mês de referência | 01/09/2026 |
| Dias úteis do mês | 21 |
| Unidade de peso | kg |
| Acionamento manual | Menu Automação de vendas → Atualizar agora |  | 07/09/2026 | Independência do Brasil |
| Desafio 1 — adicional sobre a meta | 15% |  |  | Percentual editável aplicado sobre a Meta Base. |
| Desafio 2 — adicional sobre a meta | 30% |  |  | Percentual editável aplicado sobre a Meta Base. |

| --- | --- | --- | --- | --- |
| Parâmetro | Valor |  | Feriados | Descrição |
| Data de referência atual | 09/09/2026 |
| Mês de referência | 01/09/2026 |

Fórmulas detectadas: **3**; erros retornados pela API: **0**.

### 6_Consolidado 12M e Ano

- Linhas com valores retornadas: 53  
- Células não vazias: 524  
- Arquivo bruto local: `/home/ubuntu/planilha-auditoria-values/6_Consolidado_12M_e_Ano.json`

Amostra inicial:

| CONSOLIDADO COMERCIAL — 12 MESES E ANO CORRENTE |
| Data-base | 09/09/2026 |  | Ano corrente | 2026 |  |  | Janela 12M | out./2025 a 09/09/2026 |
| Vendas no ano | 390.682,51 kg |  | Meta acumulada | 1.665.003,00 kg |  | % do ano | 23,5% | Vendas 12M | 390.682,51 kg |  | % 12M | 23,5% |
| O consolidado utiliza somente competências existentes em 1_Lançamentos Diários e 4_Metas; meses sem histórico não são estimados. |
| RANKING DO ANO CORRENTE — % DA META |  |  |  |  |  |  | RANKING DOS ÚLTIMOS 12 MESES — % DA META |
| Posição | Vendedor | Região | Vendas (kg) | Meta (kg) | % da meta |  | Posição | Vendedor | Região | Vendas (kg) | Meta (kg) | % da meta |
| 1 | TAINARA | EXTREMA | 65.674,27 kg | 77.555,00 kg | 84,7% |  | 1 | TAINARA | EXTREMA | 65.674,27 kg | 77.555,00 kg | 84,7% |  |  |  | ARIANE | MICRO | 24312,18 | 96221 | 0,2526702071 |  |  | ARIANE | MICRO | 24312,18 | 96221 | 0,2526702071 |
| 2 | MILENA | POÇOS | 34.597,15 kg | 85.666,00 kg | 40,4% |  | 2 | MILENA | POÇOS | 34.597,15 kg | 85.666,00 kg | 40,4% |  |  |  | BRUNA | VARGINHA | 18684,83 | 124000 | 0,1506841129 |  |  | BRUNA | VARGINHA | 18684,83 | 124000 | 0,1506841129 |

| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CONSOLIDADO COMERCIAL — 12 MESES E ANO CORRENTE |
| Data-base | 09/09/2026 |  | Ano corrente | 2026 |  |  | Janela 12M | out./2025 a 09/09/2026 |
| Vendas no ano | 390.682,51 kg |  | Meta acumulada | 1.665.003,00 kg |  | % do ano | 23,5% | Vendas 12M | 390.682,51 kg |  | % 12M | 23,5% |

Fórmulas detectadas: **674**; erros retornados pela API: **0**.

### 7_Upload Resumo Comercial

- Linhas com valores retornadas: 20  
- Células não vazias: 150  
- Arquivo bruto local: `/home/ubuntu/planilha-auditoria-values/7_Upload_Resumo_Comercial.json`

Amostra inicial:

| Vendedor | Tipo | Região | Segmento | Peso total | Valor total |  | CONTROLE DE CARGAS | RESUMO COMERCIAL / ASTER |
| ATF - LARISSA TERRA | ATACADO | SP - CAPITAL | INTERNO | 13.032,00 | R$ 84.182,45 |  | Última carga | 10/09/2026 07:19:51 |
| ATF - WILSON NETO | ATACADO | SP - CAPITAL | INTERNO | 13.692,00 | R$ 74.463,78 |  | Fonte | MANUAL |
| VCORP - HELOA LEITE | VAREJO | BRAGANÇA PAULISTA | CORPORATIVO | 2.304,16 | R$ 23.697,50 |  | Data do saldo | 09/09/2026 |
| VARE - LEIZ TORSO | VAREJO | BRAGANÇA PAULISTA | ESPECIALISTA | 1.799,12 | R$ 16.234,15 |  | Modo | date_balance |
| VCORP - TAINARA MATILDE | VAREJO | EXTREMA | CORPORATIVO | 12.666,52 | R$ 69.307,74 |  | Situação | CARGA CONCLUÍDA; SALDO DA DATA SUBSTITUÍDO |
| VARE - INAYARA CUNHA | VAREJO | EXTREMA | ESPECIALISTA | 2.838,35 | R$ 24.463,24 |  | Arquivo | Resumo Comercial (6).csv |
| VCORP - JESSICA SANTOS | VAREJO | ITAJUBÁ | CORPORATIVO | 1.341,40 | R$ 7.758,25 |  | Peso do dia (kg) | 56.523,75 |

| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Vendedor | Tipo | Região | Segmento | Peso total | Valor total |  | CONTROLE DE CARGAS | RESUMO COMERCIAL / ASTER |
| ATF - LARISSA TERRA | ATACADO | SP - CAPITAL | INTERNO | 13.032,00 | R$ 84.182,45 |  | Última carga | 10/09/2026 07:19:51 |
| ATF - WILSON NETO | ATACADO | SP - CAPITAL | INTERNO | 13.692,00 | R$ 74.463,78 |  | Fonte | MANUAL |

Fórmulas detectadas: **0**; erros retornados pela API: **0**.

### 7_Base Original (preservada)

- Linhas com valores retornadas: 26  
- Células não vazias: 155  
- Arquivo bruto local: `/home/ubuntu/planilha-auditoria-values/7_Base_Original_preservada.json`

Amostra inicial:

| REGIÃO | JUNDIAÍ |  |  |  | BRAG. PTA. |  |  |  | EXTREMA |  |  |  | MICRO |  |  |  |  |  | POUSO ALEGRE |  |  |  | POÇOS |  |  |  | ITAJUBÁ |  |  |  | VARGINHA |
| LÍDER REGIONAL | DYONAVA |  |  |  | ALESSANDRO |  |  |  | GUSTAVO |  |  |  | JULIANO |  |  |  |  |  | PAOLA |  |  |  | JOSÉ FELIPE |  |  |  | JENNIFER |  |  |  | PETERSON |
|  SEGMENTO | VARE |  | VCORP |  | VARE |  | VCORP |  | VARE |  | VCORP |  | VARE |  | VCORP |  | VARC |  | VARE |  | VCORP |  | VARE |  | VCORP |  | VARE |  | VCORP |  | VARE |  | VCORP |
|  VENDEDOR | JOSIANE |  | KAYLANE  |  | LEIZ |  | HELOÁ |  | INAYARA |  | TAINARA |  | EDMILA |  | MATHEUS TEIXEIRA |  | ARIANE |  | RAFAELA  |  | VITORIA  |  | MILENA |  | CAMILA |  | GABRIELA  |  | JESSICA |  | BRUNA |  | THAÍS |
|  | 83.246 |  | 83.700 |  | 109.598 |  | 90.576 |  | 107.658 |  | 77.555 |  | 111.100 |  | 83.424 |  | 96.221 |  | 111.354 |  | 78.133 |  | 85.666 |  | 115.849 |  | 110.624 |  | 107.299 |  | 124.000 |  | 89.000 |  | VAREJO  |
|  | 166.946 |  |  |  | 200.174 |  |  |  | 185.213 |  |  |  | 290.745 |  |  |  |  |  | 189.487 |  |  |  | 201.515 |  |  |  | 217.923 |  |  |  | 213.000 |  |  |  | 1.665.003 |
|  |
| 1-set. |  |  | 2-set. |

| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| REGIÃO | JUNDIAÍ |  |  |  | BRAG. PTA. |  |  |  | EXTREMA |  |  |  | MICRO |  |  |  |  |  | POUSO ALEGRE |  |  |  | POÇOS |  |  |  | ITAJUBÁ |  |  |  | VARGINHA |
| LÍDER REGIONAL | DYONAVA |  |  |  | ALESSANDRO |  |  |  | GUSTAVO |  |  |  | JULIANO |  |  |  |  |  | PAOLA |  |  |  | JOSÉ FELIPE |  |  |  | JENNIFER |  |  |  | PETERSON |
|  SEGMENTO | VARE |  | VCORP |  | VARE |  | VCORP |  | VARE |  | VCORP |  | VARE |  | VCORP |  | VARC |  | VARE |  | VCORP |  | VARE |  | VCORP |  | VARE |  | VCORP |  | VARE |  | VCORP |

Fórmulas detectadas: **9**; erros retornados pela API: **0**.

## Achados relevantes para a automação

1. A planilha usa o fuso `America/Sao_Paulo`, exatamente compatível com a execução diária às 05:00.
2. A aba de entrada se chama `1_Lançamentos Diários` e possui 7 colunas configuradas, mas os valores retornados mostram seis cabeçalhos preenchidos: Data, Vendedor, Peso do dia (kg), Observação, Região (automática) e Faturamento (R$). A coluna G deve ser investigada antes de qualquer append.
3. A coluna E da aba de lançamentos é calculada por fórmula a partir de `4_Metas`; portanto, a automação deve escrever somente nas colunas de entrada e deixar a fórmula de região intacta.
4. A aba `7_Upload Resumo Comercial` já existe e contém um fluxo manual documentado, com controle de última carga, fonte, data do saldo, modo `date_balance`, situação de substituição do saldo da data, arquivo, peso do dia e faturamento. Isso é uma forte indicação de que a integração deve adaptar ou acionar o fluxo existente, não criar uma segunda lógica concorrente.
5. A aba `4_Metas` possui metas mensais por vendedor/região/segmento e calcula dias úteis e meta diária com `NETWORKDAYS`, usando feriados da aba `5_Configurações`.
6. A aba `5_Configurações` contém data de referência, mês, dias úteis, unidade de peso, feriados e instrução de acionamento manual. A automação deve ler esses parâmetros e não alterá-los.
7. As abas `2_Totais`, `2_Ranking por Vendedor`, `3_Ranking por Região` e `6_Consolidado 12M e Ano` dependem diretamente da aba de lançamentos e/ou de metas por fórmulas. Um append correto na origem deve alimentar os resultados automaticamente.
8. Há abas ocultas `_Snapshots Acumulados`, `_Historico de Cargas` e `7_Base Original (preservada)`. Elas devem ser preservadas e incorporadas à auditoria do script antes de decidir a estratégia de fechamento mensal.
9. Não foram detectados erros de fórmula na leitura atual da API.
10. A API atual não permitiu confirmar o código dos Apps Scripts nem os gatilhos. Esta é a principal pendência antes de escrever qualquer valor.

## Próxima etapa segura

Obter o código dos Apps Scripts e a definição dos gatilhos existentes; mapear a faixa exata de escrita do fluxo `7_Upload Resumo Comercial`; e somente depois elaborar um plano de integração que reutilize ou complemente a lógica existente sem tocar em fórmulas, lançamentos manuais ou intervalos protegidos.
