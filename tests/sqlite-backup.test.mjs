import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  sqliteBackupArgs,
  sqliteRestoreArgs,
} from "../scripts/sqlite-commands.mjs";

const exec = promisify(execFile);

test("SQLite backup and restore retain schema and rows", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "neo ledger's backup-"),
  );
  const databasePath = path.join(directory, "ledger.sqlite");
  const backupPath = path.join(directory, "ledger-backup.sqlite");

  try {
    await exec("sqlite3", [
      databasePath,
      "CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE ledgers(id INTEGER PRIMARY KEY,name TEXT NOT NULL); CREATE TABLE transactions(id INTEGER PRIMARY KEY,amount INTEGER NOT NULL); CREATE TABLE digital_assets(id INTEGER PRIMARY KEY,name TEXT NOT NULL,asset_type TEXT NOT NULL,currency TEXT NOT NULL,valuation_mode TEXT NOT NULL,manual_value INTEGER); INSERT INTO app_meta VALUES('schema_version','22'); INSERT INTO ledgers VALUES(1,'家庭账本'); INSERT INTO transactions VALUES(1,845433); INSERT INTO digital_assets VALUES(1,'自住房','房产','CNY','手动估值',365000000);",
    ]);
    await exec("sqlite3", sqliteBackupArgs(databasePath, backupPath));

    const backup = await exec("sqlite3", [
      backupPath,
      "PRAGMA integrity_check; SELECT value FROM app_meta WHERE key='schema_version'; SELECT count(*),sum(amount) FROM transactions; SELECT asset_type,currency,valuation_mode,manual_value FROM digital_assets;",
    ]);
    assert.equal(
      backup.stdout.trim(),
      "ok\n22\n1|845433\n房产|CNY|手动估值|365000000",
    );

    await exec("sqlite3", [
      databasePath,
      "DELETE FROM transactions; DELETE FROM digital_assets;",
    ]);
    await exec("sqlite3", sqliteRestoreArgs(databasePath, backupPath));
    const restored = await exec("sqlite3", [
      databasePath,
      "SELECT count(*),sum(amount) FROM transactions; SELECT name,asset_type,manual_value FROM digital_assets;",
    ]);
    assert.equal(restored.stdout.trim(), "1|845433\n自住房|房产|365000000");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
