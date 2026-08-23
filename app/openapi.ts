import { APP_VERSION } from "./app-version.ts";

const requestIdHeader = {
  description: "用于支持与审计关联的请求标识",
  schema: { type: "string", minLength: 8, maxLength: 128 },
};
const responseHeaders = {
  "X-Request-ID": requestIdHeader,
};

const standardErrors = {
  "400": { $ref: "#/components/responses/BadRequest" },
  "401": { $ref: "#/components/responses/Unauthorized" },
  "403": { $ref: "#/components/responses/Forbidden" },
  "408": { $ref: "#/components/responses/RequestTimeout" },
  "409": { $ref: "#/components/responses/Conflict" },
  "413": { $ref: "#/components/responses/PayloadTooLarge" },
  "415": { $ref: "#/components/responses/UnsupportedMediaType" },
  "422": { $ref: "#/components/responses/UnprocessableEntity" },
  "429": { $ref: "#/components/responses/RateLimited" },
  "500": { $ref: "#/components/responses/InternalError" },
};

export const OPENAPI_DOCUMENT = {
  openapi: "3.1.0",
  info: {
    title: "Neo Ledger External API",
    version: APP_VERSION,
    description: "用于范围化集成令牌写入账本和提交待确认通知的稳定 v1 API。",
  },
  servers: [{ url: "/", description: "当前 Neo Ledger 实例" }],
  tags: [{ name: "Transactions" }, { name: "Webhooks" }],
  paths: {
    "/api/v1/transactions": {
      post: {
        operationId: "createExternalTransaction",
        tags: ["Transactions"],
        summary: "幂等写入一笔外部交易",
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: "#/components/parameters/IdempotencyKey" },
          { $ref: "#/components/parameters/RequestId" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ExternalTransactionInput" },
            },
          },
        },
        responses: {
          "201": {
            description: "交易已创建",
            headers: responseHeaders,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TransactionResult" },
              },
            },
          },
          "200": {
            description: "相同幂等事件已处理",
            headers: responseHeaders,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TransactionResult" },
              },
            },
          },
          ...standardErrors,
        },
      },
    },
    "/api/v1/webhook/auto-parse": {
      post: {
        operationId: "submitNotificationWebhook",
        tags: ["Webhooks"],
        summary: "解析通知并写入待确认箱",
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: "#/components/parameters/IdempotencyKey" },
          { $ref: "#/components/parameters/RequestId" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/WebhookInput" },
            },
            "application/x-www-form-urlencoded": {
              schema: { $ref: "#/components/schemas/WebhookInput" },
            },
          },
        },
        responses: {
          "201": {
            description: "待确认交易已创建",
            headers: responseHeaders,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/WebhookResult" },
              },
            },
          },
          "200": {
            description: "相同幂等事件已处理",
            headers: responseHeaders,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/WebhookResult" },
              },
            },
          },
          ...standardErrors,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "Neo Ledger integration token",
        description: "在数据中心签发、具有 ledger:write scope 的 nls_ 令牌",
      },
    },
    parameters: {
      IdempotencyKey: {
        name: "Idempotency-Key",
        in: "header",
        required: false,
        description: "推荐使用；未提供时必须在请求体提供兼容字段 externalId。同一业务事件需保持不变；8-128 位字母、数字、点、下划线、冒号或短横线",
        schema: {
          type: "string",
          minLength: 8,
          maxLength: 128,
          pattern: "^[A-Za-z0-9._:-]+$",
        },
      },
      RequestId: {
        name: "X-Request-ID",
        in: "header",
        required: false,
        description: "可选调用方追踪 ID；非法值会由服务端替换",
        schema: { type: "string", minLength: 8, maxLength: 128 },
      },
    },
    schemas: {
      ExternalTransactionInput: {
        type: "object",
        additionalProperties: false,
        required: ["ledgerId"],
        properties: {
          ledgerId: { type: "integer", minimum: 1 },
          accountId: { type: "integer", minimum: 1 },
          amount: { type: "number", exclusiveMinimum: 0, maximum: 100_000_000 },
          merchant: { type: "string", minLength: 1, maxLength: 40 },
          type: { type: "string", enum: ["支出", "收入"] },
          category: { type: "string", minLength: 1, maxLength: 40 },
          incomeCategory: { type: "string", minLength: 1, maxLength: 40 },
          text: { type: "string", minLength: 1, maxLength: 4_000 },
          time: {
            type: "string",
            maxLength: 80,
            pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d{1,3})?)?(?:Z|[+-]\\d{2}:\\d{2})$",
            description: "带时区的 ISO 8601 时间；支持分钟级或秒级精度",
          },
          source: { type: "string", minLength: 1, maxLength: 60 },
          externalId: {
            type: "string",
            minLength: 8,
            maxLength: 128,
            pattern: "^[A-Za-z0-9._:-]+$",
            deprecated: true,
            description: "兼容字段；新调用方优先使用 Idempotency-Key 请求头",
          },
        },
        anyOf: [{ required: ["amount"] }, { required: ["text"] }],
      },
      WebhookInput: {
        type: "object",
        additionalProperties: true,
        required: ["ledgerId", "text"],
        properties: {
          ledgerId: { type: "integer", minimum: 1 },
          text: { type: "string", minLength: 1, maxLength: 4_000 },
          timezone: { type: "string", minLength: 1, maxLength: 80, example: "Asia/Shanghai" },
          externalId: {
            type: "string",
            minLength: 8,
            maxLength: 128,
            pattern: "^[A-Za-z0-9._:-]+$",
          },
        },
      },
      TransactionResult: {
        type: "object",
        required: ["ok", "duplicate", "id", "externalId", "requestId"],
        properties: {
          ok: { const: true },
          duplicate: { type: "boolean", default: false },
          id: { type: ["integer", "null"] },
          externalId: { type: "string" },
          type: { type: "string", enum: ["支出", "收入"] },
          category: { type: "string" },
          requestId: { type: "string" },
        },
      },
      WebhookResult: {
        type: "object",
        required: ["ok", "id", "externalId", "status", "requestId"],
        properties: {
          ok: { const: true },
          duplicate: { type: "boolean", default: false },
          id: { type: ["integer", "null"] },
          externalId: { type: "string" },
          status: { const: "待确认" },
          parsed: { type: "object" },
          requestId: { type: "string" },
        },
      },
      ApiError: {
        type: "object",
        additionalProperties: false,
        required: ["error", "code", "requestId"],
        properties: {
          error: { type: "string" },
          code: {
            type: "string",
            enum: [
              "invalid_request",
              "validation_failed",
              "idempotency_key_required",
              "idempotency_conflict",
              "invalid_token",
              "forbidden",
              "payload_too_large",
              "unsupported_media_type",
              "rate_limited",
              "request_timeout",
              "amount_not_detected",
              "account_not_found",
              "category_not_found",
              "internal_error",
            ],
          },
          requestId: { type: "string" },
          details: {
            type: "object",
            additionalProperties: { type: "string" },
          },
        },
      },
    },
    responses: Object.fromEntries(
      [
        ["BadRequest", "请求不是有效 JSON 或编码无效"],
        ["Unauthorized", "集成令牌无效或已过期"],
        ["Forbidden", "令牌无权访问目标账本"],
        ["RequestTimeout", "请求正文读取超时"],
        ["Conflict", "幂等键已用于不同事件"],
        ["PayloadTooLarge", "请求正文超过 64KB"],
        ["UnprocessableEntity", "字段校验失败"],
        ["UnsupportedMediaType", "不支持的 Content-Type"],
        ["RateLimited", "超过集成令牌速率限制"],
        ["InternalError", "服务端暂时无法完成请求"],
      ].map(([name, description]) => [
        name,
        {
          description,
          headers: responseHeaders,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/ApiError" } },
          },
        },
      ]),
    ),
  },
} as const;
