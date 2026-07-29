import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
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

async function payloadHash(value: unknown) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return [...new Uint8Array(bytes)]
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(request: Request) {
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
      (await ownerForIntegrationToken(provided)) ||
      (configured && provided === configured
        ? String(runtime.SYNC_OWNER_ID || "local")
        : null);
    if (!ownerId)
      return NextResponse.json({ error: "SYNC_TOKEN 无效" }, { status: 401 });
    await enforceIntegrationRateLimit(ownerId);
    const body = (await request.json()) as {
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
    const parsed = body.text ? parseAutomationText(body.text) : null;
    const amount = parsed?.amount || Math.round(Number(body.amount) * 100),
      ledgerId = Number(body.ledgerId || 1),
      db = getDbBinding();
    if (!Number.isFinite(amount) || amount <= 0)
      throw new Error("amount 必须为正数");
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
    if (!account) throw new Error("找不到可用账户");
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
      throw new Error("账本没有可用的消费分类");
    if (type === "收入" && !incomeCategory)
      throw new Error("账本没有可用的收入分类");
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
      occurredAt,
      source: String(body.source || parsed?.source || "external"),
      raw: parsed?.raw || "",
    });
    const externalId = String(
      body.externalId || request.headers.get("idempotency-key") || `auto:${digest}`,
    )
      .trim()
      .slice(0, 128);
    const claim = await db
      .prepare(
        "INSERT OR IGNORE INTO integration_events(owner_id,external_id,payload_hash) VALUES(?,?,?)",
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
        return NextResponse.json(
          { error: "同一个幂等 ID 不能用于不同账单" },
          { status: 409 },
        );
      return NextResponse.json({
        ok: true,
        duplicate: true,
        id: previous?.transactionId ?? null,
      });
    }
    let results;
    try {
      results = await db.batch([
        db.prepare(
          "INSERT INTO transactions (ledger_id,title,amount,type,mood,category,category_dynamic,income_category,income_category_dynamic,account_id,occurred_at,currency,original_amount,original_currency,exchange_rate_micros,original_timezone) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1000000,'UTC')",
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
        ),
        db.prepare(
          "UPDATE accounts SET current_balance=current_balance+?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",
        ).bind(type === "支出" ? -amount : amount, account.id),
      ]);
    } catch (error) {
      await db
        .prepare(
          "DELETE FROM integration_events WHERE owner_id=? AND external_id=?",
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
    return NextResponse.json(
      {
        ok: true,
        id: transactionId,
        externalId,
        type,
        category: category?.name ?? incomeCategory?.name,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "同步失败" },
      { status: 400 },
    );
  }
}
