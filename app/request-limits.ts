import { ApiAccessError } from "./api-security";

/** API JSON body limits are enforced before JSON.parse. */
export const MAX_RESTORE_BODY_BYTES = 50 * 1024 * 1024;
export const MAX_BILL_IMPORT_BODY_BYTES = 15 * 1024 * 1024;
export const MAX_WEBDAV_BODY_BYTES = 55 * 1024 * 1024;
export const MAX_EXTERNAL_API_BODY_BYTES = 64 * 1024;
// Ordinary business mutations use strict Zod schemas after parsing. Keep the
// transport budget finite before JSON.parse, while leaving room for bounded
// bulk transaction/reconciliation payloads.
export const MAX_INTERNAL_API_BODY_BYTES = 256 * 1024;
// WebAuthn responses are normally only a few KB; this still leaves room for
// platform-specific authenticator metadata without allowing an unbounded JSON
// body on the authentication surface.
export const MAX_PASSKEY_BODY_BYTES = 128 * 1024;
// Avatar data URLs can be up to 512KB; leave bounded JSON framing headroom
// while keeping authentication requests far below an unbounded parser.
export const MAX_AUTH_BODY_BYTES = 1 * 1024 * 1024;
// Offline/P2P payloads may contain many encrypted records, but still need a
// finite parser budget. The endpoint-level validators apply tighter field and
// item limits after this transport-level cap.
export const MAX_PROTOCOL_BODY_BYTES = 8 * 1024 * 1024;
const DEFAULT_BODY_TIMEOUT_MS = 15_000;

async function readChunkWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new ApiAccessError(`请求读取超时（>${Math.ceil(timeoutMs / 1000)} 秒）`, 408)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/** Read and parse JSON with a byte and per-read timeout hard limit. */
export async function readJsonWithLimit<T>(
  request: Request,
  maxBytes: number,
  timeoutMs = DEFAULT_BODY_TIMEOUT_MS,
): Promise<T> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const declared = Number(contentLength);
    if (!Number.isFinite(declared) || declared < 0)
      throw new ApiAccessError("请求大小声明无效", 400);
    if (declared > maxBytes)
      throw new ApiAccessError(`请求不能超过 ${Math.floor(maxBytes / 1024 / 1024)} MB`, 413);
  }

  const reader = request.body?.getReader();
  if (!reader) throw new ApiAccessError("请求体为空或不是有效 JSON", 400);

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await readChunkWithTimeout(reader, timeoutMs);
      if (part.done) break;
      total += part.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("request body too large").catch(() => undefined);
        throw new ApiAccessError(
          `请求不能超过 ${Math.floor(maxBytes / 1024 / 1024)} MB`,
          413,
        );
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
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ApiAccessError("请求体编码无效", 400);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiAccessError("请求体不是有效 JSON", 400);
  }
}

/** Read UTF-8 request text with the same streaming hard limit used by JSON APIs. */
export async function readTextWithLimit(
  request: Request,
  maxBytes: number,
  timeoutMs = DEFAULT_BODY_TIMEOUT_MS,
) {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const declared = Number(contentLength);
    if (!Number.isFinite(declared) || declared < 0)
      throw new ApiAccessError("请求大小声明无效", 400);
    if (declared > maxBytes)
      throw new ApiAccessError(`请求不能超过 ${Math.ceil(maxBytes / 1024)} KB`, 413);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new ApiAccessError("请求体为空", 400);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await readChunkWithTimeout(reader, timeoutMs);
      if (part.done) break;
      total += part.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("request body too large").catch(() => undefined);
        throw new ApiAccessError(`请求不能超过 ${Math.ceil(maxBytes / 1024)} KB`, 413);
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
    throw new ApiAccessError("请求体编码无效", 400);
  }
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_BODY_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted)
      throw new ApiAccessError("外部服务响应超时", 504);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function readResponseTextWithLimit(
  response: Response,
  maxBytes: number,
  timeoutMs = DEFAULT_BODY_TIMEOUT_MS,
) {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes)
    throw new ApiAccessError("外部备份响应过大", 413);
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await readChunkWithTimeout(reader, timeoutMs);
      if (part.done) break;
      total += part.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("response body too large").catch(() => undefined);
        throw new ApiAccessError("外部备份响应过大", 413);
      }
      chunks.push(part.value);
    }
  } catch (error) {
    await reader.cancel("response read failed").catch(() => undefined);
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
    throw new ApiAccessError("外部备份响应编码无效", 502);
  }
}

/** Read an external binary response without trusting Content-Length or buffering it unboundedly. */
export async function readResponseBytesWithLimit(
  response: Response,
  maxBytes: number,
  timeoutMs = DEFAULT_BODY_TIMEOUT_MS,
) {
  const contentLength = response.headers.get("content-length");
  if (contentLength) {
    const declared = Number(contentLength);
    if (!Number.isFinite(declared) || declared < 0)
      throw new ApiAccessError("外部响应大小声明无效", 502);
    if (declared > maxBytes) throw new ApiAccessError("外部响应过大", 413);
  }
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await readChunkWithTimeout(reader, timeoutMs);
      if (part.done) break;
      total += part.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("response body too large").catch(() => undefined);
        throw new ApiAccessError("外部响应过大", 413);
      }
      chunks.push(part.value);
    }
  } catch (error) {
    await reader.cancel("response read failed").catch(() => undefined);
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
  return bytes;
}
