import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const token = process.env.NEO_UPDATER_TOKEN || "";
const repository = process.env.NEO_GITHUB_REPOSITORY || "1510952971/neo-ledger";
const statePath = path.join(root, ".neo-update-state.json");
const backupsDir = path.join(root, "backups");
const TAG_PATTERN = /^v\d+\.\d+\.\d+$/;
let applying = false;

function json(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(value));
}

function authorized(request) {
  return Boolean(token && request.headers.authorization === `Bearer ${token}`);
}

async function command(binary, args, options = {}) {
  const result = await exec(binary, args, {
    cwd: root,
    maxBuffer: 20 * 1024 * 1024,
    ...options,
  });
  return String(result.stdout || "").trim();
}

async function readJsonBody(request) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 100_000) throw new Error("请求内容过大");
  }
  return raw ? JSON.parse(raw) : {};
}

async function findFiles(directory, suffix) {
  const found = [];
  async function walk(current) {
    let entries = [];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(fullPath);
      else if (entry.name.endsWith(suffix)) found.push(fullPath);
    }
  }
  await walk(directory);
  return found;
}

function sqliteQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function locateLedgerDatabase() {
  const files = await findFiles(path.join(root, ".wrangler", "state"), ".sqlite");
  for (const file of files) {
    try {
      const value = await command("sqlite3", [
        file,
        "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='app_meta';",
      ]);
      if (value === "1") return file;
    } catch {}
  }
  return null;
}

async function backupLedgerDatabase(version) {
  const databasePath = await locateLedgerDatabase();
  if (!databasePath) return { databasePath: null, backupPath: null };
  await mkdir(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(
    backupsDir,
    `neo-ledger-before-${version}-${stamp}.sqlite`,
  );
  await command("sqlite3", [
    databasePath,
    `.timeout 10000\n.backup ${sqliteQuote(backupPath)}\n`,
  ]);
  const integrity = await command("sqlite3", [backupPath, "PRAGMA integrity_check;"]);
  if (integrity !== "ok") throw new Error("更新前数据库备份完整性检查失败");
  const backups = (await readdir(backupsDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sqlite"))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  for (const stale of backups.slice(10))
    await unlink(path.join(backupsDir, stale));
  return { databasePath, backupPath };
}

async function latestReleaseTag() {
  const response = await fetch(
    `https://api.github.com/repos/${repository}/releases/latest`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "neo-ledger-updater",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!response.ok) throw new Error(`无法验证 GitHub Release（${response.status}）`);
  const release = await response.json();
  if (release.draft || release.prerelease || !TAG_PATTERN.test(release.tag_name))
    throw new Error("GitHub 最新版本不是可安装的正式版本");
  return release.tag_name;
}

async function writeState(value) {
  await writeFile(statePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function applyRelease(tag) {
  if (!TAG_PATTERN.test(tag)) throw new Error("版本标签无效");
  if ((await latestReleaseTag()) !== tag) throw new Error("只能安装 GitHub 最新正式版本");
  const origin = await command("git", ["remote", "get-url", "origin"]);
  if (!origin.includes(`github.com/${repository}`))
    throw new Error("Git 远端与程序配置的 GitHub 仓库不一致");
  const dirty = await command("git", ["status", "--porcelain", "--untracked-files=no"]);
  if (dirty)
    throw new Error("程序代码存在未提交修改，为避免覆盖已取消更新");

  const previousCommit = await command("git", ["rev-parse", "HEAD"]);
  const backup = await backupLedgerDatabase(tag.slice(1));
  let checkedOut = false;
  try {
    await command("git", ["fetch", "--force", "origin", "tag", tag]);
    const targetCommit = await command("git", ["rev-list", "-n", "1", tag]);
    if (!targetCommit) throw new Error("GitHub Release 标签没有对应提交");
    await command("git", ["checkout", "--detach", targetCommit]);
    checkedOut = true;
    const packageJson = JSON.parse(
      await readFile(path.join(root, "package.json"), "utf8"),
    );
    if (`v${packageJson.version}` !== tag)
      throw new Error("Release 标签与程序包版本不一致");
    await command("npm", ["ci"], { timeout: 10 * 60_000 });
    await command("npm", ["run", "build"], { timeout: 10 * 60_000 });
    await writeState({
      status: "restart-pending",
      previousCommit,
      targetCommit,
      targetVersion: tag.slice(1),
      databasePath: backup.databasePath,
      backupPath: backup.backupPath,
      updatedAt: new Date().toISOString(),
    });
    return backup;
  } catch (error) {
    if (checkedOut) {
      try {
        await command("git", ["checkout", "--detach", previousCommit]);
        await command("npm", ["ci"], { timeout: 10 * 60_000 });
        await command("npm", ["run", "build"], { timeout: 10 * 60_000 });
      } catch {}
    }
    throw error;
  }
}

const server = createServer(async (request, response) => {
  if (!authorized(request)) return json(response, 401, { error: "更新服务认证失败" });
  if (request.method === "GET" && request.url === "/status")
    return json(response, 200, { ok: true, applying });
  if (request.method !== "POST" || request.url !== "/apply")
    return json(response, 404, { error: "更新接口不存在" });
  if (applying) return json(response, 409, { error: "已有更新正在执行" });
  applying = true;
  try {
    const body = await readJsonBody(request);
    const backup = await applyRelease(String(body.tag || ""));
    json(response, 202, { ok: true, backupPath: backup.backupPath });
    const unlockTimer = setTimeout(() => {
      applying = false;
    }, 120_000);
    unlockTimer.unref();
    setTimeout(() => {
      try {
        process.kill(process.ppid, "SIGUSR2");
      } catch {}
    }, 300);
  } catch (error) {
    applying = false;
    json(response, 400, {
      error: error instanceof Error ? error.message : "更新失败",
    });
  }
});

if (!token) throw new Error("NEO_UPDATER_TOKEN 未配置");
server.listen(3210, "127.0.0.1", () => {
  console.log("Neo Ledger update service listening on 127.0.0.1:3210");
});
