import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../db";
import { accessErrorResponse, requestOwnerId } from "../../api-security";
export async function GET(request: Request) {
  await ensureDb();
  const ownerId = requestOwnerId(request);
  const db = getDbBinding();
  await db.prepare("UPDATE ledgers SET owner_id=? WHERE owner_id IS NULL").bind(ownerId).run();
  const rows = await db
    .prepare(
      "SELECT id,name,icon,uuid,updated_at AS updatedAt,created_at AS createdAt FROM ledgers WHERE owner_id=? ORDER BY id",
    )
    .bind(ownerId)
    .all();
  return NextResponse.json(rows.results);
}
export async function POST(request: Request) {
  try {
    await ensureDb();
    const ownerId = requestOwnerId(request);
    const body = (await request.json()) as { name?: string; icon?: string };
    const name = String(body.name ?? "")
      .trim()
      .slice(0, 30);
    const icon = String(body.icon ?? "📒").slice(0, 4);
    if (!name) throw new Error("请输入账本名称");
    const db = getDbBinding();
    const result = await db
      .prepare("INSERT INTO ledgers (name,icon,owner_id,uuid,updated_at) VALUES (?,?,?,lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'))")
      .bind(name, icon, ownerId)
      .run();
    const id = Number(result.meta.last_row_id);
    await db.batch([
      db
        .prepare("INSERT INTO budget_settings (id,amount) VALUES (?,500000)")
        .bind(id),
      db
        .prepare(
          "INSERT INTO category_budgets (ledger_id,category,amount) VALUES (?, '餐饮',0),(?,'交通',0),(?,'购物',0),(?,'咖啡',30000),(?,'娱乐',50000)",
        )
        .bind(id, id, id, id, id),
      db
        .prepare(
          "INSERT INTO expense_categories(ledger_id,name,icon,color,builtin_key,is_system,sort_order) VALUES(?,'餐饮','🍔','#e98565','餐饮',1,10),(?,'交通','🚇','#84a28d','交通',1,20),(?,'购物','🛍️','#c98fa7','购物',1,30),(?,'咖啡','☕','#ae8566','咖啡',1,40),(?,'娱乐','🎮','#858cbd','娱乐',1,50)",
        )
        .bind(id, id, id, id, id),
      db
        .prepare(
          "INSERT INTO income_categories(ledger_id,name,icon,color,builtin_key,is_system,sort_order) VALUES(?,'薪资发放','💼','#4f9b78','薪资发放',1,10),(?,'理财收益','📈','#78b899','理财收益',1,20),(?,'兼职外快','🧧','#d19a5d','兼职外快',1,30),(?,'其它收入','🎁','#8f91b8','其它收入',1,40)",
        )
        .bind(id, id, id, id),
      db
        .prepare(
          "INSERT INTO members (ledger_id,name,icon,is_me) VALUES (?,'我','🧑',1)",
        )
        .bind(id),
      db.prepare("INSERT INTO fire_settings(ledger_id) VALUES(?)").bind(id),
      db.prepare("INSERT INTO economic_settings(ledger_id) VALUES(?)").bind(id),
    ]);
    return NextResponse.json({ id, name, icon }, { status: 201 });
  } catch (error) {
    return accessErrorResponse(error, "创建失败");
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureDb();
    const ownerId = requestOwnerId(request);
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) throw new Error("账本参数无效");

    const db = getDbBinding();
    const ledger = await db
      .prepare("SELECT id,name,uuid FROM ledgers WHERE id=? AND owner_id=?")
      .bind(id, ownerId)
      .first<{ id: number; name: string; uuid: string }>();
    if (!ledger) throw new Error("账本不存在或已被删除");

    const count = await db
      .prepare("SELECT COUNT(*) AS count FROM ledgers WHERE owner_id=?")
      .bind(ownerId)
      .first<{ count: number }>();
    if (Number(count?.count ?? 0) <= 1) {
      throw new Error("至少需要保留一个账本");
    }

    await db.batch([
      db.prepare("DELETE FROM side_hustle_deductions WHERE ledger_id=?").bind(id),
      db.prepare("DELETE FROM scheduled_occurrences WHERE ledger_id=?").bind(id),
      db.prepare("DELETE FROM account_transfers WHERE ledger_id=?").bind(id),
      db.prepare("DELETE FROM pending_transactions WHERE ledger_id=?").bind(id),
      db.prepare("DELETE FROM subscriptions WHERE ledger_id=?").bind(id),
      db.prepare("DELETE FROM installments WHERE ledger_id=?").bind(id),
      db.prepare("DELETE FROM transactions WHERE ledger_id=?").bind(id),
      db.prepare("DELETE FROM digital_assets WHERE ledger_id=?").bind(id),
      db.prepare("DELETE FROM savings_goals WHERE ledger_id=?").bind(id),
      db.prepare("DELETE FROM category_budgets WHERE ledger_id=?").bind(id),
      db.prepare("DELETE FROM expense_categories WHERE ledger_id=?").bind(id),
      db.prepare("DELETE FROM income_categories WHERE ledger_id=?").bind(id),
      db.prepare("DELETE FROM achievements WHERE ledger_id=?").bind(id),
      db.prepare("DELETE FROM members WHERE ledger_id=?").bind(id),
      db.prepare("DELETE FROM system_notifications WHERE ledger_id=?").bind(id),
      db.prepare("DELETE FROM crdt_tombstones WHERE ledger_id=?").bind(id),
      db.prepare("DELETE FROM fire_settings WHERE ledger_id=?").bind(id),
      db.prepare("DELETE FROM economic_settings WHERE ledger_id=?").bind(id),
      db.prepare("DELETE FROM budget_settings WHERE id=?").bind(id),
      db.prepare("DELETE FROM accounts WHERE ledger_id=?").bind(id),
      db.prepare("INSERT OR REPLACE INTO sync_tombstones(entity_type,entity_uuid,ledger_id,deleted_at) VALUES('ledger',?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))").bind(ledger.uuid, id),
      db.prepare("DELETE FROM ledgers WHERE id=?").bind(id),
    ]);
    return NextResponse.json({ ok: true, deletedId: id });
  } catch (error) {
    return accessErrorResponse(error, "删除失败");
  }
}
