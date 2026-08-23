import { describe, check, call, summary } from "./lib.mjs";
process.env.TZ = "Asia/Shanghai";
const dbmod = await import("../../db/index.ts");
await dbmod.ensureDb();
const B = dbmod.getDbBinding();
const q = async (sql, ...p) => (await B.prepare(sql).bind(...p).all()).results;

const ledgers = await import("../../app/api/ledgers/route.ts");
const accounts = await import("../../app/api/accounts/route.ts");
const categories = await import("../../app/api/categories/route.ts");
const incomeCats = await import("../../app/api/income-categories/route.ts");
const offline = await import("../../app/api/offline-sync/route.ts");
const transactions = await import("../../app/api/transactions/route.ts");
const transfers = await import("../../app/api/transfers/route.ts");
const budgets = await import("../../app/api/category-budgets/route.ts");
const prefs = await import("../../app/api/preferences/route.ts");
const fireSet = await import("../../app/api/fire-settings/route.ts");
const ecoSet = await import("../../app/api/economic-settings/route.ts");
const rates = await import("../../app/api/exchange-rates/route.ts");
const forecast = await import("../../app/api/forecast/route.ts");
const notices = await import("../../app/api/notifications/route.ts");
const exportApi = await import("../../app/api/data/export/route.ts");
const { MAX_ACCOUNT_COUNT } = await import("../../app/account-limits.ts");
const { MAX_LEDGER_COUNT } = await import("../../app/ledger-limits.ts");

describe("账本");
let r = await call(ledgers, "GET", "/api/ledgers");
check("GET 默认账本", r.status === 200 && Array.isArray(r.json) && r.json.length >= 1, JSON.stringify(r.json).slice(0,120));
const L = r.json[0].id;
r = await call(ledgers, "POST", "/api/ledgers", { body: { name: "测试账本", icon: "🧪" } });
check("POST 新建账本", r.status === 200 || r.status === 201, r.text);
const emptyLedgerId = r.json?.id;
r = await call(ledgers, "GET", "/api/ledgers");
check("新账本出现在列表", r.json?.some?.(x => x.name === "测试账本"), r.text);
check("账本列表具备容量与缓存边界", r.status === 200 && r.headers?.get?.("cache-control") === "no-store, private, max-age=0" && Number(r.headers?.get?.("x-total-count")) >= r.json.length && ["0", "1"].includes(r.headers?.get?.("x-has-more") || ""), `${r.status} ${r.headers?.get?.("x-total-count")} ${r.json?.length}`);

describe("账户");
r = await call(accounts, "POST", "/api/accounts", { body: { ledgerId: L, name: "工资卡", type: "资产", balance: 10000, currency: "CNY" } });
check("POST 资产账户", r.status === 201 && r.json?.id, r.text);
const acct1 = r.json?.id;
r = await call(accounts, "POST", "/api/accounts", { body: { ledgerId: L, name: "信用卡", type: "负债", balance: 5000, billDay: 5, repaymentDay: 25 } });
check("POST 负债账户", r.status === 201, r.text);
const acct2 = r.json?.id;
for (const [name, body, why] of [
  ["空名称被拒", { ledgerId: L, type: "资产", balance: 1, name: "" }, "请输入账户名称"],
  ["负余额被拒", { ledgerId: L, type: "资产", balance: -5, name: "x" }, "请输入正确金额"],
  ["非法账单日被拒", { ledgerId: L, type: "负债", balance: 1, name: "x", billDay: 40 }, "1—31"],
  ["非法类型被拒", { ledgerId: L, type: "别的", balance: 1, name: "x" }, "账户类型"],
]) {
  r = await call(accounts, "POST", "/api/accounts", { body });
  check(name, r.status >= 400 && r.status < 500 && (r.json?.error || "").includes(why), `${r.status} ${r.text}`);
}
const accountCountBeforeSchemaRejects = (await q("SELECT COUNT(*) n FROM accounts WHERE ledger_id=?", L))[0].n;
for (const [name, body] of [
  ["非法币种不再静默改为CNY", { ledgerId: L, name: "非法币种", type: "资产", balance: 1, currency: "BTC" }],
  ["非法资产类别不再静默降级", { ledgerId: L, name: "非法类别", type: "资产", balance: 1, assetClass: "高风险" }],
  ["超长账户名称不再静默截断", { ledgerId: L, name: "x".repeat(31), type: "资产", balance: 1 }],
  ["账户未知字段被拒", { ledgerId: L, name: "额外字段", type: "资产", balance: 1, ownerId: "other" }],
]) {
  r = await call(accounts, "POST", "/api/accounts", { body });
  check(name, r.status === 400 && r.json?.code === "request_failed", `${r.status} ${r.text}`);
}
const accountCountAfterSchemaRejects = (await q("SELECT COUNT(*) n FROM accounts WHERE ledger_id=?", L))[0].n;
check("非法账户请求不产生记录", accountCountAfterSchemaRejects === accountCountBeforeSchemaRejects, `${accountCountBeforeSchemaRejects} -> ${accountCountAfterSchemaRejects}`);
r = await call(accounts, "GET", `/api/accounts?ledger=${L}`);
const acctRows = r.json || [];
check("GET 账户列表含新建2个", [acct1, acct2].every(id => acctRows.some(x => x.id === id)), JSON.stringify(acctRows.map(x=>x.name)));
check("账户列表具备容量与缓存边界", r.status === 200 && r.headers?.get?.("cache-control") === "no-store, private, max-age=0" && r.headers?.get?.("x-total-count") === String(acctRows.length) && r.headers?.get?.("x-has-more") === "0", `${r.status} ${r.headers?.get?.("x-total-count")} ${acctRows.length}`);
check("负债余额为负(分)", acctRows.find(x => x.id === acct2)?.currentBalance === -500000, JSON.stringify(acctRows.map(x=>x.currentBalance)));
if (MAX_ACCOUNT_COUNT > 0)
  await B.batch(Array.from({ length: MAX_ACCOUNT_COUNT }, (_, index) =>
    B.prepare("INSERT INTO accounts(ledger_id,name,type,current_balance,icon,is_investment,initial_balance,currency,asset_class,uuid,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
      .bind(emptyLedgerId, `容量账户${index}`, "资产", 0, "💰", 0, 0, "CNY", "现金流", `capacity-account-${index}`, new Date().toISOString()),
  ));
r = await call(accounts, "GET", `/api/accounts?ledger=${emptyLedgerId}`);
check("账户集合达到容量边界", r.status === 200 && r.json?.length === MAX_ACCOUNT_COUNT && r.headers?.get?.("x-total-count") === String(MAX_ACCOUNT_COUNT) && r.headers?.get?.("x-has-more") === "0", `${r.status} ${r.headers?.get?.("x-total-count")} ${r.json?.length}`);
r = await call(accounts, "POST", "/api/accounts", { body: { ledgerId: emptyLedgerId, name: "超限账户", type: "资产", balance: 1 } });
check("账户达到容量上限时拒绝创建", r.status === 409, `${r.status} ${r.text}`);
await B.prepare("DELETE FROM accounts WHERE ledger_id=?").bind(emptyLedgerId).run();
const accountVersionBeforeEdit = (await q("SELECT updated_at updatedAt FROM accounts WHERE id=?", acct1))[0]?.updatedAt;
r = await call(accounts, "PUT", "/api/accounts", { body: { id: acct1, ledgerId: L, name: "工资卡改", type: "资产", balance: 12000, currency: "CNY", expectedUpdatedAt: accountVersionBeforeEdit } });
check("PUT 改名+调余额", r.status === 200, r.text);
const bal = (await q("SELECT current_balance b FROM accounts WHERE id=?", acct1))[0]?.b;
check("余额调账落库 12000元", bal === 1200000, String(bal));
const adj = await q("SELECT COUNT(*) n FROM account_transfers WHERE kind='余额调账'");
check("生成余额调账转账记录", adj[0].n === 1, JSON.stringify(adj));
r = await call(accounts, "PUT", "/api/accounts", { body: { id: acct1, ledgerId: L, name: "旧标签覆盖", type: "资产", balance: 13000, currency: "CNY", expectedUpdatedAt: accountVersionBeforeEdit } });
check("账户编辑使用旧版本时拒绝覆盖并避免二次调账", r.status === 409 && (await q("SELECT current_balance b FROM accounts WHERE id=?", acct1))[0]?.b === 1200000, `${r.status} ${r.text}`);
const currentAccountVersion = (await q("SELECT updated_at updatedAt FROM accounts WHERE id=?", acct1))[0]?.updatedAt;
r = await call(accounts, "DELETE", `/api/accounts?id=${acct1}&expectedUpdatedAt=${encodeURIComponent(currentAccountVersion)}`);
check("已有账务引用的账户不能注销", r.status === 409, `${r.status} ${r.text}`);
r = await call(accounts, "POST", "/api/accounts", { body: { ledgerId: L, name: "待注销账户", type: "资产", balance: 10, currency: "CNY" } });
const deletableAccountId = r.json?.id;
const deletableAccountVersion = (await q("SELECT updated_at updatedAt FROM accounts WHERE id=?", deletableAccountId))[0]?.updatedAt;
r = await call(accounts, "DELETE", `/api/accounts?id=${deletableAccountId}&expectedUpdatedAt=${encodeURIComponent(deletableAccountVersion)}`);
check("无引用账户可按版本安全注销", r.status === 200 && !(await q("SELECT id FROM accounts WHERE id=?", deletableAccountId)).length, `${r.status} ${r.text}`);

describe("分类");
r = await call(categories, "GET", `/api/categories?ledger=${L}`);
check("GET 默认支出分类非空", r.status === 200 && r.json?.length > 0, r.text?.slice(0,120));
check("支出分类列表具备容量与缓存边界", r.status === 200 && r.headers?.get("cache-control")?.includes("no-store") && Number(r.headers?.get("x-total-count")) >= r.json.length && ["0", "1"].includes(r.headers?.get("x-has-more") || ""), r.text?.slice(0,120));
r = await call(categories, "POST", "/api/categories", { body: { ledgerId: L, name: "宠物", icon: "🐱", color: "#aabbcc" } });
check("POST 新分类", r.status === 200 || r.status === 201, r.text);
const expenseCategoryCountBeforeRejects = (await q("SELECT COUNT(*) n FROM expense_categories WHERE ledger_id=?", L))[0].n;
for (const [name, body] of [
  ["非法分类颜色不再静默使用默认值", { ledgerId: L, name: "坏颜色", icon: "X", color: "red" }],
  ["超长分类名称不再静默截断", { ledgerId: L, name: "x".repeat(13), icon: "X", color: "#aabbcc" }],
  ["分类未知字段被拒", { ledgerId: L, name: "越权分类", icon: "X", color: "#aabbcc", builtinKey: "餐饮" }],
]) {
  r = await call(categories, "POST", "/api/categories", { body });
  check(name, r.status === 400, `${r.status} ${r.text}`);
}
const expenseCategoryCountAfterRejects = (await q("SELECT COUNT(*) n FROM expense_categories WHERE ledger_id=?", L))[0].n;
check("非法消费分类请求不产生记录", expenseCategoryCountAfterRejects === expenseCategoryCountBeforeRejects, `${expenseCategoryCountBeforeRejects} -> ${expenseCategoryCountAfterRejects}`);
r = await call(incomeCats, "GET", `/api/income-categories?ledger=${L}`);
check("GET 收入分类非空", r.status === 200 && r.json?.length > 0, r.text?.slice(0,120));
check("收入分类列表具备容量与缓存边界", r.status === 200 && r.headers?.get("cache-control")?.includes("no-store") && Number(r.headers?.get("x-total-count")) >= r.json.length && ["0", "1"].includes(r.headers?.get("x-has-more") || ""), r.text?.slice(0,120));
r = await call(incomeCats, "POST", "/api/income-categories", { body: { ledgerId: L, name: "坏收入颜色", icon: "X", color: "transparent" } });
check("非法收入分类颜色被拒", r.status === 400, `${r.status} ${r.text}`);

describe("离线记账/流水");
const mk = (i, type, amount) => ({ offlineId: `t-${i}`, ledgerId: L, accountId: acct1, amount, type, title: `测试${i}`, mood: "刚需", category: "餐饮", incomeCategory: "工资", occurredAt: "2026-07-20T12:00", originalTimezone: "Asia/Shanghai" });
r = await call(offline, "POST", "/api/offline-sync", { body: { items: [mk(1, "支出", 35.5), mk(2, "收入", 8888.88)] } });
check("POST 两笔离线账单", r.status === 200, r.text);
let txs = await q("SELECT id,amount,type,title,updated_at FROM transactions ORDER BY id");
check("流水落库2条", txs.length === 2, JSON.stringify(txs).slice(0,150));
check("金额转分正确 35.5→3550", txs[0]?.amount === 3550, String(txs[0]?.amount));
r = await call(offline, "POST", "/api/offline-sync", { body: { items: [mk(1, "支出", 35.5)] } });
txs = await q("SELECT COUNT(*) n FROM transactions");
check("重复 offlineId 幂等不重复入账", txs[0].n === 2, JSON.stringify(txs));
const t1 = (await q("SELECT id,updated_at u FROM transactions WHERE title='测试1'"))[0];
r = await call(transactions, "PUT", "/api/transactions", { body: { id: t1.id, ledgerId: L, accountId: acct1, amount: 66, type: "支出", title: "改名账单", mood: "冲动", category: "餐饮", occurredAt: "2026-07-20T13:00", expectedUpdatedAt: t1.u } });
check("PUT 编辑账单", r.status === 200, r.text);
r = await call(transactions, "PUT", "/api/transactions", { body: { id: t1.id, ledgerId: L, accountId: acct1, amount: 66, type: "支出", title: "再改", mood: "冲动", category: "餐饮", occurredAt: "2026-07-20T13:00", expectedUpdatedAt: t1.u } });
check("过期版本冲突返回409", r.status === 409, `${r.status} ${r.text}`);

describe("转账");
r = await call(transfers, "POST", "/api/transfers", { body: { ledgerId: L, kind: "账户转账", fromAccountId: acct1, toAccountId: acct2, amount: 300, occurredAt: "2026-07-21T10:00", originalTimezone: "Asia/Shanghai", note: "还卡" } });
check("POST 账户转账", r.status === 200 || r.status === 201, r.text);
const b1 = (await q("SELECT current_balance b FROM accounts WHERE id=?", acct1))[0].b;
const b2 = (await q("SELECT current_balance b FROM accounts WHERE id=?", acct2))[0].b;
check("触发器扣减转出方(精确)", b1 === 1200000 - 3550 + 888888 - 3050 - 30000, String(b1));
check("触发器增加转入方", b2 === -500000 + 30000, String(b2));
r = await call(transfers, "GET", `/api/transfers?ledger=${L}`);
check("GET 转账列表", r.status === 200 && (r.json?.length ?? 0) >= 2, r.text?.slice(0,120));
const retryTransferBody = { ledgerId: L, kind: "账户转账", fromAccountId: acct1, toAccountId: acct2, amount: 1, idempotencyKey: "transfer-retry-001", occurredAt: "2026-07-21T11:00", originalTimezone: "Asia/Shanghai", note: "可重试转账" };
const transferCountBeforeRetry = Number((await q("SELECT COUNT(*) n FROM account_transfers WHERE ledger_id=?", L))[0].n);
r = await call(transfers, "POST", "/api/transfers", { body: retryTransferBody });
const firstRetryUuid = r.json?.uuid;
check("转账支持幂等键首次写入", (r.status === 201 || r.status === 200) && firstRetryUuid && r.json?.duplicate === false, r.text);
r = await call(transfers, "POST", "/api/transfers", { body: retryTransferBody });
const transferCountAfterRetry = Number((await q("SELECT COUNT(*) n FROM account_transfers WHERE ledger_id=?", L))[0].n);
check("转账重复提交不重复扣款", r.status === 200 && r.json?.duplicate === true && r.json?.uuid === firstRetryUuid && transferCountAfterRetry === transferCountBeforeRetry + 1, `${r.status} ${r.text} ${transferCountBeforeRetry}->${transferCountAfterRetry}`);
r = await call(transfers, "POST", "/api/transfers", { body: { ...retryTransferBody, amount: 2 } });
check("转账复用幂等键但改金额被拒", r.status === 409 && r.json?.code === "request_failed", `${r.status} ${r.text}`);
const transferCountBeforeInvalid = (await q("SELECT COUNT(*) n FROM account_transfers WHERE ledger_id=?", L))[0].n;
for (const [name, options] of [
  ["未知转账类型不会静默降级", { body: { ledgerId: L, kind: "分期还款", fromAccountId: acct1, toAccountId: acct2, amount: 1 } }],
  ["非有限转账金额被拒", { body: { ledgerId: L, kind: "账户转账", fromAccountId: acct1, toAccountId: acct2, amount: "Infinity" } }],
  ["转账额外字段被拒", { body: { ledgerId: L, kind: "账户转账", fromAccountId: acct1, toAccountId: acct2, amount: 1, admin: true } }],
  ["畸形 JSON 返回稳定 400", { raw: "{", headers: { "content-type": "application/json" } }],
]) {
  r = await call(transfers, "POST", "/api/transfers", options);
  check(name, r.status === 400 && r.json?.code === "request_failed" && r.json?.requestId === r.headers.get("x-request-id"), `${r.status} ${r.text}`);
}
const transferCountAfterInvalid = (await q("SELECT COUNT(*) n FROM account_transfers WHERE ledger_id=?", L))[0].n;
check("非法转账请求不产生资金记录", transferCountAfterInvalid === transferCountBeforeInvalid, `${transferCountBeforeInvalid} -> ${transferCountAfterInvalid}`);

describe("预算/设置");
r = await call(budgets, "PUT", "/api/category-budgets", { body: { ledgerId: L, category: "餐饮", amount: 1500 } });
check("PUT 分类预算", r.status === 200, r.text);
r = await call(budgets, "PUT", "/api/category-budgets", { body: { ledgerId: L, category: "餐饮", amount: -1 } });
check("负预算不再静默修正为零", r.status === 400, `${r.status} ${r.text}`);
r = await call(budgets, "PUT", "/api/category-budgets", { body: { ledgerId: L, category: "餐饮", amount: 1, extra: true } });
check("预算未知字段被拒", r.status === 400, `${r.status} ${r.text}`);
r = await call(budgets, "GET", `/api/category-budgets?ledger=${L}`);
check("GET 预算回读且非法更新未改值", r.status === 200 && r.json?.find?.((item) => item.category === "餐饮")?.amount === 150000, r.text?.slice(0,120));
check("预算列表具备容量与缓存边界", r.status === 200 && r.headers?.get?.("cache-control") === "no-store, private, max-age=0" && Number(r.headers?.get?.("x-total-count")) >= r.json.length && ["0", "1"].includes(r.headers?.get?.("x-has-more") || ""), r.text?.slice(0,120));
r = await call(fireSet, "PUT", "/api/fire-settings", { body: { ledgerId: L, monthlyExpense: 12000, annualReturn: 5 } });
check("PUT FIRE设置", r.status === 200, r.text);
r = await call(fireSet, "PUT", "/api/fire-settings", { body: { ledgerId: L, monthlyExpense: "Infinity", annualReturn: 5 } });
check("FIRE非有限金额被拒", r.status === 400, r.text);
r = await call(ecoSet, "PUT", "/api/economic-settings", { body: { ledgerId: L, inflationRate: 2.5 } });
check("PUT 通胀设置", r.status === 200, r.text);
r = await call(ecoSet, "PUT", "/api/economic-settings", { body: { ledgerId: L, inflationRate: 2.5, admin: true } });
check("经济设置未知字段被拒", r.status === 400, r.text);
r = await call(prefs, "GET", "/api/preferences");
check("GET 偏好", r.status === 200, r.text?.slice(0,120));
r = await call(prefs, "PATCH", "/api/preferences", { body: { theme: "glacier" } });
check("PATCH 主题", r.status === 200, r.text);
r = await call(prefs, "PATCH", "/api/preferences", { body: {} });
check("空偏好更新被拒", r.status === 400, r.text);
r = await call(prefs, "PATCH", "/api/preferences", { body: { theme: "glacier", ownerId: "other" } });
check("偏好未知字段被拒", r.status === 400, r.text);

describe("汇率/预测/通知");
r = await call(rates, "GET", "/api/exchange-rates");
check("GET 汇率", r.status === 200 && r.json?.rates?.USD > 0, r.text);
r = await call(forecast, "GET", `/api/forecast?ledger=${L}`);
check("GET 现金流预测", r.status === 200, r.text?.slice(0,150));
r = await call(forecast, "GET", "/api/forecast?ledger=" + emptyLedgerId);
check(
  "空账本预测不返回伪精确跑道",
  r.status === 200 && r.json?.runwayDays === null && r.json?.dataStatus === "insufficient_data",
  r.text?.slice(0,180),
);
const existingLedgerCount = Number((await q("SELECT COUNT(*) n FROM ledgers WHERE owner_id='local'"))[0]?.n ?? 0);
const guardedLedgerResponse = await call(ledgers, "POST", "/api/ledgers", { body: { name: "删除保护账本", icon: "🛡️" } });
const guardedLedgerId = guardedLedgerResponse.json?.id;
const guardedLedgerVersion = (await q("SELECT updated_at updatedAt FROM ledgers WHERE id=?", guardedLedgerId))[0]?.updatedAt;
r = await call(ledgers, "DELETE", `/api/ledgers?id=${guardedLedgerId}&expectedUpdatedAt=stale-version`);
check("账本删除拒绝旧版本且不清理子数据", r.status === 409 && (await q("SELECT id FROM ledgers WHERE id=?", guardedLedgerId)).length === 1 && (await q("SELECT id FROM budget_settings WHERE id=?", guardedLedgerId)).length === 1, `${r.status} ${r.text}`);
r = await call(ledgers, "DELETE", `/api/ledgers?id=${guardedLedgerId}&expectedUpdatedAt=${encodeURIComponent(guardedLedgerVersion)}`);
check("账本删除按正确版本原子完成", r.status === 200 && !(await q("SELECT id FROM ledgers WHERE id=?", guardedLedgerId)).length && !(await q("SELECT id FROM budget_settings WHERE id=?", guardedLedgerId)).length, `${r.status} ${r.text}`);
if (MAX_LEDGER_COUNT > existingLedgerCount)
  await B.batch(Array.from({ length: MAX_LEDGER_COUNT - existingLedgerCount }, (_, index) =>
    B.prepare("INSERT INTO ledgers(name,icon,owner_id,uuid,updated_at) VALUES(?,?,?,?,?)")
      .bind(`容量账本${index}`, "🧱", "local", `capacity-ledger-${index}`, new Date().toISOString()),
  ));
r = await call(ledgers, "GET", "/api/ledgers");
check("账本集合达到容量边界", r.status === 200 && r.json?.length === MAX_LEDGER_COUNT && r.headers?.get?.("x-total-count") === String(MAX_LEDGER_COUNT) && r.headers?.get?.("x-has-more") === "0", `${r.status} ${r.headers?.get?.("x-total-count")} ${r.json?.length}`);
r = await call(ledgers, "POST", "/api/ledgers", { body: { name: "超限账本", icon: "🧱" } });
check("账本达到容量上限时拒绝创建", r.status === 409, `${r.status} ${r.text}`);
for (const ledger of (await q("SELECT id,updated_at updatedAt FROM ledgers WHERE owner_id='local' AND id<>?", L)))
  await call(ledgers, "DELETE", `/api/ledgers?id=${ledger.id}&expectedUpdatedAt=${encodeURIComponent(ledger.updatedAt)}`);
r = await call(notices, "GET", `/api/notifications?ledger=${L}`);
check("GET 通知", r.status === 200, r.text?.slice(0,120));
check("通知响应禁止缓存并声明 nosniff", r.status === 200 && r.headers?.get("cache-control")?.includes("no-store") && r.headers?.get("x-content-type-options") === "nosniff", r.text?.slice(0,120));

describe("导出");
const backupTransactionId = (await q("SELECT id FROM transactions WHERE ledger_id=? ORDER BY id LIMIT 1", L))[0]?.id;
await B.prepare("INSERT INTO transaction_reconciliation(transaction_id,ledger_id,status,note,reconciled_by,reconciled_at) VALUES(?,?,?,?,?,?)").bind(backupTransactionId, L, "reconciled", "备份回环核对", "local", "2026-07-20T14:00:00.000Z").run();
await B.prepare("INSERT INTO automation_rules(id,owner_id,ledger_id,name,priority,enabled,conditions_json,actions_json) VALUES(?,?,?,?,?,?,?,?)").bind("backup-rule", "local", L, "备份咖啡规则", 10, 1, JSON.stringify({ merchantContains: "咖啡", accountId: acct1 }), JSON.stringify({ category: "餐饮", accountId: acct1 })).run();
r = await call(exportApi, "GET", "/api/data/export");
check("GET JSON导出", r.status === 200 && r.json?.version === 23 && r.json?.transactions?.length === 2, `v=${r.json?.version} tx=${r.json?.transactions?.length}`);
check("v23 导出对账状态和自动化规则", r.json?.transactionReconciliation?.some?.((item) => item.note === "备份回环核对") && r.json?.automationRules?.some?.((item) => item.id === "backup-rule" && item.conditions?.accountId === acct1), JSON.stringify({ reconciliation: r.json?.transactionReconciliation, rules: r.json?.automationRules }));
globalThis.__EXPORT__ = r.json;
r = await call(exportApi, "GET", "/api/data/export?format=csv");
check("GET CSV导出表头完整", r.status === 200 && r.text.includes("账本") && r.text.includes("消费情绪"), r.text?.slice(0,60));

const fs = await import("node:fs");
fs.writeFileSync(process.env.NL_SNAPSHOT, JSON.stringify(globalThis.__EXPORT__));
process.exit(summary("套件1 · 核心记账链路") ? 1 : 0);
