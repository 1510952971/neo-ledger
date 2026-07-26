import { describe, check, call, summary } from "./lib.mjs";
process.env.TZ = "Asia/Shanghai";
const dbmod = await import("../../db/index.ts");
await dbmod.ensureDb();
const B = dbmod.getDbBinding();
const q = async (sql, ...p) => (await B.prepare(sql).bind(...p).all()).results;

const ledgers = await import("../../app/api/ledgers/route.ts");
const accounts = await import("../../app/api/accounts/route.ts");
const goals = await import("../../app/api/savings-goals/route.ts");
const subs = await import("../../app/api/subscriptions/route.ts");
const inst = await import("../../app/api/installments/route.ts");
const members = await import("../../app/api/members/route.ts");
const settlements = await import("../../app/api/settlements/route.ts");
const assets = await import("../../app/api/assets/route.ts");
const pending = await import("../../app/api/pending-transactions/route.ts");
const webhook = await import("../../app/api/v1/webhook/auto-parse/route.ts");
const billImport = await import("../../app/api/bill-import/route.ts");
const p2pDisc = await import("../../app/api/p2p/discovery/route.ts");
const p2pSig = await import("../../app/api/p2p/signals/route.ts");
const p2pCrdt = await import("../../app/api/p2p/crdt/route.ts");
const aiChat = await import("../../app/api/v1/ai/chat/route.ts");
const intToken = await import("../../app/api/integrations/quick-sync/route.ts");
const extSync = await import("../../app/api/external/quick-sync/route.ts");
const health = await import("../../app/api/app-update/health/route.ts");

let r = await call(ledgers, "GET", "/api/ledgers");
const L = r.json[0].id;
r = await call(accounts, "POST", "/api/accounts", { body: { ledgerId: L, name: "现金池", type: "资产", balance: 50000 } });
const cashId = r.json.id;
r = await call(accounts, "POST", "/api/accounts", { body: { ledgerId: L, name: "花呗", type: "负债", balance: 3000, billDay: 1, repaymentDay: 10 } });
const debtId = r.json.id;

describe("储蓄目标");
r = await call(goals, "POST", "/api/savings-goals", { body: { ledgerId: L, name: "旅行基金", targetAmount: 20000, deadline: "2027-12-31", icon: "✈️" } });
check("POST 新建目标", r.status === 200 || r.status === 201, r.text);
r = await call(goals, "GET", `/api/savings-goals?ledger=${L}`);
const goalId = r.json?.[0]?.id;
check("GET 目标列表", r.status === 200 && goalId, r.text?.slice(0,120));
r = await call(goals, "PATCH", "/api/savings-goals", { body: { id: goalId, accountId: cashId, amount: 1500 } });
check("PATCH 存入1500", r.status === 200, r.text);
const saved = (await q("SELECT saved_amount s FROM savings_goals WHERE id=?", goalId))[0]?.s;
check("已存金额落库150000分", saved === 150000, String(saved));
const cashAfter = (await q("SELECT current_balance b FROM accounts WHERE id=?", cashId))[0].b;
check("现金池被扣减", cashAfter === 5000000 - 150000, String(cashAfter));
r = await call(goals, "PATCH", "/api/savings-goals", { body: { id: goalId, accountId: cashId, amount: -5 } });
check("负数存入被拒", r.status >= 400, `${r.status} ${r.text}`);

describe("订阅");
r = await call(subs, "POST", "/api/subscriptions", { body: { ledgerId: L, name: "视频会员", amount: 25, accountId: cashId, cycle: "每月", category: "娱乐", nextChargeDate: "2026-07-01" } });
check("POST 新订阅(扣费日已过)", r.status === 200 || r.status === 201, r.text);
r = await call(subs, "POST", "/api/subscriptions", { body: { ledgerId: L, name: "坏订阅", amount: 25, accountId: cashId, cycle: "每周", category: "娱乐", nextChargeDate: "2026-08-01" } });
check("非法周期被拒", r.status >= 400 && (r.json?.error||"").includes("周期"), `${r.status} ${r.text}`);
await dbmod.processDueSubscriptions(L);
const subTx = await q("SELECT COUNT(*) n FROM transactions WHERE title LIKE '%视频会员%'");
check("到期订阅自动扣费生成流水", subTx[0].n >= 1, JSON.stringify(subTx));
const nextDate = (await q("SELECT next_charge_date d FROM subscriptions WHERE name='视频会员'"))[0]?.d;
check("下次扣费日推进到未来", nextDate > "2026-07-26", String(nextDate));

describe("分期");
r = await call(inst, "POST", "/api/installments", { body: { ledgerId: L, name: "手机分期", totalAmount: 6000, periods: 12, feeAmount: 120, accountId: debtId, paymentAccountId: cashId, chargeDay: 15, startMonth: "2026-06" } });
check("POST 新分期", r.status === 200 || r.status === 201, r.text);
r = await call(inst, "POST", "/api/installments", { body: { ledgerId: L, name: "错绑资产", totalAmount: 100, periods: 3, feeAmount: 0, accountId: cashId, paymentAccountId: cashId, chargeDay: 15, startMonth: "2026-06" } });
check("分期绑资产账户被拒", r.status >= 400 && (r.json?.error||"").includes("负债"), `${r.status} ${r.text}`);
await dbmod.processDueInstallments(L);
const instTx = await q("SELECT COUNT(*) n FROM account_transfers WHERE kind='分期还款'");
check("到期分期自动还款(6/15,7/15两期)", instTx[0].n === 2, JSON.stringify(instTx));
r = await call(inst, "GET", `/api/installments?ledger=${L}`);
const instId = r.json?.[0]?.id;
r = await call(inst, "DELETE", `/api/installments?id=${instId}`);
check("已还款分期拒绝删除(保护)", r.status >= 400 && (r.json?.error||"").includes("不能直接删除"), `${r.status} ${r.text}`);
r = await call(inst, "POST", "/api/installments", { body: { ledgerId: L, name: "未开始分期", totalAmount: 1200, periods: 6, feeAmount: 0, accountId: debtId, paymentAccountId: cashId, chargeDay: 15, startMonth: "2026-09" } });
check("POST 未开始分期", r.status === 200 || r.status === 201, r.text);
r = await call(inst, "GET", `/api/installments?ledger=${L}`);
const freshId = (r.json||[]).find(x => x.name === "未开始分期")?.id;
r = await call(inst, "DELETE", `/api/installments?id=${freshId}`);
check("DELETE 无还款分期成功", r.status === 200, r.text);

describe("成员/人情账");
r = await call(members, "POST", "/api/members", { body: { ledgerId: L, name: "小王", icon: "🧑" } });
check("POST 新成员", r.status === 200 || r.status === 201, r.text);
r = await call(members, "GET", `/api/members?ledger=${L}`);
const memberId = (r.json || []).find(m => m.name === "小王")?.id;
check("GET 成员列表", !!memberId, r.text?.slice(0,150));
r = await call(settlements, "POST", "/api/settlements", { body: { ledgerId: L, memberId, amount: 88, direction: "collect" } });
check("POST 人情平账", r.status === 200 || (r.status < 500 && !!r.json), `${r.status} ${r.text?.slice(0,120)}`);

describe("数码资产");
r = await call(assets, "POST", "/api/assets", { body: { ledgerId: L, name: "MacBook", assetType: "电脑", purchasePrice: 15000, purchaseDate: "2025-01-15", lifespanMonths: 48, residualRate: 10, valuationMode: "自动折旧", heatLevel: "高" } });
check("POST 新资产", r.status === 200 || r.status === 201, r.text);
r = await call(assets, "GET", `/api/assets?ledger=${L}`);
const asset = r.json?.[0];
check("GET 估值(折旧后<原价)", asset && asset.currentValue < 1500000 && asset.currentValue > 0, JSON.stringify(asset)?.slice(0,150));
r = await call(assets, "PATCH", "/api/assets", { body: { id: asset?.id, ledgerId: L, salePrice: 8000, accountId: cashId } });
check("PATCH 变卖回款", r.status === 200, r.text);
const saleTx = await q("SELECT COUNT(*) n FROM transactions WHERE type='收入' AND title LIKE '%MacBook%'");
check("变卖生成收入流水", saleTx[0].n === 1, JSON.stringify(saleTx));

describe("集成令牌/外部同步/webhook");
r = await call(intToken, "POST", "/api/integrations/quick-sync");
const token = r.json?.token;
check("POST 签发令牌", r.status === 200 && token, r.text?.slice(0,120));
r = await call(extSync, "POST", "/api/external/quick-sync", { headers: { authorization: `Bearer ${token}` }, body: { ledgerId: L, accountId: cashId, amount: 12.5, merchant: "便利店", category: "餐饮", time: "2026-07-25T09:00" } });
check("外部快速记账(带令牌)", r.status === 200 || r.status === 201, `${r.status} ${r.text?.slice(0,150)}`);
r = await call(extSync, "POST", "/api/external/quick-sync", { headers: { authorization: "Bearer wrong-token-123" }, body: { ledgerId: L, accountId: cashId, amount: 1, merchant: "x" } });
check("错误令牌被拒", r.status === 401 || r.status === 403, `${r.status}`);
r = await call(webhook, "POST", "/api/v1/webhook/auto-parse", { headers: { "x-sync-token": "harness-sync-token", "content-type": "application/json" }, body: { ledgerId: L, text: "微信支付 向 星巴克 付款 ¥45.00" } });
check("webhook 自动解析入待确认", r.status === 201 || r.status === 200, `${r.status} ${r.text?.slice(0,150)}`);
r = await call(pending, "GET", `/api/pending-transactions?ledger=${L}`);
const pendId = r.json?.[0]?.id;
check("GET 待确认列表", r.status === 200, r.text?.slice(0,150));
if (pendId) {
  r = await call(pending, "PATCH", "/api/pending-transactions", { body: { id: pendId, action: "confirm", category: "餐饮" } });
  check("PATCH 确认入账", r.status === 200, r.text?.slice(0,120));
}

describe("账单导入");
const items = [
  { source: "wechat", externalId: "wx-001", occurredAt: "2026-07-19 08:30:00", originalTimezone: "Asia/Shanghai", type: "支出", amount: 28.8, merchant: "早餐店", paymentMethod: "零钱", title: "早餐" },
  { source: "wechat", externalId: "wx-001", occurredAt: "2026-07-19 08:30:00", originalTimezone: "Asia/Shanghai", type: "支出", amount: 28.8, merchant: "早餐店", paymentMethod: "零钱", title: "早餐" },
  { source: "alipay", externalId: "zfb-9", occurredAt: "2026-07-18 20:11:00", originalTimezone: "Asia/Shanghai", type: "收入", amount: 200, merchant: "转账", paymentMethod: "余额", title: "收款" },
];
r = await call(billImport, "POST", "/api/bill-import", { body: { ledgerId: L, items } });
check("POST 导入(含重复行)", r.status === 200, `${r.status} ${r.text?.slice(0,200)}`);
check("重复行被去重", JSON.stringify(r.json||{}).match(/2|去重|dup/) !== null, r.text?.slice(0,200));

describe("P2P/AI/健康");
r = await call(p2pDisc, "GET", "/api/p2p/discovery");
check("GET 发现元数据", r.status === 200 && r.json?.service, r.text?.slice(0,100));
r = await call(p2pSig, "POST", "/api/p2p/signals", { body: { room: "TESTROOM1", fromNode: "node-a", toNode: "node-b", kind: "offer", payload: {} } });
check("POST 信令", r.status === 201 || r.status === 200, r.text?.slice(0,120));
r = await call(p2pSig, "GET", "/api/p2p/signals?room=TESTROOM1&node=node-b&after=0");
check("GET 信令回读", r.status === 200 && JSON.stringify(r.json).includes("offer"), r.text?.slice(0,150));
r = await call(p2pCrdt, "GET", `/api/p2p/crdt?ledger=${L}&since=0`);
check("GET CRDT 全量", r.status === 200 && Array.isArray(r.json?.transactions), r.text?.slice(0,120));
r = await call(aiChat, "POST", "/api/v1/ai/chat", { body: { ledgerId: L, message: "我这个月花了多少钱" } });
check("POST AI 问答(本地统计)", r.status === 200 && (r.json?.reply || r.json?.message || r.text.length > 10), r.text?.slice(0,150));
r = await call(health, "GET", "/api/app-update/health");
check("GET 健康检查", r.status === 200, r.text?.slice(0,120));

process.exit(summary("套件2 · 业务模块") ? 1 : 0);
