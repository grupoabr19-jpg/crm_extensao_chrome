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
  await db.exec(sql("0002_crm_operations.sql"));
  await db.exec(sql("0003_sellers_routes.sql"));
  await db.exec(sql("0005_customer_registry.sql"));
  await db.exec(sql("0008_customer_lookup_indexes.sql"));
  await db.exec(sql("0013_sales_workflow.sql"));
  org = (await q("insert into organizations(name) values('ABR teste') returning id"))[0].id;
  await db.exec(sql("0014_operator_transfer_profiles.sql"));
  await db.exec(sql("0015_wholesale_ddd_routes.sql"));
  await db.exec(sql("0016_aster_sales_snapshots.sql"));
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
  it("gera códigos de cliente únicos no formato C00000000", async () => {
    const first = (await q("insert into contacts(organization_id,display_name) values($1,'Cliente A') returning customer_code", [org]))[0].customer_code;
    const second = (await q("insert into contacts(organization_id,display_name) values($1,'Cliente B') returning customer_code", [org]))[0].customer_code;
    expect(first).toMatch(/^C[0-9]{8}$/);
    expect(second).toMatch(/^C[0-9]{8}$/);
    expect(second).not.toBe(first);
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
  it("permite exclusão recuperável e indexa somente fichas ativas", async () => {
    const columns = await q("select column_name from information_schema.columns where table_name='cases' and column_name='deleted_at'");
    expect(columns).toHaveLength(1);
    const indexes = await q("select indexname from pg_indexes where indexname in ('cases_active_pipeline_stage','cases_won_sales') order by indexname");
    expect(indexes.map((row) => row.indexname)).toEqual(["cases_active_pipeline_stage", "cases_won_sales"]);
  });
  it("cadastra os operadores com WhatsApp e polo para transferencia", async () => {
    const profiles = await q("select count(*)::int total from seller_profiles where organization_id=$1 and active=true and whatsapp_e164 is not null", [org]);
    expect(profiles[0].total).toBe(28);
    const leaders = await q("select u.display_name,sr.route_value from seller_profiles sp join users u on u.id=sp.user_id join seller_routes sr on sr.profile_id=sp.id where sp.organization_id=$1 and sp.sales_function='vendedor_externo' and sr.channel='varejo' and sr.route_type='region' order by sr.route_value", [org]);
    expect(leaders).toHaveLength(8);
    expect(leaders).toContainEqual(expect.objectContaining({ display_name: "Alessandro Takahashi", route_value: "BRAGANCA" }));
    expect(leaders).toContainEqual(expect.objectContaining({ display_name: "Gustavo Alvarenga", route_value: "EXTREMA" }));
  });
  it("distribui o atacado entre os nove DDDs e seus polos", async () => {
    const routes = await q("select u.display_name,sr.route_value,sr.region from seller_profiles sp join users u on u.id=sp.user_id join seller_routes sr on sr.profile_id=sp.id where sp.organization_id=$1 and sr.channel='atacado' and sr.route_type='ddd' and sr.active=true order by sr.route_value", [org]);
    expect(routes).toHaveLength(9);
    expect(routes).toContainEqual(expect.objectContaining({ display_name: "Wilson Neto", route_value: "14", region: "BAURU" }));
    expect(routes).toContainEqual(expect.objectContaining({ display_name: "Wilson Neto", route_value: "18", region: "PRESIDENTE PRUDENTE" }));
    expect(routes).toContainEqual(expect.objectContaining({ display_name: "Larissa Terra", route_value: "11", region: "SAO PAULO" }));
    expect(routes).toContainEqual(expect.objectContaining({ display_name: "Julio Melo", route_value: "19", region: "CAMPINAS" }));
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
  it("mantém uma fotografia idempotente de vendas do Aster por vendedor e dia", async () => {
    await db.query("insert into aster_sales_snapshots(organization_id,reference_date,vendor_name,vendor_key,weight_kg,value_brl) values($1,'2026-10-14','VARE - JOSIANE LIMA','JOSIANE LIMA',1250,9800)", [org]);
    expect(await fails("insert into aster_sales_snapshots(organization_id,reference_date,vendor_name,vendor_key,weight_kg,value_brl) values($1,'2026-10-14','JOSIANE LIMA','JOSIANE LIMA',1,1)", [org])).toBe(true);
    const snapshot = (await q("select weight_kg::float8,value_brl::float8 from aster_sales_snapshots where organization_id=$1", [org]))[0];
    expect(snapshot).toEqual({ weight_kg: 1250, value_brl: 9800 });
  });
});
