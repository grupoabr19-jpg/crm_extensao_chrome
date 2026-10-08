import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { deriveDirectDatabaseUrl, isPlaceholderConnectionString, loadDotEnv, pgSslConfig } from "./env.mjs";

loadDotEnv();

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(__dirname, "../migrations");
const url = !isPlaceholderConnectionString(process.env.DATABASE_URL_UNPOOLED)
  ? process.env.DATABASE_URL_UNPOOLED
  : deriveDirectDatabaseUrl(process.env.DATABASE_URL);

if (!url) {
  console.error("DATABASE_URL_UNPOOLED ou DATABASE_URL nao configurada.");
  process.exit(1);
}

const client = new Client({ connectionString: url, ssl: pgSslConfig(url) });

async function applyMigration(version, fn) {
  const done = await client.query("select version from schema_migrations where version=$1", [version]);
  if (done.rowCount) {
    console.log(`Migration ${version} ja aplicada.`);
    return;
  }
  await fn();
  await client.query("insert into schema_migrations(version) values($1)", [version]);
  console.log(`Migration ${version} aplicada.`);
}

try {
  await client.connect();
  await client.query("begin");
  await client.query("create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now())");
  await applyMigration("0001_core", async () => {
    const coreAlreadyExists = await client.query("select to_regclass('public.organizations') as table_name");
    if (coreAlreadyExists.rows[0]?.table_name) return;
    await client.query(readFileSync(resolve(migrationsDir, "0001_core.sql"), "utf8"));
    const org = await client.query("insert into organizations(name) values($1) returning id", ["Grupo ABR"]);
    const orgId = org.rows[0].id;
    const seed = readFileSync(resolve(migrationsDir, "seed_reference_demo.sql"), "utf8").replaceAll(":'org_id'", `'${orgId}'`);
    await client.query(seed);
  });
  await applyMigration("0002_crm_operations", async () => {
    await client.query(readFileSync(resolve(migrationsDir, "0002_crm_operations.sql"), "utf8"));
  });
  await client.query("commit");
  console.log("Migrations concluidas.");
} catch (err) {
  await client.query("rollback").catch(() => {});
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.end();
}
