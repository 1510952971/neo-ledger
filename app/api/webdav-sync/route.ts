import { NextResponse } from "next/server";
import { ApiAccessError, accessErrorResponse, requestOwnerId } from "../../api-security";
import {
  MAX_WEBDAV_BODY_BYTES,
  fetchWithTimeout,
  readJsonWithLimit,
  readResponseTextWithLimit,
} from "../../request-limits";
import { configValue } from "../../runtime-env";
import { recordAuditEvent, requestIdFromRequest } from "../../audit-log";

function privateJson(body: unknown) {
  const headers = new Headers({
    "Cache-Control": "no-store, private, max-age=0",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  return NextResponse.json(body, { headers });
}

const isPrivateNetworkHost = (host: string): boolean => {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "");
  const mappedHex = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  const mappedHost = mappedHex
    ? `${parseInt(mappedHex[1], 16) >> 8}.${parseInt(mappedHex[1], 16) & 255}.${parseInt(mappedHex[2], 16) >> 8}.${parseInt(mappedHex[2], 16) & 255}`
    : null;
  const numeric = Number(normalized);
  const dotted = normalized.split(".").map(Number);
  const isDottedPrivate =
    dotted.length === 4 &&
    dotted.every((value) => Number.isInteger(value) && value >= 0 && value <= 255) &&
    (dotted[0] === 0 ||
      dotted[0] === 10 ||
      dotted[0] === 127 ||
      (dotted[0] === 172 && dotted[1] >= 16 && dotted[1] <= 31) ||
      (dotted[0] === 192 && dotted[1] === 168) ||
      (dotted[0] === 169 && dotted[1] === 254));
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    normalized === "0.0.0.0" ||
    normalized === "::1" ||
    (normalized.startsWith("::ffff:") && isPrivateNetworkHost(normalized.slice(7))) ||
    (mappedHost !== null && isPrivateNetworkHost(mappedHost)) ||
    /^fc[0-9a-f]{2}:/i.test(normalized) ||
    /^fe[89ab][0-9a-f]:/i.test(normalized) ||
    isDottedPrivate ||
    (Number.isSafeInteger(numeric) && numeric >= 0 && numeric <= 0xffffffff &&
      isPrivateNetworkHost(`${(numeric >>> 24) & 255}.${(numeric >>> 16) & 255}.${(numeric >>> 8) & 255}.${numeric & 255}`))
  );
};

const isLocalRequest = (request: Request) =>
  isPrivateNetworkHost(new URL(request.url).hostname.toLowerCase());
const allowedWebDavHosts = () =>
  configValue("NEO_WEBDAV_ALLOWED_HOSTS")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
const deploymentMode = () => configValue("DEPLOYMENT_MODE").toLowerCase() || "local";
const boundedText = (value: unknown, max: number, label: string, required = true) => {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u001f\u007f]/u.test(value))
    throw new ApiAccessError(`${label}格式无效或超过${max}字符`, 400);
  if (required && !value.trim()) throw new ApiAccessError(`${label}不能为空`, 400);
  return value;
};
const validateTarget = (url: URL, allowPrivate: boolean) => {
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:")
    throw new Error("WebDAV 必须使用 HTTPS，避免账号和备份在传输中泄露");
  if (!allowPrivate && isPrivateNetworkHost(host))
    throw new Error("公开服务不能访问本机或内网 WebDAV 地址");
  const allowlist = allowedWebDavHosts();
  if (!allowPrivate && deploymentMode() === "cloud" && !allowlist.includes(host))
    throw new Error("云端 WebDAV 必须使用管理员允许的目标域名");
  if (!allowPrivate && allowlist.length && !allowlist.includes(host))
    throw new Error("WebDAV 目标域名不在管理员允许列表中");
  return url;
};
const target = (
  base: string,
  allowPrivate: boolean,
  fileName = "neo-ledger.e2ee.json",
) => {
  const url = new URL(base);
  validateTarget(url, allowPrivate);
  url.pathname = `${url.pathname.replace(/\/$/, "")}/${fileName}`;
  return url;
};

const collection = (base: string, allowPrivate: boolean) => {
  const url = new URL(base);
  validateTarget(url, allowPrivate);
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url;
};

/** Fetch WebDAV without following an unvalidated redirect. Every hop is
 * checked against the same private-network and administrator allowlist rules.
 * Cloudflare Workers do not expose DNS resolution; the cloud allowlist is the
 * fail-closed control that prevents DNS rebinding to a private target. */
async function fetchSafe(
  input: URL,
  allowPrivate: boolean,
  init: RequestInit = {},
) {
  let current = input;
  for (let hop = 0; hop <= 3; hop += 1) {
    validateTarget(current, allowPrivate);
    const response = await fetchWithTimeout(current, { ...init, redirect: "manual" });
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get("location");
    if (!location) throw new Error("WebDAV 重定向缺少目标地址");
    const next = new URL(location, current);
    if (next.origin !== current.origin)
      throw new Error("WebDAV 禁止跨域重定向，避免凭据泄露");
    current = next;
  }
  throw new Error("WebDAV 重定向次数过多");
}
export async function POST(request: Request) {
  try {
    // 该接口会代替调用方向外部 WebDAV 发请求；公开部署时必须先登录，
    // 否则会成为任意人可用的中继。本地无账号模式仍与其他接口一致放行。
    const ownerId = await requestOwnerId(request);
    const body = await readJsonWithLimit<{
      action?: "upload" | "download";
      url?: string;
      username?: string;
      password?: string;
      payload?: string;
    }>(request, MAX_WEBDAV_BODY_BYTES);
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new ApiAccessError("WebDAV 请求体必须是 JSON 对象", 400);
    if (body.action !== "upload" && body.action !== "download")
      throw new ApiAccessError("WebDAV 操作无效", 400);
    const baseUrl = boundedText(body.url, 2_048, "WebDAV 地址"),
      username = boundedText(body.username ?? "", 256, "WebDAV 用户名", false),
      password = boundedText(body.password ?? "", 1_024, "WebDAV 密码", false),
      allowPrivate = isLocalRequest(request),
      url = target(baseUrl, allowPrivate),
      auth =
        "Basic " + btoa(`${username}:${password}`);
    if (body.action === "upload") {
      if (!body.payload || body.payload.length > 50_000_000)
        throw new Error("加密备份为空或过大");
      const upload = () =>
        fetchSafe(url, allowPrivate, {
          method: "PUT",
          headers: {
            Authorization: auth,
            "Content-Type": "application/octet-stream",
          },
          body: body.payload,
        });
      let response = await upload();
      if (response.status === 404 || response.status === 409) {
        const created = await fetchSafe(collection(baseUrl, allowPrivate), allowPrivate, {
          method: "MKCOL",
          headers: { Authorization: auth },
        });
        if (!created.ok && created.status !== 405)
          throw new Error(`WebDAV 文件夹创建失败：${created.status}`);
        response = await upload();
      }
      if (!response.ok) throw new Error(`WebDAV 上传失败：${response.status}`);
      await recordAuditEvent({
        ownerId,
        eventType: "sync.webdav_upload",
        subjectType: "webdav",
        requestId: requestIdFromRequest(request),
        metadata: { host: new URL(baseUrl).hostname.toLowerCase() },
      });
      return privateJson({
        ok: true,
        fileUrl: url.toString(),
        syncedAt: new Date().toISOString(),
      });
    }
    let response = await fetchSafe(url, allowPrivate, { headers: { Authorization: auth } });
    if (response.status === 404) {
      for (const legacyName of [
        "neo-ledger-v21.e2ee.json",
        "neo-ledger-v20.e2ee.json",
        "neo-ledger-v19.e2ee.json",
        "neo-ledger-v13.e2ee.json",
      ]) {
        response = await fetchSafe(target(baseUrl, allowPrivate, legacyName), allowPrivate, {
          headers: { Authorization: auth },
        });
        if (response.ok || response.status !== 404) break;
      }
    }
    if (!response.ok) throw new Error(`WebDAV 下载失败：${response.status}`);
    await recordAuditEvent({
      ownerId,
      eventType: "sync.webdav_download",
      subjectType: "webdav",
      requestId: requestIdFromRequest(request),
      metadata: { host: new URL(baseUrl).hostname.toLowerCase() },
    });
    return privateJson({
      ok: true,
      payload: await readResponseTextWithLimit(response, 50 * 1024 * 1024),
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    return accessErrorResponse(error, "WebDAV 同步失败", request);
  }
}
