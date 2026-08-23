import { env } from "cloudflare:workers";
import { ensureDb, getDbBinding } from "../../../../db";
import { claimLedgerForOwner } from "../../../api-security";
import {
  enforceIntegrationRateLimit,
  ownerForIntegrationToken,
} from "../../../integration-token";
import {
  inferAutomationCategory,
  parseAutomationText,
} from "../../../automation-core.js";
import {
  ExternalApiError,
  externalApiError,
  externalApiResponse,
} from "../../../external-api";
import { parseExternalTransactionInput } from "../../../external-transaction-contract";
import {
  MAX_EXTERNAL_API_BODY_BYTES,
  readJsonWithLimit,
} from "../../../request-limits";

function finalizeResponse(response: Response, deprecated: boolean) {
  if (deprecated) {
    response.headers.set("Deprecation", "true");
    response.headers.set("Sunset", "Thu, 31 Dec 2026 23:59:59 GMT");
    response.headers.set("Link", '</api/v1/transactions>; rel="successor-version"');
  }
  return response;
}

async function payloadHash(value: unknown) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return [...new Uint8Array(bytes)]
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * A deterministic marker lets a retry recover a transaction when the worker
 * crashes after the financial batch commits but before integration_events is
 * linked to the new transaction.
 */
async function integrationOfflineId(ownerId: string, externalId: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${ownerId}\n${externalId}`),
  );
  return `integration:${[...new Uint8Array(digest)]
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("")}`;
}

export async function handleQuickSync(
  request: Request,
  options: { strict?: boolean; deprecated?: boolean } = {},
) {
  try {
    await ensureDb();
    const configured = String(
      (env as unknown as Record<string, unknown>).SYNC_TOKEN || "",
    );
    const provided =
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
      request.headers.get("x-sync-token") ||
      "";
    const runtime = env as unknown as Record<string, unknown>;
    const ownerId =
      (await ownerForIntegrationToken(provided, request)) ||
      (!options.strict && configured && provided === configured
        ? String(runtime.SYNC_OWNER_ID || "local")
        : null);
    if (!ownerId)
      throw new ExternalApiError("集成令牌无效或已过期", 401, "invalid_token");
    await enforceIntegrationRateLimit(ownerId);
    if (
      options.strict &&
      (request.headers.get("content-type") || "").split(";")[0].trim() !== "application/json"
    )
      throw new ExternalApiError(
        "Content-Type 必须是 application/json",
        415,
        "unsupported_media_type",
      );
    const body = parseExternalTransactionInput(
      await readJsonWithLimit(request, MAX_EXTERNAL_API_BODY_BYTES),
      {
        requireLedgerId: options.strict,
        requireIdempotencyKey: options.strict,
        strictDateTime: options.strict,
        idempotencyKey: request.headers.get("idempotency-key"),
      },
    );
    const parsed = body.text ? parseAutomationText(body.text) : null;
    const amount = parsed?.amount || Math.round(Number(body.amount) * 100),
      ledgerId = Number(body.ledgerId || 1),
      db = getDbBinding();
    if (!Number.isFinite(amount) || amount <= 0)
      throw new ExternalApiError("amount 必须为正数", 422, "validation_failed", { field: "amount" });
    await claimLedgerForOwner(ownerId, ledgerId);
    const account = body.accountId
      ? await db
          .prepare(
            "SELECT id,currency FROM accounts WHERE id=? AND ledger_id=?",
          )
          .bind(body.accountId, ledgerId)
          .first<{ id: number; currency: string }>()
      : await db
          .prepare(
            "SELECT id,currency FROM accounts WHERE ledger_id=? AND type='资产' ORDER BY id LIMIT 1",
          )
          .bind(ledgerId)
          .first<{ id: number; currency: string }>();
    if (!account)
      throw new ExternalApiError("找不到可用账户", 422, "account_not_found");
    const merchant = String(
      body.merchant || parsed?.merchant || "外部同步账单",
    ).slice(0, 40);
    const type = body.type === "收入" || parsed?.type === "收入" ? "收入" : "支出";
    const inferredCategory = inferAutomationCategory(merchant);
    const requestedCategory = String(body.category || inferredCategory).trim();
    const requestedIncomeCategory = String(
      body.incomeCategory || "其它收入",
    ).trim();
    const category =
      type === "支出"
        ? await db
            .prepare(
              `SELECT name,builtin_key builtinKey FROM expense_categories
               WHERE ledger_id=? AND is_active=1
               ORDER BY CASE WHEN name=? THEN 0 WHEN name=? THEN 1 ELSE 2 END,sort_order,id
               LIMIT 1`,
            )
            .bind(ledgerId, requestedCategory, inferredCategory)
            .first<{ name: string; builtinKey: string | null }>()
        : null;
    const incomeCategory =
      type === "收入"
        ? await db
            .prepare(
              `SELECT name,builtin_key builtinKey FROM income_categories
               WHERE ledger_id=? AND is_active=1
               ORDER BY CASE WHEN name=? THEN 0 ELSE 1 END,sort_order,id LIMIT 1`,
            )
            .bind(ledgerId, requestedIncomeCategory)
            .first<{ name: string; builtinKey: string | null }>()
        : null;
    if (type === "支出" && !category)
      throw new ExternalApiError("账本没有可用的消费分类", 422, "category_not_found");
    if (type === "收入" && !incomeCategory)
      throw new ExternalApiError("账本没有可用的收入分类", 422, "category_not_found");
    const occurredAt =
      body.time && Number.isFinite(new Date(body.time).getTime())
        ? new Date(body.time).toISOString()
        : new Date().toISOString();
    const digest = await payloadHash({
      ledgerId,
      accountId: account.id,
      amount,
      merchant,
      type,
      requestedTime: body.time ?? null,
      source: String(body.source || parsed?.source || "external"),
      raw: parsed?.raw || "",
    });
    const externalId = String(
      body.externalId || request.headers.get("idempotency-key") || `auto:${digest}`,
    )
      .trim()
      .slice(0, 128);
    const offlineId = await integrationOfflineId(ownerId, externalId);
    const claim = await db
      .prepare(
        "INSERT OR IGNORE INTO integration_events(owner_id,external_id,payload_hash,transaction_id) VALUES(?,?,?,-1)",
      )
      .bind(ownerId, externalId, digest)
      .run();
    if (!Number(claim.meta.changes || 0)) {
      const previous = await db
        .prepare(
          "SELECT transaction_id transactionId,payload_hash payloadHash FROM integration_events WHERE owner_id=? AND external_id=?",
        )
        .bind(ownerId, externalId)
        .first<{ transactionId: number | null; payloadHash: string }>();
      if (previous?.payloadHash && previous.payloadHash !== digest)
        throw new ExternalApiError(
          "同一个幂等 ID 不能用于不同账单",
          409,
          "idempotency_conflict",
        );
      if ((previous?.transactionId ?? 0) > 0)
        return finalizeResponse(
          externalApiResponse(request, {
            ok: true,
            duplicate: true,
            id: previous?.transactionId ?? null,
            externalId,
          }),
          Boolean(options.deprecated),
        );

      // Recover a committed financial row if the worker died before linking
      // integration_events to it. This prevents a retry from double charging.
      const recovered = await db
        .prepare("SELECT id FROM transactions WHERE offline_id=? AND ledger_id=?")
        .bind(offlineId, ledgerId)
        .first<{ id: number }>();
      if (recovered) {
        await db
          .prepare(
            "UPDATE integration_events SET transaction_id=? WHERE owner_id=? AND external_id=? AND (transaction_id IS NULL OR transaction_id=-1)",
          )
          .bind(recovered.id, ownerId, externalId)
          .run();
        return finalizeResponse(
          externalApiResponse(request, {
            ok: true,
            duplicate: true,
            id: recovered.id,
            externalId,
          }),
          Boolean(options.deprecated),
        );
      }

      // -1 is a short-lived processing lease. Reclaim a lease left by a
      // crashed worker, then reserve it atomically before doing any writes.
      await db
        .prepare(
          "UPDATE integration_events SET transaction_id=NULL WHERE owner_id=? AND external_id=? AND transaction_id=-1 AND created_at<datetime('now','-5 minutes')",
        )
        .bind(ownerId, externalId)
        .run();
      const reserved = await db
        .prepare(
          "UPDATE integration_events SET transaction_id=-1 WHERE owner_id=? AND external_id=? AND payload_hash=? AND transaction_id IS NULL",
        )
        .bind(ownerId, externalId, digest)
        .run();
      if (!Number(reserved.meta.changes || 0))
        throw new ExternalApiError(
          "该外部事件正在处理中，请稍后重试",
          409,
          "idempotency_in_progress",
        );
    }
    let results;
    try {
      results = await db.batch([
        db.prepare(
          "INSERT INTO transactions (ledger_id,title,amount,type,mood,category,category_dynamic,income_category,income_category_dynamic,account_id,occurred_at,currency,original_amount,original_currency,exchange_rate_micros,original_timezone,offline_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1000000,'UTC',?)",
        ).bind(
          ledgerId,
          merchant,
          amount,
          type,
          type === "支出" ? "刚需" : null,
          category?.builtinKey ?? null,
          category?.name ?? null,
          incomeCategory?.builtinKey ?? null,
          incomeCategory?.name ?? null,
          account.id,
          occurredAt,
          account.currency,
          amount,
          account.currency,
          offlineId,
        ),
        db.prepare(
          "UPDATE accounts SET current_balance=current_balance+?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",
        ).bind(type === "支出" ? -amount : amount, account.id),
        db.prepare(
          "INSERT INTO system_notifications(ledger_id,title,message) VALUES(?,?,?)",
        ).bind(
          ledgerId,
          "收到一笔自动账单",
          `${merchant} · ${type} ¥${(amount / 100).toFixed(2)}，已自动加入个人账单`,
        ),
      ]);
    } catch (error) {
      await db
        .prepare(
          "DELETE FROM integration_events WHERE owner_id=? AND external_id=? AND transaction_id=-1",
        )
        .bind(ownerId, externalId)
        .run();
      throw error;
    }
    const transactionId = Number(results[0].meta.last_row_id);
    await db
      .prepare(
        "UPDATE integration_events SET transaction_id=? WHERE owner_id=? AND external_id=?",
      )
      .bind(transactionId, ownerId, externalId)
      .run();
    await db
      .prepare("DELETE FROM integration_events WHERE created_at<datetime('now','-90 days')")
      .run();
    return finalizeResponse(
      externalApiResponse(request, {
        ok: true,
        duplicate: false,
        id: transactionId,
        externalId,
        type,
        category: category?.name ?? incomeCategory?.name,
      }, 201),
      Boolean(options.deprecated),
    );
  } catch (error) {
    return finalizeResponse(
      externalApiError(error, request, "同步失败"),
      Boolean(options.deprecated),
    );
  }
}

export async function POST(request: Request) {
  return handleQuickSync(request, { deprecated: true });
}
