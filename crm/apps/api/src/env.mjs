import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function loadDotEnv(file = ".env") {
  const path = findUp(process.cwd(), file);
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function findUp(start, file) {
  let dir = resolve(start);
  while (true) {
    const candidate = join(dir, file);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return candidate;
    dir = parent;
  }
}

export function pgSslConfig(connectionString) {
  if (!connectionString) return undefined;
  if (/sslmode=(require|verify-ca|verify-full)/i.test(connectionString) || /neon\.tech/i.test(connectionString)) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

export function isPlaceholderConnectionString(connectionString) {
  return !connectionString || /\b(USER|PASSWORD|HOST|REGION|DB)\b|__preencher__/i.test(connectionString);
}

export function deriveDirectDatabaseUrl(connectionString) {
  if (isPlaceholderConnectionString(connectionString)) return "";
  try {
    const url = new URL(connectionString);
    url.hostname = url.hostname.replace("-pooler.", ".");
    return url.toString();
  } catch {
    return connectionString;
  }
}
