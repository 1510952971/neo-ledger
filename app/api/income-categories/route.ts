import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../db";
import { ApiAccessError, accessErrorResponse, claimAndRequireLedger, guardedApiResponse } from "../../api-security";
import {
  readIncomeCategoryCreateInput,
  readIncomeCategoryUpdateInput,
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
  return guardedApiResponse(request, "读取收入分类失败", async () => {
    await ensureDb();
    const ledgerId = Number(new URL(request.url).searchParams.get("ledger") || 1);
    await claimAndRequireLedger(request, ledgerId);
    const db = getDbBinding();
    const total = await db.prepare("SELECT COUNT(*) count FROM income_categories WHERE ledger_id=?").bind(ledgerId).first<{ count: number }>();
    const rows = await db
      .prepare(
        "SELECT id,ledger_id ledgerId,name,icon,color,builtin_key builtinKey,is_system isSystem,is_active isActive,sort_order sortOrder,created_at createdAt FROM income_categories WHERE ledger_id=? ORDER BY is_active DESC,sort_order,id LIMIT ?",
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
    const body = await readIncomeCategoryCreateInput(request);
    const ledgerId = body.ledgerId,
      { name, icon, color } = body,
      db = getDbBinding();
    await claimAndRequireLedger(request, ledgerId);
    const count = await db.prepare("SELECT COUNT(*) count FROM income_categories WHERE ledger_id=?").bind(ledgerId).first<{ count: number }>();
    if (Number(count?.count ?? 0) >= MAX_CATEGORY_COUNT)
      throw new ApiAccessError("收入分类最多 " + MAX_CATEGORY_COUNT + " 个", 409);
    const exists = await db
      .prepare("SELECT id FROM income_categories WHERE ledger_id=? AND name=?")
      .bind(ledgerId, name)
      .first();
    if (exists) throw new Error("这个收入分类已经存在");
    const result = await db
      .prepare(
        "INSERT INTO income_categories(ledger_id,name,icon,color,sort_order) VALUES(?,?,?,?,(SELECT COALESCE(MAX(sort_order),0)+10 FROM income_categories WHERE ledger_id=?))",
      )
      .bind(ledgerId, name, icon, color, ledgerId)
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
    const body = await readIncomeCategoryUpdateInput(request);
    const id = body.id,
      ledgerId = body.ledgerId,
      { name, icon, color } = body,
      db = getDbBinding();
    await claimAndRequireLedger(request, ledgerId);
    const current = await db
      .prepare("SELECT name FROM income_categories WHERE id=? AND ledger_id=?")
      .bind(id, ledgerId)
      .first<{ name: string }>();
    if (!current) throw new Error("收入分类不存在");
    const duplicate = await db
      .prepare(
        "SELECT id FROM income_categories WHERE ledger_id=? AND name=? AND id<>?",
      )
      .bind(ledgerId, name, id)
      .first();
    if (duplicate) throw new Error("这个收入分类已经存在");
    await db.batch([
      db
        .prepare(
          "UPDATE income_categories SET name=?,icon=?,color=?,is_active=? WHERE id=? AND ledger_id=?",
        )
        .bind(name, icon, color, body.isActive === false ? 0 : 1, id, ledgerId),
      db
        .prepare(
          "UPDATE transactions SET income_category_dynamic=? WHERE ledger_id=? AND COALESCE(income_category_dynamic,income_category)=?",
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
    const url = new URL(request.url),
      id = Number(url.searchParams.get("id")),
      ledgerId = Number(url.searchParams.get("ledger") || 1),
      db = getDbBinding();
    await claimAndRequireLedger(request, ledgerId);
    const current = await db
      .prepare(
        "SELECT name,is_system isSystem FROM income_categories WHERE id=? AND ledger_id=?",
      )
      .bind(id, ledgerId)
      .first<{ name: string; isSystem: number }>();
    if (!current) throw new Error("收入分类不存在");
    if (current.isSystem) throw new Error("内置收入分类只支持重命名，不能删除");
    const active = await db
      .prepare(
        "SELECT COUNT(*) count FROM income_categories WHERE ledger_id=? AND is_active=1",
      )
      .bind(ledgerId)
      .first<{ count: number }>();
    if ((active?.count ?? 0) <= 1) throw new Error("至少保留一个收入分类");
    const usage = await db
      .prepare(
        "SELECT COUNT(*) count FROM transactions WHERE ledger_id=? AND COALESCE(income_category_dynamic,income_category)=?",
      )
      .bind(ledgerId, current.name)
      .first<{ count: number }>();
    if ((usage?.count ?? 0) === 0) {
      await db.prepare("DELETE FROM income_categories WHERE id=?").bind(id).run();
      return privateJson({ ok: true, removed: true });
    }
    await db
      .prepare("UPDATE income_categories SET is_active=0 WHERE id=?")
      .bind(id)
      .run();
    return privateJson({ ok: true, removed: false });
  } catch (error) {
    return accessErrorResponse(error, "删除失败", request);
  }
}
