import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../../db";
import { accessErrorResponse, requestOwnerId } from "../../../api-security";
type Row = Record<string, unknown>;

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
    }
  }
}
export async function POST(request: Request) {
  try {
    await ensureDb();
    const data = (await request.json()) as Record<string, unknown>;
    if (
      ![7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21].includes(Number(data.version)) ||
      !Array.isArray(data.ledgers) ||
      !Array.isArray(data.accounts) ||
      !Array.isArray(data.transactions)
    )
      throw new Error("不是有效的 NeoLedger 备份");
    const db = getDbBinding(),
      ownerId = requestOwnerId(request),
      rows = data as unknown as {
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
      };
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
            "INSERT INTO digital_assets(id,ledger_id,name,asset_type,purchase_price,purchase_date,lifespan_months,residual_rate_bps,heat_level,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            x.id,
            x.ledgerId,
            x.name,
            x.assetType,
            x.purchasePrice,
            x.purchaseDate,
            x.lifespanMonths,
            x.residualRateBps,
            x.heatLevel ?? null,
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
    q.push(db.prepare("DELETE FROM app_meta WHERE key='restore_mode'"));
    await db.batch(q);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return accessErrorResponse(error, "恢复失败");
  }
}
