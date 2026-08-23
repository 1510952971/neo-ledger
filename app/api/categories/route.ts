import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../db";
import { ApiAccessError, accessErrorResponse, claimAndRequireLedger, guardedApiResponse } from "../../api-security";
import {
  readExpenseCategoryCreateInput,
  readExpenseCategoryUpdateInput,
} from "../../internal-api-contract";
import { MAX_CATEGORY_COUNT } from "../../category-limits";

export const dynamic = "force-dynamic";

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, private, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  return NextResponse.json(body, { ...init, headers });
}

export async function GET(request: Request) {
  return guardedApiResponse(request, "读取支出分类失败", async () => {
    await ensureDb();
    const ledgerId = Number(new URL(request.url).searchParams.get("ledger") || 1);
    await claimAndRequireLedger(request, ledgerId);
    const db = getDbBinding();
    const total = await db.prepare("SELECT COUNT(*) count FROM expense_categories WHERE ledger_id=?").bind(ledgerId).first<{ count: number }>();
    const rows = await db
      .prepare(
        "SELECT id,ledger_id ledgerId,name,icon,color,builtin_key builtinKey,is_system isSystem,is_active isActive,sort_order sortOrder,created_at createdAt FROM expense_categories WHERE ledger_id=? ORDER BY is_active DESC,sort_order,id LIMIT ?",
      )
      .bind(ledgerId, MAX_CATEGORY_COUNT)
      .all();
    const response = privateJson(rows.results);
    const totalCount = Number(total?.count ?? 0);
    response.headers.set("X-Total-Count", String(totalCount));
    response.headers.set("X-Has-More", totalCount > MAX_CATEGORY_COUNT ? "1" : "0");
    return response;
  });
}

export async function POST(request: Request) {
  try {
    await ensureDb();
    const body = await readExpenseCategoryCreateInput(request);
    const ledgerId = body.ledgerId;
    await claimAndRequireLedger(request, ledgerId);
    const { name, icon, color } = body;
    const db = getDbBinding();
    const count = await db.prepare("SELECT COUNT(*) count FROM expense_categories WHERE ledger_id=?").bind(ledgerId).first<{ count: number }>();
    if (Number(count?.count ?? 0) >= MAX_CATEGORY_COUNT)
      throw new ApiAccessError("支出分类最多 " + MAX_CATEGORY_COUNT + " 个", 409);
    const exists = await db
      .prepare("SELECT id FROM expense_categories WHERE ledger_id=? AND name=?")
      .bind(ledgerId, name)
      .first();
    if (exists) throw new Error("这个分类名称已经存在");
    const order = await db
      .prepare(
        "SELECT COALESCE(MAX(sort_order),0)+10 nextOrder FROM expense_categories WHERE ledger_id=?",
      )
      .bind(ledgerId)
      .first<{ nextOrder: number }>();
    const result = await db
      .prepare(
        "INSERT INTO expense_categories(ledger_id,name,icon,color,sort_order) VALUES(?,?,?,?,?)",
      )
      .bind(ledgerId, name, icon, color, order?.nextOrder ?? 10)
      .run();
    await db
      .prepare(
        "INSERT OR IGNORE INTO category_budgets(ledger_id,category,amount) VALUES(?,?,0)",
      )
      .bind(ledgerId, name)
      .run();
    return privateJson(
      { id: Number(result.meta.last_row_id) },
      { status: 201 },
    );
  } catch (error) {
    return accessErrorResponse(error, "添加失败", request);
  }
}

export async function PUT(request: Request) {
  try {
    await ensureDb();
    const body = await readExpenseCategoryUpdateInput(request);
    const id = body.id;
    const ledgerId = body.ledgerId;
    await claimAndRequireLedger(request, ledgerId);
    const { name, icon, color } = body;
    const db = getDbBinding();
    const current = await db
      .prepare(
        "SELECT name FROM expense_categories WHERE id=? AND ledger_id=?",
      )
      .bind(id, ledgerId)
      .first<{ name: string }>();
    if (!current) throw new Error("分类不存在");
    const duplicate = await db
      .prepare(
        "SELECT id FROM expense_categories WHERE ledger_id=? AND name=? AND id<>?",
      )
      .bind(ledgerId, name, id)
      .first();
    if (duplicate) throw new Error("这个分类名称已经存在");
    await db.batch([
      db
        .prepare(
          "UPDATE expense_categories SET name=?,icon=?,color=?,is_active=? WHERE id=? AND ledger_id=?",
        )
        .bind(name, icon, color, body.isActive === false ? 0 : 1, id, ledgerId),
      db
        .prepare(
          "UPDATE transactions SET category_dynamic=? WHERE ledger_id=? AND COALESCE(category_dynamic,category)=?",
        )
        .bind(name, ledgerId, current.name),
      db
        .prepare(
          "UPDATE subscriptions SET category_dynamic=? WHERE ledger_id=? AND COALESCE(category_dynamic,category)=?",
        )
        .bind(name, ledgerId, current.name),
      db
        .prepare(
          "UPDATE category_budgets SET category=? WHERE ledger_id=? AND category=?",
        )
        .bind(name, ledgerId, current.name),
    ]);
    return privateJson({ ok: true });
  } catch (error) {
    return accessErrorResponse(error, "修改失败", request);
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureDb();
    const url = new URL(request.url);
    const id = Number(url.searchParams.get("id"));
    const ledgerId = Number(url.searchParams.get("ledger") || 1);
    await claimAndRequireLedger(request, ledgerId);
    const db = getDbBinding();
    const active = await db
      .prepare(
        "SELECT COUNT(*) count FROM expense_categories WHERE ledger_id=? AND is_active=1",
      )
      .bind(ledgerId)
      .first<{ count: number }>();
    if ((active?.count ?? 0) <= 1) throw new Error("至少保留一个消费分类");
    const current = await db
      .prepare(
        "SELECT name,is_system isSystem FROM expense_categories WHERE id=? AND ledger_id=?",
      )
      .bind(id, ledgerId)
      .first<{ name: string; isSystem: number }>();
    if (!current) throw new Error("分类不存在");
    const usage = await db
      .prepare(
        "SELECT (SELECT COUNT(*) FROM transactions WHERE ledger_id=? AND COALESCE(category_dynamic,category)=?)+(SELECT COUNT(*) FROM subscriptions WHERE ledger_id=? AND COALESCE(category_dynamic,category)=?) count",
      )
      .bind(ledgerId, current.name, ledgerId, current.name)
      .first<{ count: number }>();
    if (!current.isSystem && (usage?.count ?? 0) === 0) {
      await db.batch([
        db.prepare("DELETE FROM expense_categories WHERE id=?").bind(id),
        db
          .prepare("DELETE FROM category_budgets WHERE ledger_id=? AND category=?")
          .bind(ledgerId, current.name),
      ]);
      return privateJson({ ok: true, removed: true });
    }
    await db
      .prepare(
        "UPDATE expense_categories SET is_active=0 WHERE id=? AND ledger_id=?",
      )
      .bind(id, ledgerId)
      .run();
    return privateJson({ ok: true, removed: false });
  } catch (error) {
    return accessErrorResponse(error, "删除失败", request);
  }
}
