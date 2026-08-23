import { NextResponse } from "next/server";
import { ensureDb, evaluateAchievements, getDbBinding } from "../../../db";
import { accessErrorResponse, claimAndRequireLedger, guardedApiResponse } from "../../api-security";
import { matchAutomationRule, type AutomationRule } from "../../automation-engine";
import { readPendingTransactionInput } from "../../internal-api-contract";

const AUTOMATION_RULE_LIMIT = 200;

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, private, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  return NextResponse.json(body, { ...init, headers });
}

function decodeRules(rows: Array<Record<string, unknown>>) {
  return rows.map((row) => {
    try {
      return {
        id: String(row.id),
        name: String(row.name),
        conditions: JSON.parse(String(row.conditionsJson)),
        actions: JSON.parse(String(row.actionsJson)),
      } as AutomationRule;
    } catch {
      return null;
    }
  }).filter((rule): rule is AutomationRule => Boolean(rule));
}

async function enabledRules(ownerId: string, ledgerId: number) {
  const rows = await getDbBinding().prepare(
    "SELECT id,name,conditions_json conditionsJson,actions_json actionsJson FROM automation_rules WHERE owner_id=? AND ledger_id=? AND enabled=1 ORDER BY priority,id LIMIT ?",
  ).bind(ownerId, ledgerId, AUTOMATION_RULE_LIMIT).all();
  return decodeRules(rows.results as Array<Record<string, unknown>>);
}
export async function GET(request: Request) {
  return guardedApiResponse(request, "读取待确认流水失败", async () => {
    await ensureDb();
    const url = new URL(request.url);
    const ledgerId = Number(url.searchParams.get("ledger") || 1);
    const rawLimit = Number(url.searchParams.get("limit") || 100);
    if (!Number.isSafeInteger(rawLimit) || rawLimit < 1 || rawLimit > 100)
      throw new Error("limit 必须介于 1 和 100 之间");
    const ownerId = await claimAndRequireLedger(request, ledgerId);
    const db = getDbBinding();
    const total = await db
      .prepare("SELECT COUNT(*) count FROM pending_transactions WHERE ledger_id=? AND status='待确认'")
      .bind(ledgerId)
      .first<{ count: number }>();
    const rows = await db
      .prepare(
        "SELECT p.id,p.raw_text rawText,p.title,p.amount,p.type,p.account_id accountId,p.currency,p.occurred_at occurredAt,p.status,p.created_at createdAt,a.name accountName FROM pending_transactions p JOIN accounts a ON a.id=p.account_id WHERE p.ledger_id=? AND p.status='待确认' ORDER BY p.id DESC LIMIT ?",
      )
      .bind(ledgerId, rawLimit)
      .all();
    const rules = await enabledRules(ownerId, ledgerId);
    const response = privateJson(rows.results.map((row) => ({
      ...row,
      automationSuggestion: matchAutomationRule({
        rawText: String(row.rawText), title: String(row.title), amount: Number(row.amount), accountId: Number(row.accountId),
      }, rules),
    })));
    response.headers.set("X-Total-Count", String(Number(total?.count ?? 0)));
    response.headers.set("X-Has-More", Number(total?.count ?? 0) > rawLimit ? "true" : "false");
    return response;
  });
}
export async function PATCH(request: Request) {
  try {
    await ensureDb();
    const body = await readPendingTransactionInput(request);
    const id = body.id,
      db = getDbBinding(),
      row = await db
        .prepare(
          "SELECT * FROM pending_transactions WHERE id=? AND status='待确认'",
        )
        .bind(id)
        .first<{
          id: number;
          ledger_id: number;
          title: string;
          amount: number;
          type: string;
          account_id: number;
          currency: string;
          occurred_at: string;
          balance_applied: number;
        }>();
    if (!row) return privateJson({ error: "待确认流水已处理或不存在" }, { status: 409 });
    const ownerId = await claimAndRequireLedger(request, row.ledger_id);
    const claimed = await db.prepare("UPDATE pending_transactions SET status='处理中' WHERE id=? AND status='待确认'").bind(id).run();
    if (!Number(claimed.meta.changes)) return privateJson({ error: "待确认流水已被其他请求处理，请刷新后重试" }, { status: 409 });
    let keepClaim = true;
    const restoreClaim = async () => {
      if (!keepClaim) return;
      keepClaim = false;
      await db.prepare("UPDATE pending_transactions SET status='待确认' WHERE id=? AND status='处理中'").bind(id).run();
    };
    if (body.action === "ignore") {
      try {
        const results = await db.batch([
          db.prepare("UPDATE accounts SET current_balance=current_balance+? WHERE id=? AND ledger_id=? AND EXISTS (SELECT 1 FROM pending_transactions WHERE id=? AND status='处理中')").bind(row.type === "支出" ? row.amount : -row.amount, row.account_id, row.ledger_id, id),
          db.prepare("UPDATE pending_transactions SET status='已忽略' WHERE id=? AND status='处理中'").bind(id),
        ]);
        if (Number(results.at(-1)?.meta.changes ?? 0) !== 1) throw new Error("待确认流水状态已变化，请重试");
        keepClaim = false;
        return privateJson({ ok: true });
      } catch (error) {
        await restoreClaim();
        throw error;
      }
    }
    try {
      const suggestion = matchAutomationRule({ rawText: String((row as { raw_text?: string }).raw_text ?? ""), title: row.title, amount: row.amount, accountId: row.account_id }, await enabledRules(ownerId, row.ledger_id));
    const suggestedAccountId = Number(suggestion?.actions.accountId ?? row.account_id);
    const targetAccount = await db.prepare("SELECT id,currency FROM accounts WHERE id=? AND ledger_id=?").bind(suggestedAccountId, row.ledger_id).first<{ id: number; currency: string }>();
    if (!targetAccount || targetAccount.currency !== row.currency) throw new Error("规则建议账户不存在或币种不一致");
    const requestedCategory = String(body.category || suggestion?.actions.category || "");
    const configuredCategory = row.type === "支出"
      ? await db.prepare("SELECT name,builtin_key builtinKey FROM expense_categories WHERE ledger_id=? AND name=? AND is_active=1").bind(row.ledger_id, requestedCategory).first<{ name: string; builtinKey: string | null }>()
      : null;
    const configuredIncomeCategory = row.type === "收入"
      ? await db.prepare("SELECT name,builtin_key builtinKey FROM income_categories WHERE ledger_id=? AND is_active=1 ORDER BY CASE WHEN name=? THEN 0 WHEN builtin_key='其它收入' THEN 1 ELSE 2 END,sort_order,id LIMIT 1").bind(row.ledger_id, String(suggestion?.actions.incomeCategory || "")).first<{ name: string; builtinKey: string | null }>()
      : null;
    if (row.type === "支出" && !configuredCategory) throw new Error("请选择正确分类");
    if (row.type === "收入" && !configuredIncomeCategory) throw new Error("请先添加收入分类");
    const statements = [
      db
        .prepare(
          "INSERT INTO transactions(ledger_id,title,amount,type,mood,category,category_dynamic,income_category,income_category_dynamic,account_id,currency,original_amount,original_currency,exchange_rate_micros,original_timezone,occurred_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,1000000,'legacy/unknown',? WHERE EXISTS (SELECT 1 FROM pending_transactions WHERE id=? AND status='处理中')",
        )
        .bind(
          row.ledger_id,
          row.title,
          row.amount,
          row.type,
          row.type === "支出" ? (suggestion?.actions.mood ?? "刚需") : null,
          row.type === "支出" ? configuredCategory?.builtinKey : null,
          row.type === "支出" ? configuredCategory?.name : null,
          row.type === "收入" ? configuredIncomeCategory?.builtinKey : null,
          row.type === "收入" ? configuredIncomeCategory?.name : null,
          targetAccount.id,
          row.currency,
          row.amount,
          row.currency,
          row.occurred_at,
          id,
        ),
    ];
    if (targetAccount.id !== row.account_id) statements.push(
      db.prepare("UPDATE accounts SET current_balance=current_balance+? WHERE id=? AND ledger_id=? AND EXISTS (SELECT 1 FROM pending_transactions WHERE id=? AND status='处理中')").bind(row.type === "支出" ? row.amount : -row.amount, row.account_id, row.ledger_id, id),
      db.prepare("UPDATE accounts SET current_balance=current_balance+? WHERE id=? AND ledger_id=? AND EXISTS (SELECT 1 FROM pending_transactions WHERE id=? AND status='处理中')").bind(row.type === "支出" ? -row.amount : row.amount, targetAccount.id, row.ledger_id, id),
    );
      statements.push(db.prepare("UPDATE pending_transactions SET status='已确认' WHERE id=? AND status='处理中'").bind(id));
      const results = await db.batch(statements);
      if (Number(results.at(-1)?.meta.changes ?? 0) !== 1) throw new Error("待确认流水状态已变化，请重试");
      keepClaim = false;
      await evaluateAchievements(row.ledger_id);
      return privateJson({ ok: true, appliedRule: suggestion ? { ruleId: suggestion.ruleId, ruleName: suggestion.ruleName, reasons: suggestion.reasons } : null });
    } catch (error) {
      await restoreClaim();
      throw error;
    }
  } catch (error) {
    return accessErrorResponse(error, "处理失败", request);
  }
}
