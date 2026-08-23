import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../../db";
import { ApiAccessError, accessErrorResponse, claimAndRequireLedger } from "../../../api-security";
import { requireSameOrigin } from "../../../auth";
import { recordAuditEvent, requestIdFromRequest } from "../../../audit-log";
import { readAutomationCreateInput, readAutomationDeleteInput, readAutomationUpdateInput } from "../../../internal-api-contract";

export const AUTOMATION_RULE_LIMIT = 200;

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, private, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  return NextResponse.json(body, { ...init, headers });
}

type RuleConditions = {
  merchantContains?: string;
  source?: string;
  minAmount?: number;
  maxAmount?: number;
  accountId?: number;
};
type RuleActions = { category?: string; incomeCategory?: string; mood?: "悦己" | "刚需" | "冲动"; accountId?: number };

function normalizeConditions(value: unknown): RuleConditions {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const result: RuleConditions = {};
  if (typeof input.merchantContains === "string" && input.merchantContains.trim()) result.merchantContains = input.merchantContains.trim().slice(0, 80);
  if (typeof input.source === "string" && input.source.trim()) result.source = input.source.trim().slice(0, 40);
  if (input.minAmount != null && Number.isFinite(Number(input.minAmount))) result.minAmount = Math.round(Number(input.minAmount) * 100);
  if (input.maxAmount != null && Number.isFinite(Number(input.maxAmount))) result.maxAmount = Math.round(Number(input.maxAmount) * 100);
  if (input.accountId != null && Number.isInteger(Number(input.accountId))) result.accountId = Number(input.accountId);
  if (result.minAmount != null && result.maxAmount != null && result.minAmount > result.maxAmount) throw new Error("金额范围无效");
  if (!Object.keys(result).length) throw new Error("至少设置一个匹配条件");
  return result;
}

function normalizeActions(value: unknown): RuleActions {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const result: RuleActions = {};
  if (typeof input.category === "string" && input.category.trim()) result.category = input.category.trim().slice(0, 40);
  if (typeof input.incomeCategory === "string" && input.incomeCategory.trim()) result.incomeCategory = input.incomeCategory.trim().slice(0, 40);
  if (["悦己", "刚需", "冲动"].includes(String(input.mood))) result.mood = input.mood as RuleActions["mood"];
  if (input.accountId != null && Number.isInteger(Number(input.accountId))) result.accountId = Number(input.accountId);
  if (!Object.keys(result).length) throw new Error("至少设置一个自动处理动作");
  return result;
}

function decodeJson(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function validateActions(ledgerId: number, actions: RuleActions) {
  const db = getDbBinding();
  if (actions.category && !(await db.prepare("SELECT id FROM expense_categories WHERE ledger_id=? AND name=? AND is_active=1").bind(ledgerId, actions.category).first()))
    throw new Error("规则消费分类不存在");
  if (actions.incomeCategory && !(await db.prepare("SELECT id FROM income_categories WHERE ledger_id=? AND name=? AND is_active=1").bind(ledgerId, actions.incomeCategory).first()))
    throw new Error("规则收入分类不存在");
  if (actions.accountId && !(await db.prepare("SELECT id FROM accounts WHERE ledger_id=? AND id=?").bind(ledgerId, actions.accountId).first()))
    throw new Error("规则账户不存在");
}

export async function GET(request: Request) {
  try {
    await ensureDb();
    const ledgerId = Number(new URL(request.url).searchParams.get("ledger"));
    const ownerId = await claimAndRequireLedger(request, ledgerId);
    const db = getDbBinding();
    const total = await db
      .prepare("SELECT COUNT(*) count FROM automation_rules WHERE owner_id=? AND ledger_id=?")
      .bind(ownerId, ledgerId)
      .first<{ count: number }>();
    const rows = await db
      .prepare("SELECT id,name,priority,enabled,conditions_json conditionsJson,actions_json actionsJson,created_at createdAt,updated_at updatedAt FROM automation_rules WHERE owner_id=? AND ledger_id=? ORDER BY priority,id LIMIT ?")
      .bind(ownerId, ledgerId, AUTOMATION_RULE_LIMIT)
      .all();
    const totalCount = Number(total?.count ?? 0);
    const response = privateJson(rows.results.map((row) => ({ ...row, conditions: decodeJson(String(row.conditionsJson ?? "{}")), actions: decodeJson(String(row.actionsJson ?? "{}")), conditionsJson: undefined, actionsJson: undefined })));
    response.headers.set("X-Total-Count", String(totalCount));
    response.headers.set("X-Has-More", totalCount > AUTOMATION_RULE_LIMIT ? "1" : "0");
    return response;
  } catch (error) {
    return accessErrorResponse(error, "读取自动化规则失败", request);
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await ensureDb();
    const body = await readAutomationCreateInput(request);
    const ledgerId = body.ledgerId;
    const ownerId = await claimAndRequireLedger(request, ledgerId);
    const count = await getDbBinding()
      .prepare("SELECT COUNT(*) count FROM automation_rules WHERE owner_id=? AND ledger_id=?")
      .bind(ownerId, ledgerId)
      .first<{ count: number }>();
    if (Number(count?.count ?? 0) >= AUTOMATION_RULE_LIMIT)
      throw new ApiAccessError(`自动化规则最多 ${AUTOMATION_RULE_LIMIT} 条`, 409);
    const name = body.name;
    const conditions = normalizeConditions(body.conditions);
    const actions = normalizeActions(body.actions);
    await validateActions(ledgerId, actions);
    const id = crypto.randomUUID();
    await getDbBinding().prepare("INSERT INTO automation_rules(id,owner_id,ledger_id,name,priority,enabled,conditions_json,actions_json) VALUES(?,?,?,?,?,?,?,?)").bind(id, ownerId, ledgerId, name, body.priority, body.enabled ? 1 : 0, JSON.stringify(conditions), JSON.stringify(actions)).run();
    await recordAuditEvent({ ownerId, eventType: "automation.rule_create", subjectType: "rule", subjectId: id, requestId: requestIdFromRequest(request), metadata: { enabled: Boolean(body.enabled) } });
    return privateJson({ ok: true, id, conditions, actions }, { status: 201 });
  } catch (error) {
    return accessErrorResponse(error, "创建自动化规则失败", request);
  }
}

export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request);
    await ensureDb();
    const body = await readAutomationUpdateInput(request);
    const ledgerId = body.ledgerId;
    const ownerId = await claimAndRequireLedger(request, ledgerId);
    const existing = await getDbBinding().prepare("SELECT id,name,priority,enabled,conditions_json conditionsJson,actions_json actionsJson FROM automation_rules WHERE id=? AND owner_id=? AND ledger_id=?").bind(body.id, ownerId, ledgerId).first<{ id: string; name: string; priority: number; enabled: number; conditionsJson: string; actionsJson: string }>();
    if (!existing) throw new Error("规则不存在");
    const conditions = body.conditions === undefined ? decodeJson(existing.conditionsJson) : normalizeConditions(body.conditions);
    const actions = body.actions === undefined ? decodeJson(existing.actionsJson) : normalizeActions(body.actions);
    await validateActions(ledgerId, actions as RuleActions);
    await getDbBinding().prepare("UPDATE automation_rules SET name=?,priority=?,enabled=?,conditions_json=?,actions_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_id=? AND ledger_id=?").bind(body.name ?? existing.name, body.priority ?? existing.priority, body.enabled === undefined ? existing.enabled : body.enabled ? 1 : 0, JSON.stringify(conditions), JSON.stringify(actions), existing.id, ownerId, ledgerId).run();
    await recordAuditEvent({ ownerId, eventType: "automation.rule_update", subjectType: "rule", subjectId: existing.id, requestId: requestIdFromRequest(request) });
    return privateJson({ ok: true, id: existing.id, conditions, actions });
  } catch (error) {
    return accessErrorResponse(error, "更新自动化规则失败", request);
  }
}

export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    await ensureDb();
    const body = await readAutomationDeleteInput(request);
    const ledgerId = body.ledgerId;
    const ownerId = await claimAndRequireLedger(request, ledgerId);
    const result = await getDbBinding().prepare("DELETE FROM automation_rules WHERE id=? AND owner_id=? AND ledger_id=?").bind(body.id, ownerId, ledgerId).run();
    if (!result.meta.changes) throw new Error("规则不存在");
    await recordAuditEvent({ ownerId, eventType: "automation.rule_delete", subjectType: "rule", subjectId: body.id, requestId: requestIdFromRequest(request) });
    return privateJson({ ok: true });
  } catch (error) {
    return accessErrorResponse(error, "删除自动化规则失败", request);
  }
}
