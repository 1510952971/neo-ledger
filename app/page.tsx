import { desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { LedgerApp } from "./ledger-app";
import {
  ensureDb,
  evaluateDigitalAsset,
  evaluateAchievements,
  FX_TO_CNY,
  getDb,
  getDbBinding,
  processDueInstallments,
  processDueSubscriptions,
} from "../db";
import {
  accounts,
  budgetSettings,
  categoryBudgets,
  fireSettings,
  economicSettings,
  digitalAssets,
  expenseCategories,
  incomeCategoriesConfig,
  installments,
  ledgers,
  members,
  savingsGoals,
  sideHustleDeductions,
  subscriptions,
  transactions,
} from "../db/schema";
import { getChatGPTUser, requireChatGPTUser } from "./chatgpt-auth";
import { getOwnerPreferences } from "./api-security";
import { localDateTimeToUtc } from "./time-money.js";

export const dynamic = "force-dynamic";

const moods = ["悦己", "刚需", "冲动"] as const;
const categories = ["餐饮", "交通", "购物", "咖啡", "娱乐"] as const;
async function currentOwnerId() {
  const requestHeaders = await headers();
  const user = await getChatGPTUser();
  if (user) return `email:${user.email.toLowerCase()}`;
  const hostname = (requestHeaders.get("host") ?? "localhost").split(":")[0];
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]")
    return "local";
  return `email:${(await requireChatGPTUser("/")).email.toLowerCase()}`;
}

async function requireOwnedLedger(ledgerId: number) {
  const ownerId = await currentOwnerId();
  const db = getDbBinding();
  await db.prepare("UPDATE ledgers SET owner_id=? WHERE id=? AND owner_id IS NULL").bind(ownerId, ledgerId).run();
  const row = await db.prepare("SELECT id FROM ledgers WHERE id=? AND owner_id=?").bind(ledgerId, ownerId).first();
  if (!row) throw new Error("无权访问这个账本");
  return ownerId;
}
async function addTransaction(formData: FormData) {
  "use server";
  const amountYuan = Number(formData.get("amount"));
  const amount = Math.round(amountYuan * 100);
  const title = String(formData.get("title") || "今日消费")
    .trim()
    .slice(0, 40);
  const type = String(formData.get("type"));
  const mood = String(formData.get("mood"));
  const category = String(formData.get("category"));
  const incomeCategory = String(formData.get("incomeCategory"));
  const accountId = Number(formData.get("accountId"));
  const occurredAt = String(formData.get("occurredAt") || "");
  const originalTimezone = String(formData.get("originalTimezone") || "Asia/Shanghai");
  const ledgerId = Number(formData.get("ledgerId") || 1);
  const splitMode = String(formData.get("splitMode") || "");
  const splitWithMemberId = Number(formData.get("splitWithMemberId") || 0);
  const mySharePercent = Math.max(
    0,
    Math.min(100, Number(formData.get("mySharePercent") || 100)),
  );
  const isSideHustle = formData.get("isSideHustle") === "on";
  const isBusinessExpense = formData.get("isBusinessExpense") === "on";

  if (!Number.isFinite(amount) || amount <= 0)
    throw new Error("请输入正确金额");
  if (!(type === "支出" || type === "收入")) throw new Error("请选择收支类型");
  if (type === "支出" && !moods.includes(mood as (typeof moods)[number]))
    throw new Error("请选择消费情绪");
  if (!Number.isInteger(accountId) || accountId <= 0)
    throw new Error("请选择账户");

  await ensureDb();
  await requireOwnedLedger(ledgerId);
  const binding = getDbBinding();
  let configuredIncomeCategory: {
    name: string;
    builtinKey: string | null;
  } | null = null;
  if (type === "支出") {
    const configuredCategory = await binding
      .prepare(
        "SELECT id FROM expense_categories WHERE ledger_id=? AND name=? AND is_active=1",
      )
      .bind(ledgerId, category)
      .first();
    if (!configuredCategory) throw new Error("请选择有效的消费分类");
  }
  if (type === "收入") {
    configuredIncomeCategory = await binding
      .prepare(
        "SELECT name,builtin_key builtinKey FROM income_categories WHERE ledger_id=? AND name=? AND is_active=1",
      )
      .bind(ledgerId, incomeCategory)
      .first<{ name: string; builtinKey: string | null }>();
    if (!configuredIncomeCategory) throw new Error("请选择有效的收入分类");
  }
  const account = await binding
    .prepare(
      "SELECT id, is_investment AS isInvestment,currency FROM accounts WHERE id = ? AND ledger_id=?",
    )
    .bind(accountId, ledgerId)
    .first<{ id: number; isInvestment: number; currency: string }>();
  if (!account) throw new Error("扣款账户不存在");
  const normalizedTime = localDateTimeToUtc(occurredAt || new Date().toISOString(), originalTimezone);
  const balanceDelta = type === "支出" ? -amount : amount;

  const me = await binding
    .prepare("SELECT id FROM members WHERE ledger_id=? AND is_me=1")
    .bind(ledgerId)
    .first<{ id: number }>();
  const shared =
    type === "支出" &&
    splitWithMemberId > 0 &&
    ["全额由我支付", "全额由对方支付", "按比例平摊"].includes(splitMode);
  const results = await binding.batch([
    binding
      .prepare(
        `
      INSERT INTO transactions (ledger_id,title,amount,type,mood,category,category_dynamic,income_category,income_category_dynamic,account_id,occurred_at,paid_by_member_id,split_with_member_id,split_mode,my_share_percent,currency,original_amount,original_currency,exchange_rate_micros,original_timezone,is_side_hustle)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1000000,?,?)
    `,
      )
      .bind(
        ledgerId,
        title || (type === "收入" ? "本期收入" : "今日消费"),
        amount,
        type,
        type === "支出" ? mood : null,
        type === "支出" && categories.includes(category as never)
          ? category
          : null,
        type === "支出" ? category : null,
        type === "收入" ? configuredIncomeCategory?.builtinKey : null,
        type === "收入" ? configuredIncomeCategory?.name : null,
        accountId,
        normalizedTime,
        shared
          ? splitMode === "全额由对方支付"
            ? splitWithMemberId
            : (me?.id ?? null)
          : null,
        shared ? splitWithMemberId : null,
        shared ? splitMode : null,
        shared ? mySharePercent : 100,
        account.currency,
        amount,
        account.currency,
        originalTimezone,
        type === "收入" && isSideHustle ? 1 : 0,
      ),
    binding
      .prepare(
        `UPDATE accounts SET current_balance = current_balance + ?,
      cumulative_income = cumulative_income + ? WHERE id = ?`,
      )
      .bind(
        balanceDelta,
        type === "收入" &&
          configuredIncomeCategory?.builtinKey === "理财收益" &&
          account.isInvestment
          ? amount
          : 0,
        accountId,
      ),
  ]);
  const transactionId = Number(results[0].meta.last_row_id);
  if (type === "支出" && isBusinessExpense && transactionId)
    await binding
      .prepare(
        "INSERT INTO side_hustle_deductions(ledger_id,transaction_id,amount,note) VALUES (?,?,?,?)",
      )
      .bind(ledgerId, transactionId, amount, title || "副业经营成本")
      .run();
  await evaluateAchievements(ledgerId);
  revalidatePath("/");
}

async function deleteTransaction(id: number) {
  "use server";
  try {
    await ensureDb();
    const binding = getDbBinding();
    const item = await binding
      .prepare(
        "SELECT amount, type, income_category AS incomeCategory, account_id AS accountId,installment_id AS installmentId,crdt_id AS crdtId,ledger_id AS ledgerId FROM transactions WHERE id = ?",
      )
      .bind(id)
      .first<{
        amount: number;
        type: string;
        incomeCategory: string | null;
        accountId: number;
        installmentId: number | null;
        crdtId: string | null;
        ledgerId: number;
      }>();
    if (!item)
      return { ok: false, error: "这笔流水已经不存在，页面可能尚未刷新。" };
    await requireOwnedLedger(item.ledgerId);
    if (item.installmentId)
      return {
        ok: false,
        error:
          "这是分期摊销引擎自动生成的还款流水，不能单独删除。请前往「负债摊销沙盘」管理对应分期项目。",
      };
    const reverseDelta = item.type === "支出" ? item.amount : -item.amount;
    await binding.batch([
      binding
        .prepare(
          `UPDATE accounts SET current_balance = current_balance + ?,
      cumulative_income = MAX(0, cumulative_income - ?) WHERE id = ?`,
        )
        .bind(
          reverseDelta,
          item.type === "收入" && item.incomeCategory === "理财收益"
            ? item.amount
            : 0,
          item.accountId,
        ),
      binding
        .prepare("DELETE FROM side_hustle_deductions WHERE transaction_id = ?")
        .bind(id),
      binding
        .prepare(
          "INSERT OR IGNORE INTO crdt_tombstones(crdt_id,ledger_id) VALUES(?,?)",
        )
        .bind(item.crdtId ?? `legacy:${id}`, item.ledgerId),
      binding.prepare("INSERT OR REPLACE INTO sync_tombstones(entity_type,entity_uuid,ledger_id,deleted_at) VALUES('transaction',?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))").bind(item.crdtId ?? `legacy:${id}`, item.ledgerId),
      binding.prepare("DELETE FROM transactions WHERE id = ?").bind(id),
    ]);
    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "删除失败，请稍后重试。",
    };
  }
}

async function updateBudget(formData: FormData) {
  "use server";
  const amount = Math.round(Number(formData.get("budget")) * 100);
  const ledgerId = Number(formData.get("ledgerId") || 1);
  if (!Number.isFinite(amount) || amount <= 0)
    throw new Error("请输入正确预算");
  await ensureDb();
  await requireOwnedLedger(ledgerId);
  await getDb()
    .update(budgetSettings)
    .set({ amount, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(budgetSettings.id, ledgerId));
  revalidatePath("/");
}

async function parseImportText(text: string, ledgerId: number) {
  "use server";
  const cleaned = text.trim();
  await ensureDb();
  await requireOwnedLedger(ledgerId);
  const moneyMatches = [
    ...cleaned.matchAll(
      /(?:实付|合计|金额|¥|￥)\s*[:：]?\s*(\d+(?:\.\d{1,2})?)/gi,
    ),
  ];
  const fallback = cleaned.match(/(\d+(?:\.\d{1,2})?)/);
  const amount = moneyMatches.at(-1)?.[1] || fallback?.[1] || "";
  const rules: Array<[RegExp, (typeof categories)[number]]> = [
    [/咖啡|拿铁|美式|瑞幸|星巴克/i, "咖啡"],
    [/地铁|公交|打车|滴滴|高铁/i, "交通"],
    [/游戏|电影|会员|演出|谷子/i, "娱乐"],
    [/淘宝|京东|衣服|商品|购物/i, "购物"],
  ];
  const type = /工资|薪资|奖金|入账|收入|到账/.test(cleaned) ? "收入" : "支出";
  const legacyCategory =
    rules.find(([rule]) => rule.test(cleaned))?.[1] ?? "餐饮";
  const legacyIncomeCategory = /工资|薪资|奖金/.test(cleaned)
    ? "薪资发放"
    : /理财|基金|收益/.test(cleaned)
      ? "理财收益"
      : /兼职|外快/.test(cleaned)
        ? "兼职外快"
        : "其它收入";
  const mood = /冲动|上头|后悔/.test(cleaned)
    ? "冲动"
    : /开心|奖励|悦己/.test(cleaned)
      ? "悦己"
      : "刚需";
  const categoryRows = await getDbBinding()
    .prepare(
      "SELECT name,builtin_key builtinKey FROM expense_categories WHERE ledger_id=? AND is_active=1 ORDER BY sort_order,id",
    )
    .bind(ledgerId)
    .all<{ name: string; builtinKey: string | null }>();
  const category =
    categoryRows.results.find((item) => item.builtinKey === legacyCategory)
      ?.name ??
    categoryRows.results[0]?.name ??
    legacyCategory;
  const incomeCategoryRows = await getDbBinding()
    .prepare(
      "SELECT name,builtin_key builtinKey FROM income_categories WHERE ledger_id=? AND is_active=1 ORDER BY sort_order,id",
    )
    .bind(ledgerId)
    .all<{ name: string; builtinKey: string | null }>();
  const incomeCategory =
    incomeCategoryRows.results.find(
      (item) => item.builtinKey === legacyIncomeCategory,
    )?.name ??
    incomeCategoryRows.results[0]?.name ??
    legacyIncomeCategory;
  const accountRows = await getDb()
    .select()
    .from(accounts)
    .where(eq(accounts.ledgerId, ledgerId));
  const account =
    accountRows.find(
      (item) =>
        cleaned.includes(item.name) ||
        (item.name.includes("支付宝") && cleaned.includes("支付宝")) ||
        (item.name.includes("微信") && cleaned.includes("微信")),
    ) ?? accountRows[0];
  const title =
    cleaned
      .split(/[\n，,]/)
      .map((part) => part.trim())
      .find((part) => part && !/^\d/.test(part))
      ?.slice(0, 28) || "导入订单";
  return {
    amount,
    category,
    title,
    type,
    incomeCategory,
    mood,
    accountId: account?.id ?? 0,
    accountName: account?.name ?? "未找到账户",
  };
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ ledger?: string }>;
}) {
  await ensureDb();
  const ownerId = await currentOwnerId();
  await getDbBinding()
    .prepare("UPDATE ledgers SET owner_id=? WHERE owner_id IS NULL")
    .bind(ownerId)
    .run();
  const params = await searchParams;
  const ledgerRows = await getDb()
    .select()
    .from(ledgers)
    .where(eq(ledgers.ownerId, ownerId))
    .orderBy(ledgers.id);
  const requestedLedger = Number(params.ledger || 1);
  const ledgerId = ledgerRows.some((item) => item.id === requestedLedger)
    ? requestedLedger
    : (ledgerRows[0]?.id ?? 1);
  await processDueSubscriptions(ledgerId);
  await processDueInstallments(ledgerId);
  const db = getDb();
  const [
    records,
    accountRows,
    budgetRows,
    categoryBudgetRows,
    subscriptionRows,
    goalRows,
    preferenceRows,
    memberRows,
    installmentRows,
    achievementResult,
    deductionRows,
    fireRows,
    economicRows,
    digitalAssetRows,
    expenseCategoryRows,
    incomeCategoryRows,
  ] = await Promise.all([
    db
      .select()
      .from(transactions)
      .where(eq(transactions.ledgerId, ledgerId))
      .orderBy(desc(transactions.occurredAt), desc(transactions.id)),
    db
      .select()
      .from(accounts)
      .where(eq(accounts.ledgerId, ledgerId))
      .orderBy(accounts.id),
    db.select().from(budgetSettings).where(eq(budgetSettings.id, ledgerId)),
    db
      .select()
      .from(categoryBudgets)
      .where(eq(categoryBudgets.ledgerId, ledgerId))
      .orderBy(categoryBudgets.category),
    db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.ledgerId, ledgerId))
      .orderBy(subscriptions.nextChargeDate),
    db
      .select()
      .from(savingsGoals)
      .where(eq(savingsGoals.ledgerId, ledgerId))
      .orderBy(savingsGoals.id),
    getOwnerPreferences(ownerId),
    db
      .select()
      .from(members)
      .where(eq(members.ledgerId, ledgerId))
      .orderBy(desc(members.isMe), members.id),
    db
      .select()
      .from(installments)
      .where(eq(installments.ledgerId, ledgerId))
      .orderBy(desc(installments.id)),
    evaluateAchievements(ledgerId),
    db
      .select()
      .from(sideHustleDeductions)
      .where(eq(sideHustleDeductions.ledgerId, ledgerId))
      .orderBy(desc(sideHustleDeductions.id)),
    db.select().from(fireSettings).where(eq(fireSettings.ledgerId, ledgerId)),
    db
      .select()
      .from(economicSettings)
      .where(eq(economicSettings.ledgerId, ledgerId)),
    db
      .select()
      .from(digitalAssets)
      .where(eq(digitalAssets.ledgerId, ledgerId))
      .orderBy(desc(digitalAssets.id)),
    db
      .select()
      .from(expenseCategories)
      .where(eq(expenseCategories.ledgerId, ledgerId))
      .orderBy(expenseCategories.sortOrder, expenseCategories.id),
    db
      .select()
      .from(incomeCategoriesConfig)
      .where(eq(incomeCategoriesConfig.ledgerId, ledgerId))
      .orderBy(incomeCategoriesConfig.sortOrder, incomeCategoriesConfig.id),
  ]);

  return (
    <LedgerApp
      transactions={records.map((row) => ({
        ...row,
        category: row.categoryDynamic ?? row.category,
        incomeCategory: row.incomeCategoryDynamic ?? row.incomeCategory,
      }))}
      accounts={accountRows}
      budget={budgetRows[0]?.amount ?? 500000}
      categoryBudgets={categoryBudgetRows}
      subscriptions={subscriptionRows.map((row) => ({
        ...row,
        category: row.categoryDynamic ?? row.category,
      }))}
      ledgers={ledgerRows}
      currentLedgerId={ledgerId}
      savingsGoals={goalRows}
      members={memberRows}
      installments={installmentRows}
      achievements={achievementResult.results}
      exchangeRates={FX_TO_CNY}
      deductions={deductionRows}
      fireSetting={
        fireRows[0] ?? {
          ledgerId,
          monthlyExpense: 1200000,
          annualReturnBps: 500,
          updatedAt: "",
        }
      }
      economicSetting={
        economicRows[0] ?? { ledgerId, inflationBps: 250, updatedAt: "" }
      }
      digitalAssets={digitalAssetRows.map((row) =>
        evaluateDigitalAsset(row),
      )}
      expenseCategories={expenseCategoryRows}
      incomeCategories={incomeCategoryRows}
      initialTheme={(preferenceRows?.theme as "cream" | "obsidian" | "glacier" | "peach") ?? "cream"}
      lockEnabled={Boolean(preferenceRows?.lockEnabled)}
      addTransaction={addTransaction}
      deleteTransaction={deleteTransaction}
      updateBudget={updateBudget}
      parseImportText={parseImportText}
    />
  );
}
