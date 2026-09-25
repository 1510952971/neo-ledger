import { NextResponse } from "next/server";
import { ensureDb, getDbBinding, processDueRecurringTasks } from "../../../db";
import { ApiAccessError, accessErrorResponse, claimAndRequireLedger, guardedApiResponse } from "../../api-security";
import { readJsonWithLimit } from "../../request-limits";
import { normalizeRecurringTask, nextRecurringTaskDate } from "../../recurring-task-core.js";
import { dateKeyInZone } from "../../time-money.js";

const MAX_TASKS = 200;

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, private, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  return NextResponse.json(body, { ...init, headers });
}

async function readBody(request: Request) {
  const body = await readJsonWithLimit<Record<string, unknown>>(request, 16 * 1024);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiAccessError("周期任务请求格式无效", 400);
  }
  return body;
}

async function readTask(request: Request) {
  try {
    return normalizeRecurringTask(await readBody(request));
  } catch (error) {
    if (error instanceof ApiAccessError) throw error;
    throw new ApiAccessError(error instanceof Error ? error.message : "周期任务参数无效", 400);
  }
}

async function validateReferences(value: ReturnType<typeof normalizeRecurringTask>) {
  const db = getDbBinding();
  const [account, category] = await Promise.all([
    db.prepare("SELECT id FROM accounts WHERE id=? AND ledger_id=? AND type='资产' AND is_active=1")
      .bind(value.accountId, value.ledgerId).first(),
    db.prepare(`SELECT name,builtin_key AS builtinKey FROM ${value.type === "支出" ? "expense_categories" : "income_categories"} WHERE ledger_id=? AND name=? AND is_active=1`)
      .bind(value.ledgerId, value.category).first<{ name: string; builtinKey: string | null }>(),
  ]);
  if (!account) throw new ApiAccessError("请选择当前账本中启用的资产账户", 400);
  if (!category) throw new ApiAccessError("请选择当前账本中启用的收支分类", 400);
  return category;
}

export async function GET(request: Request) {
  return guardedApiResponse(request, "读取周期任务失败", async () => {
    await ensureDb();
    const requestedLedger = Number(new URL(request.url).searchParams.get("ledger"));
    const ledgerId = Number.isInteger(requestedLedger) && requestedLedger > 0 ? requestedLedger : 1;
    await claimAndRequireLedger(request, ledgerId);
    await processDueRecurringTasks(ledgerId);
    const db = getDbBinding();
    const [rows, total] = await Promise.all([
      db.prepare("SELECT id,uuid,ledger_id AS ledgerId,name,amount,type,account_id AS accountId,cycle,category_dynamic AS category,next_run_date AS nextRunDate,reminder_days AS reminderDays,is_paused AS isPaused,created_at AS createdAt,updated_at AS updatedAt FROM recurring_tasks WHERE ledger_id=? ORDER BY is_paused,next_run_date,id LIMIT ?")
        .bind(ledgerId, MAX_TASKS).all(),
      db.prepare("SELECT COUNT(*) count FROM recurring_tasks WHERE ledger_id=?").bind(ledgerId).first<{ count: number }>(),
    ]);
    const response = privateJson(rows.results.map((row) => ({ ...row, isPaused: Number((row as { isPaused?: unknown }).isPaused ?? 0) === 1 })));
    const count = Number(total?.count ?? 0);
    response.headers.set("X-Total-Count", String(count));
    response.headers.set("X-Has-More", count > MAX_TASKS ? "1" : "0");
    return response;
  });
}

export async function POST(request: Request) {
  try {
    await ensureDb();
    const value = await readTask(request);
    await claimAndRequireLedger(request, value.ledgerId);
    const db = getDbBinding();
    const count = await db.prepare("SELECT COUNT(*) count FROM recurring_tasks WHERE ledger_id=?").bind(value.ledgerId).first<{ count: number }>();
    if (Number(count?.count ?? 0) >= MAX_TASKS) throw new ApiAccessError(`周期任务最多 ${MAX_TASKS} 个`, 409);
    const category = await validateReferences(value);
    await db.prepare("INSERT INTO recurring_tasks(uuid,ledger_id,name,amount,type,account_id,cycle,category,category_dynamic,next_run_date,reminder_days) VALUES(lower(hex(randomblob(16))),?,?,?,?,?,?,?,?,?,?)")
      .bind(value.ledgerId, value.name, value.amount, value.type, value.accountId, value.cycle, category.builtinKey ?? category.name, category.name, value.nextRunDate, value.reminderDays).run();
    return privateJson({ ok: true }, { status: 201 });
  } catch (error) {
    return accessErrorResponse(error, "创建周期任务失败", request);
  }
}

export async function PUT(request: Request) {
  try {
    await ensureDb();
    const body = await readBody(request);
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) throw new ApiAccessError("周期任务不存在", 400);
    let value: ReturnType<typeof normalizeRecurringTask>;
    try {
      value = normalizeRecurringTask(body);
    } catch (error) {
      throw new ApiAccessError(error instanceof Error ? error.message : "周期任务参数无效", 400);
    }
    await claimAndRequireLedger(request, value.ledgerId);
    const db = getDbBinding();
    const current = await db.prepare("SELECT id FROM recurring_tasks WHERE id=? AND ledger_id=?").bind(id, value.ledgerId).first();
    if (!current) throw new ApiAccessError("周期任务不存在", 404);
    const category = await validateReferences(value);
    await db.prepare("UPDATE recurring_tasks SET name=?,amount=?,type=?,account_id=?,cycle=?,category=?,category_dynamic=?,next_run_date=?,reminder_days=? WHERE id=? AND ledger_id=?")
      .bind(value.name, value.amount, value.type, value.accountId, value.cycle, category.builtinKey ?? category.name, category.name, value.nextRunDate, value.reminderDays, id, value.ledgerId).run();
    return privateJson({ ok: true });
  } catch (error) {
    return accessErrorResponse(error, "修改周期任务失败", request);
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureDb();
    const body = await readBody(request);
    const id = Number(body.id);
    const ledgerId = Number(body.ledgerId);
    if (Object.keys(body).some((key) => !["id", "ledgerId", "paused"].includes(key)) || !Number.isInteger(id) || id <= 0 || !Number.isInteger(ledgerId) || ledgerId <= 0 || typeof body.paused !== "boolean") {
      throw new ApiAccessError("周期任务状态参数无效", 400);
    }
    await claimAndRequireLedger(request, ledgerId);
    const db = getDbBinding();
    const task = await db.prepare("SELECT is_paused AS isPaused,next_run_date AS nextRunDate,cycle FROM recurring_tasks WHERE id=? AND ledger_id=?")
      .bind(id, ledgerId).first<{ isPaused: number; nextRunDate: string; cycle: string }>();
    if (!task) throw new ApiAccessError("周期任务不存在", 404);
    let nextRunDate = task.nextRunDate;
    if (!body.paused && Number(task.isPaused) === 1) {
      const today = dateKeyInZone(new Date(), "Asia/Shanghai");
      let guard = 0;
      while (nextRunDate <= today && guard++ < 10_000) nextRunDate = nextRecurringTaskDate(nextRunDate, task.cycle);
    }
    await db.prepare("UPDATE recurring_tasks SET is_paused=?,next_run_date=? WHERE id=? AND ledger_id=?")
      .bind(body.paused ? 1 : 0, nextRunDate, id, ledgerId).run();
    return privateJson({ ok: true, paused: body.paused, nextRunDate });
  } catch (error) {
    return accessErrorResponse(error, "更新周期任务状态失败", request);
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureDb();
    const query = new URL(request.url).searchParams;
    const id = Number(query.get("id"));
    const ledgerId = Number(query.get("ledger"));
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(ledgerId) || ledgerId <= 0) throw new ApiAccessError("周期任务不存在", 400);
    await claimAndRequireLedger(request, ledgerId);
    const db = getDbBinding();
    const task = await db.prepare("SELECT uuid FROM recurring_tasks WHERE id=? AND ledger_id=?").bind(id, ledgerId).first<{ uuid: string }>();
    if (!task) throw new ApiAccessError("周期任务不存在", 404);
    await db.batch([
      db.prepare("INSERT OR REPLACE INTO sync_tombstones(entity_type,entity_uuid,ledger_id,deleted_at) VALUES('recurring-task',?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))").bind(task.uuid, ledgerId),
      db.prepare("DELETE FROM recurring_tasks WHERE id=? AND ledger_id=?").bind(id, ledgerId),
    ]);
    return privateJson({ ok: true });
  } catch (error) {
    return accessErrorResponse(error, "删除周期任务失败", request);
  }
}
