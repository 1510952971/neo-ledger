import { ExternalApiError } from "./external-api-error.ts";

export type ExternalTransactionInput = {
  amount?: number;
  merchant?: string;
  time?: string;
  ledgerId?: number;
  accountId?: number;
  category?: string;
  incomeCategory?: string;
  type?: "支出" | "收入";
  text?: string;
  externalId?: string;
  source?: string;
};

function optionalText(
  body: Record<string, unknown>,
  name: keyof ExternalTransactionInput,
  maxLength: number,
) {
  if (body[name] == null || body[name] === "") return undefined;
  if (typeof body[name] !== "string")
    throw new ExternalApiError(`${name} 必须是字符串`, 422, "validation_failed", { field: name });
  const text = body[name].trim();
  if (!text || text.length > maxLength)
    throw new ExternalApiError(`${name} 长度无效`, 422, "validation_failed", { field: name });
  return text;
}

function optionalPositiveInteger(body: Record<string, unknown>, name: "ledgerId" | "accountId") {
  if (body[name] == null || body[name] === "") return undefined;
  const value = Number(body[name]);
  if (!Number.isInteger(value) || value <= 0)
    throw new ExternalApiError(`${name} 必须是正整数`, 422, "validation_failed", { field: name });
  return value;
}

export function parseExternalTransactionInput(
  input: unknown,
  options: {
    requireLedgerId?: boolean;
    requireIdempotencyKey?: boolean;
    strictDateTime?: boolean;
    idempotencyKey?: string | null;
  } = {},
): ExternalTransactionInput {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new ExternalApiError("请求体必须是 JSON 对象", 422, "validation_failed");
  const body = input as Record<string, unknown>;
  const ledgerId = optionalPositiveInteger(body, "ledgerId");
  const accountId = optionalPositiveInteger(body, "accountId");
  if (options.requireLedgerId && !ledgerId)
    throw new ExternalApiError("ledgerId 为必填项", 422, "validation_failed", { field: "ledgerId" });

  const amount = body.amount == null || body.amount === "" ? undefined : Number(body.amount);
  if (amount != null && (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000))
    throw new ExternalApiError("amount 必须大于 0 且不超过 100000000", 422, "validation_failed", { field: "amount" });
  const text = optionalText(body, "text", 4_000);
  if (amount == null && !text)
    throw new ExternalApiError("amount 和 text 至少提供一项", 422, "validation_failed");

  const time = optionalText(body, "time", 80);
  if (time && !Number.isFinite(Date.parse(time)))
    throw new ExternalApiError("time 必须是有效的 ISO 8601 时间", 422, "validation_failed", { field: "time" });
  if (time && options.strictDateTime && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/u.test(time))
    throw new ExternalApiError("time 必须包含 ISO 8601 时区", 422, "validation_failed", { field: "time" });
  if (body.type != null && body.type !== "支出" && body.type !== "收入")
    throw new ExternalApiError("type 只能是支出或收入", 422, "validation_failed", { field: "type" });

  const externalId = optionalText(body, "externalId", 128) ?? options.idempotencyKey?.trim();
  if (externalId && (externalId.length < 8 || externalId.length > 128 || !/^[A-Za-z0-9._:-]+$/u.test(externalId)))
    throw new ExternalApiError("幂等 ID 必须为 8-128 位安全字符", 422, "validation_failed", { field: "externalId" });
  if (options.requireIdempotencyKey && !externalId)
    throw new ExternalApiError("必须提供 Idempotency-Key 或 externalId", 422, "idempotency_key_required");

  return {
    amount,
    merchant: optionalText(body, "merchant", 40),
    time,
    ledgerId,
    accountId,
    category: optionalText(body, "category", 40),
    incomeCategory: optionalText(body, "incomeCategory", 40),
    type: body.type as "支出" | "收入" | undefined,
    text,
    externalId,
    source: optionalText(body, "source", 60),
  };
}
