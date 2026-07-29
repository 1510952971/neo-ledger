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

describe("账本");
let r = await call(ledgers, "GET", "/api/ledgers");
check("GET 默认账本", r.status === 200 && Array.isArray(r.json) && r.json.length >= 1, JSON.stringify(r.json).slice(0,120));
const L = r.json[0].id;
r = await call(ledgers, "POST", "/api/ledgers", { body: { name: "测试账本", icon: "🧪" } });
check("POST 新建账本", r.status === 200 || r.status === 201, r.text);
r = await call(ledgers, "GET", "/api/ledgers");
check("新账本出现在列表", r.json?.some?.(x => x.name === "测试账本"), r.text);

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
r = await call(accounts, "GET", `/api/accounts?ledger=${L}`);
const acctRows = r.json || [];
check("GET 账户列表含新建2个", [acct1, acct2].every(id => acctRows.some(x => x.id === id)), JSON.stringify(acctRows.map(x=>x.name)));
check("负债余额为负(分)", acctRows.find(x => x.id === acct2)?.currentBalance === -500000, JSON.stringify(acctRows.map(x=>x.currentBalance)));
r = await call(accounts, "PUT", "/api/accounts", { body: { id: acct1, ledgerId: L, name: "工资卡改", type: "资产", balance: 12000, currency: "CNY" } });
check("PUT 改名+调余额", r.status === 200, r.text);
const bal = (await q("SELECT current_balance b FROM accounts WHERE id=?", acct1))[0]?.b;
check("余额调账落库 12000元", bal === 1200000, String(bal));
const adj = await q("SELECT COUNT(*) n FROM account_transfers WHERE kind='余额调账'");
check("生成余额调账转账记录", adj[0].n === 1, JSON.stringify(adj));

describe("分类");
r = await call(categories, "GET", `/api/categories?ledger=${L}`);
check("GET 默认支出分类非空", r.status === 200 && r.json?.length > 0, r.text?.slice(0,120));
r = await call(categories, "POST", "/api/categories", { body: { ledgerId: L, name: "宠物", icon: "🐱", color: "#aabbcc" } });
check("POST 新分类", r.status === 200 || r.status === 201, r.text);
r = await call(incomeCats, "GET", `/api/income-categories?ledger=${L}`);
check("GET 收入分类非空", r.status === 200 && r.json?.length > 0, r.text?.slice(0,120));

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

describe("预算/设置");
r = await call(budgets, "PUT", "/api/category-budgets", { body: { ledgerId: L, category: "餐饮", amount: 1500 } });
check("PUT 分类预算", r.status === 200, r.text);
r = await call(budgets, "GET", `/api/category-budgets?ledger=${L}`);
check("GET 预算回读", r.status === 200 && JSON.stringify(r.json).includes("餐饮"), r.text?.slice(0,120));
r = await call(fireSet, "PUT", "/api/fire-settings", { body: { ledgerId: L, monthlyExpense: 12000, annualReturn: 5 } });
check("PUT FIRE设置", r.status === 200, r.text);
r = await call(ecoSet, "PUT", "/api/economic-settings", { body: { ledgerId: L, inflationRate: 2.5 } });
check("PUT 通胀设置", r.status === 200, r.text);
r = await call(prefs, "GET", "/api/preferences");
check("GET 偏好", r.status === 200, r.text?.slice(0,120));
r = await call(prefs, "PATCH", "/api/preferences", { body: { theme: "glacier" } });
check("PATCH 主题", r.status === 200, r.text);

describe("汇率/预测/通知");
r = await call(rates, "GET", "/api/exchange-rates");
check("GET 汇率", r.status === 200 && r.json?.rates?.USD > 0, r.text);
r = await call(forecast, "GET", `/api/forecast?ledger=${L}`);
check("GET 现金流预测", r.status === 200, r.text?.slice(0,150));
r = await call(notices, "GET", `/api/notifications?ledger=${L}`);
check("GET 通知", r.status === 200, r.text?.slice(0,120));

describe("导出");
r = await call(exportApi, "GET", "/api/data/export");
check("GET JSON导出", r.status === 200 && r.json?.version && r.json?.transactions?.length === 2, `v=${r.json?.version} tx=${r.json?.transactions?.length}`);
globalThis.__EXPORT__ = r.json;
r = await call(exportApi, "GET", "/api/data/export?format=csv");
check("GET CSV导出表头完整", r.status === 200 && r.text.includes("账本") && r.text.includes("消费情绪"), r.text?.slice(0,60));

const fs = await import("node:fs");
fs.writeFileSync(process.env.NL_SNAPSHOT, JSON.stringify(globalThis.__EXPORT__));
process.exit(summary("套件1 · 核心记账链路") ? 1 : 0);
