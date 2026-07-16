import { NextResponse } from "next/server";
import { ensureDb, getDb, getDbBinding } from "../../../../db";
import { requestOwnerId } from "../../../api-security";
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
const quote = (value: unknown) => {
  const text = String(value ?? "");
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
};
export async function GET(request: Request) {
  await ensureDb();
  const ownerId = requestOwnerId(request);
  const binding = getDbBinding();
  await binding.prepare("UPDATE ledgers SET owner_id=? WHERE owner_id IS NULL").bind(ownerId).run();
  const db = getDb();
  const [a, t, b, c, s, l, g, m, i, h, d, p, n, f, e, ct, da, ec, ic] = await Promise.all([
    db.select().from(accounts),
    db.select().from(transactions),
    db.select().from(budgetSettings),
    db.select().from(categoryBudgets),
    db.select().from(subscriptions),
    db.select().from(ledgers),
    db.select().from(savingsGoals),
    db.select().from(members),
    db.select().from(installments),
    db.select().from(achievements),
    db.select().from(sideHustleDeductions),
    db.select().from(pendingTransactions),
    db.select().from(systemNotifications),
    db.select().from(fireSettings),
    db.select().from(economicSettings),
    db.select().from(crdtTombstones),
    db.select().from(digitalAssets),
    db.select().from(expenseCategories),
    db.select().from(incomeCategoriesConfig),
  ]);
  const ownedLedgers = l.filter((row) => row.ownerId === ownerId);
  const ownedIds = new Set(ownedLedgers.map((row) => row.id));
  const keep = <T extends { ledgerId: number }>(rows: T[]) =>
    rows.filter((row) => ownedIds.has(row.ledgerId));
  const ownedAccounts = keep(a);
  const ownedTransactions = keep(t);
  const installation = await binding.prepare("SELECT value FROM app_meta WHERE key='installation_id'").first<{ value: string }>();
  const installationId = installation?.value ?? "legacy-installation";
  const transferRows = await binding.prepare("SELECT uuid,ledger_id AS ledgerId,kind,from_account_id AS fromAccountId,to_account_id AS toAccountId,amount,currency,target_type AS targetType,target_id AS targetId,occurrence_key AS occurrenceKey,occurred_at AS occurredAt,original_timezone AS originalTimezone,note,created_at AS createdAt,updated_at AS updatedAt FROM account_transfers").all<Record<string, unknown>>();
  const syncTombRows = await binding.prepare("SELECT entity_type AS entityType,entity_uuid AS entityUuid,ledger_id AS ledgerId,owner_id AS ownerId,deleted_at AS deletedAt FROM sync_tombstones").all<Record<string, unknown>>();
  const ledgerSync = new Map(ownedLedgers.map((row) => [row.id, row.uuid]));
  const accountSync = new Map(ownedAccounts.map((row) => [row.id, row.uuid]));
  const memberSync = new Map(keep(m).map((row) => [row.id, `${installationId}:members:${row.id}`]));
  const transactionSync = new Map(ownedTransactions.map((row) => [row.id, row.crdtId ?? `${installationId}:transactions:${row.id}`]));
  const enrich = (table: string, rows: Record<string, unknown>[]) =>
    rows.map((row) => ({
      ...row,
      syncId: row.uuid ?? row.crdtId ?? `${installationId}:${table}:${row.id ?? `${row.ledgerId ?? ""}:${row.code ?? row.category ?? row.name ?? "row"}`}`,
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
    return new Response(`\uFEFF${[header, ...rows].join("\n")}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="neo-ledger.csv"`,
      },
    });
  }
  return NextResponse.json(
    {
      version: 21,
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
    },
    {
      headers: {
        "Content-Disposition": `attachment; filename="neo-ledger-backup-v21.json"`,
      },
    },
  );
}
