import { NextResponse } from "next/server";
import { accessErrorResponse, requestOwnerId } from "../../api-security";
const isPrivateNetworkHost = (host: string) =>
  host === "localhost" ||
  host === "127.0.0.1" ||
  host === "[::1]" ||
  /^10\./.test(host) ||
  /^192\.168\./.test(host) ||
  /^172\.(1[6-9]|2\d|3[01])\./.test(host);

const isLocalRequest = (request: Request) =>
  isPrivateNetworkHost(new URL(request.url).hostname.toLowerCase());
const target = (
  base: string,
  allowPrivate: boolean,
  fileName = "neo-ledger.e2ee.json",
) => {
  const url = new URL(base);
  if (url.protocol !== "https:")
    throw new Error("WebDAV 必须使用 HTTPS，避免账号和备份在传输中泄露");
  const host = url.hostname.toLowerCase();
  if (
    !allowPrivate &&
    (isPrivateNetworkHost(host) ||
      host.endsWith(".local") ||
      host === "0.0.0.0" ||
      host === "::1" ||
      /^127\./.test(host) ||
      /^169\.254\./.test(host))
  )
    throw new Error("公开服务不能访问本机或内网 WebDAV 地址");
  url.pathname = `${url.pathname.replace(/\/$/, "")}/${fileName}`;
  return url;
};

const collection = (base: string) => {
  const url = new URL(base);
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url;
};
export async function POST(request: Request) {
  try {
    // 该接口会代替调用方向外部 WebDAV 发请求；公开部署时必须先登录，
    // 否则会成为任意人可用的中继。本地无账号模式仍与其他接口一致放行。
    await requestOwnerId(request);
    const body = (await request.json()) as {
      action?: "upload" | "download";
      url?: string;
      username?: string;
      password?: string;
      payload?: string;
    };
    const baseUrl = String(body.url || ""),
      allowPrivate = isLocalRequest(request),
      url = target(baseUrl, allowPrivate),
      auth =
        "Basic " +
        btoa(`${String(body.username || "")}:${String(body.password || "")}`);
    if (body.action === "upload") {
      if (!body.payload || body.payload.length > 50_000_000)
        throw new Error("加密备份为空或过大");
      const upload = () =>
        fetch(url, {
          method: "PUT",
          headers: {
            Authorization: auth,
            "Content-Type": "application/octet-stream",
          },
          body: body.payload,
        });
      let response = await upload();
      if (response.status === 404 || response.status === 409) {
        const created = await fetch(collection(baseUrl), {
          method: "MKCOL",
          headers: { Authorization: auth },
        });
        if (!created.ok && created.status !== 405)
          throw new Error(`WebDAV 文件夹创建失败：${created.status}`);
        response = await upload();
      }
      if (!response.ok) throw new Error(`WebDAV 上传失败：${response.status}`);
      return NextResponse.json({
        ok: true,
        fileUrl: url.toString(),
        syncedAt: new Date().toISOString(),
      });
    }
    let response = await fetch(url, { headers: { Authorization: auth } });
    if (response.status === 404) {
      for (const legacyName of [
        "neo-ledger-v21.e2ee.json",
        "neo-ledger-v20.e2ee.json",
        "neo-ledger-v19.e2ee.json",
        "neo-ledger-v13.e2ee.json",
      ]) {
        response = await fetch(target(baseUrl, allowPrivate, legacyName), {
          headers: { Authorization: auth },
        });
        if (response.ok || response.status !== 404) break;
      }
    }
    if (!response.ok) throw new Error(`WebDAV 下载失败：${response.status}`);
    return NextResponse.json({
      ok: true,
      payload: await response.text(),
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    return accessErrorResponse(error, "WebDAV 同步失败");
  }
}
