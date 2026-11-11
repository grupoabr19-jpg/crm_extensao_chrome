import json
import sys
from openpyxl import load_workbook

start = int(sys.argv[1])
size = int(sys.argv[2])
wb = load_workbook('output/inativos.xlsx', read_only=True, data_only=True)
ws = wb['Base bruta 60+']
rows = [[str(row[0].value or ''), str(row[1].value or '')] for row in ws.iter_rows(min_row=2, max_col=2) if row[0].value and row[1].value]
print(json.dumps(rows[start:start + size], ensure_ascii=False))
