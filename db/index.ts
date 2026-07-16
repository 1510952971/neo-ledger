import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import { dateKeyInZone, localDateTimeToUtc } from "../app/time-money.js";
import {
  ACCOUNT_TRANSFERS_APPLY_TRIGGER_SQL,
  ACCOUNT_TRANSFERS_LEDGER_INDEX_SQL,
  ACCOUNT_TRANSFERS_OCCURRENCE_INDEX_SQL,
  ACCOUNT_TRANSFERS_TABLE_SQL,
  ACCOUNT_TRANSFERS_VALIDATE_TRIGGER_SQL,
  SCHEDULED_OCCURRENCES_TABLE_SQL,
} from "./transfer-schema.js";

const SCHEMA_VERSION = "21";

export const FX_TO_CNY = { CNY: 1, USD: 7.2, JPY: 0.0462, EUR: 7.85 } as const;

export type DigitalAssetRow = {
  id: number;
  ledgerId: number;
  name: string;
  assetType: "数码设备" | "游戏账号" | "潮流玩具";
  purchasePrice: number;
  purchaseDate: string;
  lifespanMonths: number;
  residualRateBps: number;
  heatLevel: "高" | "中" | "低" | null;
  createdAt: string;
};

export function evaluateDigitalAsset(
  asset: DigitalAssetRow,
  now = new Date(),
) {
  const purchased = new Date(`${asset.purchaseDate}T12:00:00Z`);
  const elapsedMonths = Math.max(
    0,
    (now.getTime() - purchased.getTime()) / (86400000 * 30.4375),
  );
  const residualValue = Math.round(
    asset.purchasePrice * (asset.residualRateBps / 10000),
  );
  // Multi-factor accelerated depreciation:
  // V = max(P*R, P*(1-t/L)*e^(-lambda*t)).
  // A popular game retains attention longer; a low-heat account fades faster.
  const heatLambda =
    asset.assetType === "游戏账号"
      ? asset.heatLevel === "高"
        ? 0.008
        : asset.heatLevel === "低"
          ? 0.04
          : 0.02
      : 0;
  const lifeFactor = Math.max(0, 1 - elapsedMonths / asset.lifespanMonths);
  const modeledValue = Math.round(
    asset.purchasePrice * lifeFactor * Math.exp(-heatLambda * elapsedMonths),
  );
  const currentValue = Math.max(residualValue, modeledValue);
  const valueLost = Math.max(0, asset.purchasePrice - currentValue);
  const reachedFloor = currentValue <= residualValue;
  const nextMonth = Math.min(
    asset.lifespanMonths,
    elapsedMonths + 1 / 30.4375,
  );
  const nextValue = Math.max(
    residualValue,
    Math.round(
      asset.purchasePrice *
        Math.max(0, 1 - nextMonth / asset.lifespanMonths) *
        Math.exp(-heatLambda * nextMonth),
    ),
  );
  return {
    ...asset,
    elapsedMonths: Number(elapsedMonths.toFixed(2)),
    currentValue,
    residualValue,
    valueLost,
    lossPercent: Number(
      ((valueLost / Math.max(1, asset.purchasePrice)) * 100).toFixed(1),
    ),
    dailyDepreciation: reachedFloor
      ? 0
      : Math.max(0, currentValue - nextValue),
    heatLambda,
  };
}

export function getDbBinding() {
  if (!env.DB) throw new Error("本地 SQLite 数据库尚未连接");
  return env.DB;
}

export function getDb() {
  return drizzle(getDbBinding(), { schema });
}

export async function ensureDb() {
  const binding = getDbBinding();
  await binding
    .prepare(
      "CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    )
    .run();
  const version = await binding
    .prepare("SELECT value FROM app_meta WHERE key = 'schema_version'")
    .first<{ value: string }>();
  if (version?.value === SCHEMA_VERSION) return;
  if (version?.value === "20") {
    const transactionColumns = await binding
      .prepare("PRAGMA table_info(transactions)")
      .all<{ name: string }>();
    const names = new Set(transactionColumns.results.map((column) => column.name));
    const repairs = [];
    if (!names.has("offline_id"))
      repairs.push(
        binding.prepare("ALTER TABLE transactions ADD COLUMN offline_id TEXT"),
      );
    repairs.push(
      binding.prepare(
        "CREATE UNIQUE INDEX IF NOT EXISTS transactions_offline_id_unique ON transactions(offline_id) WHERE offline_id IS NOT NULL",
      ),
      binding.prepare("UPDATE app_meta SET value='21' WHERE key='schema_version'"),
    );
    await binding.batch(repairs);
    return;
  }
  if (version?.value === "19") {
    await binding.batch([
      binding.prepare("ALTER TABLE sync_tombstones ADD COLUMN owner_id TEXT"),
      binding.prepare("UPDATE sync_tombstones SET owner_id=(SELECT owner_id FROM ledgers WHERE ledgers.id=sync_tombstones.ledger_id) WHERE owner_id IS NULL"),
      binding.prepare("CREATE INDEX sync_tombstones_owner_idx ON sync_tombstones(owner_id,deleted_at)"),
      binding.prepare("CREATE TRIGGER sync_tombstones_assign_owner AFTER INSERT ON sync_tombstones WHEN NEW.owner_id IS NULL BEGIN UPDATE sync_tombstones SET owner_id=(SELECT owner_id FROM ledgers WHERE id=NEW.ledger_id) WHERE entity_type=NEW.entity_type AND entity_uuid=NEW.entity_uuid; END"),
      binding.prepare("UPDATE app_meta SET value='20' WHERE key='schema_version'"),
    ]);
    return ensureDb();
  }
  if (version?.value === "18") {
    await binding.batch([
      binding.prepare("ALTER TABLE ledgers ADD COLUMN owner_id TEXT"),
      binding.prepare("ALTER TABLE ledgers ADD COLUMN uuid TEXT"),
      binding.prepare("ALTER TABLE ledgers ADD COLUMN updated_at TEXT"),
      binding.prepare("UPDATE ledgers SET uuid=lower(hex(randomblob(16))),updated_at=COALESCE(created_at,CURRENT_TIMESTAMP) WHERE uuid IS NULL"),
      binding.prepare("CREATE UNIQUE INDEX ledgers_uuid_unique ON ledgers(uuid)"),
      binding.prepare("ALTER TABLE accounts ADD COLUMN uuid TEXT"),
      binding.prepare("ALTER TABLE accounts ADD COLUMN updated_at TEXT"),
      binding.prepare("UPDATE accounts SET uuid=lower(hex(randomblob(16))),updated_at=COALESCE(created_at,CURRENT_TIMESTAMP) WHERE uuid IS NULL"),
      binding.prepare("CREATE UNIQUE INDEX accounts_uuid_unique ON accounts(uuid)"),
      binding.prepare("ALTER TABLE transactions ADD COLUMN original_amount INTEGER"),
      binding.prepare("ALTER TABLE transactions ADD COLUMN original_currency TEXT"),
      binding.prepare("ALTER TABLE transactions ADD COLUMN exchange_rate_micros INTEGER NOT NULL DEFAULT 1000000"),
      binding.prepare("ALTER TABLE transactions ADD COLUMN original_timezone TEXT NOT NULL DEFAULT 'legacy/unknown'"),
      binding.prepare("ALTER TABLE transactions ADD COLUMN occurrence_key TEXT"),
      binding.prepare("UPDATE transactions SET original_amount=amount,original_currency=currency WHERE original_amount IS NULL OR original_currency IS NULL"),
      binding.prepare("CREATE UNIQUE INDEX transactions_occurrence_unique ON transactions(occurrence_key) WHERE occurrence_key IS NOT NULL"),
      binding.prepare("ALTER TABLE installments ADD COLUMN uuid TEXT"),
      binding.prepare("ALTER TABLE installments ADD COLUMN payment_account_id INTEGER"),
      binding.prepare("ALTER TABLE installments ADD COLUMN updated_at TEXT"),
      binding.prepare("UPDATE installments SET uuid=lower(hex(randomblob(16))),updated_at=COALESCE(created_at,CURRENT_TIMESTAMP) WHERE uuid IS NULL"),
      binding.prepare("UPDATE installments SET payment_account_id=(SELECT a.id FROM accounts a WHERE a.ledger_id=installments.ledger_id AND a.type='资产' AND a.currency=installments.currency ORDER BY a.id LIMIT 1) WHERE payment_account_id IS NULL AND (SELECT type FROM accounts WHERE id=installments.account_id)='负债'"),
      binding.prepare("CREATE UNIQUE INDEX installments_uuid_unique ON installments(uuid)"),
      binding.prepare("ALTER TABLE subscriptions ADD COLUMN uuid TEXT"),
      binding.prepare("ALTER TABLE subscriptions ADD COLUMN updated_at TEXT"),
      binding.prepare("UPDATE subscriptions SET uuid=lower(hex(randomblob(16))),updated_at=COALESCE(created_at,CURRENT_TIMESTAMP) WHERE uuid IS NULL"),
      binding.prepare("CREATE UNIQUE INDEX subscriptions_uuid_unique ON subscriptions(uuid)"),
      binding.prepare("ALTER TABLE savings_goals ADD COLUMN uuid TEXT"),
      binding.prepare("ALTER TABLE savings_goals ADD COLUMN updated_at TEXT"),
      binding.prepare("UPDATE savings_goals SET uuid=lower(hex(randomblob(16))),updated_at=COALESCE(created_at,CURRENT_TIMESTAMP) WHERE uuid IS NULL"),
      binding.prepare("CREATE UNIQUE INDEX savings_goals_uuid_unique ON savings_goals(uuid)"),
      binding.prepare(ACCOUNT_TRANSFERS_TABLE_SQL),
      binding.prepare(ACCOUNT_TRANSFERS_OCCURRENCE_INDEX_SQL),
      binding.prepare(ACCOUNT_TRANSFERS_LEDGER_INDEX_SQL),
      binding.prepare(ACCOUNT_TRANSFERS_VALIDATE_TRIGGER_SQL),
      binding.prepare(ACCOUNT_TRANSFERS_APPLY_TRIGGER_SQL),
      binding.prepare(SCHEDULED_OCCURRENCES_TABLE_SQL),
      binding.prepare("CREATE TABLE sync_tombstones(entity_type TEXT NOT NULL,entity_uuid TEXT NOT NULL,ledger_id INTEGER NOT NULL,deleted_at TEXT NOT NULL,PRIMARY KEY(entity_type,entity_uuid))"),
      binding.prepare("CREATE TABLE api_rate_limits(owner_id TEXT NOT NULL,scope TEXT NOT NULL,window_start INTEGER NOT NULL,count INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(owner_id,scope,window_start))"),
      binding.prepare("CREATE TABLE user_preferences(owner_id TEXT PRIMARY KEY,theme TEXT NOT NULL DEFAULT 'cream',lock_enabled INTEGER NOT NULL DEFAULT 0,pin_hash TEXT,pin_salt TEXT,pin_iterations INTEGER NOT NULL DEFAULT 120000,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
      binding.prepare("CREATE TRIGGER ledgers_touch_updated AFTER UPDATE ON ledgers WHEN NEW.updated_at=OLD.updated_at BEGIN UPDATE ledgers SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id; END"),
      binding.prepare("CREATE TRIGGER accounts_touch_updated AFTER UPDATE ON accounts WHEN NEW.updated_at=OLD.updated_at BEGIN UPDATE accounts SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id; END"),
      binding.prepare("CREATE TRIGGER installments_touch_updated AFTER UPDATE ON installments WHEN NEW.updated_at=OLD.updated_at BEGIN UPDATE installments SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id; END"),
      binding.prepare("CREATE TRIGGER subscriptions_touch_updated AFTER UPDATE ON subscriptions WHEN NEW.updated_at=OLD.updated_at BEGIN UPDATE subscriptions SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id; END"),
      binding.prepare("CREATE TRIGGER savings_goals_touch_updated AFTER UPDATE ON savings_goals WHEN NEW.updated_at=OLD.updated_at BEGIN UPDATE savings_goals SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id; END"),
      binding.prepare("INSERT OR IGNORE INTO app_meta(key,value) VALUES('installation_id',lower(hex(randomblob(16))))"),
      binding.prepare("UPDATE app_meta SET value='19' WHERE key='schema_version'"),
    ]);
    return ensureDb();
  }
  if (version?.value === "17") {
    await binding.batch([
      binding.prepare("ALTER TABLE subscriptions RENAME TO subscriptions_v17"),
      binding.prepare(
        "CREATE TABLE subscriptions(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,amount INTEGER NOT NULL,account_id INTEGER NOT NULL REFERENCES accounts(id),cycle TEXT NOT NULL CHECK(cycle IN ('每月','每季','每年')),category TEXT NOT NULL DEFAULT '娱乐',next_charge_date TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,ledger_id INTEGER NOT NULL DEFAULT 1,category_dynamic TEXT)",
      ),
      binding.prepare(
        "INSERT INTO subscriptions(id,name,amount,account_id,cycle,category,next_charge_date,created_at,ledger_id,category_dynamic) SELECT id,name,amount,account_id,cycle,category,next_charge_date,created_at,ledger_id,category_dynamic FROM subscriptions_v17",
      ),
      binding.prepare("DROP TABLE subscriptions_v17"),
      binding
        .prepare("UPDATE app_meta SET value=? WHERE key='schema_version'")
        .bind("18"),
    ]);
    return ensureDb();
  }
  if (version?.value === "16") {
    await binding.batch([
      binding.prepare(
        "CREATE TABLE income_categories(id INTEGER PRIMARY KEY AUTOINCREMENT,ledger_id INTEGER NOT NULL DEFAULT 1,name TEXT NOT NULL,icon TEXT NOT NULL DEFAULT '💰',color TEXT NOT NULL DEFAULT '#78a98c',builtin_key TEXT,is_system INTEGER NOT NULL DEFAULT 0,is_active INTEGER NOT NULL DEFAULT 1,sort_order INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
      ),
      binding.prepare(
        "CREATE UNIQUE INDEX income_categories_name_unique ON income_categories(ledger_id,name)",
      ),
      binding.prepare(
        "CREATE UNIQUE INDEX income_categories_builtin_unique ON income_categories(ledger_id,builtin_key) WHERE builtin_key IS NOT NULL",
      ),
      binding.prepare(
        "INSERT INTO income_categories(ledger_id,name,icon,color,builtin_key,is_system,sort_order) SELECT id,'薪资发放','💼','#4f9b78','薪资发放',1,10 FROM ledgers",
      ),
      binding.prepare(
        "INSERT INTO income_categories(ledger_id,name,icon,color,builtin_key,is_system,sort_order) SELECT id,'理财收益','📈','#78b899','理财收益',1,20 FROM ledgers",
      ),
      binding.prepare(
        "INSERT INTO income_categories(ledger_id,name,icon,color,builtin_key,is_system,sort_order) SELECT id,'兼职外快','🧧','#d19a5d','兼职外快',1,30 FROM ledgers",
      ),
      binding.prepare(
        "INSERT INTO income_categories(ledger_id,name,icon,color,builtin_key,is_system,sort_order) SELECT id,'其它收入','🎁','#8f91b8','其它收入',1,40 FROM ledgers",
      ),
      binding.prepare(
        "ALTER TABLE transactions ADD COLUMN income_category_dynamic TEXT",
      ),
      binding.prepare(
        "UPDATE transactions SET income_category_dynamic=income_category WHERE income_category_dynamic IS NULL",
      ),
      binding.prepare(
        "CREATE TRIGGER transactions_income_category_dynamic_insert AFTER INSERT ON transactions WHEN NEW.income_category_dynamic IS NULL AND NEW.income_category IS NOT NULL BEGIN UPDATE transactions SET income_category_dynamic=COALESCE((SELECT name FROM income_categories WHERE ledger_id=NEW.ledger_id AND builtin_key=NEW.income_category),NEW.income_category) WHERE id=NEW.id; END",
      ),
      binding.prepare(
        "UPDATE app_meta SET value='17' WHERE key='schema_version'",
      ),
    ]);
    return ensureDb();
  }
  if (version?.value === "15") {
    await binding.batch([
      binding.prepare(
        "CREATE TABLE expense_categories(id INTEGER PRIMARY KEY AUTOINCREMENT,ledger_id INTEGER NOT NULL DEFAULT 1,name TEXT NOT NULL,icon TEXT NOT NULL DEFAULT '📦',color TEXT NOT NULL DEFAULT '#8f91b8',builtin_key TEXT,is_system INTEGER NOT NULL DEFAULT 0,is_active INTEGER NOT NULL DEFAULT 1,sort_order INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
      ),
      binding.prepare(
        "CREATE UNIQUE INDEX expense_categories_name_unique ON expense_categories(ledger_id,name)",
      ),
      binding.prepare(
        "CREATE UNIQUE INDEX expense_categories_builtin_unique ON expense_categories(ledger_id,builtin_key) WHERE builtin_key IS NOT NULL",
      ),
      binding.prepare(
        "INSERT INTO expense_categories(ledger_id,name,icon,color,builtin_key,is_system,sort_order) SELECT id,'餐饮','🍔','#e98565','餐饮',1,10 FROM ledgers",
      ),
      binding.prepare(
        "INSERT INTO expense_categories(ledger_id,name,icon,color,builtin_key,is_system,sort_order) SELECT id,'交通','🚇','#84a28d','交通',1,20 FROM ledgers",
      ),
      binding.prepare(
        "INSERT INTO expense_categories(ledger_id,name,icon,color,builtin_key,is_system,sort_order) SELECT id,'购物','🛍️','#c98fa7','购物',1,30 FROM ledgers",
      ),
      binding.prepare(
        "INSERT INTO expense_categories(ledger_id,name,icon,color,builtin_key,is_system,sort_order) SELECT id,'咖啡','☕','#ae8566','咖啡',1,40 FROM ledgers",
      ),
      binding.prepare(
        "INSERT INTO expense_categories(ledger_id,name,icon,color,builtin_key,is_system,sort_order) SELECT id,'娱乐','🎮','#858cbd','娱乐',1,50 FROM ledgers",
      ),
      binding.prepare("ALTER TABLE transactions ADD COLUMN category_dynamic TEXT"),
      binding.prepare(
        "UPDATE transactions SET category_dynamic=category WHERE category_dynamic IS NULL",
      ),
      binding.prepare("ALTER TABLE subscriptions ADD COLUMN category_dynamic TEXT"),
      binding.prepare(
        "UPDATE subscriptions SET category_dynamic=category WHERE category_dynamic IS NULL",
      ),
      binding.prepare(
        "CREATE TRIGGER transactions_category_dynamic_insert AFTER INSERT ON transactions WHEN NEW.category_dynamic IS NULL AND NEW.category IS NOT NULL BEGIN UPDATE transactions SET category_dynamic=COALESCE((SELECT name FROM expense_categories WHERE ledger_id=NEW.ledger_id AND builtin_key=NEW.category),NEW.category) WHERE id=NEW.id; END",
      ),
      binding.prepare(
        "UPDATE app_meta SET value='16' WHERE key='schema_version'",
      ),
    ]);
    return ensureDb();
  }
  if (version?.value === "14") {
    await binding.batch([
      binding.prepare(
        "CREATE TABLE digital_assets(id INTEGER PRIMARY KEY AUTOINCREMENT,ledger_id INTEGER NOT NULL DEFAULT 1,name TEXT NOT NULL,asset_type TEXT NOT NULL,purchase_price INTEGER NOT NULL,purchase_date TEXT NOT NULL,lifespan_months INTEGER NOT NULL,residual_rate_bps INTEGER NOT NULL DEFAULT 0,heat_level TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
      ),
      binding.prepare(
        "CREATE INDEX digital_assets_ledger_idx ON digital_assets(ledger_id,id)",
      ),
      binding.prepare(
        "UPDATE app_meta SET value='15' WHERE key='schema_version'",
      ),
    ]);
    return ensureDb();
  }
  if (version?.value === "13") {
    await binding.batch([
      binding.prepare(
        "CREATE TABLE economic_settings(ledger_id INTEGER PRIMARY KEY,inflation_bps INTEGER NOT NULL DEFAULT 250,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
      ),
      binding.prepare(
        "INSERT INTO economic_settings(ledger_id) SELECT id FROM ledgers",
      ),
      binding.prepare("ALTER TABLE transactions ADD COLUMN crdt_id TEXT"),
      binding.prepare(
        "ALTER TABLE transactions ADD COLUMN updated_at TEXT",
      ),
      binding.prepare(
        "UPDATE transactions SET crdt_id='neo-local:'||id,updated_at=COALESCE(created_at,CURRENT_TIMESTAMP) WHERE crdt_id IS NULL OR updated_at IS NULL",
      ),
      binding.prepare(
        "CREATE UNIQUE INDEX transactions_crdt_id_unique ON transactions(crdt_id) WHERE crdt_id IS NOT NULL",
      ),
      binding.prepare(
        "CREATE TABLE crdt_tombstones(crdt_id TEXT PRIMARY KEY,ledger_id INTEGER NOT NULL,deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
      ),
      binding.prepare(
        "CREATE TABLE peer_signals(id INTEGER PRIMARY KEY AUTOINCREMENT,room TEXT NOT NULL,from_node TEXT NOT NULL,to_node TEXT NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
      ),
      binding.prepare(
        "CREATE INDEX peer_signals_route_idx ON peer_signals(room,to_node,id)",
      ),
      binding.prepare(
        "CREATE TRIGGER transactions_crdt_insert AFTER INSERT ON transactions WHEN NEW.crdt_id IS NULL BEGIN UPDATE transactions SET crdt_id='neo-'||lower(hex(randomblob(8)))||':'||NEW.id,updated_at=CURRENT_TIMESTAMP WHERE id=NEW.id; END",
      ),
      binding.prepare(
        "UPDATE app_meta SET value='14' WHERE key='schema_version'",
      ),
    ]);
    return ensureDb();
  }
  if (version?.value === "12") {
    await binding.batch([
      binding.prepare(
        "CREATE TABLE fire_settings(ledger_id INTEGER PRIMARY KEY,monthly_expense INTEGER NOT NULL DEFAULT 1200000,annual_return_bps INTEGER NOT NULL DEFAULT 500,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
      ),
      binding.prepare(
        "INSERT INTO fire_settings(ledger_id) SELECT id FROM ledgers",
      ),
      binding.prepare(
        "UPDATE app_meta SET value='13' WHERE key='schema_version'",
      ),
    ]);
    return ensureDb();
  }
  if (version?.value === "11") {
    await binding.batch([
      binding.prepare(
        "ALTER TABLE accounts ADD COLUMN asset_class TEXT NOT NULL DEFAULT '现金流'",
      ),
      binding.prepare(
        "UPDATE accounts SET asset_class=CASE WHEN is_investment=1 THEN '风险进攻' WHEN name LIKE '%银行%' OR name LIKE '%存款%' THEN '固收防守' ELSE '现金流' END WHERE type='资产'",
      ),
      binding.prepare(
        "CREATE TABLE pending_transactions(id INTEGER PRIMARY KEY AUTOINCREMENT,ledger_id INTEGER NOT NULL DEFAULT 1,raw_text TEXT NOT NULL,title TEXT NOT NULL,amount INTEGER NOT NULL,type TEXT NOT NULL,account_id INTEGER NOT NULL REFERENCES accounts(id),currency TEXT NOT NULL DEFAULT 'CNY',occurred_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT '待确认',balance_applied INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
      ),
      binding.prepare(
        "CREATE TABLE system_notifications(id INTEGER PRIMARY KEY AUTOINCREMENT,ledger_id INTEGER NOT NULL DEFAULT 1,title TEXT NOT NULL,message TEXT NOT NULL,read INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
      ),
      binding.prepare("ALTER TABLE transactions ADD COLUMN offline_id TEXT"),
      binding.prepare(
        "CREATE UNIQUE INDEX transactions_offline_id_unique ON transactions(offline_id) WHERE offline_id IS NOT NULL",
      ),
      binding.prepare(
        "UPDATE app_meta SET value='12' WHERE key='schema_version'",
      ),
    ]);
    return ensureDb();
  }

  if (version?.value === "10") {
    await binding.batch([
      binding.prepare(
        "ALTER TABLE transactions ADD COLUMN is_side_hustle INTEGER NOT NULL DEFAULT 0",
      ),
      binding.prepare(
        "CREATE TABLE side_hustle_deductions (id INTEGER PRIMARY KEY AUTOINCREMENT,ledger_id INTEGER NOT NULL DEFAULT 1,transaction_id INTEGER NOT NULL REFERENCES transactions(id),amount INTEGER NOT NULL,note TEXT NOT NULL DEFAULT '副业经营成本',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
      ),
      binding.prepare(
        "CREATE UNIQUE INDEX side_hustle_deduction_transaction_unique ON side_hustle_deductions(transaction_id)",
      ),
      binding.prepare(
        "UPDATE app_meta SET value='11' WHERE key='schema_version'",
      ),
    ]);
    return ensureDb();
  }

  if (version?.value === "9") {
    await binding.batch([
      binding.prepare(
        "ALTER TABLE accounts ADD COLUMN currency TEXT NOT NULL DEFAULT 'CNY'",
      ),
      binding.prepare(
        "ALTER TABLE transactions ADD COLUMN currency TEXT NOT NULL DEFAULT 'CNY'",
      ),
      binding.prepare(
        "ALTER TABLE transactions ADD COLUMN installment_id INTEGER",
      ),
      binding.prepare(
        "ALTER TABLE transactions ADD COLUMN installment_number INTEGER",
      ),
      binding.prepare(
        "CREATE TABLE installments (id INTEGER PRIMARY KEY AUTOINCREMENT,ledger_id INTEGER NOT NULL DEFAULT 1,name TEXT NOT NULL,total_amount INTEGER NOT NULL,periods INTEGER NOT NULL,paid_periods INTEGER NOT NULL DEFAULT 0,fee_amount INTEGER NOT NULL DEFAULT 0,account_id INTEGER NOT NULL REFERENCES accounts(id),start_month TEXT NOT NULL,charge_day INTEGER NOT NULL DEFAULT 1,currency TEXT NOT NULL DEFAULT 'CNY',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
      ),
      binding.prepare(
        "CREATE UNIQUE INDEX installments_transaction_unique ON transactions(installment_id,installment_number) WHERE installment_id IS NOT NULL",
      ),
      binding.prepare(
        "CREATE TABLE achievements (ledger_id INTEGER NOT NULL DEFAULT 1,code TEXT NOT NULL,unlocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(ledger_id,code))",
      ),
      binding.prepare(
        "UPDATE app_meta SET value='10' WHERE key='schema_version'",
      ),
    ]);
    return ensureDb();
  }

  if (version?.value === "8") {
    await binding.batch([
      binding.prepare(
        "CREATE TABLE members (id INTEGER PRIMARY KEY AUTOINCREMENT, ledger_id INTEGER NOT NULL DEFAULT 1, name TEXT NOT NULL, icon TEXT NOT NULL DEFAULT '👤', is_me INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
      ),
      binding.prepare(
        "INSERT INTO members (ledger_id,name,icon,is_me) SELECT id,'我','🧑',1 FROM ledgers",
      ),
      binding.prepare(
        "ALTER TABLE transactions ADD COLUMN paid_by_member_id INTEGER",
      ),
      binding.prepare(
        "ALTER TABLE transactions ADD COLUMN split_with_member_id INTEGER",
      ),
      binding.prepare("ALTER TABLE transactions ADD COLUMN split_mode TEXT"),
      binding.prepare(
        "ALTER TABLE transactions ADD COLUMN my_share_percent INTEGER NOT NULL DEFAULT 100",
      ),
      binding
        .prepare("UPDATE app_meta SET value=? WHERE key='schema_version'")
        .bind("9"),
    ]);
    return ensureDb();
  }

  if (version?.value === "7") {
    await binding.batch([
      binding.prepare(
        "CREATE TABLE app_preferences (id INTEGER PRIMARY KEY, theme TEXT NOT NULL DEFAULT 'cream', lock_enabled INTEGER NOT NULL DEFAULT 0, pin_hash TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
      ),
      binding.prepare(
        "INSERT INTO app_preferences (id,theme,lock_enabled) VALUES (1,'cream',0)",
      ),
      binding
        .prepare("UPDATE app_meta SET value=? WHERE key='schema_version'")
        .bind("8"),
    ]);
    return ensureDb();
  }

  if (version?.value === "6") {
    await binding.batch([
      binding.prepare(
        "CREATE TABLE ledgers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, icon TEXT NOT NULL DEFAULT '🏠', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
      ),
      binding.prepare(
        "INSERT INTO ledgers (id,name,icon) VALUES (1,'日常生活账本','🏠')",
      ),
      binding.prepare(
        "ALTER TABLE accounts ADD COLUMN ledger_id INTEGER NOT NULL DEFAULT 1",
      ),
      binding.prepare(
        "ALTER TABLE transactions ADD COLUMN ledger_id INTEGER NOT NULL DEFAULT 1",
      ),
      binding.prepare(
        "ALTER TABLE subscriptions ADD COLUMN ledger_id INTEGER NOT NULL DEFAULT 1",
      ),
      binding.prepare(
        "ALTER TABLE category_budgets RENAME TO category_budgets_v6",
      ),
      binding.prepare(
        "CREATE TABLE category_budgets (ledger_id INTEGER NOT NULL DEFAULT 1, category TEXT NOT NULL, amount INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(ledger_id,category))",
      ),
      binding.prepare(
        "INSERT INTO category_budgets (ledger_id,category,amount,updated_at) SELECT 1,category,amount,updated_at FROM category_budgets_v6",
      ),
      binding.prepare("DROP TABLE category_budgets_v6"),
      binding.prepare(
        "CREATE TABLE savings_goals (id INTEGER PRIMARY KEY AUTOINCREMENT, ledger_id INTEGER NOT NULL DEFAULT 1, name TEXT NOT NULL, target_amount INTEGER NOT NULL, saved_amount INTEGER NOT NULL DEFAULT 0, deadline TEXT NOT NULL, icon TEXT NOT NULL DEFAULT '🌟', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
      ),
      binding
        .prepare("UPDATE app_meta SET value=? WHERE key='schema_version'")
        .bind("7"),
    ]);
    return ensureDb();
  }

  if (version?.value === "5") {
    await binding.batch([
      binding.prepare(
        `CREATE TABLE category_budgets (category TEXT PRIMARY KEY, amount INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      ),
      binding.prepare(
        `CREATE TABLE subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, amount INTEGER NOT NULL, account_id INTEGER NOT NULL REFERENCES accounts(id), cycle TEXT NOT NULL CHECK(cycle IN ('每月','每季','每年')), category TEXT NOT NULL DEFAULT '娱乐', next_charge_date TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      ),
      binding.prepare(
        "INSERT INTO category_budgets (category,amount) VALUES ('餐饮',0),('交通',0),('购物',0),('咖啡',30000),('娱乐',50000)",
      ),
      binding
        .prepare("UPDATE app_meta SET value=? WHERE key='schema_version'")
        .bind("6"),
    ]);
    return ensureDb();
  }

  if (version?.value === "4") {
    await binding.batch([
      binding.prepare(
        "ALTER TABLE accounts ADD COLUMN is_investment INTEGER NOT NULL DEFAULT 0",
      ),
      binding.prepare(
        "ALTER TABLE accounts ADD COLUMN initial_balance INTEGER NOT NULL DEFAULT 0",
      ),
      binding.prepare(
        "ALTER TABLE accounts ADD COLUMN cumulative_income INTEGER NOT NULL DEFAULT 0",
      ),
      binding.prepare(`CREATE TABLE transactions_v5 (
        id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, amount INTEGER NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('支出','收入')),
        mood TEXT CHECK (mood IN ('悦己','刚需','冲动')),
        category TEXT CHECK (category IN ('餐饮','交通','购物','咖啡','娱乐')),
        income_category TEXT CHECK (income_category IN ('薪资发放','理财收益','兼职外快','其它收入')),
        account_id INTEGER NOT NULL REFERENCES accounts(id),
        occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      binding.prepare(`INSERT INTO transactions_v5 (id,title,amount,type,mood,category,income_category,account_id,occurred_at,created_at)
        SELECT id,title,amount,type,
          CASE WHEN type='支出' THEN mood ELSE NULL END,
          CASE WHEN type='支出' THEN category ELSE NULL END,
          CASE WHEN type='收入' THEN '其它收入' ELSE NULL END,
          account_id,occurred_at,created_at FROM transactions`),
      binding.prepare("DROP TABLE transactions"),
      binding.prepare("ALTER TABLE transactions_v5 RENAME TO transactions"),
      binding.prepare(`INSERT INTO accounts (name,type,current_balance,icon,is_investment,initial_balance,cumulative_income)
        VALUES ('招商银行理财卡/基金账户','资产',3000000,'📈',1,3000000,0)`),
      binding
        .prepare("UPDATE app_meta SET value=? WHERE key='schema_version'")
        .bind("5"),
    ]);
    return ensureDb();
  }

  await binding.batch([
    binding.prepare("DROP TABLE IF EXISTS subscriptions"),
    binding.prepare("DROP TABLE IF EXISTS category_budgets"),
    binding.prepare("DROP TABLE IF EXISTS transactions"),
    binding.prepare("DROP TABLE IF EXISTS expenses"),
    binding.prepare("DROP TABLE IF EXISTS accounts"),
    binding.prepare("DROP TABLE IF EXISTS budget_settings"),
    binding.prepare(`CREATE TABLE accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('资产','负债')),
      current_balance INTEGER NOT NULL DEFAULT 0, bill_day INTEGER, repayment_day INTEGER, icon TEXT NOT NULL DEFAULT '💳',
      is_investment INTEGER NOT NULL DEFAULT 0, initial_balance INTEGER NOT NULL DEFAULT 0,
      cumulative_income INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    binding.prepare(`CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, amount INTEGER NOT NULL, type TEXT NOT NULL CHECK(type IN ('支出','收入')),
      mood TEXT CHECK(mood IN ('悦己','刚需','冲动')), category TEXT CHECK(category IN ('餐饮','交通','购物','咖啡','娱乐')),
      income_category TEXT CHECK(income_category IN ('薪资发放','理财收益','兼职外快','其它收入')),
      account_id INTEGER NOT NULL REFERENCES accounts(id), occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    binding.prepare(
      "CREATE TABLE budget_settings (id INTEGER PRIMARY KEY, amount INTEGER NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    ),
    binding.prepare(
      "CREATE TABLE category_budgets (category TEXT PRIMARY KEY, amount INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    ),
    binding.prepare(
      "CREATE TABLE subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, amount INTEGER NOT NULL, account_id INTEGER NOT NULL REFERENCES accounts(id), cycle TEXT NOT NULL CHECK(cycle IN ('每月','每季','每年')), category TEXT NOT NULL DEFAULT '娱乐', next_charge_date TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    ),
    binding.prepare(
      "INSERT INTO budget_settings VALUES (1,500000,CURRENT_TIMESTAMP)",
    ),
    binding.prepare(
      "INSERT INTO category_budgets (category,amount) VALUES ('餐饮',0),('交通',0),('购物',0),('咖啡',30000),('娱乐',50000)",
    ),
    binding.prepare(
      "INSERT INTO accounts (name,type,current_balance,icon,initial_balance) VALUES ('微信钱包','资产',286530,'💚',286530)",
    ),
    binding.prepare(
      "INSERT INTO accounts (name,type,current_balance,icon,initial_balance) VALUES ('支付宝','资产',168800,'💙',168800)",
    ),
    binding.prepare(
      "INSERT INTO accounts (name,type,current_balance,icon,initial_balance) VALUES ('招商银行卡','资产',1258000,'💳',1258000)",
    ),
    binding.prepare(
      "INSERT INTO accounts (name,type,current_balance,bill_day,repayment_day,icon) VALUES ('花呗','负债',0,1,10,'🌸')",
    ),
    binding.prepare(
      "INSERT INTO accounts (name,type,current_balance,bill_day,repayment_day,icon) VALUES ('分期乐/信用卡','负债',0,20,5,'💠')",
    ),
    binding.prepare(
      "INSERT INTO accounts (name,type,current_balance,icon,is_investment,initial_balance) VALUES ('招商银行理财卡/基金账户','资产',3000000,'📈',1,3000000)",
    ),
    binding
      .prepare("INSERT OR REPLACE INTO app_meta VALUES ('schema_version',?)")
      .bind("6"),
  ]);
  return ensureDb();
}

export async function processDueSubscriptions(ledgerId?: number) {
  await ensureDb();
  const binding = getDbBinding();
  const timezone = "Asia/Shanghai";
  const today = dateKeyInZone(new Date(), timezone);
  const due = await binding
    .prepare(
      "SELECT * FROM subscriptions WHERE next_charge_date <= ? AND (? IS NULL OR ledger_id=?) ORDER BY next_charge_date",
    )
    .bind(today, ledgerId ?? null, ledgerId ?? null)
    .all<{
      id: number;
      name: string;
      amount: number;
      account_id: number;
      cycle: string;
      category: string;
      category_dynamic: string | null;
      next_charge_date: string;
    }>();
  for (const item of due.results) {
    let chargeDate = item.next_charge_date;
    while (chargeDate <= today) {
      const occurrenceKey = `subscription:${item.id}:${chargeDate}`;
      const claimed = await binding
        .prepare("INSERT INTO scheduled_occurrences(occurrence_key,ledger_id,source_type,source_id) VALUES(?,(SELECT ledger_id FROM subscriptions WHERE id=?),'subscription',?) ON CONFLICT(occurrence_key) DO UPDATE SET status='处理中',created_at=CURRENT_TIMESTAMP,completed_at=NULL WHERE scheduled_occurrences.status='失败'")
        .bind(occurrenceKey, item.id, item.id)
        .run();
      const next = new Date(`${chargeDate}T12:00:00Z`);
      if (item.cycle === "每年") next.setUTCFullYear(next.getUTCFullYear() + 1);
      else if (item.cycle === "每季") next.setUTCMonth(next.getUTCMonth() + 3);
      else next.setUTCMonth(next.getUTCMonth() + 1);
      const nextDate = next.toISOString().slice(0, 10);
      if (Number(claimed.meta.changes || 0) > 0) {
        try {
          await binding.batch([
            binding
              .prepare("INSERT INTO transactions (ledger_id,title,amount,type,mood,category,category_dynamic,account_id,occurred_at,currency,original_amount,original_currency,exchange_rate_micros,original_timezone,occurrence_key) VALUES ((SELECT ledger_id FROM subscriptions WHERE id=?),?,?,'支出','刚需',?,?,?,?,(SELECT currency FROM accounts WHERE id=?),?,(SELECT currency FROM accounts WHERE id=?),1000000,?,?)")
              .bind(item.id, `自动续费 · ${item.name}`, item.amount, item.category, item.category_dynamic ?? item.category, item.account_id, localDateTimeToUtc(`${chargeDate} 00:00:00`, timezone), item.account_id, item.amount, item.account_id, timezone, occurrenceKey),
            binding.prepare("UPDATE accounts SET current_balance=current_balance-? WHERE id=?").bind(item.amount, item.account_id),
            binding.prepare("UPDATE subscriptions SET next_charge_date=? WHERE id=? AND next_charge_date=?").bind(nextDate, item.id, chargeDate),
            binding.prepare("UPDATE scheduled_occurrences SET status='完成',completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE occurrence_key=?").bind(occurrenceKey),
          ]);
        } catch (error) {
          const message = error instanceof Error ? error.message : "自动续费执行失败";
          await binding.batch([
            binding.prepare("UPDATE scheduled_occurrences SET status='失败' WHERE occurrence_key=? AND status='处理中'").bind(occurrenceKey),
            binding.prepare("INSERT INTO system_notifications(ledger_id,title,message) SELECT ledger_id,'自动续费未扣款',? FROM subscriptions WHERE id=? AND NOT EXISTS(SELECT 1 FROM system_notifications WHERE ledger_id=subscriptions.ledger_id AND title='自动续费未扣款' AND message=? AND read=0)").bind(`${item.name}：${message}`, item.id, `${item.name}：${message}`),
          ]);
        }
      }
      chargeDate = nextDate;
    }
  }
}

export async function processDueInstallments(ledgerId?: number) {
  await ensureDb();
  const db = getDbBinding(),
    timezone = "Asia/Shanghai",
    today = dateKeyInZone(new Date(), timezone),
    [todayYear, todayMonth, todayDay] = today.split("-").map(Number);
  const rows = await db
    .prepare(
      "SELECT i.*,a.type account_type,a.currency account_currency,pa.currency payment_currency FROM installments i JOIN accounts a ON a.id=i.account_id LEFT JOIN accounts pa ON pa.id=i.payment_account_id WHERE i.paid_periods<i.periods AND (? IS NULL OR i.ledger_id=?) ORDER BY i.id",
    )
    .bind(ledgerId ?? null, ledgerId ?? null)
    .all<{
      id: number;
      ledger_id: number;
      name: string;
      total_amount: number;
      periods: number;
      paid_periods: number;
      fee_amount: number;
      account_id: number;
      start_month: string;
      charge_day: number;
      currency: string;
      account_type: string;
      account_currency: string;
      payment_account_id: number | null;
      payment_currency: string | null;
    }>();
  for (const item of rows.results) {
    const [year, month] = item.start_month.split("-").map(Number);
    const elapsed =
      (todayYear - year) * 12 + (todayMonth - month);
    const duePeriods = Math.min(
      item.periods,
      Math.max(0, elapsed + (todayDay >= item.charge_day ? 1 : 0)),
    );
    for (
      let installmentNumber = item.paid_periods + 1;
      installmentNumber <= duePeriods;
      installmentNumber++
    ) {
      const grand = item.total_amount + item.fee_amount,
        base = Math.floor(grand / item.periods),
        amount =
          installmentNumber === item.periods
            ? grand - base * (item.periods - 1)
            : base;
      const paymentAccountId = item.account_type === "负债" ? item.payment_account_id : item.account_id;
      if (!paymentAccountId || (item.account_type === "负债" && item.payment_currency !== item.account_currency))
        continue;
      const occurrenceKey = `installment:${item.id}:${installmentNumber}`;
      const claimed = await db
        .prepare("INSERT INTO scheduled_occurrences(occurrence_key,ledger_id,source_type,source_id) VALUES(?,?,'installment',?) ON CONFLICT(occurrence_key) DO UPDATE SET status='处理中',created_at=CURRENT_TIMESTAMP,completed_at=NULL WHERE scheduled_occurrences.status='失败'")
        .bind(occurrenceKey, item.ledger_id, item.id)
        .run();
      if (Number(claimed.meta.changes || 0) === 0) continue;
      try {
        await db.batch([
          db.prepare("INSERT INTO account_transfers(uuid,ledger_id,kind,from_account_id,to_account_id,amount,currency,target_type,target_id,occurrence_key,occurred_at,original_timezone,note) VALUES(lower(hex(randomblob(16))),?,?,?,?,?,?,?,?,?,?,?,?)")
            .bind(item.ledger_id, "分期还款", paymentAccountId, item.account_type === "负债" ? item.account_id : null, amount, item.currency, "installment", item.id, occurrenceKey, new Date().toISOString(), timezone, `${item.name} 第${installmentNumber}期`),
          db.prepare("INSERT INTO transactions (ledger_id,title,amount,type,mood,category,category_dynamic,account_id,currency,original_amount,original_currency,exchange_rate_micros,original_timezone,installment_id,installment_number,occurrence_key,occurred_at) VALUES (?,?,?,'支出','刚需','购物','购物',?,?,?,?,1000000,?,?,?,?,?)")
            .bind(item.ledger_id, `分期还款 · ${item.name} · ${item.periods}分之${installmentNumber}期`, amount, paymentAccountId, item.currency, amount, item.currency, timezone, item.id, installmentNumber, occurrenceKey, new Date().toISOString()),
          db.prepare("UPDATE installments SET paid_periods=? WHERE id=? AND paid_periods<?").bind(installmentNumber, item.id, installmentNumber),
          db.prepare("UPDATE scheduled_occurrences SET status='完成',completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE occurrence_key=?").bind(occurrenceKey),
        ]);
      } catch (error) {
        const message = error instanceof Error ? error.message : "自动还款执行失败";
        await db.batch([
          db.prepare("UPDATE scheduled_occurrences SET status='失败' WHERE occurrence_key=? AND status='处理中'").bind(occurrenceKey),
          db.prepare("INSERT INTO system_notifications(ledger_id,title,message) SELECT ?,'分期自动还款未完成',? WHERE NOT EXISTS(SELECT 1 FROM system_notifications WHERE ledger_id=? AND title='分期自动还款未完成' AND message=? AND read=0)").bind(item.ledger_id, `${item.name} 第${installmentNumber}期：${message}`, item.ledger_id, `${item.name} 第${installmentNumber}期：${message}`),
        ]);
      }
    }
  }
}

export async function evaluateAchievements(ledgerId: number) {
  await ensureDb();
  const db = getDbBinding(),
    now = new Date(),
    codes: string[] = [];
  const coffee = await db
    .prepare(
      "SELECT COUNT(*) count FROM transactions WHERE ledger_id=? AND type='支出' AND category='咖啡' AND date(occurred_at)>=date('now','-6 days')",
    )
    .bind(ledgerId)
    .first<{ count: number }>();
  const history = await db
    .prepare(
      "SELECT COUNT(*) count FROM transactions WHERE ledger_id=? AND date(occurred_at)<=date('now','-6 days')",
    )
    .bind(ledgerId)
    .first<{ count: number }>();
  if ((history?.count ?? 0) > 0 && (coffee?.count ?? 0) === 0)
    codes.push("coffee_knight");
  if (now.getUTCDate() > 15) {
    const impulse = await db
      .prepare(
        "SELECT COUNT(*) count FROM transactions WHERE ledger_id=? AND type='支出' AND mood='冲动' AND strftime('%Y-%m',occurred_at)=strftime('%Y-%m','now')",
      )
      .bind(ledgerId)
      .first<{ count: number }>();
    const monthRows = await db
      .prepare(
        "SELECT COUNT(*) count FROM transactions WHERE ledger_id=? AND strftime('%Y-%m',occurred_at)=strftime('%Y-%m','now')",
      )
      .bind(ledgerId)
      .first<{ count: number }>();
    if ((monthRows?.count ?? 0) > 0 && (impulse?.count ?? 0) === 0)
      codes.push("temptation_fighter");
  }
  const streak = await db
    .prepare(
      "SELECT COUNT(DISTINCT date(occurred_at)) count FROM transactions WHERE ledger_id=? AND date(occurred_at)>=date('now','-29 days')",
    )
    .bind(ledgerId)
    .first<{ count: number }>();
  if ((streak?.count ?? 0) >= 30) codes.push("full_revive");

  const [
    lifetime,
    month,
    recent,
    accountStats,
    budgetRow,
    digitalStats,
    goalStats,
  ] = await Promise.all([
    db
      .prepare(
        "SELECT COUNT(*) total,SUM(CASE WHEN type='收入' THEN 1 ELSE 0 END) incomeCount,COUNT(DISTINCT CASE WHEN type='收入' THEN COALESCE(income_category_dynamic,income_category) END) incomeSources,COUNT(DISTINCT CASE WHEN type='支出' THEN COALESCE(category_dynamic,category) END) expenseCategories,SUM(CASE WHEN type='收入' AND is_side_hustle=1 THEN 1 ELSE 0 END) sideHustleIncome,SUM(CASE WHEN CAST(strftime('%H',occurred_at,'+8 hours') AS INTEGER) BETWEEN 5 AND 7 THEN 1 ELSE 0 END) dawnEntries,SUM(CASE WHEN CAST(strftime('%H',occurred_at,'+8 hours') AS INTEGER) BETWEEN 0 AND 4 THEN 1 ELSE 0 END) midnightEntries FROM transactions WHERE ledger_id=?",
      )
      .bind(ledgerId)
      .first<{
        total: number;
        incomeCount: number;
        incomeSources: number;
        expenseCategories: number;
        sideHustleIncome: number;
        dawnEntries: number;
        midnightEntries: number;
      }>(),
    db
      .prepare(
        "SELECT COUNT(*) monthCount,SUM(CASE WHEN type='收入' THEN amount ELSE 0 END) monthIncome,SUM(CASE WHEN type='支出' THEN amount ELSE 0 END) monthExpense FROM transactions WHERE ledger_id=? AND strftime('%Y-%m',occurred_at)=strftime('%Y-%m','now')",
      )
      .bind(ledgerId)
      .first<{
        monthCount: number;
        monthIncome: number;
        monthExpense: number;
      }>(),
    db
      .prepare(
        "SELECT COUNT(*) recentCount,SUM(CASE WHEN type='支出' AND mood='冲动' THEN 1 ELSE 0 END) recentImpulse,SUM(CASE WHEN type='支出' THEN amount ELSE 0 END) recentExpense FROM transactions WHERE ledger_id=? AND date(occurred_at)>=date('now','-6 days')",
      )
      .bind(ledgerId)
      .first<{
        recentCount: number;
        recentImpulse: number;
        recentExpense: number;
      }>(),
    db
      .prepare(
        "SELECT COUNT(*) accountCount,SUM(CASE WHEN type='负债' THEN 1 ELSE 0 END) liabilityCount,SUM(CASE WHEN type='负债' AND current_balance<=0 THEN 1 ELSE 0 END) clearedLiabilities,SUM(CASE WHEN is_investment=1 THEN 1 ELSE 0 END) investmentCount FROM accounts WHERE ledger_id=?",
      )
      .bind(ledgerId)
      .first<{
        accountCount: number;
        liabilityCount: number;
        clearedLiabilities: number;
        investmentCount: number;
      }>(),
    db
      .prepare("SELECT amount FROM budget_settings WHERE id=?")
      .bind(ledgerId)
      .first<{ amount: number }>(),
    db
      .prepare("SELECT COUNT(*) count FROM digital_assets WHERE ledger_id=?")
      .bind(ledgerId)
      .first<{ count: number }>(),
    db
      .prepare(
        "SELECT COUNT(*) count,SUM(CASE WHEN saved_amount>=target_amount THEN 1 ELSE 0 END) completed FROM savings_goals WHERE ledger_id=?",
      )
      .bind(ledgerId)
      .first<{ count: number; completed: number }>(),
  ]);
  const total = Number(lifetime?.total ?? 0),
    incomeCount = Number(lifetime?.incomeCount ?? 0),
    incomeSources = Number(lifetime?.incomeSources ?? 0),
    monthIncome = Number(month?.monthIncome ?? 0),
    monthExpense = Number(month?.monthExpense ?? 0),
    budget = Number(budgetRow?.amount ?? 0);
  if (total >= 1) codes.push("first_spark");
  if (total >= 50) codes.push("ledger_regular");
  if (total >= 100) codes.push("century_club");
  if (total >= 365) codes.push("ledger_legend");
  if (incomeCount >= 1) codes.push("income_scout");
  if (incomeSources >= 3) codes.push("income_diversifier");
  if (Number(lifetime?.expenseCategories ?? 0) >= 5)
    codes.push("category_explorer");
  if (Number(lifetime?.sideHustleIncome ?? 0) >= 1)
    codes.push("side_hustle_starter");
  if (Number(lifetime?.dawnEntries ?? 0) >= 1)
    codes.push("dawn_bookkeeper");
  if (Number(lifetime?.midnightEntries ?? 0) >= 1)
    codes.push("midnight_witness");
  if ((streak?.count ?? 0) >= 7) codes.push("seven_day_scribe");
  if (monthIncome > monthExpense && monthIncome > 0)
    codes.push("positive_month");
  if (monthIncome > 0 && (monthIncome - monthExpense) / monthIncome >= 0.2)
    codes.push("savings_pilot");
  if (monthIncome > 0 && (monthIncome - monthExpense) / monthIncome >= 0.5)
    codes.push("super_saver");
  if (
    Number(month?.monthCount ?? 0) > 0 &&
    monthExpense > 0 &&
    budget > 0 &&
    monthExpense <= budget
  )
    codes.push("budget_guardian");
  if (Number(accountStats?.accountCount ?? 0) >= 3)
    codes.push("account_architect");
  if (Number(accountStats?.investmentCount ?? 0) >= 1)
    codes.push("investor_awakened");
  if (Number(digitalStats?.count ?? 0) >= 3) codes.push("digital_curator");
  if (Number(goalStats?.count ?? 0) >= 1) codes.push("dream_planter");
  if (Number(goalStats?.completed ?? 0) >= 1) codes.push("wish_fulfilled");
  if (
    Number(recent?.recentCount ?? 0) > 0 &&
    Number(recent?.recentImpulse ?? 0) === 0
  )
    codes.push("mindful_week");
  if (
    Number(recent?.recentCount ?? 0) > 0 &&
    Number(recent?.recentExpense ?? 0) <= 10000
  )
    codes.push("frugal_week");
  if (
    Number(accountStats?.liabilityCount ?? 0) > 0 &&
    Number(accountStats?.clearedLiabilities ?? 0) > 0
  )
    codes.push("debt_tamer");
  if (
    Number(accountStats?.liabilityCount ?? 0) > 0 &&
    Number(accountStats?.clearedLiabilities ?? 0) ===
      Number(accountStats?.liabilityCount ?? 0)
  )
    codes.push("debt_free_hidden");
  for (const code of codes)
    await db
      .prepare(
        "INSERT OR IGNORE INTO achievements(ledger_id,code) VALUES (?,?)",
      )
      .bind(ledgerId, code)
      .run();
  return db
    .prepare(
      "SELECT ledger_id AS ledgerId,code,unlocked_at AS unlockedAt FROM achievements WHERE ledger_id=? ORDER BY unlocked_at",
    )
    .bind(ledgerId)
    .all<{ ledgerId: number; code: string; unlockedAt: string }>();
}
