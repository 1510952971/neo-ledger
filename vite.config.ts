import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json" with { type: "json" };
import { sites } from "./build/sites-vite-plugin.ts";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  vars: {
    NEO_UPDATER_TOKEN: process.env.NEO_UPDATER_TOKEN ?? "",
    NEO_GITHUB_REPOSITORY:
      process.env.NEO_GITHUB_REPOSITORY ?? "1510952971/neo-ledger",
    AUTH_PUBLIC_ORIGIN: process.env.AUTH_PUBLIC_ORIGIN ?? "",
    NEO_TRUSTED_AUTH_HEADERS: process.env.NEO_TRUSTED_AUTH_HEADERS ?? "false",
    NEO_HSTS: process.env.NEO_HSTS ?? "false",
    DEPLOYMENT_MODE: process.env.DEPLOYMENT_MODE ?? "local",
    WECHAT_APP_ID: process.env.WECHAT_APP_ID ?? "",
    WECHAT_APP_SECRET: process.env.WECHAT_APP_SECRET ?? "",
    ALIPAY_APP_ID: process.env.ALIPAY_APP_ID ?? "",
    ALIPAY_PRIVATE_KEY: process.env.ALIPAY_PRIVATE_KEY ?? "",
    ALIPAY_PUBLIC_KEY: process.env.ALIPAY_PUBLIC_KEY ?? "",
  },
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      host: "0.0.0.0",
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    preview: { host: "0.0.0.0" },
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
