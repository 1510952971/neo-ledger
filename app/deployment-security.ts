export type DeploymentMode = "local" | "self_hosted" | "cloud";

export type DeploymentIssue = {
  code: string;
  message: string;
};

type RuntimeConfig = Record<string, unknown>;

function value(config: RuntimeConfig, name: string) {
  return String(config[name] ?? "").trim();
}

function enabled(config: RuntimeConfig, name: string) {
  return /^(1|true|yes)$/i.test(value(config, name));
}

export function deploymentModeFromConfig(config: RuntimeConfig): DeploymentMode | null {
  const mode = value(config, "DEPLOYMENT_MODE") || "local";
  return mode === "local" || mode === "self_hosted" || mode === "cloud"
    ? mode
    : null;
}

export function hostAllowlist(config: RuntimeConfig, name = "NEO_ALLOWED_HOSTS") {
  return value(config, name)
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

export function bindHostForConfig(config: RuntimeConfig, mode: DeploymentMode) {
  const configured = value(config, "NEO_BIND_HOST");
  if (configured) return configured;
  return mode === "local" && !enabled(config, "NEO_ENABLE_LAN")
    ? "127.0.0.1"
    : "0.0.0.0";
}

function validHostname(host: string) {
  if (host.length > 253 || host.includes("*") || host.includes(":") || host.includes("/"))
    return false;
  return host.split(".").every(
    (label) =>
      label.length > 0 &&
      label.length <= 63 &&
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label),
  );
}

function validMailFrom(input: string) {
  const match = input.match(/^(?:[^<>]+<)?([^\s<>@]+@[^\s<>@]+)>?$/);
  return Boolean(match?.[1] && match[1].split("@")[1]?.includes("."));
}

export function evaluateDeploymentSecurity(config: RuntimeConfig, requestUrl?: string) {
  const blocking: DeploymentIssue[] = [];
  const warnings: DeploymentIssue[] = [];
  const mode = deploymentModeFromConfig(config);
  if (!mode) {
    blocking.push({
      code: "invalid_deployment_mode",
      message: "DEPLOYMENT_MODE 必须是 local、self_hosted 或 cloud",
    });
    return { mode: null, secure: false, blocking, warnings };
  }

  const allowedHosts = hostAllowlist(config);
  const webdavHosts = hostAllowlist(config, "NEO_WEBDAV_ALLOWED_HOSTS");
  const invalidAllowedHost = allowedHosts.find((host) => !validHostname(host));
  const invalidWebdavHost = webdavHosts.find((host) => !validHostname(host));
  const bindHost = bindHostForConfig(config, mode);
  if (invalidAllowedHost)
    blocking.push({ code: "invalid_allowed_host", message: "NEO_ALLOWED_HOSTS 只能包含逗号分隔的主机名" });
  if (invalidWebdavHost)
    blocking.push({ code: "invalid_webdav_host", message: "NEO_WEBDAV_ALLOWED_HOSTS 只能包含逗号分隔的主机名" });
  if (
    mode === "local" &&
    !enabled(config, "NEO_ENABLE_LAN") &&
    bindHost !== "127.0.0.1" &&
    bindHost !== "::1"
  )
    blocking.push({
      code: "local_bind_requires_lan_opt_in",
      message: "local 模式监听非回环地址前必须显式设置 NEO_ENABLE_LAN=true",
    });

  const trustedHeaders = enabled(config, "NEO_TRUSTED_AUTH_HEADERS");
  if (
    trustedHeaders &&
    (value(config, "NEO_TRUSTED_AUTH_SECRET").length < 32 ||
      !value(config, "NEO_TRUSTED_PROXY_IPS"))
  )
    blocking.push({
      code: "trusted_proxy_incomplete",
      message: "可信身份代理必须配置至少 32 字节密钥和代理 IP 白名单",
    });

  if (mode === "cloud") {
    if (!enabled(config, "NEO_HSTS"))
      blocking.push({ code: "hsts_required", message: "cloud 模式必须启用 NEO_HSTS" });
    if (!allowedHosts.length)
      blocking.push({ code: "host_allowlist_required", message: "cloud 模式必须配置 NEO_ALLOWED_HOSTS" });
    if (!webdavHosts.length)
      blocking.push({ code: "backup_allowlist_required", message: "cloud 模式必须配置 WebDAV 备份主机白名单" });

    const publicOrigin = value(config, "AUTH_PUBLIC_ORIGIN");
    try {
      const origin = new URL(publicOrigin);
      if (
        origin.protocol !== "https:" ||
        origin.pathname !== "/" ||
        origin.search ||
        origin.hash ||
        !allowedHosts.includes(origin.hostname.toLowerCase())
      )
        throw new Error("invalid origin");
    } catch {
      blocking.push({
        code: "public_origin_required",
        message: "cloud 模式的 AUTH_PUBLIC_ORIGIN 必须是 Host 白名单内的 HTTPS 源站",
      });
    }

    if (!value(config, "RESEND_API_KEY") || !validMailFrom(value(config, "MAIL_FROM")))
      blocking.push({
        code: "mail_required",
        message: "cloud 模式必须配置 RESEND_API_KEY 和有效 MAIL_FROM",
      });
  } else if (mode === "self_hosted") {
    if (!enabled(config, "NEO_HSTS"))
      warnings.push({
        code: "https_recommended",
        message: "公开访问自托管实例前，请通过反向代理启用 HTTPS 并设置 NEO_HSTS=true",
      });
    if (!allowedHosts.length)
      warnings.push({
        code: "host_allowlist_recommended",
        message: "建议配置 NEO_ALLOWED_HOSTS，防止异常 Host 请求",
      });
  }

  if (requestUrl && mode === "cloud") {
    const url = new URL(requestUrl);
    if (url.protocol !== "https:")
      blocking.push({ code: "https_required", message: "cloud 模式只接受 HTTPS 请求" });
    if (allowedHosts.length && !allowedHosts.includes(url.hostname.toLowerCase()))
      blocking.push({ code: "host_not_allowed", message: "请求 Host 不在允许列表中" });
  }

  return { mode, secure: blocking.length === 0, blocking, warnings, bindHost };
}
