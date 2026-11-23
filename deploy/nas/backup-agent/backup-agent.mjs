import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

const MAGIC = Buffer.from("NLBAK001", "ascii");
const MAX_BYTES = 50 * 1024 * 1024;
const MAX_LOCAL_SNAPSHOTS = 3;
const SUPPORTED_SCHEMA_VERSION = 42;
const backupRoot = "/backup";
const sourceRoot = "/source";

const env = (name) => String(process.env[name] ?? "").trim();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function requireConfig() {
  const url = env("NEO_OCI_BACKUP_URL");
  const token = env("NEO_OCI_BACKUP_TOKEN");
  const passphrase = env("NEO_BACKUP_PASSPHRASE");
  if (!url || !token || !passphrase) throw new Error("OCI 备份未配置；检查独立备份密钥文件");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("OCI 备份地址必须使用 HTTPS");
  if (token.length < 40 || !/^[A-Za-z0-9_-]+$/.test(token))
    throw new Error("OCI 备份 Token 格式无效");
  if (passphrase.length < 20) throw new Error("独立恢复口令至少需要 20 个字符");
  return { url: parsed.toString(), token, passphrase };
}

function listDatabases(root) {
  const result = execFileSync(
    "find",
    [root, "-type", "f", "-name", "*.sqlite", "-print"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  return result.split("\n").filter(Boolean).sort();
}

function sqliteQuery(database, query) {
  return execFileSync("sqlite3", ["-readonly", database, query], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function isLedgerDatabase(database) {
  try {
    return sqliteQuery(
      database,
      "SELECT CASE WHEN EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='app_users') AND EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='ledgers') THEN 1 ELSE 0 END;",
    ) === "1";
  } catch {
    return false;
  }
}

function encryptArchive(archive, passphrase) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(passphrase, salt, 32, { N: 1 << 17, r: 8, p: 1, maxmem: 512 * 1024 * 1024 });
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(archive), cipher.final()]);
  const tag = cipher.getAuthTag();
  key.fill(0);
  return Buffer.concat([MAGIC, salt, iv, tag, encrypted]);
}

function decryptArchive(envelope, passphrase) {
  const minimum = MAGIC.length + 16 + 12 + 16;
  if (envelope.length < minimum || !envelope.subarray(0, MAGIC.length).equals(MAGIC))
    throw new Error("OCI 文件不是 Neo Ledger 加密快照格式");
  const saltStart = MAGIC.length;
  const ivStart = saltStart + 16;
  const tagStart = ivStart + 12;
  const encryptedStart = tagStart + 16;
  const salt = envelope.subarray(saltStart, ivStart);
  const iv = envelope.subarray(ivStart, tagStart);
  const tag = envelope.subarray(tagStart, encryptedStart);
  const key = scryptSync(passphrase, salt, 32, { N: 1 << 17, r: 8, p: 1, maxmem: 512 * 1024 * 1024 });
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(envelope.subarray(encryptedStart)), decipher.final()]);
  } finally {
    key.fill(0);
  }
}

function createSnapshot() {
  const candidates = listDatabases(sourceRoot).filter(isLedgerDatabase);
  if (candidates.length !== 1)
    throw new Error(`NAS 数据目录中应恰好有一个包含 Neo Ledger 账号和账本表的 SQLite 数据库，当前找到 ${candidates.length} 个；拒绝猜测目标`);
  const source = candidates[0];
  const relativeDatabasePath = path.relative(sourceRoot, source);
  if (relativeDatabasePath.startsWith("..") || path.isAbsolute(relativeDatabasePath))
    throw new Error("数据库路径超出 NAS 持久数据目录");

  const work = mkdtempSync(path.join(os.tmpdir(), "neo-ledger-backup-"));
  try {
    const snapshotPath = path.join(work, "database.sqlite");
    execFileSync("sqlite3", ["-readonly", source, `.backup '${snapshotPath}'`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (statSync(snapshotPath).size > MAX_BYTES)
      throw new Error("SQLite 数据库超过 50 MiB 快照上限；保留 NAS 数据且不覆盖 OCI 快照");
    const integrity = sqliteQuery(snapshotPath, "PRAGMA integrity_check;");
    if (integrity !== "ok") throw new Error("NAS 数据库完整性检查失败；未上传备份");
    const userCount = Number(sqliteQuery(snapshotPath, "SELECT COUNT(*) FROM app_users;"));
    const ledgerCount = Number(sqliteQuery(snapshotPath, "SELECT COUNT(*) FROM ledgers;"));
    const schemaVersion = sqliteQuery(snapshotPath, "SELECT value FROM app_meta WHERE key='schema_version';");
    if (!/^\d+$/.test(schemaVersion) || Number(schemaVersion) > SUPPORTED_SCHEMA_VERSION)
      throw new Error(`未知或高于当前程序的数据库 schema 版本 ${schemaVersion || "(空)"}；拒绝上传快照`);
    if (!Number.isSafeInteger(userCount) || userCount < 1 || !Number.isSafeInteger(ledgerCount) || ledgerCount < 1)
      throw new Error("快照中没有可确认的账号或账本；拒绝上传");

    const manifest = {
      format: "neo-ledger-nas-snapshot-v1",
      createdAt: new Date().toISOString(),
      databasePath: relativeDatabasePath,
      databaseSha256: sha256(readFileSync(snapshotPath)),
      schemaVersion,
      userCount,
      ledgerCount,
    };
    writeFileSync(path.join(work, "manifest.json"), JSON.stringify(manifest), { mode: 0o600 });
    execFileSync("tar", ["-czf", path.join(work, "snapshot.tar.gz"), "-C", work, "database.sqlite", "manifest.json"]);
    const archive = readFileSync(path.join(work, "snapshot.tar.gz"));
    if (archive.length + 52 > MAX_BYTES)
      throw new Error("加密快照超过 50 MiB 接收上限；保留 NAS 数据且不覆盖 OCI 快照");
    return { work, archive, manifest };
  } catch (error) {
    rmSync(work, { recursive: true, force: true });
    throw error;
  }
}

async function uploadOnce() {
  const { url, token, passphrase } = requireConfig();
  mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
  chmodSync(backupRoot, 0o700);
  const snapshot = createSnapshot();
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const localFile = path.join(backupRoot, `nas-${timestamp}.bin`);
  try {
    const encrypted = encryptArchive(snapshot.archive, passphrase);
    if (encrypted.length > MAX_BYTES) throw new Error("加密快照超过 OCI 接收上限");
    writeFileSync(localFile, encrypted, { mode: 0o600, flag: "wx" });
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
        "X-Backup-SHA256": sha256(encrypted),
      },
      body: encrypted,
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`OCI 备份上传失败（HTTP ${response.status}）`);
    const receipt = await response.json();
    if (!receipt?.ok || receipt.checksum !== sha256(encrypted))
      throw new Error("OCI 返回的备份摘要与上传文件不一致");

    const files = readdirSync(backupRoot)
      .filter((name) => /^nas-.*\.bin$/.test(name))
      .map((name) => ({ name, time: statSync(path.join(backupRoot, name)).mtimeMs }))
      .sort((left, right) => right.time - left.time);
    for (const old of files.slice(MAX_LOCAL_SNAPSHOTS))
      rmSync(path.join(backupRoot, old.name), { force: true });
    console.log(`OCI NAS backup succeeded: ${receipt.createdAt}; bytes=${encrypted.length}; sha256=${receipt.checksum}`);
  } finally {
    rmSync(snapshot.work, { recursive: true, force: true });
  }
}

async function prepareRestore() {
  const { url, token, passphrase } = requireConfig();
  mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
  chmodSync(backupRoot, 0o700);
  const snapshotId = env("NEO_BACKUP_SNAPSHOT_ID");
  if (snapshotId && !/^[0-9a-f-]{36}$/i.test(snapshotId))
    throw new Error("NEO_BACKUP_SNAPSHOT_ID 格式无效");
  const restoreUrl = new URL(url);
  if (snapshotId) restoreUrl.searchParams.set("id", snapshotId);
  const response = await fetch(restoreUrl, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`OCI 恢复快照下载失败（HTTP ${response.status}）`);
  const envelope = Buffer.from(await response.arrayBuffer());
  const expected = response.headers.get("x-backup-sha256");
  if (!expected || sha256(envelope) !== expected) throw new Error("OCI 下载文件摘要不匹配");

  const work = mkdtempSync(path.join(os.tmpdir(), "neo-ledger-restore-"));
  try {
    const archive = decryptArchive(envelope, passphrase);
    const archivePath = path.join(work, "snapshot.tar.gz");
    writeFileSync(archivePath, archive, { mode: 0o600 });
    const listing = execFileSync("tar", ["-tzf", archivePath], { encoding: "utf8" }).split("\n").filter(Boolean);
    if (listing.length !== 2 || !listing.includes("database.sqlite") || !listing.includes("manifest.json"))
      throw new Error("恢复包内容不符合预期；未更改 NAS 数据");
    execFileSync("tar", ["-xzf", archivePath, "-C", work]);
    const manifest = JSON.parse(readFileSync(path.join(work, "manifest.json"), "utf8"));
    if (manifest?.format !== "neo-ledger-nas-snapshot-v1" || typeof manifest.databasePath !== "string")
      throw new Error("恢复清单格式无效；未更改 NAS 数据");
    if (!/^\d+$/.test(String(manifest.schemaVersion)) || Number(manifest.schemaVersion) > SUPPORTED_SCHEMA_VERSION)
      throw new Error(`OCI 快照 schema 版本 ${manifest.schemaVersion ?? "(空)"} 高于当前恢复程序支持的版本；未更改 NAS 数据`);
    const relative = path.normalize(manifest.databasePath);
    if (path.isAbsolute(relative) || relative.startsWith("..")) throw new Error("恢复清单数据库路径越界");
    const candidate = path.join(work, "database.sqlite");
    if (sha256(readFileSync(candidate)) !== manifest.databaseSha256)
      throw new Error("解密后的数据库摘要不匹配；未更改 NAS 数据");
    if (sqliteQuery(candidate, "PRAGMA integrity_check;") !== "ok")
      throw new Error("OCI 快照 SQLite 完整性检查失败；未更改 NAS 数据");
    const users = Number(sqliteQuery(candidate, "SELECT COUNT(*) FROM app_users;"));
    const ledgers = Number(sqliteQuery(candidate, "SELECT COUNT(*) FROM ledgers;"));
    if (users !== Number(manifest.userCount) || ledgers !== Number(manifest.ledgerCount) || users < 1 || ledgers < 1)
      throw new Error("OCI 快照账号/账本数量与清单不一致；未更改 NAS 数据");
    const destination = path.join(backupRoot, `restore-candidate-${new Date().toISOString().replaceAll(":", "-")}`);
    mkdirSync(destination, { recursive: true, mode: 0o700 });
    copyFileSync(candidate, path.join(destination, "database.sqlite"));
    writeFileSync(path.join(destination, "manifest.json"), JSON.stringify(manifest), { mode: 0o600 });
    chmodSync(path.join(destination, "database.sqlite"), 0o600);
    console.log(`OCI restore candidate is ready; snapshot=${response.headers.get("x-backup-id")}; createdAt=${response.headers.get("x-backup-created-at")}; databasePath=${relative}; users=${users}; ledgers=${ledgers}; schema=${manifest.schemaVersion}. NAS data has NOT been changed.`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

async function runScheduler() {
  const interval = Number(env("NEO_BACKUP_INTERVAL_SECONDS") || 86400);
  if (!Number.isSafeInteger(interval) || interval < 3600 || interval > 604800)
    throw new Error("备份间隔须介于 1 小时和 7 天之间");
  for (;;) {
    try {
      await uploadOnce();
    } catch (error) {
      console.error(`OCI NAS backup failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
    await new Promise((resolve) => setTimeout(resolve, interval * 1000));
  }
}

const mode = process.argv[2] ?? "run";
if (mode === "run") await runScheduler();
else if (mode === "prepare-restore") await prepareRestore();
else throw new Error("Unknown backup-agent command");
