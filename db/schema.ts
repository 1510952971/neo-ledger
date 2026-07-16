import { sql } from "drizzle-orm";
import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const ledgers = sqliteTable("ledgers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("🏠"),
  ownerId: text("owner_id"),
  uuid: text("uuid").notNull(),
  updatedAt: text("updated_at").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ledgerId: integer("ledger_id").notNull().default(1),
  name: text("name").notNull(),
  type: text("type", { enum: ["资产", "负债"] }).notNull(),
  currentBalance: integer("current_balance").notNull().default(0),
  billDay: integer("bill_day"),
  repaymentDay: integer("repayment_day"),
  icon: text("icon").notNull().default("💳"),
  isInvestment: integer("is_investment", { mode: "boolean" })
    .notNull()
    .default(false),
  initialBalance: integer("initial_balance").notNull().default(0),
  cumulativeIncome: integer("cumulative_income").notNull().default(0),
  currency: text("currency", { enum: ["CNY", "USD", "JPY", "EUR"] })
    .notNull()
    .default("CNY"),
  assetClass: text("asset_class", { enum: ["现金流", "固收防守", "风险进攻"] })
    .notNull()
    .default("现金流"),
  uuid: text("uuid").notNull(),
  updatedAt: text("updated_at").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const digitalAssets = sqliteTable("digital_assets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ledgerId: integer("ledger_id").notNull().default(1),
  name: text("name").notNull(),
  assetType: text("asset_type", {
    enum: ["数码设备", "游戏账号", "潮流玩具"],
  }).notNull(),
  purchasePrice: integer("purchase_price").notNull(),
  purchaseDate: text("purchase_date").notNull(),
  lifespanMonths: integer("lifespan_months").notNull(),
  residualRateBps: integer("residual_rate_bps").notNull().default(0),
  heatLevel: text("heat_level", { enum: ["高", "中", "低"] }),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const pendingTransactions = sqliteTable("pending_transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ledgerId: integer("ledger_id").notNull().default(1),
  rawText: text("raw_text").notNull(),
  title: text("title").notNull(),
  amount: integer("amount").notNull(),
  type: text("type", { enum: ["支出", "收入"] }).notNull(),
  accountId: integer("account_id")
    .notNull()
    .references(() => accounts.id),
  currency: text("currency", { enum: ["CNY", "USD", "JPY", "EUR"] })
    .notNull()
    .default("CNY"),
  occurredAt: text("occurred_at").notNull(),
  status: text("status", { enum: ["待确认", "已确认", "已忽略"] })
    .notNull()
    .default("待确认"),
  balanceApplied: integer("balance_applied", { mode: "boolean" })
    .notNull()
    .default(true),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const systemNotifications = sqliteTable("system_notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ledgerId: integer("ledger_id").notNull().default(1),
  title: text("title").notNull(),
  message: text("message").notNull(),
  read: integer("read", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const fireSettings = sqliteTable("fire_settings", {
  ledgerId: integer("ledger_id").primaryKey(),
  monthlyExpense: integer("monthly_expense").notNull().default(1200000),
  annualReturnBps: integer("annual_return_bps").notNull().default(500),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
export const economicSettings = sqliteTable("economic_settings", {
  ledgerId: integer("ledger_id").primaryKey(),
  inflationBps: integer("inflation_bps").notNull().default(250),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
export const crdtTombstones = sqliteTable("crdt_tombstones", {
  crdtId: text("crdt_id").primaryKey(),
  ledgerId: integer("ledger_id").notNull(),
  deletedAt: text("deleted_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
export const peerSignals = sqliteTable("peer_signals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  room: text("room").notNull(),
  fromNode: text("from_node").notNull(),
  toNode: text("to_node").notNull(),
  kind: text("kind").notNull(),
  payload: text("payload").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ledgerId: integer("ledger_id").notNull().default(1),
  title: text("title").notNull(),
  amount: integer("amount").notNull(),
  type: text("type", { enum: ["支出", "收入"] }).notNull(),
  mood: text("mood", { enum: ["悦己", "刚需", "冲动"] }),
  category: text("category", {
    enum: ["餐饮", "交通", "购物", "咖啡", "娱乐"],
  }),
  categoryDynamic: text("category_dynamic"),
  incomeCategory: text("income_category", {
    enum: ["薪资发放", "理财收益", "兼职外快", "其它收入"],
  }),
  incomeCategoryDynamic: text("income_category_dynamic"),
  accountId: integer("account_id")
    .notNull()
    .references(() => accounts.id),
  paidByMemberId: integer("paid_by_member_id"),
  splitWithMemberId: integer("split_with_member_id"),
  splitMode: text("split_mode", {
    enum: ["全额由我支付", "全额由对方支付", "按比例平摊", "人情平账"],
  }),
  mySharePercent: integer("my_share_percent").notNull().default(100),
  currency: text("currency", { enum: ["CNY", "USD", "JPY", "EUR"] })
    .notNull()
    .default("CNY"),
  originalAmount: integer("original_amount"),
  originalCurrency: text("original_currency", {
    enum: ["CNY", "USD", "JPY", "EUR"],
  }),
  exchangeRateMicros: integer("exchange_rate_micros").notNull().default(1000000),
  originalTimezone: text("original_timezone").notNull().default("Asia/Shanghai"),
  occurrenceKey: text("occurrence_key"),
  installmentId: integer("installment_id"),
  installmentNumber: integer("installment_number"),
  isSideHustle: integer("is_side_hustle", { mode: "boolean" })
    .notNull()
    .default(false),
  offlineId: text("offline_id"),
  crdtId: text("crdt_id"),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  occurredAt: text("occurred_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const expenseCategories = sqliteTable("expense_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ledgerId: integer("ledger_id").notNull().default(1),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("📦"),
  color: text("color").notNull().default("#8f91b8"),
  builtinKey: text("builtin_key"),
  isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const incomeCategoriesConfig = sqliteTable("income_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ledgerId: integer("ledger_id").notNull().default(1),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("💰"),
  color: text("color").notNull().default("#78a98c"),
  builtinKey: text("builtin_key"),
  isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const sideHustleDeductions = sqliteTable("side_hustle_deductions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ledgerId: integer("ledger_id").notNull().default(1),
  transactionId: integer("transaction_id")
    .notNull()
    .references(() => transactions.id),
  amount: integer("amount").notNull(),
  note: text("note").notNull().default("副业经营成本"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const installments = sqliteTable("installments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ledgerId: integer("ledger_id").notNull().default(1),
  name: text("name").notNull(),
  totalAmount: integer("total_amount").notNull(),
  periods: integer("periods").notNull(),
  paidPeriods: integer("paid_periods").notNull().default(0),
  feeAmount: integer("fee_amount").notNull().default(0),
  accountId: integer("account_id")
    .notNull()
    .references(() => accounts.id),
  paymentAccountId: integer("payment_account_id").references(() => accounts.id),
  startMonth: text("start_month").notNull(),
  chargeDay: integer("charge_day").notNull().default(1),
  currency: text("currency", { enum: ["CNY", "USD", "JPY", "EUR"] })
    .notNull()
    .default("CNY"),
  uuid: text("uuid").notNull(),
  updatedAt: text("updated_at").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const achievements = sqliteTable(
  "achievements",
  {
    ledgerId: integer("ledger_id").notNull().default(1),
    code: text("code").notNull(),
    unlockedAt: text("unlocked_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.ledgerId, table.code] })],
);

export const members = sqliteTable("members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ledgerId: integer("ledger_id").notNull().default(1),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("👤"),
  isMe: integer("is_me", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const budgetSettings = sqliteTable("budget_settings", {
  id: integer("id").primaryKey(),
  amount: integer("amount").notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const categoryBudgets = sqliteTable(
  "category_budgets",
  {
    ledgerId: integer("ledger_id").notNull().default(1),
    category: text("category", {
      enum: ["餐饮", "交通", "购物", "咖啡", "娱乐"],
    }).notNull(),
    amount: integer("amount").notNull().default(0),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.ledgerId, table.category] })],
);

export const subscriptions = sqliteTable("subscriptions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ledgerId: integer("ledger_id").notNull().default(1),
  name: text("name").notNull(),
  amount: integer("amount").notNull(),
  accountId: integer("account_id")
    .notNull()
    .references(() => accounts.id),
  cycle: text("cycle", { enum: ["每月", "每季", "每年"] }).notNull(),
  category: text("category", { enum: ["餐饮", "交通", "购物", "咖啡", "娱乐"] })
    .notNull()
    .default("娱乐"),
  categoryDynamic: text("category_dynamic"),
  nextChargeDate: text("next_charge_date").notNull(),
  uuid: text("uuid").notNull(),
  updatedAt: text("updated_at").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const savingsGoals = sqliteTable("savings_goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ledgerId: integer("ledger_id").notNull().default(1),
  name: text("name").notNull(),
  targetAmount: integer("target_amount").notNull(),
  savedAmount: integer("saved_amount").notNull().default(0),
  deadline: text("deadline").notNull(),
  icon: text("icon").notNull().default("🌟"),
  uuid: text("uuid").notNull(),
  updatedAt: text("updated_at").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const appPreferences = sqliteTable("app_preferences", {
  id: integer("id").primaryKey(),
  theme: text("theme", { enum: ["cream", "obsidian", "glacier", "peach"] })
    .notNull()
    .default("cream"),
  lockEnabled: integer("lock_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  pinHash: text("pin_hash"),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
