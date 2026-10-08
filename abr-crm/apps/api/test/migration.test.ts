import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const sql = (f: string) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), "utf8");
let db: PGlite; let org: string;
const q = async (s: string, p: unknown[] = []) => (await db.query(s, p)).rows as any[];
const fails = async (s: string, p: unknown[] = []) => { try { await db.query(s, p); return false; } catch { return true; } };

beforeAll(async () => {
  db = new PGlite();
  await db.exec(sql("0001_core.sql"));
  org = (await q("insert into organizations(name) values('ABR teste') returning id"))[0].id;
  await db.exec(sql("seed_reference_demo.sql").replaceAll(":'org_id'", `'${org}'`));
}, 60_000);

describe("migration 0001 em PostgreSQL real (PGlite)", () => {
  it("aplica e semeia referências demonstrativas", async () => {
    expect((await q("select count(*)::int c from segments"))[0].c).toBe(20);
    expect((await q("select count(*)::int c from pipeline_stages"))[0].c).toBe(7);
    expect((await q("select internal_only from pipeline_stages where name='COMUNICAÇÃO INTERNA'"))[0].internal_only).toBe(true);
    expect(await q("select name from pipeline_stages where name in ('Cotação','Venda ganha','Venda perdida') and ai_may_move")).toEqual([]);
    expect((await q("select requires_detail from loss_reasons where name='Outro'"))[0].requires_detail).toBe(true);
  });
  it("Revendedores e Revendas permanecem distintos; Atacado é canal, não região", async () => {
    expect((await q("select count(*)::int c from segments where label in ('Revendedores','Revendas')"))[0].c).toBe(2);
    expect((await q("select count(*)::int c from commercial_regions where name='Atacado'"))[0].c).toBe(0);
    expect((await q("select count(*)::int c from commercial_channels where name='Atacado'"))[0].c).toBe(1);
  });
  it("telefone compartilhado é permitido (índice não único) e E.164 é imposto", async () => {
    const c1 = (await q("insert into contacts(organization_id) values($1) returning id", [org]))[0].id;
    const c2 = (await q("insert into contacts(organization_id) values($1) returning id", [org]))[0].id;
    const ins = (c: string, p: string) => db.query("insert into contact_identifiers(organization_id,contact_id,kind,e164,original,source) values($1,$2,'phone',$3,$3,'t')", [org, c, p]);
    await ins(c1, "+5511999990001"); await ins(c2, "+5511999990001");
    expect(await fails("insert into contact_identifiers(organization_id,contact_id,kind,e164,original,source) values($1,$2,'phone','11999990001','x','t')", [org, c1])).toBe(true);
  });
  it("valor desconhecido é NULL, nunca 0 forçado; negativos recusados", async () => {
    const c = (await q("insert into contacts(organization_id) values($1) returning id", [org]))[0].id;
    const id = (await q("insert into cases(organization_id,contact_id) values($1,$2) returning id,sale_value", [org, c]))[0];
    expect(id.sale_value).toBeNull();
    expect(await fails("update cases set sale_value=-1 where id=$1", [id.id])).toBe(true);
  });
  it("protocolo é único e segue o formato; uma conta tem no máximo um vínculo ativo", async () => {
    expect(await fails("insert into handoffs(organization_id,case_id,source_account_id,destination_account_id,destination_user_id,protocol,routing_inputs,expires_at) values($1,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'ABR-ILLEGAL!',$2,now())", [org, "{}"])).toBe(true);
    const u = (await q("insert into users(organization_id,email,display_name,role) values($1,'a@x.com','A','seller') returning id", [org]))[0].id;
    const a = (await q("insert into whatsapp_accounts(organization_id,e164,label,kind) values($1,'+5511900000001','A','employee') returning id", [org]))[0].id;
    await db.query("insert into user_account_bindings(organization_id,user_id,account_id,verified_at) values($1,$2,$3,now())", [org, u, a]);
    expect(await fails("insert into user_account_bindings(organization_id,user_id,account_id) values($1,$2,$3)", [org, u, a])).toBe(true);
  });
  it("outbox: estado 'uncertain' exige execução iniciada; override manual exige motivo", async () => {
    const u = (await q("select id from users limit 1"))[0].id;
    const a = (await q("select id from whatsapp_accounts limit 1"))[0].id;
    const cs = (await q("select id from cases limit 1"))[0].id;
    const base = "insert into outbox_commands(organization_id,account_id,case_id,kind,payload,state,case_version,context_id,expected_user_id,expires_at,execution_started) values($1,$2,$3,'handoff_link','{}',$4,1,'c',$5,now(),$6)";
    expect(await fails(base, [org, a, cs, "uncertain", u, false])).toBe(true);
    expect(await fails(base, [org, a, cs, "uncertain", u, true])).toBe(false);
    expect(await fails("insert into case_assignments(case_id,user_id,inputs,reason,manual_override) values($1,$2,'{}','x',true)", [cs, u])).toBe(true);
  });
  it("handoff_events é idempotente por (handoff, chave)", async () => {
    const u = (await q("select id from users limit 1"))[0].id;
    const a = (await q("select id from whatsapp_accounts limit 1"))[0].id;
    const cs = (await q("select id from cases limit 1"))[0].id;
    const h = (await q("insert into handoffs(organization_id,case_id,source_account_id,destination_account_id,destination_user_id,protocol,routing_inputs,expires_at) values($1,$2,$3,$3,$4,'ABR-0000-0001','{}',now()+interval '1 day') returning id", [org, cs, a, u]))[0].id;
    await db.query("insert into handoff_events(handoff_id,type,idempotency_key) values($1,'created','k1')", [h]);
    expect(await fails("insert into handoff_events(handoff_id,type,idempotency_key) values($1,'created','k1')", [h])).toBe(true);
  });
});
