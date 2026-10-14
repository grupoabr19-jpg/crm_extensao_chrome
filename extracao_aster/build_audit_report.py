#!/usr/bin/env python3
import json, pathlib, re
meta=json.load(open('/home/ubuntu/planilha-metadata.json'))
valdir=pathlib.Path('/home/ubuntu/planilha-auditoria-values')
fdir=pathlib.Path('/home/ubuntu/planilha-auditoria-grid')
summary=json.load(open('/home/ubuntu/planilha-auditoria-summary.json'))
fs=json.load(open('/home/ubuntu/planilha-auditoria-formulas-summary.json'))
fmap={x['title']:x for x in fs}
lines=[]
props=meta['properties']
lines += ['# Auditoria somente leitura — Meta Varejo - tonelada por dia','',f"**ID:** `{meta['spreadsheetId']}`  ",f"**Título:** {props.get('title')}  ",f"**Fuso:** `{props.get('timeZone')}`  ",f"**Locale:** `{props.get('locale')}`  ",f"**Recálculo:** `{props.get('autoRecalc')}`  ",'', '## Limites da auditoria','', 'Nenhuma operação de escrita foi executada. A API autorizada permitiu leitura de metadados, valores e fórmulas. O conteúdo de Apps Script vinculado e os gatilhos não são expostos pelo escopo atual do Google Sheets CLI; eles precisam ser auditados separadamente pelo código do projeto ou por uma autorização/API própria.', '', '## Inventário das abas','', '| # | Aba | Oculta | Dimensão | Fórmulas | Erros de fórmula | Filtro | Mesclagens | Observações |','|---:|---|:---:|---:|---:|---:|:---:|---:|---|']
for i,s in enumerate(meta['sheets']):
 p=s['properties']; g=p.get('gridProperties',{}); title=p['properties']['title'] if 'properties' in p else p['title']
 # actual
 title=p['title']; f=fmap.get(title,{})
 obs=[]
 if title=='1_Lançamentos Diários': obs.append('entrada operacional; fórmulas na coluna E')
 if title=='7_Upload Resumo Comercial': obs.append('layout de carga manual existente')
 if p.get('hidden'): obs.append('oculta')
 lines.append(f"| {i} | {title} | {'sim' if p.get('hidden') else 'não'} | {g.get('rowCount')} × {g.get('columnCount')} | {f.get('formula_count','?')} | {f.get('error_count','?')} | {'sim' if 'basicFilter' in s else 'não'} | {len(s.get('merges',[]))} | {'; '.join(obs)} |")
lines += ['', '## Conteúdo observado por aba', '']
for item in summary:
 title=item['title']; safe=re.sub(r'[^A-Za-z0-9_-]+','_',title).strip('_') or 'sheet'; vf=valdir/(safe+'.json')
 try: d=json.load(open(vf)); vals=d.get('values',[])
 except: vals=[]
 lines += [f'### {title}', '', f"- Linhas com valores retornadas: {item.get('rows_returned')}  ", f"- Células não vazias: {item.get('nonempty_cells')}  ", f"- Arquivo bruto local: `{vf}`", '', 'Amostra inicial:', '']
 for row in vals[:8]:
  cells=[str(x).replace('|','\\|').replace('\n',' ') for x in row]
  lines.append('| '+' | '.join(cells)+' |')
 if vals:
  lines.append('')
  lines.append('| '+ ' | '.join(['---']*max(len(x) for x in vals[:8])) +' |')
  for row in vals[:3]:
   cells=[str(x).replace('|','\\|').replace('\n',' ') for x in row]
   lines.append('| '+' | '.join(cells)+' |')
 lines += ['', f"Fórmulas detectadas: **{fmap.get(title,{}).get('formula_count','?')}**; erros retornados pela API: **{fmap.get(title,{}).get('error_count','?')}**.", '']
lines += ['## Achados relevantes para a automação', '', '1. A planilha usa o fuso `America/Sao_Paulo`, exatamente compatível com a execução diária às 05:00.', '2. A aba de entrada se chama `1_Lançamentos Diários` e possui 7 colunas configuradas, mas os valores retornados mostram seis cabeçalhos preenchidos: Data, Vendedor, Peso do dia (kg), Observação, Região (automática) e Faturamento (R$). A coluna G deve ser investigada antes de qualquer append.', '3. A coluna E da aba de lançamentos é calculada por fórmula a partir de `4_Metas`; portanto, a automação deve escrever somente nas colunas de entrada e deixar a fórmula de região intacta.', '4. A aba `7_Upload Resumo Comercial` já existe e contém um fluxo manual documentado, com controle de última carga, fonte, data do saldo, modo `date_balance`, situação de substituição do saldo da data, arquivo, peso do dia e faturamento. Isso é uma forte indicação de que a integração deve adaptar ou acionar o fluxo existente, não criar uma segunda lógica concorrente.', '5. A aba `4_Metas` possui metas mensais por vendedor/região/segmento e calcula dias úteis e meta diária com `NETWORKDAYS`, usando feriados da aba `5_Configurações`.', '6. A aba `5_Configurações` contém data de referência, mês, dias úteis, unidade de peso, feriados e instrução de acionamento manual. A automação deve ler esses parâmetros e não alterá-los.', '7. As abas `2_Totais`, `2_Ranking por Vendedor`, `3_Ranking por Região` e `6_Consolidado 12M e Ano` dependem diretamente da aba de lançamentos e/ou de metas por fórmulas. Um append correto na origem deve alimentar os resultados automaticamente.', '8. Há abas ocultas `_Snapshots Acumulados`, `_Historico de Cargas` e `7_Base Original (preservada)`. Elas devem ser preservadas e incorporadas à auditoria do script antes de decidir a estratégia de fechamento mensal.', '9. Não foram detectados erros de fórmula na leitura atual da API.', '10. A API atual não permitiu confirmar o código dos Apps Scripts nem os gatilhos. Esta é a principal pendência antes de escrever qualquer valor.', '', '## Próxima etapa segura', '', 'Obter o código dos Apps Scripts e a definição dos gatilhos existentes; mapear a faixa exata de escrita do fluxo `7_Upload Resumo Comercial`; e somente depois elaborar um plano de integração que reutilize ou complemente a lógica existente sem tocar em fórmulas, lançamentos manuais ou intervalos protegidos.']
path='/home/ubuntu/planilha-auditoria-relatorio.md'; pathlib.Path(path).write_text('\n'.join(lines)+'\n',encoding='utf-8'); print(path)
