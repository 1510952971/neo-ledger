import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../db";
import { accessErrorResponse, claimAndRequireLedger, guardedApiResponse } from "../../api-security";
import { readCategoryBudgetInput } from "../../internal-api-contract";
import { MAX_CATEGORY_COUNT } from "../../category-limits";
import { calculateBudgetCarryover } from "../../category-budget-rollover.js";

const RATE_SQL = "(CASE t.currency WHEN 'USD' THEN 7.2 WHEN 'JPY' THEN 0.0462 WHEN 'EUR' THEN 7.85 ELSE 1 END)";

function validDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function localMonthStartUtc(month: string, offsetMinutes: number) {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1, 1) - offsetMinutes * 60_000)
    .toISOString();
}

function monthModifier(offsetMinutes: number) {
  return `${offsetMinutes >= 0 ? "+" : ""}${offsetMinutes} minutes`;
}

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, private, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  return NextResponse.json(body, { ...init, headers });
}

export async function GET(request: Request) {
  return guardedApiResponse(request, "读取分类预算失败", async () => {
    await ensureDb();
    const url = new URL(request.url);
    const ledgerId = Number(url.searchParams.get("ledger") || 1);
    await claimAndRequireLedger(request, ledgerId);
    const db = getDbBinding();
    const offsetMinutes = Number(url.searchParams.get("offset") ?? 480);
    if (!Number.isInteger(offsetMinutes) || offsetMinutes < -840 || offsetMinutes > 840) {
      throw new Error("offset 无效");
    }
    const shiftedNow = new Date(Date.now() + offsetMinutes * 60_000);
    const today = url.searchParams.get("today") || shiftedNow.toISOString().slice(0, 10);
    if (!validDateKey(today)) throw new Error("today 格式无效");
    const currentMonth = today.slice(0, 7);
    const total = await db
      .prepare("SELECT COUNT(*) count FROM category_budgets WHERE ledger_id=?")
      .bind(ledgerId)
      .first<{ count: number }>();
    const rows = await db
      .prepare(
        "SELECT ledger_id ledgerId,category,amount,updated_at updatedAt,carryover_enabled carryoverEnabled,strftime('%Y-%m',datetime(updated_at,?)) updatedMonth FROM category_budgets WHERE ledger_id=? ORDER BY category LIMIT ?",
      )
      .bind(monthModifier(offsetMinutes), ledgerId, MAX_CATEGORY_COUNT)
      .all();
    const budgetRows = rows.results as Array<{
      ledgerId: number;
      category: string;
      amount: number;
      updatedAt: string;
      carryoverEnabled: number | boolean;
      updatedMonth: string | null;
    }>;
    const currentStart = localMonthStartUtc(currentMonth, offsetMinutes);
    const firstMonth = budgetRows
      .filter((row) => Boolean(row.carryoverEnabled) && row.updatedMonth)
      .map((row) => row.updatedMonth as string)
      .sort()[0];
    const spending = new Map<string, Map<string, number>>();
    if (firstMonth && firstMonth < currentMonth) {
      const start = localMonthStartUtc(firstMonth, offsetMinutes);
      const monthlyRows = await db.prepare(`
        SELECT COALESCE(t.category_dynamic,t.category,'未分类') category,
          strftime('%Y-%m',datetime(t.occurred_at,?)) month,
          COALESCE(SUM(t.amount*${RATE_SQL}),0) amount
        FROM transactions t
        WHERE t.ledger_id=? AND t.type='支出' AND t.exclude_from_budget=0
          AND t.occurred_at>=? AND t.occurred_at<?
        GROUP BY COALESCE(t.category_dynamic,t.category,'未分类'),strftime('%Y-%m',datetime(t.occurred_at,?))
      `).bind(
        monthModifier(offsetMinutes),
        ledgerId,
        start,
        currentStart,
        monthModifier(offsetMinutes),
      ).all<{ category: string; month: string; amount: number }>();
      for (const row of monthlyRows.results) {
        const byMonth = spending.get(row.category) ?? new Map<string, number>();
        byMonth.set(row.month, Math.round(Number(row.amount)));
        spending.set(row.category, byMonth);
      }
    }
    const response = privateJson(budgetRows.map((row) => {
      const carryoverAmount = calculateBudgetCarryover({
        monthlyAmount: Number(row.amount),
        enabled: Boolean(row.carryoverEnabled),
        updatedMonth: row.updatedMonth,
        currentMonth,
        spendingByMonth: spending.get(row.category) ?? new Map(),
      });
      return {
        ...row,
        carryoverEnabled: Boolean(row.carryoverEnabled),
        carryoverAmount,
        availableAmount: Number(row.amount) + carryoverAmount,
      };
    }));
    const totalCount = Number(total?.count ?? 0);
    response.headers.set("X-Total-Count", String(totalCount));
    response.headers.set("X-Has-More", totalCount > MAX_CATEGORY_COUNT ? "1" : "0");
    return response;
  });
}

export async function PUT(request: Request) {
  try {
    await ensureDb();
    const body = await readCategoryBudgetInput(request);
    const ledgerId = body.ledgerId;
    await claimAndRequireLedger(request, ledgerId);
    const category = body.category;
    const valid = await getDbBinding()
      .prepare(
        "SELECT id FROM expense_categories WHERE ledger_id=? AND name=? AND is_active=1",
      )
      .bind(ledgerId, category)
      .first();
    if (!valid) throw new Error("分类不存在或已停用");
    const amount = Math.round(body.amount * 100);
    const carryoverEnabled = body.carryoverEnabled;
    await getDbBinding()
      .prepare(
        "INSERT INTO category_budgets(ledger_id,category,amount,carryover_enabled,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(ledger_id,category) DO UPDATE SET amount=excluded.amount,carryover_enabled=COALESCE(?,category_budgets.carryover_enabled),updated_at=CURRENT_TIMESTAMP",
      )
      .bind(
        ledgerId,
        category,
        amount,
        carryoverEnabled ? 1 : 0,
        carryoverEnabled == null ? null : carryoverEnabled ? 1 : 0,
      )
      .run();
    return privateJson({ ok: true });
  } catch (error) {
    return accessErrorResponse(error, "保存失败", request);
  }
}
