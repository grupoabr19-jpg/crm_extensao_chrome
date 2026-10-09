import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const migration = (file: string) => readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8");
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(migration("0001_core.sql"));
  await db.query("insert into organizations(name) values('AI profile test')");
  await db.exec(migration("0003_sellers_routes.sql"));
  await db.exec(migration("0007_ai_operator_profile.sql"));
}, 60_000);

describe("migration do operador unico da IA", () => {
  it("vincula Thiago ao numero principal da IA", async () => {
    const rows = (await db.query(`
      select u.email, wa.e164, wa.kind, sp.whatsapp_e164, sp.sales_function
      from users u
      join seller_profiles sp on sp.user_id=u.id
      join user_account_bindings b on b.user_id=u.id and b.revoked_at is null
      join whatsapp_accounts wa on wa.id=b.account_id
      where lower(u.email)=lower('thiago.almeida@grupoabr.com.br')
    `)).rows as Array<Record<string, string>>;

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      email: "thiago.almeida@grupoabr.com.br",
      e164: "+5535997709232",
      kind: "main",
      whatsapp_e164: "+5535997709232",
      sales_function: "adm_sdr"
    });
  });
});
