import { ensureDb, getDbBinding } from "../../../../../db";
import { claimLedgerForOwner } from "../../../../api-security";
import {
  ExternalApiError,
  externalApiError,
  externalApiResponse,
} from "../../../../external-api";
import {
  enforceIntegrationRateLimit,
  ownerForIntegrationToken,
} from "../../../../integration-token";
import {
  MAX_EXTERNAL_API_BODY_BYTES,
  readJsonWithLimit,
  readTextWithLimit,
} from "../../../../request-limits";
import { localDateTimeToUtc } from "../../../../time-money.js";
import { MAX_ACCOUNT_COUNT } from "../../../../account-limits";

const clean = (value: string) =>
  value
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();

async function payloadHash(value: unknown) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function integrationOwner(request: Request) {
  const provided =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    request.headers.get("x-sync-token") ||
    "";
  return ownerForIntegrationToken(provided, request);
}

function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

async function requestBody(request: Request) {
  const contentType = (request.headers.get("content-type") || "").split(";")[0].trim();
  if (contentType === "application/json")
    return readJsonWithLimit<Record<string, unknown>>(request, MAX_EXTERNAL_API_BODY_BYTES);
  if (contentType === "application/x-www-form-urlencoded")
    return Object.fromEntries(
      new URLSearchParams(await readTextWithLimit(request, MAX_EXTERNAL_API_BODY_BYTES)),
    );
  throw new ExternalApiError(
    "Content-Type 必须是 application/json 或 application/x-www-form-urlencoded",
    415,
    "unsupported_media_type",
  );
}

export async function POST(request: Request) {
  try {
    await ensureDb();
    const ownerId = await integrationOwner(request);
    if (!ownerId)
      throw new ExternalApiError("集成令牌无效或已过期", 401, "invalid_token");
    await enforceIntegrationRateLimit(ownerId);
    const body = await requestBody(request);
    const raw = clean(
      String(body.text || body.body || body.message || body.content || body.title || ""),
    );
    if (!raw || raw.length > 4_000)
      throw new ExternalApiError("通知文本长度必须为 1-4000", 422, "validation_failed", { field: "text" });
    const ledgerId = Number(body.ledgerId);
    if (!Number.isInteger(ledgerId) || ledgerId <= 0)
      throw new ExternalApiError("ledgerId 必须是正整数", 422, "validation_failed", { field: "ledgerId" });
    const timezone = String(body.timezone || "Asia/Shanghai").trim();
    if (!validTimezone(timezone))
      throw new ExternalApiError("timezone 必须是有效 IANA 时区", 422, "validation_failed", { field: "timezone" });
    const suppliedId = String(
      body.externalId || request.headers.get("idempotency-key") || "",
    ).trim();
    if (
      suppliedId.length < 8 ||
      suppliedId.length > 128 ||
      !/^[A-Za-z0-9._:-]+$/u.test(suppliedId)
    )
      throw new ExternalApiError(
        "必须提供 8-128 位 Idempotency-Key 或 externalId",
        422,
        "idempotency_key_required",
      );
    await claimLedgerForOwner(ownerId, ledgerId);

    const amountHit =
      raw.match(/(?:人民币|CNY|RMB|¥|￥)\s*([0-9,]+(?:\.\d{1,2})?)\s*元?/i) ||
      raw.match(/(?:消费|支出|扣款|交易|支付|入账|收入)[^0-9]{0,10}([0-9,]+\.\d{1,2})\s*元?/i);
    if (!amountHit)
      throw new ExternalApiError("未识别到明确金额", 422, "amount_not_detected");
    const amount = Math.round(Number(amountHit[1].replaceAll(",", "")) * 100);
    if (!amount || amount > 10_000_000_000)
      throw new ExternalApiError("金额超出有效范围", 422, "validation_failed", { field: "text" });

    const now = new Date();
    const dateHit = raw.match(
      /(?:(20\d{2})[-/年])?(\d{1,2})[-/月](\d{1,2})日?\s*(\d{1,2}):(\d{2})/,
    );
    let occurredAt = now.toISOString();
    if (dateHit) {
      try {
        occurredAt = localDateTimeToUtc(
          `${dateHit[1] || now.getFullYear()}-${dateHit[2].padStart(2, "0")}-${dateHit[3].padStart(2, "0")} ${dateHit[4].padStart(2, "0")}:${dateHit[5]}:00`,
          timezone,
        );
      } catch {
        throw new ExternalApiError("通知中的交易时间无效", 422, "validation_failed", { field: "text" });
      }
    }
    const type =
      /入账|收入|到账|退款/.test(raw) && !/消费|支出|扣款/.test(raw)
        ? "收入"
        : "支出";
    const db = getDbBinding();
    const accounts = await db
      .prepare("SELECT id,name,currency FROM accounts WHERE ledger_id=? ORDER BY id LIMIT ?")
      .bind(ledgerId, MAX_ACCOUNT_COUNT)
      .all<{ id: number; name: string; currency: string }>();
    const bankWord =
      raw.match(/【([^】]+)】/)?.[1] ||
      raw.match(/(招商|建设|工商|农业|中国|交通|支付宝|微信)/)?.[1] ||
      "";
    const account =
      accounts.results.find(
        (item) =>
          raw.includes(item.name) ||
          item.name.includes(bankWord) ||
          bankWord.includes(item.name.replace(/银行|卡|账户/g, "")),
      ) ?? accounts.results[0];
    if (!account)
      throw new ExternalApiError("账本中没有可匹配账户", 422, "account_not_found");

    const eventId = `webhook:${suppliedId}`;
    const digest = await payloadHash({ ledgerId, raw, timezone });
    const claim = await db
      .prepare(
        "INSERT OR IGNORE INTO integration_events(owner_id,external_id,payload_hash) VALUES(?,?,?)",
      )
      .bind(ownerId, eventId, digest)
      .run();
    if (!claim.meta.changes) {
      const previous = await db
        .prepare(
          "SELECT transaction_id transactionId,payload_hash payloadHash FROM integration_events WHERE owner_id=? AND external_id=?",
        )
        .bind(ownerId, eventId)
        .first<{ transactionId: number | null; payloadHash: string }>();
      if (previous?.payloadHash !== digest)
        throw new ExternalApiError(
          "同一个幂等 ID 不能用于不同通知",
          409,
          "idempotency_conflict",
        );
      return externalApiResponse(request, {
        ok: true,
        duplicate: true,
        id: previous?.transactionId ?? null,
        externalId: suppliedId,
        status: "待确认",
      });
    }

    const title =
      (bankWord ? `${bankWord}通知` : "手机通知") +
      ` · ${
        raw
          .match(/(?:商户|于)([^，。]{2,24})(?:消费|支出|扣款|支付)/)?.[1]
          ?.replace(/账户\d+/g, "")
          .trim() || "待确认交易"
      }`;
    let pendingId: number;
    try {
      const results = await db.batch([
        db
          .prepare(
            "INSERT INTO pending_transactions(ledger_id,raw_text,title,amount,type,account_id,currency,occurred_at) VALUES(?,?,?,?,?,?,?,?)",
          )
          .bind(
            ledgerId,
            raw,
            title.slice(0, 40),
            amount,
            type,
            account.id,
            account.currency,
            occurredAt,
          ),
        db
          .prepare("UPDATE accounts SET current_balance=current_balance+? WHERE id=?")
          .bind(type === "支出" ? -amount : amount, account.id),
        db
          .prepare(
            "INSERT INTO system_notifications(ledger_id,title,message) VALUES (?,'收到一笔自动流水',?)",
          )
          .bind(
            ledgerId,
            `${account.name} ${type} ${account.currency} ${(amount / 100).toFixed(2)}，等待分类确认`,
          ),
      ]);
      pendingId = Number(results[0].meta.last_row_id);
    } catch (error) {
      await db
        .prepare("DELETE FROM integration_events WHERE owner_id=? AND external_id=?")
        .bind(ownerId, eventId)
        .run();
      throw error;
    }
    await db
      .prepare(
        "UPDATE integration_events SET transaction_id=? WHERE owner_id=? AND external_id=?",
      )
      .bind(pendingId, ownerId, eventId)
      .run();
    return externalApiResponse(
      request,
      {
        ok: true,
        id: pendingId,
        externalId: suppliedId,
        status: "待确认",
        parsed: {
          amount: amount / 100,
          type,
          account: account.name,
          occurredAt,
        },
      },
      201,
    );
  } catch (error) {
    return externalApiError(error, request, "自动解析失败");
  }
}
