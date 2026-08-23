import { spawn } from "node:child_process";
import path from "node:path";
import { bindHostForConfig, evaluateDeploymentSecurity } from "../app/deployment-security.ts";

const root = path.resolve(import.meta.dirname, "..");
const deployment = evaluateDeploymentSecurity(process.env);
if (!deployment.secure) {
  console.error("Neo Ledger 配置检查失败：");
  for (const issue of deployment.blocking) console.error(`- [${issue.code}] ${issue.message}`);
  process.exit(1);
}
for (const warning of deployment.warnings)
  console.warn(`[${warning.code}] ${warning.message}`);
const mode = deployment.mode ?? "local";
const bindHost = bindHostForConfig(process.env, mode);
const wrangler = path.join(root, "node_modules", ".bin", "wrangler");
const args = [
  "dev",
  "--config",
  path.join(root, "dist", "server", "wrangler.json"),
  "--local",
  "--ip",
  bindHost,
  "--port",
  String(process.env.PORT || "3000"),
  "--persist-to",
  path.join(root, ".wrangler", "state"),
  "--show-interactive-dev-session=false",
];

const variableNames = [
  "SYNC_TOKEN",
  "SYNC_OWNER_ID",
  "RESEND_API_KEY",
  "MAIL_FROM",
  "OLLAMA_URL",
  "OLLAMA_MODEL",
  "AUTH_PUBLIC_ORIGIN",
  "WECHAT_APP_ID",
  "WECHAT_APP_SECRET",
  "ALIPAY_APP_ID",
  "ALIPAY_PRIVATE_KEY",
  "ALIPAY_PUBLIC_KEY",
  "P2P_STUN_URLS",
  "LAN_ORIGIN",
  "NEO_TRUSTED_AUTH_HEADERS",
  "NEO_HSTS",
  "DEPLOYMENT_MODE",
  "NEO_ALLOWED_HOSTS",
  "NEO_WEBDAV_ALLOWED_HOSTS",
  "NEO_TRUSTED_AUTH_SECRET",
  "NEO_TRUSTED_PROXY_IPS",
  "NEO_TRUSTED_AUTH_AUDIENCE",
];
for (const name of variableNames) {
  const value = String(process.env[name] || "").trim();
  if (value) args.push("--var", `${name}:${value}`);
}

const child = spawn(wrangler, args, { cwd: root, env: process.env, stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
