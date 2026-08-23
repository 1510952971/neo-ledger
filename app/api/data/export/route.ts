import { eq, sql } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm/column";
import { ensureDb, getDb, getDbBinding } from "../../../../db";
import { ApiAccessError, accessErrorResponse, requestOwnerId } from "../../../api-security";
import { encodedExportBytes, estimateExportBytes, MAX_EXPORT_ESTIMATED_BYTES } from "../../../export-limits";
import {
  accounts,
  budgetSettings,
  categoryBudgets,
  achievements,
  installments,
  fireSettings,
  economicSettings,
  crdtTombstones,
  digitalAssets,
  expenseCategories,
  incomeCategoriesConfig,
  ledgers,
  members,
  savingsGoals,
  sideHustleDeductions,
  pendingTransactions,
  systemNotifications,
  subscriptions,
  transactions,
} from "../../../../db/schema";
import { recordAuditEvent, requestIdFromRequest } from "../../../audit-log";
const quote = (value: unknown) => {
  const text = String(value ?? "");
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
};

type ExportRow = Record<string, unknown>;
type ExportRows = { results: ExportRow[] };
const privateDownloadHeaders = {
  "Cache-Control": "no-store, private, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
  "X-Download-Options": "noopen",
};

function privateDownload(body: string, contentType: string, filename: string) {
  if (encodedExportBytes(body) > MAX_EXPORT_ESTIMATED_BYTES)
    throw new ApiAccessError("导出数据超过 50 MB，请先减少单次导出范围", 413);
  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      ...privateDownloadHeaders,
    },
  });
}

export async function GET(request: Request) {
  try {
    await ensureDb();
    let ownerId: string;
    try {
      ownerId = await requestOwnerId(request);
    } catch (error) {
      return accessErrorResponse(error, "导出失败", request);
    }
  await recordAuditEvent({
    ownerId,
    eventType: "data.export",
    subjectType: "ledger",
    requestId: requestIdFromRequest(request),
    metadata: { format: new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "json" },
  });
  const binding = getDbBinding();
  if (ownerId === "local")
    await binding.prepare("UPDATE ledgers SET owner_id=? WHERE owner_id IS NULL OR owner_id='local'").bind(ownerId).run();
  const db = getDb();
  const ownedLedgers = await db
    .select()
    .from(ledgers)
    .where(eq(ledgers.ownerId, ownerId));
  const ownedIds = new Set(ownedLedgers.map((row) => row.id));
  try {
    // Count every collection that the export actually materializes. A partial
    // count (for example transactions only) can under-estimate a legacy or
    // maliciously inflated database and still let the response exceed the
    // shared 50 MiB restore/sync transport budget. Table and column names are
    // fixed constants here; values remain bound parameters.
    const countLedgerRows = (table: string, ledgerColumn = "ledger_id") =>
      binding
        .prepare(
          `SELECT COUNT(*) count FROM ${table} r JOIN ledgers l ON l.id=r.${ledgerColumn} WHERE l.owner_id=?`,
        )
        .bind(ownerId)
        .first<{ count: number }>();
    const countRows = await Promise.all([
      countLedgerRows("transactions"),
      binding
        .prepare("SELECT COUNT(*) count FROM ledgers WHERE owner_id=?")
        .bind(ownerId)
        .first<{ count: number }>(),
      countLedgerRows("accounts"),
      countLedgerRows("budget_settings", "id"),
      countLedgerRows("category_budgets"),
      countLedgerRows("subscriptions"),
      countLedgerRows("savings_goals"),
      countLedgerRows("members"),
      countLedgerRows("installments"),
      countLedgerRows("achievements"),
      countLedgerRows("side_hustle_deductions"),
      countLedgerRows("pending_transactions"),
      countLedgerRows("system_notifications"),
      countLedgerRows("fire_settings"),
      countLedgerRows("economic_settings"),
      countLedgerRows("crdt_tombstones"),
      countLedgerRows("digital_assets"),
      countLedgerRows("expense_categories"),
      countLedgerRows("income_categories"),
      countLedgerRows("account_transfers"),
      countLedgerRows("sync_tombstones"),
      countLedgerRows("transaction_reconciliation"),
      countLedgerRows("automation_rules"),
    ]);
    const transactionCount = Number(countRows[0]?.count ?? 0);
    const otherRecords = countRows.slice(1).reduce((sum, row) => sum + Number(row?.count ?? 0), 0);
    const estimatedBytes = estimateExportBytes({ transactions: transactionCount, otherRecords });
    if (estimatedBytes > MAX_EXPORT_ESTIMATED_BYTES)
      throw new ApiAccessError("导出数据预计超过 50 MB，请先减少单次导出范围", 413);
  } catch (error) {
    return accessErrorResponse(error, "导出失败", request);
  }
  // Keep the owner predicate in SQL instead of expanding one bound parameter
  // per ledger. This remains safe for users with a large number of ledgers and
  // prevents export queries from hitting D1/SQLite parameter limits.
  const ledgerScope = (column: AnyColumn) =>
    sql`${column} IN (SELECT id FROM ledgers WHERE owner_id=${ownerId})`;
  const [a, t, b, c, s, g, m, i, h, d, p, n, f, e, ct, da, ec, ic] = await Promise.all([
    db.select().from(accounts).where(ledgerScope(accounts.ledgerId)),
    db.select().from(transactions).where(ledgerScope(transactions.ledgerId)),
    db.select().from(budgetSettings).where(ledgerScope(budgetSettings.id)),
    db.select().from(categoryBudgets).where(ledgerScope(categoryBudgets.ledgerId)),
    db.select().from(subscriptions).where(ledgerScope(subscriptions.ledgerId)),
    db.select().from(savingsGoals).where(ledgerScope(savingsGoals.ledgerId)),
    db.select().from(members).where(ledgerScope(members.ledgerId)),
    db.select().from(installments).where(ledgerScope(installments.ledgerId)),
    db.select().from(achievements).where(ledgerScope(achievements.ledgerId)),
    db.select().from(sideHustleDeductions).where(ledgerScope(sideHustleDeductions.ledgerId)),
    db.select().from(pendingTransactions).where(ledgerScope(pendingTransactions.ledgerId)),
    db.select().from(systemNotifications).where(ledgerScope(systemNotifications.ledgerId)),
    db.select().from(fireSettings).where(ledgerScope(fireSettings.ledgerId)),
    db.select().from(economicSettings).where(ledgerScope(economicSettings.ledgerId)),
    db.select().from(crdtTombstones).where(ledgerScope(crdtTombstones.ledgerId)),
    db.select().from(digitalAssets).where(ledgerScope(digitalAssets.ledgerId)),
    db.select().from(expenseCategories).where(ledgerScope(expenseCategories.ledgerId)),
    db.select().from(incomeCategoriesConfig).where(ledgerScope(incomeCategoriesConfig.ledgerId)),
  ]);
  const keep = <T extends { ledgerId: number }>(rows: T[]) =>
    rows.filter((row) => ownedIds.has(row.ledgerId));
  const ownedAccounts = keep(a);
  const ownedTransactions = keep(t);
  const installation = await binding.prepare("SELECT value FROM app_meta WHERE key='installation_id'").first<{ value: string }>();
  const installationId = installation?.value ?? "legacy-installation";
  const transferRows: ExportRows = await binding
    .prepare(
      "SELECT t.uuid,t.ledger_id AS ledgerId,t.kind,t.from_account_id AS fromAccountId,t.to_account_id AS toAccountId,t.amount,t.currency,t.target_type AS targetType,t.target_id AS targetId,t.occurrence_key AS occurrenceKey,t.occurred_at AS occurredAt,t.original_timezone AS originalTimezone,t.note,t.created_at AS createdAt,t.updated_at AS updatedAt FROM account_transfers t JOIN ledgers l ON l.id=t.ledger_id WHERE l.owner_id=?",
    )
    .bind(ownerId)
    .all<ExportRow>();
  const syncTombRows: ExportRows = await binding
    .prepare(
      "SELECT s.entity_type AS entityType,s.entity_uuid AS entityUuid,s.ledger_id AS ledgerId,s.owner_id AS ownerId,s.deleted_at AS deletedAt FROM sync_tombstones s JOIN ledgers l ON l.id=s.ledger_id WHERE s.owner_id=? AND l.owner_id=?",
    )
    .bind(ownerId, ownerId)
    .all<ExportRow>();
  const reconciliationRows: ExportRows = await binding
    .prepare(
      "SELECT r.transaction_id AS transactionId,r.ledger_id AS ledgerId,r.status,r.note,r.reconciled_at AS reconciledAt,r.updated_at AS updatedAt FROM transaction_reconciliation r JOIN ledgers l ON l.id=r.ledger_id WHERE l.owner_id=?",
    )
    .bind(ownerId)
    .all<ExportRow>();
  const automationRuleRows: ExportRows = await binding
    .prepare(
      "SELECT r.id,r.ledger_id AS ledgerId,r.name,r.priority,r.enabled,r.conditions_json AS conditionsJson,r.actions_json AS actionsJson,r.created_at AS createdAt,r.updated_at AS updatedAt FROM automation_rules r JOIN ledgers l ON l.id=r.ledger_id WHERE r.owner_id=? AND l.owner_id=?",
    )
    .bind(ownerId, ownerId)
    .all<ExportRow>();
  const ledgerSync = new Map(ownedLedgers.map((row) => [row.id, row.uuid]));
  const accountSync = new Map(ownedAccounts.map((row) => [row.id, row.uuid]));
  const memberSync = new Map(keep(m).map((row) => [row.id, `${installationId}:members:${row.id}`]));
  const transactionSync = new Map(ownedTransactions.map((row) => [row.id, row.crdtId ?? `${installationId}:transactions:${row.id}`]));
  const naturalSyncId = (table: string, row: Record<string, unknown>) => {
    const ledgerId = Number(row.ledgerId ?? row.id);
    const ledgerIdForSync = ledgerSync.get(ledgerId);
    if (!ledgerIdForSync) return null;
    if (table === "budgetSettings" || table === "fireSettings" || table === "economicSettings")
      return `${ledgerIdForSync}:${table}`;
    if (table === "categoryBudgets")
      return `${ledgerIdForSync}:${table}:${String(row.category ?? "")}`;
    if (table === "expenseCategories" || table === "incomeCategories")
      return `${ledgerIdForSync}:${table}:${String(row.builtinKey ?? row.name ?? "")}`;
    if (table === "members")
      return `${ledgerIdForSync}:${table}:${row.isMe ? "self" : String(row.name ?? row.id ?? "")}`;
    if (table === "achievements")
      return `${ledgerIdForSync}:${table}:${String(row.code ?? "")}`;
    return null;
  };
  const enrich = (table: string, rows: Record<string, unknown>[]) =>
    rows.map((row) => ({
      ...row,
      syncId: row.uuid ?? row.crdtId ?? naturalSyncId(table, row) ?? `${installationId}:${table}:${row.id ?? `${row.ledgerId ?? ""}:${row.code ?? row.category ?? row.name ?? "row"}`}`,
      updatedAt: row.updatedAt ?? row.createdAt ?? new Date(0).toISOString(),
      ledgerSyncId: ledgerSync.get(Number(row.ledgerId)),
      accountSyncId: accountSync.get(Number(row.accountId)),
      paymentAccountSyncId: accountSync.get(Number(row.paymentAccountId)),
      fromAccountSyncId: accountSync.get(Number(row.fromAccountId)),
      toAccountSyncId: accountSync.get(Number(row.toAccountId)),
      paidByMemberSyncId: memberSync.get(Number(row.paidByMemberId)),
      splitWithMemberSyncId: memberSync.get(Number(row.splitWithMemberId)),
      transactionSyncId: transactionSync.get(Number(row.transactionId)),
    }));
  if (new URL(request.url).searchParams.get("format") === "csv") {
    const names = new Map(ownedAccounts.map((x) => [x.id, x.name]));
    const books = new Map(ownedLedgers.map((x) => [x.id, x.name]));
    const header = [
      "账本",
      "ID",
      "时间",
      "类型",
      "名称",
      "金额",
      "消费分类",
      "消费情绪",
      "收入分类",
      "账户",
      "币种",
      "折合人民币",
    ]
      .map(quote)
      .join(",");
    const rows = ownedTransactions.map((x) =>
      [
        books.get(x.ledgerId),
        x.id,
        x.occurredAt,
        x.type,
        x.title,
        (x.amount / 100).toFixed(2),
        x.categoryDynamic ?? x.category,
        x.mood,
        x.incomeCategoryDynamic ?? x.incomeCategory,
        names.get(x.accountId),
        x.currency,
        (
          (x.amount *
            { CNY: 1, USD: 7.2, JPY: 0.0462, EUR: 7.85 }[x.currency]) /
          100
        ).toFixed(2),
      ]
        .map(quote)
        .join(","),
    );
    return privateDownload(`\uFEFF${[header, ...rows].join("\n")}`, "text/csv; charset=utf-8", "neo-ledger.csv");
  }
    const jsonBody = JSON.stringify({
      version: 23,
      installationId,
      exportedAt: new Date().toISOString(),
      ledgers: enrich("ledgers", ownedLedgers),
      accounts: enrich("accounts", ownedAccounts),
      transactions: enrich("transactions", ownedTransactions),
      budgetSettings: enrich("budgetSettings", b.filter((row) => ownedIds.has(row.id)).map((row) => ({ ...row, ledgerId: row.id }))),
      categoryBudgets: enrich("categoryBudgets", keep(c)),
      subscriptions: enrich("subscriptions", keep(s)),
      savingsGoals: enrich("savingsGoals", keep(g)),
      members: enrich("members", keep(m)),
      installments: enrich("installments", keep(i)),
      achievements: enrich("achievements", keep(h)),
      sideHustleDeductions: enrich("sideHustleDeductions", keep(d)),
      pendingTransactions: enrich("pendingTransactions", keep(p)),
      systemNotifications: enrich("systemNotifications", keep(n)),
      fireSettings: enrich("fireSettings", keep(f)),
      economicSettings: enrich("economicSettings", keep(e)),
      crdtTombstones: enrich("crdtTombstones", keep(ct)),
      syncTombstones: syncTombRows.results
        .filter(
          (row) =>
            ownedIds.has(Number(row.ledgerId)) || row.ownerId === ownerId,
        )
        .map((row) => ({
          ...row,
          syncId: row.entityUuid,
          ledgerSyncId: ledgerSync.get(Number(row.ledgerId)),
        })),
      accountTransfers: enrich("accountTransfers", transferRows.results.filter((row) => ownedIds.has(Number(row.ledgerId)))),
      digitalAssets: enrich("digitalAssets", keep(da)),
      expenseCategories: enrich("expenseCategories", keep(ec)),
      incomeCategories: enrich("incomeCategories", keep(ic)),
      transactionReconciliation: enrich("transactionReconciliation", reconciliationRows.results.filter((row) => ownedIds.has(Number(row.ledgerId)))),
      automationRules: automationRuleRows.results
        .filter((row) => ownedIds.has(Number(row.ledgerId)))
        .map((row) => {
          const conditions = JSON.parse(String(row.conditionsJson ?? "{}"));
          const actions = JSON.parse(String(row.actionsJson ?? "{}"));
          return {
          id: row.id,
          ledgerId: row.ledgerId,
          ledgerSyncId: ledgerSync.get(Number(row.ledgerId)),
          name: row.name,
          priority: row.priority,
          enabled: Boolean(row.enabled),
          conditions,
          actions,
          conditionAccountSyncId: accountSync.get(Number(conditions.accountId)),
          actionAccountSyncId: accountSync.get(Number(actions.accountId)),
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }; }),
    });
    return privateDownload(jsonBody, "application/json; charset=utf-8", "neo-ledger-backup-v23.json");
  } catch (error) {
    return accessErrorResponse(error, "导出失败", request);
  }
}
