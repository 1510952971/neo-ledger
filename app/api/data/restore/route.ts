import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../../db";
import { ApiAccessError, accessErrorResponse, requestOwnerId } from "../../../api-security";
import { requireSameOrigin } from "../../../auth";
import {
  MAX_RESTORE_BODY_BYTES,
  readJsonWithLimit,
} from "../../../request-limits";
import {
  acquireRestoreLock,
  createRestoreSnapshot,
  createRestoreStaging,
  deleteRestoreStaging,
  listRestoreSnapshots,
  loadRestoreSnapshot,
  loadRestoreStaging,
  releaseRestoreLock,
} from "../../../restore-snapshot";
import {
  estimateRestoreBatchStatements,
  MAX_RESTORE_BATCH_STATEMENTS,
} from "../../../restore-limits";
import { recordAuditEvent, requestIdFromRequest } from "../../../audit-log";
import { canonicalRestorePayload, fingerprintRestorePlan } from "../../../restore-plan";
type Row = Record<string, unknown>;

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, private, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  return NextResponse.json(body, { ...init, headers });
}

function dedupeNaturalRows(rows: Row[] | undefined, fields: string[]) {
  if (!rows) return rows;
  const winners = new Map<string, Row>();
  for (const row of rows) {
    const key = [row.ledgerSyncId ?? row.ledgerId, ...fields.map((field) => row[field])]
      .map((value) => String(value ?? ""))
      .join(":");
    const current = winners.get(key);
    const timestamp = String(row.updatedAt ?? row.createdAt ?? "");
    const currentTimestamp = String(current?.updatedAt ?? current?.createdAt ?? "");
    if (!current || timestamp > currentTimestamp) winners.set(key, row);
  }
  return [...winners.values()];
}

function dedupeCategoryRows(rows: Row[] | undefined) {
  if (!rows) return rows;
  const winners = new Map<string, Row>();
  for (const row of rows) {
    const key = `${String(row.ledgerSyncId ?? row.ledgerId ?? "")}:${String(row.builtinKey ?? row.name ?? "")}`;
    const current = winners.get(key);
    const timestamp = String(row.updatedAt ?? row.createdAt ?? "");
    const currentTimestamp = String(current?.updatedAt ?? current?.createdAt ?? "");
    if (!current || timestamp > currentTimestamp) winners.set(key, row);
  }
  return [...winners.values()];
}

function validateRestoreRows(data: Record<string, unknown>) {
  const arrays = Object.entries(data).filter(([, value]) => Array.isArray(value)) as Array<[string, unknown[]]>;
  for (const [name, rows] of arrays) {
    if (rows.length > 500_000) throw new Error(`${name} 条目过多，恢复已取消`);
    for (const row of rows) if (!row || typeof row !== "object") throw new Error(`${name} 包含无效条目`);
  }
  const idTables = [
    "ledgers",
    "accounts",
    "members",
    "transactions",
    "subscriptions",
    "savingsGoals",
    "installments",
    "digitalAssets",
    "expenseCategories",
    "incomeCategories",
    "pendingTransactions",
    "systemNotifications",
    "sideHustleDeductions",
  ] as const;
  const ids = new Map<string, Set<number>>();
  for (const key of idTables) {
    const rows = (data[key] as Row[]) ?? [];
    const values = rows.map((row) => Number(row.id));
    if (
      values.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
      new Set(values).size !== values.length
    )
      throw new Error(`${key} 编号重复或无效`);
    ids.set(key, new Set(values));
  }
  const ledgerIds = ids.get("ledgers") ?? new Set<number>();
  const accounts = (data.accounts as Row[]) ?? [];
  const accountIds = ids.get("accounts") ?? new Set<number>();
  const memberIds = ids.get("members") ?? new Set<number>();
  const transactionIds = ids.get("transactions") ?? new Set<number>();
  const requireLedger = (row: Row, label: string) => {
    if (!ledgerIds.has(Number(row.ledgerId))) throw new Error(`${label}归属了不存在的账本`);
  };
  for (const key of [
    "categoryBudgets", "subscriptions", "savingsGoals", "members", "installments",
    "achievements", "sideHustleDeductions", "pendingTransactions", "systemNotifications",
    "fireSettings", "economicSettings", "crdtTombstones", "digitalAssets", "expenseCategories",
    "incomeCategories", "accountTransfers", "syncTombstones", "transactionReconciliation", "automationRules",
  ]) {
    for (const row of ((data[key] as Row[]) ?? [])) requireLedger(row, key);
  }
  for (const row of ((data.budgetSettings as Row[]) ?? [])) {
    if (!ledgerIds.has(Number(row.id))) throw new Error("备份预算设置归属了不存在的账本");
  }
  for (const row of accounts) {
    if (!ledgerIds.has(Number(row.ledgerId)))
      throw new Error("备份账户归属无效");
    if (!["资产", "负债"].includes(String(row.type)))
      throw new Error("备份包含无效账户类型");
    if (row.currency != null && !["CNY", "USD", "JPY", "EUR"].includes(String(row.currency)))
      throw new Error("备份包含无效账户币种");
    if (row.assetClass != null && !["现金流", "固收防守", "风险进攻"].includes(String(row.assetClass)))
      throw new Error("备份包含无效资产分类");
  }
  for (const row of ((data.transactions as Row[]) ?? [])) {
    if (!ledgerIds.has(Number(row.ledgerId)) || !accountIds.has(Number(row.accountId)))
      throw new Error("备份流水引用了不存在的账本或账户");
    for (const memberId of [row.paidByMemberId, row.splitWithMemberId])
      if (memberId != null && !memberIds.has(Number(memberId))) throw new Error("备份流水引用了不存在的分账成员");
    if (row.installmentId != null && !ids.get("installments")?.has(Number(row.installmentId)))
      throw new Error("备份流水引用了不存在的分期");
    if (!Number.isSafeInteger(Number(row.amount)) || Number(row.amount) < 0)
      throw new Error("备份包含无效金额");
    if (!["支出", "收入"].includes(String(row.type)))
      throw new Error("备份包含无效流水类型");
    if (row.currency != null && !["CNY", "USD", "JPY", "EUR"].includes(String(row.currency)))
      throw new Error("备份包含无效流水币种");
  }
  for (const row of ((data.transactionReconciliation as Row[]) ?? [])) {
    if (!ledgerIds.has(Number(row.ledgerId)) || !transactionIds.has(Number(row.transactionId)))
      throw new Error("备份对账状态引用了不存在的账本或流水");
    if (!["unreconciled", "reconciled", "exception"].includes(String(row.status)))
      throw new Error("备份包含无效对账状态");
  }
  for (const row of ((data.subscriptions as Row[]) ?? []))
    if (!accountIds.has(Number(row.accountId))) throw new Error("备份续费引用了不存在的账户");
  for (const row of ((data.installments as Row[]) ?? []))
    for (const accountId of [row.accountId, row.paymentAccountId])
      if (accountId != null && !accountIds.has(Number(accountId))) throw new Error("备份分期引用了不存在的账户");
  for (const row of ((data.pendingTransactions as Row[]) ?? []))
    if (!accountIds.has(Number(row.accountId))) throw new Error("备份待确认流水引用了不存在的账户");
  for (const row of ((data.sideHustleDeductions as Row[]) ?? []))
    if (!transactionIds.has(Number(row.transactionId))) throw new Error("备份副业扣除引用了不存在的流水");
  for (const row of ((data.accountTransfers as Row[]) ?? [])) {
    for (const accountId of [row.fromAccountId, row.toAccountId])
      if (accountId != null && !accountIds.has(Number(accountId))) throw new Error("备份转账引用了不存在的账户");
    if (row.targetType === "savings-goal" && !ids.get("savingsGoals")?.has(Number(row.targetId))) throw new Error("备份转账引用了不存在的储蓄目标");
    if (row.targetType === "member" && !memberIds.has(Number(row.targetId))) throw new Error("备份转账引用了不存在的分账成员");
    if (row.targetType === "installment" && !ids.get("installments")?.has(Number(row.targetId))) throw new Error("备份转账引用了不存在的分期");
  }
  for (const row of ((data.automationRules as Row[]) ?? [])) {
    if (!ledgerIds.has(Number(row.ledgerId)) || typeof row.id !== "string" || !row.id)
      throw new Error("备份自动化规则归属无效");
    for (const value of [row.conditions, row.actions])
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("备份自动化规则格式无效");
    for (const value of [(row.conditions as Row).accountId, (row.actions as Row).accountId])
      if (value != null && !accountIds.has(Number(value))) throw new Error("备份自动化规则引用了不存在的账户");
  }
}

async function remapLocalIds(db: ReturnType<typeof getDbBinding>, rows: Record<string, Row[] | undefined>) {
  const definitions = [
    ["ledgers", "ledgers"], ["accounts", "accounts"], ["members", "members"],
    ["transactions", "transactions"], ["subscriptions", "subscriptions"],
    ["savingsGoals", "savings_goals"], ["installments", "installments"],
    ["digitalAssets", "digital_assets"], ["expenseCategories", "expense_categories"],
    ["incomeCategories", "income_categories"], ["pendingTransactions", "pending_transactions"],
    ["systemNotifications", "system_notifications"], ["sideHustleDeductions", "side_hustle_deductions"],
  ] as const;
  const maps = new Map<string, Map<number, number>>();
  for (const [key, table] of definitions) {
    const list = rows[key] ?? [];
    const max = await db.prepare(`SELECT COALESCE(MAX(id),0) value FROM ${table}`).first<{ value: number }>();
    const map = new Map<number, number>();
    let next = Number(max?.value ?? 0) + 1;
    for (const row of list) {
      const old = Number(row.id);
      if (Number.isInteger(old)) {
        map.set(old, next);
        row.id = next++;
      }
    }
    maps.set(key, map);
  }
  const mapValue = (row: Row, field: string, map: string) => {
    const value = Number(row[field]);
    if (maps.get(map)?.has(value)) row[field] = maps.get(map)!.get(value)!;
  };
  for (const [key, list] of Object.entries(rows)) {
    if (!Array.isArray(list)) continue;
    for (const row of list) {
      if (key === "budgetSettings") mapValue(row, "id", "ledgers");
      mapValue(row, "ledgerId", "ledgers");
      mapValue(row, "accountId", "accounts");
      mapValue(row, "paymentAccountId", "accounts");
      mapValue(row, "fromAccountId", "accounts");
      mapValue(row, "toAccountId", "accounts");
      mapValue(row, "paidByMemberId", "members");
      mapValue(row, "splitWithMemberId", "members");
      mapValue(row, "transactionId", "transactions");
      mapValue(row, "installmentId", "installments");
      if (key === "accountTransfers" && row.targetType === "savings-goal")
        mapValue(row, "targetId", "savingsGoals");
      if (key === "accountTransfers" && row.targetType === "member")
        mapValue(row, "targetId", "members");
      if (key === "accountTransfers" && row.targetType === "installment")
        mapValue(row, "targetId", "installments");
      if (key === "automationRules") {
        if (row.conditions && typeof row.conditions === "object") mapValue(row.conditions as Row, "accountId", "accounts");
        if (row.actions && typeof row.actions === "object") mapValue(row.actions as Row, "accountId", "accounts");
      }
    }
  }
}
export async function POST(request: Request) {
  let restoreLock: { ownerId: string; lockId: string } | null = null;
  let stagingId: string | null = null;
  let stagingOwnerId: string | null = null;
  try {
    requireSameOrigin(request);
    await ensureDb();
    const submitted = await readJsonWithLimit<Record<string, unknown>>(
      request,
      MAX_RESTORE_BODY_BYTES,
    );
    const db = getDbBinding();
    const ownerId = await requestOwnerId(request);
    stagingOwnerId = ownerId;
    const dryRun =
      submitted.dryRun === true ||
      request.headers.get("x-restore-dry-run") === "1";
    const expectedPlanChecksum = request.headers
      .get("x-restore-plan-checksum")
      ?.trim() ?? "";
    if (expectedPlanChecksum && !/^[a-f0-9]{64}$/u.test(expectedPlanChecksum))
      throw new ApiAccessError("恢复计划指纹格式无效", 400);
    if (!dryRun) {
      const lock = await acquireRestoreLock(ownerId);
      if (!lock)
        throw new ApiAccessError("当前账本正在恢复，请稍后再试", 409);
      restoreLock = { ownerId, lockId: lock.lockId };
    }
    const auditRequestId = requestIdFromRequest(request);
    const snapshotId =
      typeof submitted.restoreSnapshotId === "string"
        ? submitted.restoreSnapshotId
        : null;
    const data = snapshotId
      ? await loadRestoreSnapshot(ownerId, snapshotId)
      : submitted;
    if (
      ![7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23].includes(Number(data.version)) ||
      !Array.isArray(data.ledgers) ||
      !Array.isArray(data.accounts) ||
      !Array.isArray(data.transactions)
    )
      throw new Error("不是有效的 NeoLedger 备份");
    validateRestoreRows(data);
    const sourceRows = data as unknown as {
      ledgers: Row[];
      accounts: Row[];
      transactions: Row[];
      budgetSettings?: Row[];
      categoryBudgets?: Row[];
      subscriptions?: Row[];
      savingsGoals?: Row[];
      members?: Row[];
      installments?: Row[];
      achievements?: Row[];
      sideHustleDeductions?: Row[];
      pendingTransactions?: Row[];
      systemNotifications?: Row[];
      fireSettings?: Row[];
      economicSettings?: Row[];
      crdtTombstones?: Row[];
      digitalAssets?: Row[];
      expenseCategories?: Row[];
      incomeCategories?: Row[];
      accountTransfers?: Row[];
      syncTombstones?: Row[];
      transactionReconciliation?: Row[];
      automationRules?: Row[];
    };
    sourceRows.expenseCategories = dedupeCategoryRows(sourceRows.expenseCategories);
    sourceRows.incomeCategories = dedupeCategoryRows(sourceRows.incomeCategories);
    sourceRows.categoryBudgets = dedupeNaturalRows(sourceRows.categoryBudgets, ["category"]);
    const planPayload = Object.fromEntries(
      Object.entries(sourceRows).filter(
        ([key, value]) => key === "version" || Array.isArray(value),
      ),
    );
    const planChecksum = await fingerprintRestorePlan(planPayload);
    if (expectedPlanChecksum && expectedPlanChecksum !== planChecksum)
      throw new ApiAccessError("恢复计划已变化，请重新执行预检", 409);
    const estimatedStatements = estimateRestoreBatchStatements(sourceRows);
    if (estimatedStatements > MAX_RESTORE_BATCH_STATEMENTS)
      throw new ApiAccessError(
        `恢复内容过大，需要约 ${estimatedStatements} 条数据库语句，当前单批上限为 ${MAX_RESTORE_BATCH_STATEMENTS} 条；请拆分账本后再恢复`,
        413,
      );
    if (dryRun) {
      const restoredByType = Object.fromEntries(
        Object.entries(sourceRows)
          .filter(([, value]) => Array.isArray(value))
          .map(([key, value]) => [key, (value as Row[]).length]),
      );
      const totalRecords = Object.values(restoredByType).reduce((total, count) => total + count, 0);
      return privateJson({
        ok: true,
        dryRun: true,
        summary: {
          version: Number(data.version),
          totalRecords,
          restoredByType,
          estimatedStatements,
          maxStatements: MAX_RESTORE_BATCH_STATEMENTS,
          planChecksum,
          errorCount: 0,
        },
      });
    }
    const staged = await createRestoreStaging(ownerId, canonicalRestorePayload(planPayload));
    stagingId = staged.id;
    const stagedData = await loadRestoreStaging(ownerId, staged.id);
    if (await fingerprintRestorePlan(stagedData) !== planChecksum)
      throw new ApiAccessError("恢复暂存计划指纹不一致，已取消恢复", 409);
    validateRestoreRows(stagedData);
    const rows = stagedData as unknown as {
      ledgers: Row[];
      accounts: Row[];
      transactions: Row[];
      budgetSettings?: Row[];
      categoryBudgets?: Row[];
      subscriptions?: Row[];
      savingsGoals?: Row[];
      members?: Row[];
      installments?: Row[];
      achievements?: Row[];
      sideHustleDeductions?: Row[];
      pendingTransactions?: Row[];
      systemNotifications?: Row[];
      fireSettings?: Row[];
      economicSettings?: Row[];
      crdtTombstones?: Row[];
      digitalAssets?: Row[];
      expenseCategories?: Row[];
      incomeCategories?: Row[];
      accountTransfers?: Row[];
      syncTombstones?: Row[];
      transactionReconciliation?: Row[];
      automationRules?: Row[];
    };
    if (ownerId === "local")
      await db
        .prepare("UPDATE ledgers SET owner_id=? WHERE owner_id IS NULL OR owner_id='local'")
        .bind(ownerId)
        .run();
    const beforeSnapshot = await createRestoreSnapshot(request, ownerId);
    await recordAuditEvent({
      ownerId,
      eventType: snapshotId ? "data.restore_snapshot" : "data.restore",
      subjectType: "snapshot",
      subjectId: beforeSnapshot.id,
      requestId: auditRequestId,
      metadata: {
        source: snapshotId ? "snapshot" : "upload",
        planChecksum,
        estimatedStatements,
      },
    });
    await remapLocalIds(db, rows as unknown as Record<string, Row[] | undefined>);
    const q = [
      db.prepare("INSERT OR REPLACE INTO app_meta(key,value) VALUES('restore_mode','1')"),
      db.prepare("DELETE FROM side_hustle_deductions WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
      db.prepare("DELETE FROM pending_transactions WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
      db.prepare("DELETE FROM system_notifications WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
      db.prepare("DELETE FROM scheduled_occurrences WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
      db.prepare("DELETE FROM account_transfers WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
      db.prepare("DELETE FROM sync_tombstones WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
      db.prepare("DELETE FROM fire_settings WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
      db.prepare("DELETE FROM economic_settings WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
      db.prepare("DELETE FROM crdt_tombstones WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
      db.prepare("DELETE FROM transaction_reconciliation WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
      db.prepare("DELETE FROM automation_rules WHERE owner_id=?").bind(ownerId),
      db.prepare("DELETE FROM import_batch_items WHERE batch_id IN (SELECT id FROM import_batches WHERE owner_id=?)").bind(ownerId),
      db.prepare("DELETE FROM import_batches WHERE owner_id=?").bind(ownerId),
      db.prepare("DELETE FROM digital_assets WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
      db.prepare("DELETE FROM expense_categories WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
      db.prepare("DELETE FROM income_categories WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
      db.prepare("DELETE FROM transactions WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
      db.prepare("DELETE FROM installments WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
      db.prepare("DELETE FROM achievements WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
      db.prepare("DELETE FROM subscriptions WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
      db.prepare("DELETE FROM savings_goals WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
      db.prepare("DELETE FROM category_budgets WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
      db.prepare("DELETE FROM members WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
      db.prepare("DELETE FROM accounts WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
      db.prepare("DELETE FROM budget_settings WHERE id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
      db.prepare("DELETE FROM ledgers WHERE owner_id=?").bind(ownerId),
    ];
    for (const x of rows.ledgers)
      q.push(
        db
          .prepare(
            "INSERT INTO ledgers(id,name,icon,owner_id,uuid,updated_at,created_at) VALUES(?,?,?,?,?,?,?)",
          )
          .bind(x.id, x.name, x.icon, ownerId, x.uuid ?? x.syncId, x.updatedAt ?? x.createdAt, x.createdAt),
      );
    for (const x of rows.accounts)
      q.push(
        db
          .prepare(
            "INSERT INTO accounts(id,ledger_id,name,type,current_balance,bill_day,repayment_day,icon,is_investment,initial_balance,cumulative_income,currency,asset_class,uuid,updated_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            x.id,
            x.ledgerId,
            x.name,
            x.type,
            x.currentBalance,
            x.billDay,
            x.repaymentDay,
            x.icon,
            x.isInvestment ? 1 : 0,
            x.initialBalance,
            x.cumulativeIncome,
            x.currency ?? "CNY",
            x.assetClass ?? "现金流",
            x.uuid ?? x.syncId,
            x.updatedAt ?? x.createdAt,
            x.createdAt,
          ),
      );
    for (const x of rows.digitalAssets ?? [])
      q.push(
        db
          .prepare(
            "INSERT INTO digital_assets(id,ledger_id,name,asset_type,currency,valuation_mode,manual_value,purchase_price,purchase_date,lifespan_months,residual_rate_bps,heat_level,updated_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            x.id,
            x.ledgerId,
            x.name,
            x.assetType,
            x.currency ?? "CNY",
            x.valuationMode ?? "自动折旧",
            x.manualValue ?? null,
            x.purchasePrice,
            x.purchaseDate,
            x.lifespanMonths,
            x.residualRateBps,
            x.heatLevel ?? null,
            x.updatedAt ?? x.createdAt,
            x.createdAt,
          ),
      );
    for (const x of rows.expenseCategories ?? [])
      q.push(
        db
          .prepare(
            "INSERT INTO expense_categories(id,ledger_id,name,icon,color,builtin_key,is_system,is_active,sort_order,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            x.id,
            x.ledgerId,
            x.name,
            x.icon,
            x.color,
            x.builtinKey ?? null,
            x.isSystem ? 1 : 0,
            x.isActive === false ? 0 : 1,
            x.sortOrder ?? 0,
            x.createdAt,
          ),
      );
    if (!rows.expenseCategories?.length) {
      const defaults = [
        ["餐饮", "🍔", "#e98565"],
        ["交通", "🚇", "#84a28d"],
        ["购物", "🛍️", "#c98fa7"],
        ["咖啡", "☕", "#ae8566"],
        ["娱乐", "🎮", "#858cbd"],
      ];
      for (const ledger of rows.ledgers)
        defaults.forEach(([name, icon, color], index) =>
          q.push(
            db
              .prepare(
                "INSERT INTO expense_categories(ledger_id,name,icon,color,builtin_key,is_system,sort_order) VALUES(?,?,?,?,?,1,?)",
              )
              .bind(ledger.id, name, icon, color, name, (index + 1) * 10),
          ),
        );
    }
    for (const x of rows.incomeCategories ?? [])
      q.push(
        db
          .prepare(
            "INSERT INTO income_categories(id,ledger_id,name,icon,color,builtin_key,is_system,is_active,sort_order,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            x.id,
            x.ledgerId,
            x.name,
            x.icon,
            x.color,
            x.builtinKey ?? null,
            x.isSystem ? 1 : 0,
            x.isActive === false ? 0 : 1,
            x.sortOrder ?? 0,
            x.createdAt,
          ),
      );
    if (!rows.incomeCategories?.length) {
      const defaults = [
        ["薪资发放", "💼", "#4f9b78"],
        ["理财收益", "📈", "#78b899"],
        ["兼职外快", "🧧", "#d19a5d"],
        ["其它收入", "🎁", "#8f91b8"],
      ];
      for (const ledger of rows.ledgers)
        defaults.forEach(([name, icon, color], index) =>
          q.push(
            db
              .prepare(
                "INSERT INTO income_categories(ledger_id,name,icon,color,builtin_key,is_system,sort_order) VALUES(?,?,?,?,?,1,?)",
              )
              .bind(ledger.id, name, icon, color, name, (index + 1) * 10),
          ),
        );
    }
    for (const x of rows.installments ?? [])
      q.push(
        db
          .prepare(
            "INSERT INTO installments(id,ledger_id,name,total_amount,periods,paid_periods,fee_amount,account_id,payment_account_id,start_month,charge_day,currency,uuid,updated_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            x.id,
            x.ledgerId,
            x.name,
            x.totalAmount,
            x.periods,
            x.paidPeriods,
            x.feeAmount,
            x.accountId,
            x.paymentAccountId ?? null,
            x.startMonth,
            x.chargeDay,
            x.currency ?? "CNY",
            x.uuid ?? x.syncId,
            x.updatedAt ?? x.createdAt,
            x.createdAt,
          ),
      );
    for (const x of rows.transactions)
      q.push(
        db
          .prepare(
            "INSERT INTO transactions(id,ledger_id,title,amount,type,mood,category,category_dynamic,income_category,income_category_dynamic,account_id,paid_by_member_id,split_with_member_id,split_mode,my_share_percent,currency,original_amount,original_currency,exchange_rate_micros,original_timezone,installment_id,installment_number,occurrence_key,is_side_hustle,offline_id,crdt_id,updated_at,occurred_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            x.id,
            x.ledgerId,
            x.title,
            x.amount,
            x.type,
            x.mood,
            x.category,
            x.categoryDynamic ?? x.category,
            x.incomeCategory,
            x.incomeCategoryDynamic ?? x.incomeCategory,
            x.accountId,
            x.paidByMemberId ?? null,
            x.splitWithMemberId ?? null,
            x.splitMode ?? null,
            x.mySharePercent ?? 100,
            x.currency ?? "CNY",
            x.originalAmount ?? x.amount,
            x.originalCurrency ?? x.currency ?? "CNY",
            x.exchangeRateMicros ?? 1000000,
            x.originalTimezone ?? "legacy/unknown",
            x.installmentId ?? null,
            x.installmentNumber ?? null,
            x.occurrenceKey ?? null,
            x.isSideHustle ? 1 : 0,
            x.offlineId ?? null,
            x.crdtId ?? null,
            x.updatedAt ?? x.createdAt,
            x.occurredAt,
            x.createdAt,
          ),
      );
    for (const x of rows.achievements ?? [])
      q.push(
        db
          .prepare(
            "INSERT INTO achievements(ledger_id,code,unlocked_at) VALUES(?,?,?)",
          )
          .bind(x.ledgerId, x.code, x.unlockedAt),
      );
    for (const x of rows.sideHustleDeductions ?? [])
      q.push(
        db
          .prepare(
            "INSERT INTO side_hustle_deductions(id,ledger_id,transaction_id,amount,note,created_at) VALUES(?,?,?,?,?,?)",
          )
          .bind(
            x.id,
            x.ledgerId,
            x.transactionId,
            x.amount,
            x.note,
            x.createdAt,
          ),
      );
    for (const x of rows.pendingTransactions ?? [])
      q.push(
        db
          .prepare(
            "INSERT INTO pending_transactions(id,ledger_id,raw_text,title,amount,type,account_id,currency,occurred_at,status,balance_applied,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            x.id,
            x.ledgerId,
            x.rawText,
            x.title,
            x.amount,
            x.type,
            x.accountId,
            x.currency,
            x.occurredAt,
            x.status,
            x.balanceApplied ? 1 : 0,
            x.createdAt,
          ),
      );
    for (const x of rows.systemNotifications ?? [])
      q.push(
        db
          .prepare(
            "INSERT INTO system_notifications(id,ledger_id,title,message,read,created_at) VALUES(?,?,?,?,?,?)",
          )
          .bind(
            x.id,
            x.ledgerId,
            x.title,
            x.message,
            x.read ? 1 : 0,
            x.createdAt,
          ),
      );
    if (rows.fireSettings?.length) {
      for (const x of rows.fireSettings)
        q.push(
          db
            .prepare(
              "INSERT INTO fire_settings(ledger_id,monthly_expense,annual_return_bps,updated_at) VALUES(?,?,?,?)",
            )
            .bind(x.ledgerId, x.monthlyExpense, x.annualReturnBps, x.updatedAt),
        );
    } else {
      for (const x of rows.ledgers)
        q.push(
          db
            .prepare("INSERT INTO fire_settings(ledger_id) VALUES(?)")
            .bind(x.id),
        );
    }
    if (rows.economicSettings?.length) {
      for (const x of rows.economicSettings)
        q.push(
          db
            .prepare(
              "INSERT INTO economic_settings(ledger_id,inflation_bps,updated_at) VALUES(?,?,?)",
            )
            .bind(x.ledgerId, x.inflationBps, x.updatedAt),
        );
    } else {
      for (const x of rows.ledgers)
        q.push(
          db
            .prepare("INSERT INTO economic_settings(ledger_id) VALUES(?)")
            .bind(x.id),
        );
    }
    for (const x of rows.crdtTombstones ?? [])
      q.push(
        db
          .prepare(
            "INSERT INTO crdt_tombstones(crdt_id,ledger_id,deleted_at) VALUES(?,?,?)",
          )
          .bind(x.crdtId, x.ledgerId, x.deletedAt),
      );
    if (rows.members?.length) {
      for (const x of rows.members)
        q.push(
          db
            .prepare(
              "INSERT INTO members(id,ledger_id,name,icon,is_me,created_at) VALUES(?,?,?,?,?,?)",
            )
            .bind(
              x.id,
              x.ledgerId,
              x.name,
              x.icon,
              x.isMe ? 1 : 0,
              x.createdAt,
            ),
        );
    } else {
      for (const x of rows.ledgers)
        q.push(
          db
            .prepare(
              "INSERT INTO members(ledger_id,name,icon,is_me) VALUES (?,'我','🧑',1)",
            )
            .bind(x.id),
        );
    }
    for (const x of rows.budgetSettings ?? [])
      q.push(
        db
          .prepare(
            "INSERT INTO budget_settings(id,amount,updated_at) VALUES(?,?,?)",
          )
          .bind(x.id, x.amount, x.updatedAt),
      );
    for (const x of rows.categoryBudgets ?? [])
      q.push(
        db
          .prepare(
            "INSERT INTO category_budgets(ledger_id,category,amount,updated_at) VALUES(?,?,?,?)",
          )
          .bind(x.ledgerId, x.category, x.amount, x.updatedAt),
      );
    for (const x of rows.subscriptions ?? [])
      q.push(
        db
          .prepare(
            "INSERT INTO subscriptions(id,ledger_id,name,amount,account_id,cycle,category,category_dynamic,next_charge_date,uuid,updated_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            x.id,
            x.ledgerId,
            x.name,
            x.amount,
            x.accountId,
            x.cycle,
            x.category,
            x.categoryDynamic ?? x.category,
            x.nextChargeDate,
            x.uuid ?? x.syncId,
            x.updatedAt ?? x.createdAt,
            x.createdAt,
          ),
      );
    for (const x of rows.savingsGoals ?? [])
      q.push(
        db
          .prepare(
            "INSERT INTO savings_goals(id,ledger_id,name,target_amount,saved_amount,deadline,icon,uuid,updated_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            x.id,
            x.ledgerId,
            x.name,
            x.targetAmount,
            x.savedAmount,
            x.deadline,
            x.icon,
            x.uuid ?? x.syncId,
            x.updatedAt ?? x.createdAt,
            x.createdAt,
          ),
      );
    for (const x of rows.accountTransfers ?? [])
      q.push(
        db.prepare("INSERT INTO account_transfers(uuid,ledger_id,kind,from_account_id,to_account_id,amount,currency,target_type,target_id,occurrence_key,occurred_at,original_timezone,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
          .bind(x.uuid ?? x.syncId, x.ledgerId, x.kind, x.fromAccountId ?? null, x.toAccountId ?? null, x.amount, x.currency, x.targetType ?? null, x.targetId ?? null, x.occurrenceKey ?? null, x.occurredAt, x.originalTimezone ?? "legacy/unknown", x.note ?? "", x.createdAt ?? x.updatedAt, x.updatedAt ?? x.createdAt),
      );
    for (const x of rows.syncTombstones ?? [])
      q.push(
        db.prepare("INSERT OR REPLACE INTO sync_tombstones(entity_type,entity_uuid,ledger_id,owner_id,deleted_at) VALUES(?,?,?,?,?)")
          .bind(x.entityType ?? x.table, x.entityUuid ?? x.syncId, x.ledgerId, ownerId, x.deletedAt),
      );
    for (const x of rows.transactionReconciliation ?? [])
      q.push(
        db.prepare("INSERT INTO transaction_reconciliation(transaction_id,ledger_id,status,note,reconciled_by,reconciled_at,updated_at) VALUES(?,?,?,?,?,?,?)")
          .bind(x.transactionId, x.ledgerId, x.status, x.note ?? null, ownerId, x.reconciledAt ?? null, x.updatedAt ?? x.reconciledAt ?? new Date(0).toISOString()),
      );
    for (const x of rows.automationRules ?? [])
      q.push(
        db.prepare("INSERT INTO automation_rules(id,owner_id,ledger_id,name,priority,enabled,conditions_json,actions_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
          .bind(x.id, ownerId, x.ledgerId, x.name, x.priority ?? 100, x.enabled ? 1 : 0, JSON.stringify(x.conditions ?? {}), JSON.stringify(x.actions ?? {}), x.createdAt ?? x.updatedAt, x.updatedAt ?? x.createdAt),
      );
    q.push(db.prepare("DELETE FROM app_meta WHERE key='restore_mode'"));
    const restoredByType = Object.fromEntries(
      Object.entries(rows)
        .filter(([, value]) => Array.isArray(value))
        .map(([key, value]) => [key, (value as Row[]).length]),
    );
    const totalRecords = Object.values(restoredByType).reduce(
      (total, count) => total + count,
      0,
    );
    await db.batch(q);
    await deleteRestoreStaging(ownerId, stagingId).catch(() => undefined);
    stagingId = null;
    return privateJson({
      ok: true,
      beforeSnapshot,
      summary: {
        totalRecords,
        restoredByType,
        planChecksum,
        skippedRecords: 0,
        errorCount: 0,
      },
    });
  } catch (error) {
    return accessErrorResponse(error, "恢复失败", request);
  } finally {
    if (stagingId && stagingOwnerId)
      await deleteRestoreStaging(stagingOwnerId, stagingId).catch(() => undefined);
    if (restoreLock)
      await releaseRestoreLock(restoreLock.ownerId, restoreLock.lockId).catch(() => undefined);
  }
}

export async function GET(request: Request) {
  try {
    await ensureDb();
    return privateJson(
      await listRestoreSnapshots(await requestOwnerId(request)),
    );
  } catch (error) {
    return accessErrorResponse(error, "读取恢复快照失败", request);
  }
}
