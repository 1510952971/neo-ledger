import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../db";
import { ApiAccessError, accessErrorResponse, requestOwnerId } from "../../api-security";
import { readLedgerCreateInput } from "../../internal-api-contract";
import { MAX_LEDGER_COUNT } from "../../ledger-limits";

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, private, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  return NextResponse.json(body, { ...init, headers });
}
export async function GET(request: Request) {
  try {
    await ensureDb();
    const ownerId = await requestOwnerId(request);
    const db = getDbBinding();
    // 仅无账号的本地单用户模式允许首次接管旧数据；已认证用户绝不批量认领孤立账本。
    if (ownerId === "local")
      await db.prepare("UPDATE ledgers SET owner_id=? WHERE owner_id IS NULL OR owner_id='local'").bind(ownerId).run();
    const total = await db
      .prepare("SELECT COUNT(*) count FROM ledgers WHERE owner_id=?")
      .bind(ownerId)
      .first<{ count: number }>();
    const rows = await db
      .prepare(
        "SELECT id,name,icon,uuid,updated_at AS updatedAt,created_at AS createdAt FROM ledgers WHERE owner_id=? ORDER BY id LIMIT ?",
      )
      .bind(ownerId, MAX_LEDGER_COUNT)
      .all();
    const response = privateJson(rows.results);
    const totalCount = Number(total?.count ?? 0);
    response.headers.set("X-Total-Count", String(totalCount));
    response.headers.set("X-Has-More", totalCount > MAX_LEDGER_COUNT ? "1" : "0");
    return response;
  } catch (error) {
    return accessErrorResponse(error, "读取账本失败", request);
  }
}
export async function POST(request: Request) {
  try {
    await ensureDb();
    const ownerId = await requestOwnerId(request);
    const body = await readLedgerCreateInput(request);
    const { name, icon } = body;
    const db = getDbBinding();
    const count = await db
      .prepare("SELECT COUNT(*) count FROM ledgers WHERE owner_id=?")
      .bind(ownerId)
      .first<{ count: number }>();
    if (Number(count?.count ?? 0) >= MAX_LEDGER_COUNT)
      throw new ApiAccessError("账本最多 " + MAX_LEDGER_COUNT + " 个", 409);
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
    return privateJson({ id, name, icon }, { status: 201 });
  } catch (error) {
    return accessErrorResponse(error, "创建失败", request);
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureDb();
    const ownerId = await requestOwnerId(request);
    const url = new URL(request.url);
    const id = Number(url.searchParams.get("id"));
    const expectedUpdatedAt = url.searchParams.get("expectedUpdatedAt")?.trim() ?? "";
    if (!Number.isInteger(id) || id <= 0) throw new Error("账本参数无效");
    if (!expectedUpdatedAt || expectedUpdatedAt.length > 64)
      throw new ApiAccessError("账本版本无效，请刷新后重试", 409);

    const db = getDbBinding();
    const ledger = await db
      .prepare("SELECT id,name,uuid,updated_at updatedAt FROM ledgers WHERE id=? AND owner_id=?")
      .bind(id, ownerId)
      .first<{ id: number; name: string; uuid: string; updatedAt: string }>();
    if (!ledger) throw new Error("账本不存在或已被删除");
    if (ledger.updatedAt !== expectedUpdatedAt)
      throw new ApiAccessError("账本已被其他操作更新，请刷新后重试", 409);

    const count = await db
      .prepare("SELECT COUNT(*) AS count FROM ledgers WHERE owner_id=?")
      .bind(ownerId)
      .first<{ count: number }>();
    if (Number(count?.count ?? 0) <= 1) {
      throw new Error("至少需要保留一个账本");
    }

    const nextUpdatedAt = new Date().toISOString();
    const guard = "EXISTS (SELECT 1 FROM ledgers WHERE id=? AND owner_id=? AND updated_at=?)";
    const guardArgs = [id, ownerId, nextUpdatedAt];
    const results = await db.batch([
      db.prepare("UPDATE ledgers SET updated_at=? WHERE id=? AND owner_id=? AND updated_at=?").bind(nextUpdatedAt, id, ownerId, expectedUpdatedAt),
      db.prepare(`DELETE FROM side_hustle_deductions WHERE ledger_id=? AND ${guard}`).bind(id, ...guardArgs),
      db.prepare(`DELETE FROM scheduled_occurrences WHERE ledger_id=? AND ${guard}`).bind(id, ...guardArgs),
      db.prepare(`DELETE FROM account_transfers WHERE ledger_id=? AND ${guard}`).bind(id, ...guardArgs),
      db.prepare(`DELETE FROM pending_transactions WHERE ledger_id=? AND ${guard}`).bind(id, ...guardArgs),
      db.prepare(`DELETE FROM subscriptions WHERE ledger_id=? AND ${guard}`).bind(id, ...guardArgs),
      db.prepare(`DELETE FROM installments WHERE ledger_id=? AND ${guard}`).bind(id, ...guardArgs),
      db.prepare(`DELETE FROM transactions WHERE ledger_id=? AND ${guard}`).bind(id, ...guardArgs),
      db.prepare(`DELETE FROM digital_assets WHERE ledger_id=? AND ${guard}`).bind(id, ...guardArgs),
      db.prepare(`DELETE FROM savings_goals WHERE ledger_id=? AND ${guard}`).bind(id, ...guardArgs),
      db.prepare(`DELETE FROM category_budgets WHERE ledger_id=? AND ${guard}`).bind(id, ...guardArgs),
      db.prepare(`DELETE FROM expense_categories WHERE ledger_id=? AND ${guard}`).bind(id, ...guardArgs),
      db.prepare(`DELETE FROM income_categories WHERE ledger_id=? AND ${guard}`).bind(id, ...guardArgs),
      db.prepare(`DELETE FROM achievements WHERE ledger_id=? AND ${guard}`).bind(id, ...guardArgs),
      db.prepare(`DELETE FROM members WHERE ledger_id=? AND ${guard}`).bind(id, ...guardArgs),
      db.prepare(`DELETE FROM system_notifications WHERE ledger_id=? AND ${guard}`).bind(id, ...guardArgs),
      db.prepare(`DELETE FROM crdt_tombstones WHERE ledger_id=? AND ${guard}`).bind(id, ...guardArgs),
      db.prepare(`DELETE FROM transaction_reconciliation WHERE ledger_id=? AND ${guard}`).bind(id, ...guardArgs),
      db.prepare(`DELETE FROM automation_rules WHERE ledger_id=? AND owner_id=? AND ${guard}`).bind(id, ownerId, ...guardArgs),
      db.prepare(`DELETE FROM import_batch_items WHERE batch_id IN (SELECT id FROM import_batches WHERE ledger_id=? AND owner_id=?) AND ${guard}`).bind(id, ownerId, ...guardArgs),
      db.prepare(`DELETE FROM import_batches WHERE ledger_id=? AND owner_id=? AND ${guard}`).bind(id, ownerId, ...guardArgs),
      db.prepare(`DELETE FROM fire_settings WHERE ledger_id=? AND ${guard}`).bind(id, ...guardArgs),
      db.prepare(`DELETE FROM economic_settings WHERE ledger_id=? AND ${guard}`).bind(id, ...guardArgs),
      db.prepare(`DELETE FROM budget_settings WHERE id=? AND ${guard}`).bind(id, ...guardArgs),
      db.prepare(`DELETE FROM accounts WHERE ledger_id=? AND ${guard}`).bind(id, ...guardArgs),
      db.prepare(`INSERT OR REPLACE INTO sync_tombstones(entity_type,entity_uuid,ledger_id,deleted_at) SELECT 'ledger',uuid,?,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM ledgers WHERE id=? AND owner_id=? AND updated_at=?`).bind(id, id, ownerId, nextUpdatedAt),
      db.prepare("DELETE FROM ledgers WHERE id=? AND owner_id=? AND updated_at=?").bind(id, ownerId, nextUpdatedAt),
    ]);
    if (!Number(results[0]?.meta?.changes ?? 0) || !Number(results.at(-1)?.meta?.changes ?? 0))
      throw new ApiAccessError("账本已被其他操作更新，请刷新后重试", 409);
    return privateJson({ ok: true, deletedId: id });
  } catch (error) {
    return accessErrorResponse(error, "删除失败", request);
  }
}
