import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const migration = (file: string) => readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8");
let db: PGlite;
let organizationId: string;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(migration("0001_core.sql"));
  const organization = (await db.query("insert into organizations(name) values('CRM lifecycle test') returning id")).rows[0] as { id: string };
  organizationId = organization.id;
  await db.exec(migration("seed_reference_demo.sql").replaceAll(":'org_id'", `'${organizationId}'`));
  await db.exec(migration("0002_crm_operations.sql"));
  await db.exec(migration("0005_customer_registry.sql"));
  await db.exec(migration("0006_customer_import_lifecycle.sql"));
}, 60_000);

describe("migration do cadastro e ciclo de reativação", () => {
  it("persiste resumo de compras, origem da ficha e data do último contato", async () => {
    const contact = (await db.query(
      "insert into contacts(organization_id,display_name) values($1,'Cliente teste') returning id",
      [organizationId]
    )).rows[0] as { id: string };
    await db.query(
      "insert into cases(organization_id,contact_id) values($1,$2)",
      [organizationId, contact.id]
    );
    await db.query(
      "insert into customer_source_keys(organization_id,source_system,source_key,contact_id) values($1,'clientes_inativos','ERP-1',$2)",
      [organizationId, contact.id]
    );
    await db.query(
      "insert into customer_purchase_summaries(organization_id,contact_id,item_count,order_count,total_sales,last_purchase_at) values($1,$2,3,2,50,now())",
      [organizationId, contact.id]
    );
    const result = (await db.query(`
      select c.customer_code, ca.last_contact_at, s.order_count, s.total_sales, k.source_key
      from contacts c
      join cases ca on ca.contact_id=c.id
      join customer_purchase_summaries s on s.contact_id=c.id
      join customer_source_keys k on k.contact_id=c.id
      where c.id=$1
    `, [contact.id])).rows[0] as Record<string, unknown>;

    expect(result.customer_code).toMatch(/^C[0-9]{8}$/);
    expect(result.last_contact_at).toBeNull();
    expect(result.order_count).toBe(2);
    expect(Number(result.total_sales)).toBe(50);
    expect(result.source_key).toBe("ERP-1");
  });

  it("permite somente um lembrete de reativação aberto por ficha", async () => {
    const contact = (await db.query(
      "insert into contacts(organization_id,display_name) values($1,'Cliente lembrete') returning id",
      [organizationId]
    )).rows[0] as { id: string };
    const crmCase = (await db.query(
      "insert into cases(organization_id,contact_id,last_contact_at) values($1,$2,now()) returning id",
      [organizationId, contact.id]
    )).rows[0] as { id: string };
    const addTask = () => db.query(
      "insert into tasks(organization_id,case_id,title,due_at,kind) values($1,$2,'Reativar',now()+interval '60 days','reactivation')",
      [organizationId, crmCase.id]
    );
    await addTask();
    await expect(addTask()).rejects.toThrow();
    await db.query("update tasks set status='cancelled' where case_id=$1 and kind='reactivation'", [crmCase.id]);
    await expect(addTask()).resolves.toBeDefined();
  });
});
