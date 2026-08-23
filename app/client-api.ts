"use client";

export const DEFAULT_CLIENT_RESPONSE_BYTES = 512 * 1024;
// Bill parsing can legitimately return thousands of review rows. Keep a
// dedicated finite budget instead of weakening the default for every API.
export const MAX_BILL_IMPORT_RESPONSE_BYTES = 15 * 1024 * 1024;
// Full encrypted/local-first snapshots are intentionally larger than ordinary
// API responses, but still need a browser-side ceiling before JSON.parse.
export const MAX_SYNC_SNAPSHOT_RESPONSE_BYTES = 50 * 1024 * 1024;
export const MAX_WEBDAV_RESPONSE_BYTES = 55 * 1024 * 1024;
export const MAX_P2P_PACKAGE_RESPONSE_BYTES = 8 * 1024 * 1024;
export const MAX_OFFLINE_SYNC_RESPONSE_BYTES = 8 * 1024 * 1024;
export const MAX_RESTORE_UPLOAD_BYTES = 50 * 1024 * 1024;
const DEFAULT_CLIENT_TIMEOUT_MS = 15_000;

export class ClientApiError extends Error {
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "ClientApiError";
    this.status = status;
  }
}

async function readTextWithLimit(
  response: Response,
  maxBytes: number,
  timeoutMs: number,
) {
  const declared = response.headers.get("content-length");
  if (declared) {
    const length = Number(declared);
    if (!Number.isFinite(length) || length < 0)
      throw new ClientApiError("响应大小声明无效", 502);
    if (length > maxBytes) throw new ClientApiError("响应数据过大", 502);
  }
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let part: ReadableStreamReadResult<Uint8Array>;
      try {
        part = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new ClientApiError("响应读取超时", 504)), timeoutMs);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
      if (part.done) break;
      total += part.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("response body too large").catch(() => undefined);
        throw new ClientApiError("响应数据过大", 502);
      }
      chunks.push(part.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ClientApiError("响应编码无效", 502);
  }
}

export function parseClientJson<T>(text: string): T | null {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ClientApiError("响应不是有效 JSON", 502);
  }
}

export async function fetchClientText(
  input: RequestInfo | URL,
  init: RequestInit = {},
  maxBytes = DEFAULT_CLIENT_RESPONSE_BYTES,
  timeoutMs = DEFAULT_CLIENT_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const externalSignal = init.signal;
  const abortFromExternal = () => controller.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) abortFromExternal();
    else externalSignal.addEventListener("abort", abortFromExternal, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (externalSignal?.aborted) throw error;
    if (controller.signal.aborted)
      throw new ClientApiError("请求超时，请稍后重试", 504);
    throw error;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", abortFromExternal);
  }
  const text = await readTextWithLimit(response, maxBytes, timeoutMs);
  return { response, text };
}

export async function fetchClientJson<T>(
  input: RequestInfo | URL,
  init: RequestInit = {},
  maxBytes = DEFAULT_CLIENT_RESPONSE_BYTES,
  timeoutMs = DEFAULT_CLIENT_TIMEOUT_MS,
) {
  const { response, text } = await fetchClientText(input, init, maxBytes, timeoutMs);
  return { response, data: parseClientJson<T>(text) };
}
