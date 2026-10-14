#!/usr/bin/env python3
import json, subprocess, pathlib, re, sys

SPREADSHEET='10XOSE1z8HucS0_5K_8iX8VFg6s0ASZJwDAMfo0uacIA'
meta=json.load(open('/home/ubuntu/planilha-metadata.json'))
out=pathlib.Path('/home/ubuntu/planilha-auditoria-values')
out.mkdir(exist_ok=True)
summary=[]
for sheet in meta.get('sheets',[]):
    title=sheet['properties']['title']
    safe=re.sub(r'[^A-Za-z0-9_-]+','_',title).strip('_') or 'sheet'
    path=out/(safe+'.json')
    cmd=['gws','sheets','+read','--spreadsheet',SPREADSHEET,'--range',title,'--format','json']
    r=subprocess.run(cmd, text=True, capture_output=True)
    path.write_text(r.stdout, encoding='utf-8')
    if r.returncode!=0:
        summary.append({'title':title,'status':'error','stderr':r.stderr[-1000:]})
        continue
    try:
        d=json.loads(r.stdout)
    except Exception:
        summary.append({'title':title,'status':'invalid_json','bytes':len(r.stdout)})
        continue
    vals=d.get('values', d.get('valueRanges',[{}])[0].get('values',[]) if isinstance(d,dict) else [])
    nonempty=sum(1 for row in vals for v in row if v not in ('',None)) if isinstance(vals,list) else 0
    maxcols=max((len(row) for row in vals), default=0)
    summary.append({'title':title,'status':'ok','rows_returned':len(vals),'max_columns_returned':maxcols,'nonempty_cells':nonempty,'file':str(path)})
pathlib.Path('/home/ubuntu/planilha-auditoria-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False,indent=2))
