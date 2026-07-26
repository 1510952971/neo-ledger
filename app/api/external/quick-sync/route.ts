import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../../db";
import { claimLedgerForOwner } from "../../../api-security";
import {
  enforceIntegrationRateLimit,
  ownerForIntegrationToken,
} from "../../../integration-token";

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
    };
    const amount = Math.round(Number(body.amount) * 100),
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
    const merchant = String(body.merchant || "外部同步账单").slice(0, 40);
    const inferredCategory = /咖啡|拿铁/.test(merchant)
      ? "咖啡"
      : /地铁|滴滴|公交|打车/.test(merchant)
        ? "交通"
        : /淘宝|京东|拼多多|购物/.test(merchant)
          ? "购物"
          : "餐饮";
    const requestedCategory = String(body.category || inferredCategory).trim();
    const category = await db
      .prepare(
        `SELECT name,builtin_key builtinKey FROM expense_categories
         WHERE ledger_id=? AND is_active=1
         ORDER BY CASE WHEN name=? THEN 0 WHEN name=? THEN 1 ELSE 2 END,sort_order,id
         LIMIT 1`,
      )
      .bind(ledgerId, requestedCategory, inferredCategory)
      .first<{ name: string; builtinKey: string | null }>();
    if (!category) throw new Error("账本没有可用的消费分类");
    const occurredAt =
      body.time && Number.isFinite(new Date(body.time).getTime())
        ? new Date(body.time).toISOString()
        : new Date().toISOString();
    const results = await db.batch([
      db.prepare(
        "INSERT INTO transactions (ledger_id,title,amount,type,mood,category,category_dynamic,account_id,occurred_at,currency,original_amount,original_currency,exchange_rate_micros,original_timezone) VALUES (?,?,?,'支出','刚需',?,?,?,?,?,?,?,1000000,'UTC')",
      ).bind(
        ledgerId,
        merchant,
        amount,
        category.builtinKey,
        category.name,
        account.id,
        occurredAt,
        account.currency,
        amount,
        account.currency,
      ),
      db.prepare(
        "UPDATE accounts SET current_balance=current_balance-?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",
      ).bind(amount, account.id),
    ]);
    return NextResponse.json(
      { ok: true, id: Number(results[0].meta.last_row_id), category: category.name },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "同步失败" },
      { status: 400 },
    );
  }
}
