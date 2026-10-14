#!/usr/bin/env python3
import json, subprocess, pathlib, re
SPREADSHEET='10XOSE1z8HucS0_5K_8iX8VFg6s0ASZJwDAMfo0uacIA'
meta=json.load(open('/home/ubuntu/planilha-metadata.json'))
out=pathlib.Path('/home/ubuntu/planilha-auditoria-grid'); out.mkdir(exist_ok=True)
summary=[]
for s in meta.get('sheets',[]):
    p=s['properties']; g=p.get('gridProperties',{}); title=p['title']; rows=g.get('rowCount',1000); cols=g.get('columnCount',26)
    # A1 upper bound
    n=cols; letters=''
    while n:
        n,rem=divmod(n-1,26); letters=chr(65+rem)+letters
    safe=re.sub(r'[^A-Za-z0-9_-]+','_',title).strip('_') or 'sheet'
    path=out/(safe+'.json')
    params=json.dumps({'spreadsheetId':SPREADSHEET,'includeGridData':True,'ranges':[f"'{title}'!A1:{letters}{rows}"]},ensure_ascii=False)
    r=subprocess.run(['gws','sheets','spreadsheets','get','--params',params],capture_output=True,text=True)
    path.write_text(r.stdout,encoding='utf-8')
    item={'title':title,'status':'ok' if r.returncode==0 else 'error','file':str(path)}
    if r.returncode==0:
        try:
            d=json.loads(r.stdout); formulas=[]; errors=[]
            for sd in d.get('sheets',[]):
                for gd in sd.get('data',[]):
                    sr=gd.get('startRow',0); sc=gd.get('startColumn',0)
                    for ri,row in enumerate(gd.get('rowData',[])):
                        for ci,cell in enumerate(row.get('values',[])):
                            u=cell.get('userEnteredValue',{})
                            if 'formulaValue' in u: formulas.append({'row':sr+ri+1,'col':sc+ci+1,'formula':u['formulaValue']})
                            if 'errorValue' in cell: errors.append({'row':sr+ri+1,'col':sc+ci+1,'error':cell['errorValue']})
            item['formula_count']=len(formulas); item['error_count']=len(errors); item['formula_sample']=formulas[:20]; item['error_sample']=errors[:10]
        except Exception as e: item['parse_error']=str(e)
    else: item['stderr']=r.stderr[-1000:]
    summary.append(item); print(json.dumps(item,ensure_ascii=False))
pathlib.Path('/home/ubuntu/planilha-auditoria-formulas-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
