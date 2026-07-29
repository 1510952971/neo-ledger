import { spawn } from "node:child_process";
import net from "node:net";
import { execPath } from "node:process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const mode = process.argv.includes("--mode")
  ? process.argv[process.argv.indexOf("--mode") + 1] || "dev"
  : "dev";
const shouldOpen = process.argv.includes("--open");
const requestedPort = Number(process.env.PORT || "3000");
const portStart = Number.isInteger(requestedPort) && requestedPort > 0
  ? requestedPort
  : 3000;

function healthUrl(port) {
  return `http://127.0.0.1:${port}/api/app-update/health`;
}

async function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const finish = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(500, () => finish(false));
  });
}

async function isNeoLedger(port) {
  try {
    const response = await fetch(healthUrl(port), { cache: "no-store" });
    if (!response.ok) return false;
    const result = await response.json();
    return typeof result?.version === "string";
  } catch {
    return false;
  }
}

async function selectPort() {
  for (let port = portStart; port < portStart + 100; port += 1) {
    if (!(await portInUse(port))) return { port, running: false };
    if (await isNeoLedger(port)) return { port, running: true };
    console.log(`端口 ${port} 正被占用，正在尝试 ${port + 1}...`);
  }
  throw new Error(`从 ${portStart} 开始没有找到可用端口`);
}

function openBrowser(url) {
  const command = process.platform === "darwin"
    ? "open"
    : process.platform === "win32"
      ? "cmd"
      : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const browser = spawn(command, args, { detached: true, stdio: "ignore" });
  browser.unref();
}

async function waitUntilReady(port) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (await isNeoLedger(port)) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Neo Ledger 启动超时，请检查终端中的错误信息");
}

async function main() {
  const selected = await selectPort();
  const url = `http://localhost:${selected.port}`;
  if (selected.running) {
    console.log(`检测到 Neo Ledger 已在运行：${url}`);
    if (shouldOpen) openBrowser(url);
    return;
  }

  const child = spawn(execPath, [path.join(root, "scripts", "run.mjs"), mode], {
    cwd: root,
    env: { ...process.env, PORT: String(selected.port) },
    stdio: "inherit",
  });
  let stopping = false;
  const stop = (signal) => {
    if (stopping) return;
    stopping = true;
    child.kill(signal);
  };
  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));

  try {
    await waitUntilReady(selected.port);
  } catch (error) {
    child.kill("SIGTERM");
    throw error;
  }
  console.log(`Neo Ledger 已就绪：${url}`);
  if (shouldOpen) openBrowser(url);

  const code = await new Promise((resolve) =>
    child.once("exit", (exitCode, signal) => resolve(exitCode ?? (signal ? 1 : 0))),
  );
  process.exitCode = code;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
