import { NextResponse } from "next/server";
const isLocalRequest = (request: Request) => {
  const host = new URL(request.url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
};
const target = (
  base: string,
  allowPrivate: boolean,
  fileName = "neo-ledger.e2ee.json",
) => {
  const url = new URL(base);
  if (url.protocol !== "https:")
    throw new Error("WebDAV 必须使用 HTTPS，避免账号和备份在传输中泄露");
  const host = url.hostname.toLowerCase();
  if (!allowPrivate && (
    host === "localhost" ||
    host.endsWith(".local") ||
    host === "0.0.0.0" ||
    host === "::1" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ))
    throw new Error("公开服务不能访问本机或内网 WebDAV 地址");
  url.pathname = `${url.pathname.replace(/\/$/, "")}/${fileName}`;
  return url;
};
export async function POST(request: Request) {
  try {
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
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: auth,
          "Content-Type": "application/octet-stream",
        },
        body: body.payload,
      });
      if (!response.ok) throw new Error(`WebDAV 上传失败：${response.status}`);
      return NextResponse.json({
        ok: true,
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "WebDAV 同步失败" },
      { status: 400 },
    );
  }
}
