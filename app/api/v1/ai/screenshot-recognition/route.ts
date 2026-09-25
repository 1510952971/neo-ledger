import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { ApiAccessError, accessErrorResponse, requestOwnerId } from "../../../../api-security";
import { enforceAuthRateLimit, requireSameOrigin } from "../../../../auth";
import { recordAuditEvent, requestIdFromRequest } from "../../../../audit-log";
import {
  fetchWithTimeout,
  readJsonWithLimit,
  readResponseTextWithLimit,
} from "../../../../request-limits";
import {
  normalizeScreenshotRecognitionAiRequest,
  normalizeScreenshotRecognitionAiResponse,
} from "../../../../screenshot-recognition-ai-core.js";

const MAX_REQUEST_BYTES = 12 * 1024;

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, private, max-age=0",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const ownerId = await requestOwnerId(request);
    await enforceAuthRateLimit(request, "ai-screenshot-recognition");
    const body = await readJsonWithLimit<unknown>(request, MAX_REQUEST_BYTES);
    const normalized = normalizeScreenshotRecognitionAiRequest(body);
    if (!normalized)
      throw new ApiAccessError("请求格式无效，且必须逐次确认只发送脱敏文本", 400);
    if (request.headers.get("x-neo-ai-consent") !== "true")
      return privateJson({ error: "请先明确同意发送本次脱敏文本", code: "ai_consent_required" }, 428);

    const runtime = env as unknown as Record<string, unknown>;
    const ollamaUrl = String(runtime.OLLAMA_URL || "").trim().replace(/\/$/u, "");
    const model = String(runtime.OLLAMA_MODEL || "llama3.1:8b").trim().slice(0, 100);
    const externalDisabled = ["1", "true", "yes", "on"].includes(
      String(runtime.NEO_AI_EXTERNAL_DISABLED || "").trim().toLowerCase(),
    );
    if (!ollamaUrl || externalDisabled)
      return privateJson({ error: "管理员尚未配置可用的截图识别模型", code: "ai_provider_unavailable" }, 503);

    await recordAuditEvent({
      ownerId,
      eventType: "ai.screenshot_recognition",
      subjectType: "user",
      requestId: requestIdFromRequest(request),
      metadata: { provider: "ollama", model, inputChars: normalized.text.length },
    });

    let response: Response;
    try {
      response = await fetchWithTimeout(`${ollamaUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          format: "json",
          messages: [
            {
              role: "system",
              content: "从用户提供的已脱敏支付凭证文字中提取账单字段。只返回 JSON 对象，可包含 amount（正数金额）、title（商户/标题）、type（收入或支出）、category（分类建议）、occurredAt（ISO 日期时间）。无法确定的字段省略；不要推断个人身份或编造数据。",
            },
            { role: "user", content: normalized.text },
          ],
        }),
      }, 15_000);
    } catch (error) {
      if (error instanceof ApiAccessError) throw error;
      throw new ApiAccessError("截图识别模型连接失败", 502);
    }
    if (!response.ok) throw new ApiAccessError("截图识别模型暂不可用", 502);

    let raw: unknown;
    try {
      raw = JSON.parse(await readResponseTextWithLimit(response, 64 * 1024));
    } catch {
      throw new ApiAccessError("截图识别模型响应格式无效", 502);
    }
    const suggestions = normalizeScreenshotRecognitionAiResponse(raw);
    if (!suggestions) throw new ApiAccessError("模型未返回可用账单字段", 502);
    return privateJson({ suggestions, provider: "ollama", model });
  } catch (error) {
    return accessErrorResponse(error, "截图 AI 识别失败", request);
  }
}
