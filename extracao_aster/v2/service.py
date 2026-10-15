from __future__ import annotations

import json, logging, time
from urllib import request
from pathlib import Path
from datetime import date
from decimal import Decimal
from .aster import AsterExtractor
from .config import Config
from .emailer import build_message, send
from .engine import aggregate, automatic_rows, prepare_rows, rankings, region_rankings
from .report_parser import parse_csv, normalize_sales
from .sheets import existing_daily, load, publish, targets_from

log=logging.getLogger("aster_v2")

def sync_crm(c: Config, reference_date: date, sales) -> dict:
    if not c.crm_api_url or not c.crm_sync_token:
        return {"status":"not_configured"}
    payload=json.dumps({"reference_date":reference_date.isoformat(),"items":[{
        "vendor":s.vendor,"type":s.kind,"region":s.region,"segment":s.segment,
        "weight_kg":str(s.weight_kg),"value_brl":str(s.value_brl)
    } for s in sales]},ensure_ascii=False).encode("utf-8")
    endpoint=c.crm_api_url.rstrip("/")+"/v1/integrations/aster/daily"
    last_error=None
    for attempt in range(3):
        try:
            req=request.Request(endpoint,data=payload,method="POST",headers={"Authorization":"Bearer "+c.crm_sync_token,"Content-Type":"application/json"})
            with request.urlopen(req,timeout=30) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            last_error=exc
            if attempt < 2: time.sleep(2 ** attempt)
    raise RuntimeError(f"Falha ao sincronizar CRM apos 3 tentativas: {last_error}")

def run(reference_date: date, config: Config|None=None) -> dict:
    c=config or Config.load(); c.validate_for_run()
    log.info("Iniciando Aster V2 para %s; dry_run=%s",reference_date,c.dry_run)
    path=AsterExtractor(c).extract(reference_date)
    payload=load(c.sheets_url,c.sheets_token)
    targets=targets_from(payload); configured=[t.vendor for t in targets]
    sales=normalize_sales(parse_csv(path),configured)
    rows,conflicts=prepare_rows(existing_daily(payload),sales,targets,reference_date,c.conflict_policy)
    if conflicts: log.warning("Conflitos: %s", "; ".join(conflicts))
    # The Apps Script deletes only the old Aster snapshot for this date.  Sending
    # the projected full sheet here would append manual and historical rows again.
    result=publish(c.sheets_url,c.sheets_token,reference_date,automatic_rows(sales, targets, reference_date),c.dry_run)
    daily,monthly,values=aggregate(rows,reference_date,targets); items=rankings(monthly,targets); regions=region_rankings(items)
    total_weight=sum((s.weight_kg for s in sales),start=Decimal(0)); total_value=sum((s.value_brl for s in sales),start=Decimal(0))
    daily_target=sum((t.monthly_kg/Decimal(t.working_days) for t in targets if t.working_days),start=Decimal(0))
    crm_sync={"status":"dry_run"} if c.dry_run else sync_crm(c,reference_date,sales)
    mail_sent=False
    if c.email_enabled and not c.dry_run:
        send(c,build_message(c,reference_date,sales,daily,items,regions,total_weight,total_value,daily_target,c.spreadsheet_url)); mail_sent=True
    summary={"status":"dry_run" if c.dry_run else "success","reference_date":reference_date.isoformat(),"file":str(path),"sales_count":len(sales),"rows_to_publish":len(rows)-1,"conflicts":conflicts,"publish":result,"crm_sync":crm_sync,"total_weight_kg":str(total_weight),"total_value_brl":str(total_value),"daily_target_kg":str(daily_target),"email_sent":mail_sent}
    Path(c.output_dir).mkdir(exist_ok=True); Path(c.output_dir,"last_run.json").write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding="utf-8")
    return summary
