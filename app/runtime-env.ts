import { env } from "cloudflare:workers";

// 统一的运行时配置读取口：优先取 Workers 绑定的变量，本地开发回退到 process.env。
// 集中在一处，免得每个模块各写一遍 cloudflare:workers 的类型断言。
const runtimeEnv = env as unknown as Record<string, unknown>;

export function configValue(name: string) {
  return String(
    runtimeEnv[name] ??
      (globalThis as unknown as { process?: { env?: Record<string, string> } })
        .process?.env?.[name] ??
      "",
  ).trim();
}
