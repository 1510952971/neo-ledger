import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../db";
import { normalizeSubscriptionInput } from "./rules.js";
import { accessErrorResponse, claimAndRequireLedger } from "../../api-security";

async function validateReferences(
  ledgerId: number,
  accountId: number,
  category: string,
) {
  const db = getDbBinding();
  const [account, configuredCategory] = await Promise.all([
    db
      .prepare(
        "SELECT id FROM accounts WHERE id=? AND ledger_id=? AND type='资产'",
      )
      .bind(accountId, ledgerId)
      .first(),
    db
      .prepare(
        "SELECT name,builtin_key AS builtinKey FROM expense_categories WHERE ledger_id=? AND name=? AND is_active=1",
      )
      .bind(ledgerId, category)
      .first<{ name: string; builtinKey: string | null }>(),
  ]);
  if (!account) throw new Error("订阅只能绑定当前账本的资产账户");
  if (!configuredCategory) throw new Error("请选择有效的消费分类");
  return configuredCategory;
}

export async function GET(request: Request) {
  await ensureDb();
  const requestedLedger = Number(new URL(request.url).searchParams.get("ledger"));
  const ledgerId = Number.isInteger(requestedLedger) && requestedLedger > 0
    ? requestedLedger
    : 1;
  await claimAndRequireLedger(request, ledgerId);
  const rows = await getDbBinding()
    .prepare(
      "SELECT id,ledger_id AS ledgerId,name,amount,account_id AS accountId,cycle,COALESCE(category_dynamic,category) AS category,next_charge_date AS nextChargeDate,uuid,updated_at AS updatedAt,created_at AS createdAt FROM subscriptions WHERE ledger_id=? ORDER BY next_charge_date,id",
    )
    .bind(ledgerId)
    .all();
  return NextResponse.json(rows.results);
}

export async function POST(request: Request) {
  try {
    await ensureDb();
    const value = normalizeSubscriptionInput(
      (await request.json()) as Record<string, unknown>,
    );
    await claimAndRequireLedger(request, value.ledgerId);
    const configuredCategory = await validateReferences(
      value.ledgerId,
      value.accountId,
      value.category,
    );
    await getDbBinding()
      .prepare(
        "INSERT INTO subscriptions(ledger_id,name,amount,account_id,cycle,category,category_dynamic,next_charge_date,uuid,updated_at) VALUES(?,?,?,?,?,?,?,?,lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
      )
      .bind(
        value.ledgerId,
        value.name,
        value.amount,
        value.accountId,
        value.cycle,
        configuredCategory.builtinKey ?? "娱乐",
        configuredCategory.name,
        value.nextChargeDate,
      )
      .run();
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return accessErrorResponse(error, "保存失败");
  }
}

export async function PUT(request: Request) {
  try {
    await ensureDb();
    const body = (await request.json()) as Record<string, unknown>;
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("续费项目不存在");
    const value = normalizeSubscriptionInput(body);
    await claimAndRequireLedger(request, value.ledgerId);
    const db = getDbBinding();
    const current = await db
      .prepare("SELECT id FROM subscriptions WHERE id=? AND ledger_id=?")
      .bind(id, value.ledgerId)
      .first();
    if (!current) throw new Error("续费项目不存在");
    const configuredCategory = await validateReferences(
      value.ledgerId,
      value.accountId,
      value.category,
    );
    await db
      .prepare(
        "UPDATE subscriptions SET name=?,amount=?,account_id=?,cycle=?,category=?,category_dynamic=?,next_charge_date=? WHERE id=? AND ledger_id=?",
      )
      .bind(
        value.name,
        value.amount,
        value.accountId,
        value.cycle,
        configuredCategory.builtinKey ?? "娱乐",
        configuredCategory.name,
        value.nextChargeDate,
        id,
        value.ledgerId,
      )
      .run();
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
    const ledgerId = Number(url.searchParams.get("ledger"));
    if (!Number.isInteger(id) || id <= 0) throw new Error("续费项目不存在");
    if (!Number.isInteger(ledgerId) || ledgerId <= 0)
      throw new Error("账本不存在");
    await claimAndRequireLedger(request, ledgerId);
    const db = getDbBinding();
    const row = await db.prepare("SELECT uuid FROM subscriptions WHERE id=? AND ledger_id=?").bind(id, ledgerId).first<{ uuid: string }>();
    if (!row) throw new Error("续费项目不存在");
    await db.batch([
      db.prepare("INSERT OR REPLACE INTO sync_tombstones(entity_type,entity_uuid,ledger_id,deleted_at) VALUES('subscription',?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))").bind(row.uuid, ledgerId),
      db.prepare("DELETE FROM subscriptions WHERE id=? AND ledger_id=?").bind(id, ledgerId),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return accessErrorResponse(error, "删除失败");
  }
}
