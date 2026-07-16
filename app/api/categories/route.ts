import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../db";
import { accessErrorResponse, claimAndRequireLedger } from "../../api-security";

export const dynamic = "force-dynamic";

function cleanName(value: unknown) {
  const name = String(value || "").trim().slice(0, 12);
  if (!name) throw new Error("请输入分类名称");
  return name;
}

export async function GET(request: Request) {
  await ensureDb();
  const ledgerId = Number(new URL(request.url).searchParams.get("ledger") || 1);
  await claimAndRequireLedger(request, ledgerId);
  const rows = await getDbBinding()
    .prepare(
      "SELECT id,ledger_id ledgerId,name,icon,color,builtin_key builtinKey,is_system isSystem,is_active isActive,sort_order sortOrder,created_at createdAt FROM expense_categories WHERE ledger_id=? ORDER BY is_active DESC,sort_order,id",
    )
    .bind(ledgerId)
    .all();
  return NextResponse.json(rows.results);
}

export async function POST(request: Request) {
  try {
    await ensureDb();
    const body = (await request.json()) as {
      ledgerId?: number;
      name?: string;
      icon?: string;
      color?: string;
    };
    const ledgerId = Number(body.ledgerId || 1);
    await claimAndRequireLedger(request, ledgerId);
    const name = cleanName(body.name);
    const icon = String(body.icon || "📦").trim().slice(0, 8) || "📦";
    const color = /^#[0-9a-f]{6}$/i.test(String(body.color))
      ? String(body.color)
      : "#8f91b8";
    const db = getDbBinding();
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
    return NextResponse.json(
      { id: Number(result.meta.last_row_id) },
      { status: 201 },
    );
  } catch (error) {
    return accessErrorResponse(error, "添加失败");
  }
}

export async function PUT(request: Request) {
  try {
    await ensureDb();
    const body = (await request.json()) as {
      id?: number;
      ledgerId?: number;
      name?: string;
      icon?: string;
      color?: string;
      isActive?: boolean;
    };
    const id = Number(body.id);
    const ledgerId = Number(body.ledgerId || 1);
    await claimAndRequireLedger(request, ledgerId);
    const name = cleanName(body.name);
    const icon = String(body.icon || "📦").trim().slice(0, 8) || "📦";
    const color = /^#[0-9a-f]{6}$/i.test(String(body.color))
      ? String(body.color)
      : "#8f91b8";
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
    return NextResponse.json({ ok: true });
  } catch (error) {
    return accessErrorResponse(error, "修改失败");
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
      return NextResponse.json({ ok: true, removed: true });
    }
    await db
      .prepare(
        "UPDATE expense_categories SET is_active=0 WHERE id=? AND ledger_id=?",
      )
      .bind(id, ledgerId)
      .run();
    return NextResponse.json({ ok: true, removed: false });
  } catch (error) {
    return accessErrorResponse(error, "删除失败");
  }
}
