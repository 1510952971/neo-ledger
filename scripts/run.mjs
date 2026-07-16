import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { sqliteRestoreArgs } from "./sqlite-commands.mjs";

const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const mode = process.argv[2] === "start" ? "start" : "dev";
const statePath = path.join(root, ".neo-update-state.json");
const token = process.env.NEO_UPDATER_TOKEN || randomBytes(32).toString("hex");
const childEnv = {
  ...process.env,
  NEO_UPDATER_TOKEN: token,
  NEO_GITHUB_REPOSITORY:
    process.env.NEO_GITHUB_REPOSITORY || "1510952971/neo-ledger",
};
let appProcess = null;
let updaterProcess = null;
let restarting = false;
let shuttingDown = false;

function localBinary(name) {
  return path.join(
    root,
    "node_modules",
    ".bin",
    process.platform === "win32" ? `${name}.cmd` : name,
  );
}

function startApp() {
  appProcess = spawn(localBinary("vinext"), [
    mode,
    "--hostname",
    "127.0.0.1",
  ], {
    cwd: root,
    env: childEnv,
    stdio: "inherit",
  });
  appProcess.on("exit", (code) => {
    if (!restarting && !shuttingDown && code)
      console.error(`Neo Ledger exited with code ${code}`);
  });
}

function startUpdater() {
  updaterProcess = spawn(process.execPath, [path.join(root, "scripts", "update-server.mjs")], {
    cwd: root,
    env: childEnv,
    stdio: "inherit",
  });
  updaterProcess.on("exit", (code) => {
    if (!shuttingDown && code)
      console.error(`Neo Ledger update service exited with code ${code}`);
  });
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 5000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

async function readState() {
  try {
    return JSON.parse(await readFile(statePath, "utf8"));
  } catch {
    return null;
  }
}

async function waitForVersion(version) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try {
      const health = await fetch("http://127.0.0.1:3000/api/app-update/health", {
        cache: "no-store",
      });
      if (health.ok && (await health.json()).version === version) {
        const database = await fetch("http://127.0.0.1:3000/api/ledgers", {
          cache: "no-store",
        });
        if (database.ok) return true;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

async function command(binary, args, options = {}) {
  const result = await exec(binary, args, {
    cwd: root,
    maxBuffer: 20 * 1024 * 1024,
    ...options,
  });
  return String(result.stdout || "").trim();
}

async function rollback(state, reason) {
  await stopChild(appProcess);
  await command("git", ["checkout", "--detach", state.previousCommit]);
  await command("npm", ["ci"], { timeout: 10 * 60_000 });
  await command("npm", ["run", "build"], { timeout: 10 * 60_000 });
  if (state.databasePath && state.backupPath) {
    await command(
      "sqlite3",
      sqliteRestoreArgs(state.databasePath, state.backupPath),
    );
    const validation = await command("sqlite3", [
      state.databasePath,
      "PRAGMA integrity_check; SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('app_meta','ledgers','transactions');",
    ]);
    if (validation !== "ok\n3")
      throw new Error("回滚后的数据库结构或完整性检查失败");
  }
  await writeFile(
    statePath,
    `${JSON.stringify({ ...state, status: "rolled-back", error: reason, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );
  startApp();
}

async function restartAfterUpdate() {
  if (restarting) return;
  restarting = true;
  const state = await readState();
  if (!state || state.status !== "restart-pending") {
    restarting = false;
    return;
  }
  try {
    await stopChild(appProcess);
    startApp();
    if (!(await waitForVersion(state.targetVersion)))
      throw new Error("新版本未能通过启动与数据库迁移检查");
    await writeFile(
      statePath,
      `${JSON.stringify({ ...state, status: "complete", updatedAt: new Date().toISOString() }, null, 2)}\n`,
      "utf8",
    );
    console.log(`Neo Ledger 已更新到 v${state.targetVersion}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "升级后健康检查失败";
    console.error(`${message}，正在自动回滚`);
    await rollback(state, message);
  } finally {
    restarting = false;
  }
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  await Promise.all([stopChild(appProcess), stopChild(updaterProcess)]);
  process.exit(0);
}

process.on("SIGUSR2", () => void restartAfterUpdate());
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

startUpdater();
startApp();
