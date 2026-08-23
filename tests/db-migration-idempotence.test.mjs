import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const register = path.join(root, "tests/api/register.mjs");
const dbModule = pathToFileURL(path.join(root, "db/index.ts")).href;

function runMigrationProcess(databasePath, source) {
  return execFileSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--no-warnings",
      "--import",
      register,
      "--input-type=module",
      "-e",
      source,
    ],
    {
      cwd: root,
      env: { ...process.env, NL_DB: databasePath },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

test("schema 18-31 migrations are safe to resume after partial DDL", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "neo-ledger-migration-"));
  const databasePath = path.join(directory, "migration.sqlite");
  try {
    runMigrationProcess(databasePath, `
      const db = await import(${JSON.stringify(dbModule)});
      await db.ensureDb();
    `);
    runMigrationProcess(databasePath, `
      const db = await import(${JSON.stringify(dbModule)});
      const binding = db.getDbBinding();
      await binding.prepare("UPDATE app_meta SET value='28' WHERE key='schema_version'").run();
      await db.ensureDb();
      const version = await binding.prepare("SELECT value FROM app_meta WHERE key='schema_version'").first();
      const tables = await binding.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('user_passkeys','webauthn_challenges')").all();
      if (version?.value !== '32' || tables.results.length !== 2) process.exit(1);
    `);
    runMigrationProcess(databasePath, `
      const db = await import(${JSON.stringify(dbModule)});
      const binding = db.getDbBinding();
      await binding.prepare("UPDATE app_meta SET value='30' WHERE key='schema_version'").run();
      await db.ensureDb();
      const version = await binding.prepare("SELECT value FROM app_meta WHERE key='schema_version'").first();
      if (version?.value !== '32') process.exit(1);
    `);
    runMigrationProcess(databasePath, `
      const db = await import(${JSON.stringify(dbModule)});
      const binding = db.getDbBinding();
      await binding.prepare("UPDATE app_meta SET value='22' WHERE key='schema_version'").run();
      await db.ensureDb();
      const version = await binding.prepare("SELECT value FROM app_meta WHERE key='schema_version'").first();
      if (version?.value !== '32') process.exit(1);
    `);
    runMigrationProcess(databasePath, `
      const db = await import(${JSON.stringify(dbModule)});
      const binding = db.getDbBinding();
      await binding.prepare("UPDATE app_meta SET value='18' WHERE key='schema_version'").run();
      await db.ensureDb();
      const version = await binding.prepare("SELECT value FROM app_meta WHERE key='schema_version'").first();
      if (version?.value !== '32') process.exit(1);
    `);
    runMigrationProcess(databasePath, `
      const db = await import(${JSON.stringify(dbModule)});
      const binding = db.getDbBinding();
      await binding.prepare("CREATE TABLE IF NOT EXISTS subscriptions_v17(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,amount INTEGER NOT NULL,account_id INTEGER NOT NULL,cycle TEXT NOT NULL,category TEXT NOT NULL,next_charge_date TEXT NOT NULL,created_at TEXT NOT NULL,ledger_id INTEGER NOT NULL DEFAULT 1,category_dynamic TEXT)").run();
      await binding.prepare("INSERT OR IGNORE INTO subscriptions_v17(id,name,amount,account_id,cycle,category,next_charge_date,created_at,ledger_id,category_dynamic) VALUES(999,'迁移测试',100,1,'每月','娱乐','2026-01-01','2026-01-01T00:00:00Z',1,'娱乐')").run();
      await binding.prepare("UPDATE app_meta SET value='17' WHERE key='schema_version'").run();
      await db.ensureDb();
      const version = await binding.prepare("SELECT value FROM app_meta WHERE key='schema_version'").first();
      const oldTable = await binding.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='subscriptions_v17'").first();
      const copied = await binding.prepare("SELECT id FROM subscriptions WHERE id=999").first();
      if (version?.value !== '32' || oldTable || !copied) process.exit(1);
    `);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  assert.ok(true, "resumable migration completed");
});
