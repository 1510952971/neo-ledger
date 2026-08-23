import { ApiAccessError } from "./api-security";
import { requestIdFromRequest } from "./audit-log";
import { ExternalApiError } from "./external-api-error.ts";

export { ExternalApiError } from "./external-api-error.ts";

export function externalApiResponse(
  request: Request,
  body: Record<string, unknown>,
  status = 200,
  headers?: HeadersInit,
) {
  const requestId = requestIdFromRequest(request);
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Cache-Control", "no-store, private, max-age=0");
  responseHeaders.set("Pragma", "no-cache");
  responseHeaders.set("X-Content-Type-Options", "nosniff");
  responseHeaders.set("X-Request-ID", requestId);
  return Response.json(
    { ...body, requestId },
    {
      status,
      headers: responseHeaders,
    },
  );
}

export function externalApiError(error: unknown, request: Request, fallback: string) {
  const status =
    error instanceof ExternalApiError
      ? error.status
      : error instanceof ApiAccessError
        ? error.status
        : error instanceof Error && error.message.includes("请求过于频繁")
          ? 429
          : 500;
  const code =
    error instanceof ExternalApiError
      ? error.code
      : status === 401
        ? "invalid_token"
        : status === 403
          ? "forbidden"
          : status === 408
            ? "request_timeout"
            : status === 413
              ? "payload_too_large"
              : status === 415
                ? "unsupported_media_type"
              : status === 429
                ? "rate_limited"
                : status >= 500
                  ? "internal_error"
                  : "invalid_request";
  const message =
    error instanceof ExternalApiError ||
    error instanceof ApiAccessError ||
    (error instanceof Error && error.message.includes("请求过于频繁"))
      ? error.message
      : fallback;
  return externalApiResponse(
    request,
    {
      error: message,
      code,
      ...(error instanceof ExternalApiError && error.details
        ? { details: error.details }
        : {}),
    },
    status,
    status === 429 ? { "Retry-After": "60" } : undefined,
  );
}
