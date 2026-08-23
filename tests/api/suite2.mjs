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
const { MAX_MEMBER_COUNT } = await import("../../app/member-limits.ts");
const settlements = await import("../../app/api/settlements/route.ts");
const assets = await import("../../app/api/assets/route.ts");
const { MAX_ASSET_COUNT } = await import("../../app/asset-limits.ts");
const { MAX_SAVINGS_GOAL_COUNT, MAX_SUBSCRIPTION_COUNT, MAX_INSTALLMENT_COUNT } = await import("../../app/planning-limits.ts");
const pending = await import("../../app/api/pending-transactions/route.ts");
const webhook = await import("../../app/api/v1/webhook/auto-parse/route.ts");
const billImport = await import("../../app/api/bill-import/route.ts");
const p2pDisc = await import("../../app/api/p2p/discovery/route.ts");
const p2pPackages = await import("../../app/api/p2p/packages/route.ts");
const p2pSig = await import("../../app/api/p2p/signals/route.ts");
const p2pCrdt = await import("../../app/api/p2p/crdt/route.ts");
const aiChat = await import("../../app/api/v1/ai/chat/route.ts");
const intToken = await import("../../app/api/integrations/quick-sync/route.ts");
const extSync = await import("../../app/api/external/quick-sync/route.ts");
const v1Transactions = await import("../../app/api/v1/transactions/route.ts");
const openapiRoute = await import("../../app/api/openapi.json/route.ts");
const { externalApiError } = await import("../../app/external-api.ts");
const { accessErrorResponse } = await import("../../app/api-security.ts");
const health = await import("../../app/api/app-update/health/route.ts");
const healthz = await import("../../app/api/health/route.ts");
const responseLimits = await import("../../app/request-limits.ts");

let r = await call(ledgers, "GET", "/api/ledgers");
const L = r.json[0].id;
describe("外部响应边界");
const smallBinary = await responseLimits.readResponseBytesWithLimit(
  new Response(new Uint8Array([1, 2, 3])),
  4,
);
check("外部二进制响应在预算内可读取", smallBinary.length === 3 && smallBinary[2] === 3, String(smallBinary.length));
const chunkedBinary = new Response(
  new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
      controller.enqueue(new Uint8Array([4, 5, 6]));
      controller.close();
    },
  }),
);
let oversizedBinaryRejected = false;
try {
  await responseLimits.readResponseBytesWithLimit(chunkedBinary, 5);
} catch (error) {
  oversizedBinaryRejected = error?.status === 413;
}
check("无 Content-Length 的分块二进制响应超限时拒绝", oversizedBinaryRejected, String(oversizedBinaryRejected));
let textCancelled = false;
try {
  await responseLimits.readResponseTextWithLimit({
    headers: new Headers(),
    body: {
      getReader() {
        return {
          read: async () => { throw new Error("upstream reset"); },
          cancel: async () => { textCancelled = true; },
          releaseLock() {},
        };
      },
    },
  }, 16);
} catch {
  // The important contract is cancellation before the error reaches the caller.
}
check("外部文本响应读取异常时取消底层流", textCancelled, String(textCancelled));
let bytesCancelled = false;
try {
  await responseLimits.readResponseBytesWithLimit({
    headers: new Headers(),
    body: {
      getReader() {
        return {
          read: async () => { throw new Error("upstream reset"); },
          cancel: async () => { bytesCancelled = true; },
          releaseLock() {},
        };
      },
    },
  }, 16);
} catch {
  // The important contract is cancellation before the error reaches the caller.
}
check("外部二进制响应读取异常时取消底层流", bytesCancelled, String(bytesCancelled));
r = await call(accounts, "POST", "/api/accounts", { body: { ledgerId: L, name: "现金池", type: "资产", balance: 50000 } });
const cashId = r.json.id;
r = await call(accounts, "POST", "/api/accounts", { body: { ledgerId: L, name: "花呗", type: "负债", balance: 3000, billDay: 1, repaymentDay: 10 } });
const debtId = r.json.id;
r = await call(accounts, "POST", "/api/accounts", {
  headers: { "content-length": String(256 * 1024 + 1) },
  body: { ledgerId: L, name: "超限请求", type: "资产", balance: 1 },
});
check("普通内部契约在JSON解析前拒绝超限请求", r.status === 413, `${r.status} ${r.text?.slice(0,120)}`);

describe("储蓄目标");
r = await call(goals, "POST", "/api/savings-goals", { body: { ledgerId: L, name: "旅行基金", targetAmount: 20000, deadline: "2027-12-31", icon: "✈️" } });
check("POST 新建目标", r.status === 200 || r.status === 201, r.text);
r = await call(goals, "GET", `/api/savings-goals?ledger=${L}`);
const goalId = r.json?.[0]?.id;
check("GET 目标列表", r.status === 200 && goalId && r.headers?.get?.("cache-control") === "no-store, private, max-age=0", r.text?.slice(0,120));
const goalContributionBody = { id: goalId, accountId: cashId, amount: 1500, idempotencyKey: "goal-contribution-retry-001" };
const goalTransferCountBeforeRetry = Number((await q("SELECT COUNT(*) n FROM account_transfers WHERE target_type='savings-goal' AND target_id=?", goalId))[0].n);
r = await call(goals, "PATCH", "/api/savings-goals", { body: goalContributionBody });
check("PATCH 存入1500", r.status === 200 && r.json?.duplicate === false, r.text);
const saved = (await q("SELECT saved_amount s FROM savings_goals WHERE id=?", goalId))[0]?.s;
check("已存金额落库150000分", saved === 150000, String(saved));
const cashAfter = (await q("SELECT current_balance b FROM accounts WHERE id=?", cashId))[0].b;
check("现金池被扣减", cashAfter === 5000000 - 150000, String(cashAfter));
r = await call(goals, "PATCH", "/api/savings-goals", { body: goalContributionBody });
const goalTransferCountAfterRetry = Number((await q("SELECT COUNT(*) n FROM account_transfers WHERE target_type='savings-goal' AND target_id=?", goalId))[0].n);
check("储蓄存入重复提交不重复扣款", r.status === 200 && r.json?.duplicate === true && goalTransferCountAfterRetry === goalTransferCountBeforeRetry + 1, `${r.status} ${r.text} ${goalTransferCountBeforeRetry}->${goalTransferCountAfterRetry}`);
r = await call(goals, "PATCH", "/api/savings-goals", { body: { ...goalContributionBody, amount: 1600 } });
check("储蓄存入复用幂等键但改金额被拒", r.status === 409 && r.json?.code === "request_failed", `${r.status} ${r.text}`);
r = await call(goals, "PATCH", "/api/savings-goals", { body: { id: goalId, accountId: cashId, amount: -5 } });
check("负数存入被拒", r.status >= 400, `${r.status} ${r.text}`);
const goalVersionBeforeDelete = (await q("SELECT updated_at updatedAt FROM savings_goals WHERE id=?", goalId))[0]?.updatedAt;
r = await call(goals, "DELETE", "/api/savings-goals", { body: { id: goalId, accountId: cashId, expectedUpdatedAt: "stale-goal-version", idempotencyKey: "goal-refund-stale-001" } });
check("储蓄目标旧版本删除不会退款或删除目标", r.status === 409 && (await q("SELECT id FROM savings_goals WHERE id=?", goalId)).length === 1 && (await q("SELECT current_balance b FROM accounts WHERE id=?", cashId))[0]?.b === cashAfter, `${r.status} ${r.text}`);
r = await call(goals, "DELETE", "/api/savings-goals", { body: { id: goalId, accountId: cashId, expectedUpdatedAt: goalVersionBeforeDelete, idempotencyKey: "goal-refund-retry-001" } });
check("删除目标并退回储蓄", r.status === 200 && r.json?.duplicate === false && r.json?.refundedAmount === 150000, r.text);
const refundTransferCount = Number((await q("SELECT COUNT(*) n FROM account_transfers WHERE kind='储蓄退款' AND target_id=?", goalId))[0]?.n ?? 0);
const cashAfterRefund = (await q("SELECT current_balance b FROM accounts WHERE id=?", cashId))[0]?.b;
check("储蓄退款恢复账户余额", refundTransferCount === 1 && cashAfterRefund === 5000000, JSON.stringify({ refundTransferCount, cashAfterRefund }));
r = await call(goals, "DELETE", "/api/savings-goals", { body: { id: goalId, accountId: cashId, expectedUpdatedAt: goalVersionBeforeDelete, idempotencyKey: "goal-refund-retry-001" } });
const refundTransferCountAfterRetry = Number((await q("SELECT COUNT(*) n FROM account_transfers WHERE kind='储蓄退款' AND target_id=?", goalId))[0]?.n ?? 0);
check("储蓄退款重复提交不重复入账", r.status === 200 && r.json?.duplicate === true && refundTransferCountAfterRetry === 1, `${r.status} ${r.text}`);
r = await call(goals, "POST", "/api/savings-goals", { body: { ledgerId: L, name: "x".repeat(31), targetAmount: 100, deadline: "2027-01-01", icon: "X" } });
check("超长心愿名称不再静默截断", r.status === 400, r.text);
const existingGoalCount = Number((await q("SELECT COUNT(*) n FROM savings_goals WHERE ledger_id=?", L))[0]?.n ?? 0);
if (MAX_SAVINGS_GOAL_COUNT > existingGoalCount)
  await B.batch(Array.from({ length: MAX_SAVINGS_GOAL_COUNT - existingGoalCount }, (_, index) =>
    B.prepare("INSERT INTO savings_goals(ledger_id,name,target_amount,deadline,icon,uuid,updated_at) VALUES(?,?,?,?,?,lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'))")
      .bind(L, `容量目标${index}`, 100, "2099-12-31", "🎯"),
  ));
r = await call(goals, "GET", `/api/savings-goals?ledger=${L}`);
check("储蓄目标列表具备容量边界", r.status === 200 && r.json?.length === MAX_SAVINGS_GOAL_COUNT && r.headers?.get?.("x-total-count") === String(MAX_SAVINGS_GOAL_COUNT) && r.headers?.get?.("x-has-more") === "0", `${r.status} ${r.headers?.get?.("x-total-count")} ${r.json?.length}`);
r = await call(goals, "POST", "/api/savings-goals", { body: { ledgerId: L, name: "超限目标", targetAmount: 100, deadline: "2099-12-31", icon: "🎯" } });
check("储蓄目标达到容量上限时拒绝创建", r.status === 409, `${r.status} ${r.text}`);

describe("订阅");
r = await call(subs, "POST", "/api/subscriptions", { body: { ledgerId: L, name: "视频会员", amount: 25, accountId: cashId, cycle: "每月", category: "娱乐", nextChargeDate: "2026-07-01" } });
check("POST 新订阅(扣费日已过)", r.status === 200 || r.status === 201, r.text);
r = await call(subs, "POST", "/api/subscriptions", { body: { ledgerId: L, name: "坏订阅", amount: 25, accountId: cashId, cycle: "每周", category: "娱乐", nextChargeDate: "2026-08-01" } });
check("非法周期被拒", r.status >= 400 && (r.json?.error||"").includes("周期"), `${r.status} ${r.text}`);
r = await call(subs, "POST", "/api/subscriptions", { body: { ledgerId: L, name: "x".repeat(31), amount: 25, accountId: cashId, cycle: "每月", category: "娱乐", nextChargeDate: "2026-08-01" } });
check("超长订阅名称不再静默截断", r.status === 400, r.text);
r = await call(subs, "POST", "/api/subscriptions", { body: { ledgerId: L, name: "额外字段", amount: 25, accountId: cashId, cycle: "每月", category: "娱乐", nextChargeDate: "2026-08-01", ownerId: "other" } });
check("订阅未知字段被拒", r.status === 400, r.text);
await dbmod.processDueSubscriptions(L);
const subTx = await q("SELECT COUNT(*) n FROM transactions WHERE title LIKE '%视频会员%'");
check("到期订阅自动扣费生成流水", subTx[0].n >= 1, JSON.stringify(subTx));
const nextDate = (await q("SELECT next_charge_date d FROM subscriptions WHERE name='视频会员'"))[0]?.d;
check("下次扣费日推进到未来", nextDate > "2026-07-26", String(nextDate));
r = await call(subs, "GET", `/api/subscriptions?ledger=${L}`);
check("订阅列表具备容量与缓存边界", r.status === 200 && r.json?.length === 1 && r.headers?.get?.("cache-control") === "no-store, private, max-age=0" && r.headers?.get?.("x-total-count") === "1", `${r.status} ${r.headers?.get?.("x-total-count")} ${r.json?.length}`);
const existingSubscriptionCount = Number((await q("SELECT COUNT(*) n FROM subscriptions WHERE ledger_id=?", L))[0]?.n ?? 0);
if (MAX_SUBSCRIPTION_COUNT > existingSubscriptionCount)
  await B.batch(Array.from({ length: MAX_SUBSCRIPTION_COUNT - existingSubscriptionCount }, (_, index) =>
    B.prepare("INSERT INTO subscriptions(ledger_id,name,amount,account_id,cycle,category,category_dynamic,next_charge_date,uuid,updated_at) VALUES(?,?,?,?,?,?,?,?,lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'))")
      .bind(L, `容量订阅${index}`, 100, cashId, "每月", "娱乐", "娱乐", "2099-12-01"),
  ));
r = await call(subs, "GET", `/api/subscriptions?ledger=${L}`);
check("订阅列表达到容量边界", r.status === 200 && r.json?.length === MAX_SUBSCRIPTION_COUNT && r.headers?.get?.("x-total-count") === String(MAX_SUBSCRIPTION_COUNT) && r.headers?.get?.("x-has-more") === "0", `${r.status} ${r.headers?.get?.("x-total-count")} ${r.json?.length}`);
r = await call(subs, "POST", "/api/subscriptions", { body: { ledgerId: L, name: "超限订阅", amount: 25, accountId: cashId, cycle: "每月", category: "娱乐", nextChargeDate: "2099-12-01" } });
check("订阅达到容量上限时拒绝创建", r.status === 409, `${r.status} ${r.text}`);

describe("分期");
const installmentBody = { ledgerId: L, name: "手机分期", totalAmount: 6000, periods: 12, feeAmount: 120, accountId: debtId, paymentAccountId: cashId, chargeDay: 15, startMonth: "2026-06", idempotencyKey: "installment-retry-001" };
r = await call(inst, "POST", "/api/installments", { body: installmentBody });
check("POST 新分期", r.status === 200 || r.status === 201, r.text);
const installmentCountAfterFirst = Number((await q("SELECT COUNT(*) n FROM installments WHERE ledger_id=?", L))[0]?.n ?? 0);
r = await call(inst, "POST", "/api/installments", { body: installmentBody });
const installmentCountAfterRetry = Number((await q("SELECT COUNT(*) n FROM installments WHERE ledger_id=?", L))[0]?.n ?? 0);
check("分期重复提交不重复创建", r.status === 200 && r.json?.duplicate === true && installmentCountAfterRetry === installmentCountAfterFirst, `${r.status} ${r.text} ${installmentCountAfterFirst}->${installmentCountAfterRetry}`);
r = await call(inst, "POST", "/api/installments", { body: { ...installmentBody, totalAmount: 6100 } });
check("分期复用幂等键但改金额被拒", r.status === 409 && r.json?.code === "request_failed", `${r.status} ${r.text}`);
r = await call(inst, "POST", "/api/installments", { body: { ledgerId: L, name: "错绑资产", totalAmount: 100, periods: 3, feeAmount: 0, accountId: cashId, paymentAccountId: cashId, chargeDay: 15, startMonth: "2026-06" } });
check("分期绑资产账户被拒", r.status >= 400 && (r.json?.error||"").includes("负债"), `${r.status} ${r.text}`);
r = await call(inst, "POST", "/api/installments", { body: { ledgerId: L, name: "非法月份", totalAmount: 100, periods: 3, feeAmount: 0, accountId: debtId, paymentAccountId: cashId, chargeDay: 15, startMonth: "2026-99" } });
check("不存在的分期月份被拒", r.status === 400, r.text);
r = await call(inst, "POST", "/api/installments", { body: { ledgerId: L, name: "额外字段", totalAmount: 100, periods: 3, feeAmount: 0, accountId: debtId, paymentAccountId: cashId, chargeDay: 15, startMonth: "2026-09", paidPeriods: 3 } });
check("分期只读字段注入被拒", r.status === 400, r.text);
await dbmod.processDueInstallments(L);
const instTx = await q("SELECT COUNT(*) n FROM account_transfers WHERE kind='分期还款'");
const today = new Date();
const expectedDuePeriods = Math.max(0, Math.min(12, (today.getFullYear() - 2026) * 12 + today.getMonth() - 5 + (today.getDate() >= 15 ? 1 : 0)));
check("到期分期按当前日期自动还款", instTx[0].n === expectedDuePeriods, JSON.stringify({ instTx, expectedDuePeriods }));
r = await call(inst, "GET", `/api/installments?ledger=${L}`);
const instId = r.json?.[0]?.id;
check("分期列表具备容量与缓存边界", r.status === 200 && r.headers?.get?.("cache-control") === "no-store, private, max-age=0" && r.headers?.get?.("x-total-count") === "1", `${r.status} ${r.headers?.get?.("x-total-count")}`);
const paidInstallmentVersion = r.json?.[0]?.updatedAt;
r = await call(inst, "DELETE", `/api/installments?id=${instId}&expectedUpdatedAt=${encodeURIComponent(paidInstallmentVersion)}`);
check("已还款分期拒绝删除(保护)", r.status >= 400 && (r.json?.error||"").includes("不能直接删除"), `${r.status} ${r.text}`);
const freshInstallmentBody = { ledgerId: L, name: "未开始分期", totalAmount: 1200, periods: 6, feeAmount: 0, accountId: debtId, paymentAccountId: cashId, chargeDay: 15, startMonth: "2026-09", idempotencyKey: "installment-create-retry-002" };
r = await call(inst, "POST", "/api/installments", { body: freshInstallmentBody });
check("POST 未开始分期", r.status === 200 || r.status === 201, r.text);
r = await call(inst, "GET", `/api/installments?ledger=${L}`);
const freshId = (r.json||[]).find(x => x.name === "未开始分期")?.id;
const freshInstallmentVersion = (r.json||[]).find(x => x.id === freshId)?.updatedAt;
r = await call(inst, "DELETE", `/api/installments?id=${freshId}&expectedUpdatedAt=stale-installment-version&idempotencyKey=installment-reversal-stale-001`);
check("旧版本分期撤销不会冲销负债", r.status === 409 && (await q("SELECT id FROM installments WHERE id=?", freshId)).length === 1 && (await q("SELECT COUNT(*) n FROM account_transfers WHERE kind='分期撤销' AND target_id=?", freshId))[0].n === 0, `${r.status} ${r.text}`);
r = await call(inst, "DELETE", `/api/installments?id=${freshId}&expectedUpdatedAt=${encodeURIComponent(freshInstallmentVersion)}&idempotencyKey=installment-reversal-retry-001`);
check("DELETE 无还款分期成功", r.status === 200 && r.json?.duplicate === false, r.text);
const reversalCount = Number((await q("SELECT COUNT(*) n FROM account_transfers WHERE kind='分期撤销' AND target_id=?", freshId))[0]?.n ?? 0);
r = await call(inst, "DELETE", `/api/installments?id=${freshId}&expectedUpdatedAt=${encodeURIComponent(freshInstallmentVersion)}&idempotencyKey=installment-reversal-retry-001`);
const reversalCountAfterRetry = Number((await q("SELECT COUNT(*) n FROM account_transfers WHERE kind='分期撤销' AND target_id=?", freshId))[0]?.n ?? 0);
check("分期撤销重复提交不重复入账", r.status === 200 && r.json?.duplicate === true && reversalCount === 1 && reversalCountAfterRetry === 1, `${r.status} ${r.text} ${reversalCount}->${reversalCountAfterRetry}`);
const existingInstallmentCount = Number((await q("SELECT COUNT(*) n FROM installments WHERE ledger_id=?", L))[0]?.n ?? 0);
if (MAX_INSTALLMENT_COUNT > existingInstallmentCount)
  await B.batch(Array.from({ length: MAX_INSTALLMENT_COUNT - existingInstallmentCount }, (_, index) =>
    B.prepare("INSERT INTO installments(ledger_id,name,total_amount,periods,paid_periods,fee_amount,account_id,payment_account_id,start_month,charge_day,currency,uuid,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))")
      .bind(L, `容量分期${index}`, 10000, 12, 0, 0, debtId, cashId, "2099-01", 15, "CNY", `capacity-installment-${index}`),
  ));
r = await call(inst, "GET", `/api/installments?ledger=${L}`);
check("分期列表达到容量边界", r.status === 200 && r.json?.length === MAX_INSTALLMENT_COUNT && r.headers?.get?.("x-total-count") === String(MAX_INSTALLMENT_COUNT) && r.headers?.get?.("x-has-more") === "0", `${r.status} ${r.headers?.get?.("x-total-count")} ${r.json?.length}`);
r = await call(inst, "POST", "/api/installments", { body: { ledgerId: L, name: "超限分期", totalAmount: 100, periods: 3, feeAmount: 0, accountId: debtId, paymentAccountId: cashId, chargeDay: 15, startMonth: "2099-01" } });
check("分期达到容量上限时拒绝创建", r.status === 409, `${r.status} ${r.text}`);

describe("成员/人情账");
r = await call(members, "POST", "/api/members", { body: { ledgerId: L, name: "小王", icon: "🧑" } });
check("POST 新成员", r.status === 200 || r.status === 201, r.text);
r = await call(members, "POST", "/api/members", { body: { ledgerId: L, name: "x".repeat(21), icon: "X" } });
check("超长成员名称不再静默截断", r.status === 400, r.text);
r = await call(members, "GET", `/api/members?ledger=${L}`);
const memberId = (r.json || []).find(m => m.name === "小王")?.id;
check("GET 成员列表", !!memberId && r.headers?.get?.("cache-control") === "no-store, private, max-age=0", r.text?.slice(0,150));
const existingMemberCount = Number((await q("SELECT COUNT(*) n FROM members WHERE ledger_id=?", L))[0]?.n ?? 0);
const memberFill = Math.max(0, MAX_MEMBER_COUNT - existingMemberCount);
if (memberFill > 0)
  await B.batch(Array.from({ length: memberFill }, (_, index) =>
    B.prepare("INSERT INTO members(ledger_id,name,icon,is_me) VALUES(?,?,?,0)").bind(L, `容量成员${index}`, "🧩"),
  ));
r = await call(members, "GET", `/api/members?ledger=${L}`);
check("成员列表具备容量与缓存边界", r.status === 200 && r.json?.length === MAX_MEMBER_COUNT && r.headers?.get?.("x-total-count") === String(MAX_MEMBER_COUNT) && r.headers?.get?.("x-has-more") === "0", `${r.status} ${r.headers?.get?.("x-total-count")} ${r.json?.length}`);
r = await call(members, "POST", "/api/members", { body: { ledgerId: L, name: "超限成员", icon: "🧱" } });
check("成员达到容量上限时拒绝创建", r.status === 409, `${r.status} ${r.text}`);
const settlementBody = { ledgerId: L, memberId, amount: 88, direction: "owesMe", idempotencyKey: "settlement-retry-001" };
const settlementCountBeforeRetry = Number((await q("SELECT COUNT(*) n FROM account_transfers WHERE ledger_id=? AND kind='人情平账'", L))[0].n);
r = await call(settlements, "POST", "/api/settlements", { body: settlementBody });
const firstSettlementUuid = r.json?.uuid;
check("POST 人情平账", r.status === 200 && r.json?.duplicate === false && firstSettlementUuid, `${r.status} ${r.text?.slice(0,120)}`);
r = await call(settlements, "POST", "/api/settlements", { body: settlementBody });
const settlementCountAfterRetry = Number((await q("SELECT COUNT(*) n FROM account_transfers WHERE ledger_id=? AND kind='人情平账'", L))[0].n);
check("人情平账重复提交不重复入账", r.status === 200 && r.json?.duplicate === true && r.json?.uuid === firstSettlementUuid && settlementCountAfterRetry === settlementCountBeforeRetry + 1, `${r.status} ${r.text} ${settlementCountBeforeRetry}->${settlementCountAfterRetry}`);
r = await call(settlements, "POST", "/api/settlements", { body: { ...settlementBody, amount: 89 } });
check("人情平账复用幂等键但改金额被拒", r.status === 409 && r.json?.code === "request_failed", `${r.status} ${r.text}`);
r = await call(settlements, "POST", "/api/settlements", { body: { ledgerId: L, memberId, amount: "Infinity", direction: "owesMe" } });
check("人情平账非有限金额被拒", r.status === 400, r.text);

describe("数码资产");
r = await call(assets, "POST", "/api/assets", { body: { ledgerId: L, name: "MacBook", assetType: "电脑", purchasePrice: 15000, purchaseDate: "2025-01-15", lifespanMonths: 48, residualRate: 10, valuationMode: "自动折旧", heatLevel: "高" } });
check("POST 新资产", r.status === 200 || r.status === 201, r.text);
r = await call(assets, "POST", "/api/assets", { body: { ledgerId: L, name: "非法币种资产", assetType: "电脑", currency: "BTC", purchasePrice: 1, purchaseDate: "2025-01-15", lifespanMonths: 48, residualRate: 10, valuationMode: "自动折旧" } });
check("资产非法币种被结构契约拒绝", r.status === 400, r.text);
r = await call(assets, "POST", "/api/assets", { body: { ledgerId: L, name: "额外字段资产", assetType: "电脑", purchasePrice: 1, purchaseDate: "2025-01-15", lifespanMonths: 48, residualRate: 10, valuationMode: "自动折旧", currentValue: 999999 } });
check("资产未知估值字段被拒", r.status === 400, r.text);
r = await call(assets, "GET", `/api/assets?ledger=${L}`);
const asset = r.json?.[0];
check("GET 估值(折旧后<原价)", asset && asset.currentValue < 1500000 && asset.currentValue > 0, JSON.stringify(asset)?.slice(0,150));
const assetLiquidationBody = { id: asset?.id, ledgerId: L, salePrice: 8000, accountId: cashId, expectedUpdatedAt: asset?.updatedAt, idempotencyKey: "asset-liquidation-retry-001" };
r = await call(assets, "PATCH", "/api/assets", { body: { ...assetLiquidationBody, expectedUpdatedAt: "stale-asset-version", idempotencyKey: "asset-liquidation-stale-001" } });
check("旧版本资产变现不会重复入账", r.status === 409 && (await q("SELECT id FROM digital_assets WHERE id=?", asset?.id)).length === 1 && (await q("SELECT COUNT(*) n FROM transactions WHERE occurrence_key LIKE '%asset-liquidation-stale-001%'"))[0]?.n === 0, `${r.status} ${r.text}`);
r = await call(assets, "PATCH", "/api/assets", { body: assetLiquidationBody });
check("PATCH 变卖回款", r.status === 200 && r.json?.duplicate === false, r.text);
const saleTx = await q("SELECT COUNT(*) n FROM transactions WHERE type='收入' AND title LIKE '%MacBook%'");
check("变卖生成收入流水", saleTx[0].n === 1, JSON.stringify(saleTx));
r = await call(assets, "PATCH", "/api/assets", { body: assetLiquidationBody });
const saleTxAfterRetry = await q("SELECT COUNT(*) n FROM transactions WHERE type='收入' AND occurrence_key LIKE '%asset-liquidation-retry-001%'");
check("资产变现重复提交不重复入账", r.status === 200 && r.json?.duplicate === true && saleTxAfterRetry[0].n === 1, `${r.status} ${r.text}`);
r = await call(assets, "PATCH", "/api/assets", { body: { ...assetLiquidationBody, salePrice: 8100 } });
check("资产变现复用幂等键但改金额被拒", r.status === 409 && r.json?.code === "request_failed", `${r.status} ${r.text}`);
if (MAX_ASSET_COUNT > 0)
  await B.batch(Array.from({ length: MAX_ASSET_COUNT }, (_, index) =>
    B.prepare("INSERT INTO digital_assets(ledger_id,name,asset_type,currency,valuation_mode,purchase_price,purchase_date,lifespan_months,residual_rate_bps,heat_level) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .bind(L, `容量资产${index}`, "其它", "CNY", "手动估值", 100, "2026-01-01", 12, 1000, "低"),
  ));
r = await call(assets, "GET", `/api/assets?ledger=${L}`);
check("数字资产列表具备容量与缓存边界", r.status === 200 && r.json?.length === MAX_ASSET_COUNT && r.headers?.get?.("x-total-count") === String(MAX_ASSET_COUNT) && r.headers?.get?.("x-has-more") === "0" && r.headers?.get?.("cache-control") === "no-store, private, max-age=0", `${r.status} ${r.headers?.get?.("x-total-count")} ${r.json?.length}`);
r = await call(assets, "POST", "/api/assets", { body: { ledgerId: L, name: "超限资产", assetType: "其它", purchasePrice: 1, purchaseDate: "2026-01-01", lifespanMonths: 12, residualRate: 10, valuationMode: "自动折旧" } });
check("数字资产达到容量上限时拒绝创建", r.status === 409, `${r.status} ${r.text}`);

describe("集成令牌/外部同步/webhook");
r = await call(openapiRoute, "GET", "/api/openapi.json", { headers: { "x-request-id": "openapi-contract-001" } });
check("OpenAPI 文档无需登录且带追踪头", r.status === 200 && r.json?.openapi === "3.1.0" && r.json?.paths?.["/api/v1/transactions"] && r.headers?.get("x-request-id") === "openapi-contract-001", `${r.status} ${r.text?.slice(0,180)}`);
{
  const hiddenInternal = accessErrorResponse(
    new Error("SQLITE_CONSTRAINT secret_table"),
    "服务端暂时无法读取数据",
    new Request("http://localhost:3000/api/test"),
  );
  const hiddenInternalBody = await hiddenInternal.json();
  check(
    "普通 API 不泄露数据库异常",
    hiddenInternal.status === 500 &&
      hiddenInternalBody.code === "internal_error" &&
      hiddenInternalBody.error === "服务端暂时无法读取数据" &&
      !JSON.stringify(hiddenInternalBody).includes("secret_table"),
    JSON.stringify(hiddenInternalBody),
  );
  const hiddenRuntime = accessErrorResponse(
    new TypeError("Cannot read properties of undefined (reading 'secret_table')"),
    "服务端暂时无法处理请求",
    new Request("http://localhost:3000/api/test"),
  );
  const hiddenRuntimeBody = await hiddenRuntime.json();
  check(
    "普通 API 不泄露运行时异常",
    hiddenRuntime.status === 500 &&
      hiddenRuntimeBody.code === "internal_error" &&
      hiddenRuntimeBody.error === "服务端暂时无法处理请求" &&
      !JSON.stringify(hiddenRuntimeBody).includes("secret_table"),
    JSON.stringify(hiddenRuntimeBody),
  );
  const hidden = externalApiError(
    new Error("SQLITE_CONSTRAINT secret_table internal detail"),
    new Request("http://localhost:3000/api/v1/transactions"),
    "服务端暂时无法写入交易",
  );
  const hiddenBody = await hidden.json();
  check("外部 API 不泄露未知数据库错误", hidden.status === 500 && hiddenBody.code === "internal_error" && hiddenBody.error === "服务端暂时无法写入交易" && !JSON.stringify(hiddenBody).includes("secret_table"), JSON.stringify(hiddenBody));
  check("外部 API 错误响应具备安全缓存头", hidden.headers?.get("cache-control") === "no-store, private, max-age=0" && hidden.headers?.get("pragma") === "no-cache" && hidden.headers?.get("x-content-type-options") === "nosniff" && hidden.headers?.get("x-request-id") === hiddenBody.requestId, Object.fromEntries(hidden.headers ?? []));
}
r = await call(intToken, "POST", "/api/integrations/quick-sync", { body: { label: "iPhone 快捷指令", expiresInDays: 90, scope: "ledger:write" } });
let token = r.json?.token;
check("POST 签发带名称、权限和有效期的令牌", r.status === 200 && token && r.json?.label === "iPhone 快捷指令" && r.json?.scope === "ledger:write" && Date.parse(r.json?.expiresAt) > Date.now(), r.text?.slice(0,180));
r = await call(intToken, "POST", "/api/integrations/quick-sync", { body: { label: "x".repeat(61), expiresInDays: 90, scope: "ledger:write" } });
check("集成令牌标签不再静默截断", r.status === 400, r.text);
r = await call(intToken, "POST", "/api/integrations/quick-sync", { body: { label: "越界期限", expiresInDays: 731, scope: "ledger:write" } });
check("集成令牌期限不再静默夹紧", r.status === 400, r.text);
r = await call(intToken, "GET", "/api/integrations/quick-sync");
check("GET 回读令牌安全元数据", r.status === 200 && r.json?.active && r.json?.label === "iPhone 快捷指令" && r.json?.scope === "ledger:write" && r.json?.expiresAt, r.text?.slice(0,180));
await B.prepare("UPDATE integration_tokens SET expires_at='2000-01-01T00:00:00.000Z' WHERE owner_id='local'").run();
r = await call(intToken, "GET", "/api/integrations/quick-sync");
check("过期令牌不会继续显示为 active", r.status === 200 && r.json?.active === false && !r.json?.tokenPrefix, r.text?.slice(0,180));
r = await call(extSync, "POST", "/api/external/quick-sync", { headers: { authorization: `Bearer ${token}` }, body: { externalId: "expired-token-event", ledgerId: L, accountId: cashId, amount: 1, merchant: "过期令牌" } });
check("过期令牌不能写入外部流水", r.status === 401 && r.json?.code === "invalid_token", `${r.status} ${r.text?.slice(0,150)}`);
r = await call(intToken, "POST", "/api/integrations/quick-sync", { body: { label: "iPhone 快捷指令", expiresInDays: 90, scope: "ledger:write" } });
token = r.json?.token;
check("过期后可显式轮换新令牌", r.status === 200 && token && Date.parse(r.json?.expiresAt) > Date.now(), r.text?.slice(0,180));
r = await call(extSync, "POST", "/api/external/quick-sync", { headers: { authorization: `Bearer ${token}`, "cf-connecting-ip": "192.0.2.10" }, body: { externalId: "token-source-001", ledgerId: L, accountId: cashId, amount: 1, merchant: "来源一" } });
r = await call(extSync, "POST", "/api/external/quick-sync", { headers: { authorization: `Bearer ${token}`, "cf-connecting-ip": "192.0.2.11" }, body: { externalId: "token-source-002", ledgerId: L, accountId: cashId, amount: 1, merchant: "来源二" } });
check("集成令牌来源变化写入安全审计", r.status === 201 && (await q("SELECT COUNT(*) n FROM audit_events WHERE owner_id='local' AND event_type='integration_token.source_changed'"))[0]?.n >= 1, r.text?.slice(0,180));
r = await call(intToken, "POST", "/api/integrations/quick-sync", { headers: { "cf-connecting-ip": "198.51.100.7" }, body: { label: "轮换后来源重置", expiresInDays: 90, scope: "ledger:write" } });
token = r.json?.token;
const sourceAuditBeforeRotatedUse = (await q("SELECT COUNT(*) n FROM audit_events WHERE owner_id='local' AND event_type='integration_token.source_changed'"))[0]?.n ?? 0;
r = await call(extSync, "POST", "/api/external/quick-sync", { headers: { authorization: `Bearer ${token}`, "cf-connecting-ip": "203.0.113.9" }, body: { externalId: "token-rotation-source-001", ledgerId: L, accountId: cashId, amount: 1, merchant: "轮换后来源" } });
check("令牌轮换会重置旧来源审计状态", r.status === 201 && (await q("SELECT COUNT(*) n FROM audit_events WHERE owner_id='local' AND event_type='integration_token.source_changed'"))[0]?.n === sourceAuditBeforeRotatedUse, r.text?.slice(0,180));
r = await call(extSync, "POST", "/api/external/quick-sync", { headers: { authorization: `Bearer ${token}` }, body: { externalId: "shortcut-001", ledgerId: L, accountId: cashId, amount: 12.5, merchant: "便利店", category: "餐饮", time: "2026-07-25T09:00" } });
check("外部快速记账(带令牌)", r.status === 200 || r.status === 201, `${r.status} ${r.text?.slice(0,150)}`);
check("外部成功响应具备安全缓存头", r.headers?.get("cache-control") === "no-store, private, max-age=0" && r.headers?.get("pragma") === "no-cache" && r.headers?.get("x-content-type-options") === "nosniff" && r.headers?.get("x-request-id") === r.json?.requestId, Object.fromEntries(r.headers ?? []));
check("旧外部记账入口返回弃用与迁移响应头", r.headers?.get("deprecation") === "true" && r.headers?.get("link")?.includes("/api/v1/transactions"), JSON.stringify(Object.fromEntries(r.headers ?? [])));
const quickTransactionId = r.json?.id;
r = await call(extSync, "POST", "/api/external/quick-sync", { headers: { authorization: `Bearer ${token}` }, body: { externalId: "shortcut-001", ledgerId: L, accountId: cashId, amount: 12.5, merchant: "便利店", category: "餐饮", time: "2026-07-25T09:00" } });
check("相同外部事件幂等去重", r.status === 200 && r.json?.duplicate === true && r.json?.id === quickTransactionId, `${r.status} ${r.text?.slice(0,150)}`);
const quickOwnerId = (await q("SELECT owner_id ownerId FROM integration_events WHERE external_id='shortcut-001'")).at(0)?.ownerId;
await B.prepare("UPDATE integration_events SET transaction_id=-1 WHERE owner_id=? AND external_id=?").bind(quickOwnerId, "shortcut-001").run();
r = await call(extSync, "POST", "/api/external/quick-sync", { headers: { authorization: `Bearer ${token}` }, body: { externalId: "shortcut-001", ledgerId: L, accountId: cashId, amount: 12.5, merchant: "便利店", category: "餐饮", time: "2026-07-25T09:00" } });
check("幂等事件悬挂时可从已提交流水恢复且不重复入账", r.status === 200 && r.json?.duplicate === true && r.json?.id === quickTransactionId && (await q("SELECT COUNT(*) n FROM transactions WHERE offline_id IS NOT NULL AND title='便利店'"))[0]?.n === 1, `${r.status} ${r.text?.slice(0,180)}`);
const concurrentQuickRequests = await Promise.all([
  call(extSync, "POST", "/api/external/quick-sync", { headers: { authorization: `Bearer ${token}` }, body: { externalId: "shortcut-concurrent-001", ledgerId: L, accountId: cashId, amount: 3.2, merchant: "并发幂等测试", category: "餐饮", time: "2026-07-25T09:05" } }),
  call(extSync, "POST", "/api/external/quick-sync", { headers: { authorization: `Bearer ${token}` }, body: { externalId: "shortcut-concurrent-001", ledgerId: L, accountId: cashId, amount: 3.2, merchant: "并发幂等测试", category: "餐饮", time: "2026-07-25T09:05" } }),
]);
check("并发幂等请求最多写入一笔流水", concurrentQuickRequests.every((item) => [200, 201, 409].includes(item.status)) && (await q("SELECT COUNT(*) n FROM integration_events WHERE external_id='shortcut-concurrent-001'"))[0]?.n === 1 && (await q("SELECT COUNT(*) n FROM transactions WHERE offline_id IS NOT NULL AND title='并发幂等测试'"))[0]?.n === 1, JSON.stringify(concurrentQuickRequests.map((item) => ({ status: item.status, body: item.json }))));
r = await call(extSync, "POST", "/api/external/quick-sync", { headers: { authorization: `Bearer ${token}` }, body: { externalId: "shortcut-001", ledgerId: L, accountId: cashId, amount: 99, merchant: "错误复用", category: "餐饮", time: "2026-07-25T09:00" } });
check("自动记账拒绝复用幂等ID写入不同账单", r.status === 409, `${r.status} ${r.text?.slice(0,150)}`);
r = await call(extSync, "POST", "/api/external/quick-sync", { headers: { authorization: `Bearer ${token}`, "idempotency-key": "notice-income-001" }, body: { ledgerId: L, accountId: cashId, text: "支付宝到账 ¥200.00，付款方：测试用户", time: "2026-07-25T10:00" } });
check("通知全文可解析为收入", r.status === 201 && r.json?.type === "收入", `${r.status} ${r.text?.slice(0,150)}`);
r = await call(extSync, "POST", "/api/external/quick-sync", { headers: { authorization: "Bearer wrong-token-123" }, body: { ledgerId: L, accountId: cashId, amount: 1, merchant: "x" } });
check("错误令牌被拒", r.status === 401 || r.status === 403, `${r.status}`);
r = await call(v1Transactions, "POST", "/api/v1/transactions", { headers: { authorization: `Bearer ${token}` }, body: { ledgerId: L, accountId: cashId, amount: 18.8, merchant: "版本接口便利店" } });
check("v1 交易接口强制幂等键", r.status === 422 && r.json?.code === "idempotency_key_required" && r.json?.requestId === r.headers?.get("x-request-id"), `${r.status} ${r.text?.slice(0,180)}`);
r = await call(v1Transactions, "POST", "/api/v1/transactions", { headers: { "x-sync-token": "harness-sync-token", "idempotency-key": "v1-legacy-token" }, body: { ledgerId: L, amount: 1 } });
check("v1 交易接口拒绝旧全局万能密钥", r.status === 401 && r.json?.code === "invalid_token", `${r.status} ${r.text?.slice(0,160)}`);
r = await call(v1Transactions, "POST", "/api/v1/transactions", { headers: { authorization: `Bearer ${token}`, "content-type": "text/plain", "idempotency-key": "v1-event-media" }, raw: JSON.stringify({ ledgerId: L, amount: 1 }) });
check("v1 交易接口拒绝未声明 JSON 的正文", r.status === 415 && r.json?.code === "unsupported_media_type", `${r.status} ${r.text?.slice(0,160)}`);
r = await call(v1Transactions, "POST", "/api/v1/transactions", { headers: { authorization: `Bearer ${token}`, "idempotency-key": "v1-event-0001", "x-request-id": "api-contract-test-001" }, body: { ledgerId: L, accountId: cashId, amount: 18.8, merchant: "版本接口便利店", type: "支出" } });
check("v1 交易接口返回统一请求 ID", r.status === 201 && r.json?.externalId === "v1-event-0001" && r.json?.requestId === "api-contract-test-001" && r.headers?.get("x-request-id") === "api-contract-test-001" && !r.headers?.get("deprecation"), `${r.status} ${r.text?.slice(0,180)}`);
r = await call(v1Transactions, "POST", "/api/v1/transactions", { headers: { authorization: `Bearer ${token}`, "idempotency-key": "v1-event-0001" }, body: { ledgerId: L, accountId: cashId, amount: 18.8, merchant: "版本接口便利店", type: "支出" } });
check("v1 交易接口幂等重试返回同一流水", r.status === 200 && r.json?.duplicate === true, `${r.status} ${r.text?.slice(0,160)}`);
r = await call(v1Transactions, "POST", "/api/v1/transactions", { headers: { authorization: `Bearer ${token}`, "content-length": String(65 * 1024), "idempotency-key": "v1-event-large" }, body: { ledgerId: L, amount: 1 } });
check("v1 交易接口在解析前拒绝超大正文", r.status === 413 && r.json?.code === "payload_too_large", `${r.status} ${r.text?.slice(0,160)}`);
r = await call(webhook, "POST", "/api/v1/webhook/auto-parse", { headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "idempotency-key": "webhook-event-0001" }, body: { ledgerId: L, text: "微信支付 向 星巴克 付款 ¥45.00" } });
check("webhook 自动解析入待确认", r.status === 201 || r.status === 200, `${r.status} ${r.text?.slice(0,150)}`);
const webhookPendingId = r.json?.id;
r = await call(webhook, "POST", "/api/v1/webhook/auto-parse", { headers: { "x-sync-token": "harness-sync-token", "content-type": "application/json", "idempotency-key": "webhook-legacy-token" }, body: { ledgerId: L, text: "微信支付 ¥1.00" } });
check("v1 webhook 拒绝旧全局万能密钥", r.status === 401 && r.json?.code === "invalid_token", `${r.status} ${r.text?.slice(0,160)}`);
r = await call(webhook, "POST", "/api/v1/webhook/auto-parse", { headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "idempotency-key": "webhook-event-0001" }, body: { ledgerId: L, text: "微信支付 向 星巴克 付款 ¥45.00" } });
check("webhook 使用范围化令牌并按事件幂等", r.status === 200 && r.json?.duplicate === true && r.json?.id === webhookPendingId, `${r.status} ${r.text?.slice(0,160)}`);
r = await call(webhook, "POST", "/api/v1/webhook/auto-parse", { headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: { ledgerId: L, text: "微信支付 ¥10.00" } });
check("webhook 缺少幂等键时拒绝写入", r.status === 422 && r.json?.code === "idempotency_key_required", `${r.status} ${r.text?.slice(0,160)}`);
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
const importRows = r.json?.items ?? [];
const importBalanceBefore = (await q("SELECT current_balance balance FROM accounts WHERE id=?", cashId))[0]?.balance;
r = await call(billImport, "PUT", "/api/bill-import", { body: { ledgerId: L, items: importRows.map((item) => ({ ...item, accountId: cashId })) } });
const importBatchId = r.json?.batchId;
check("PUT 导入生成可追踪批次", r.status === 200 && importBatchId && r.json?.imported === 2, `${r.status} ${r.text?.slice(0,200)}`);
r = await call(billImport, "GET", `/api/bill-import?ledger=${L}`);
check("GET 可读取导入批次报告", r.status === 200 && r.json?.batches?.some?.((batch) => batch.id === importBatchId && batch.importedCount === 2 && batch.status === "completed"), r.text?.slice(0,220));
r = await call(billImport, "DELETE", `/api/bill-import?ledger=${L}&batchId=${importBatchId}`);
const importBalanceAfterUndo = (await q("SELECT current_balance balance FROM accounts WHERE id=?", cashId))[0]?.balance;
check("DELETE 整批撤销并恢复账户余额", r.status === 200 && r.json?.undone === 2 && importBalanceAfterUndo === importBalanceBefore, `${r.status} ${JSON.stringify({ result: r.json, importBalanceBefore, importBalanceAfterUndo })}`);
r = await call(billImport, "DELETE", `/api/bill-import?ledger=${L}&batchId=${importBatchId}`);
check("重复撤销保持幂等", r.status === 200 && r.json?.alreadyUndone === true, r.text?.slice(0,160));
await B.prepare("UPDATE import_batches SET status='undoing' WHERE id=?").bind(importBatchId).run();
r = await call(billImport, "DELETE", `/api/bill-import?ledger=${L}&batchId=${importBatchId}`);
check("撤销中批次拒绝并发重复请求", r.status === 409 && r.json?.error?.includes("正在撤销"), `${r.status} ${r.text?.slice(0,160)}`);
await B.prepare("UPDATE import_batches SET status='undoing',undo_started_at='2000-01-01 00:00:00',undo_lock_id='recovery-test-lock' WHERE id=?").bind(importBatchId).run();
r = await call(billImport, "DELETE", `/api/bill-import?ledger=${L}&batchId=${importBatchId}&resume=1`);
check("中断批次可安全续跑且不重复冲销", r.status === 200 && r.json?.resumed === true && (await q("SELECT status FROM import_batches WHERE id=?", importBatchId))[0]?.status === "undone" && (await q("SELECT current_balance balance FROM accounts WHERE id=?", cashId))[0]?.balance === importBalanceBefore, `${r.status} ${r.text?.slice(0,180)}`);
const editedItem = { ...items[0], externalId: "wx-edited-batch", merchant: "编辑保护测试", accountId: cashId };
r = await call(billImport, "PUT", "/api/bill-import", { body: { ledgerId: L, items: [editedItem] } });
const editedBatchId = r.json?.batchId;
await B.prepare("UPDATE transactions SET title='用户已修改',updated_at='2099-01-01T00:00:00.000Z' WHERE offline_id LIKE 'import:%' AND title='编辑保护测试'").run();
r = await call(billImport, "DELETE", `/api/bill-import?ledger=${L}&batchId=${editedBatchId}`);
check("批次流水被编辑后拒绝整批撤销", r.status >= 400 && r.json?.error?.includes("已被修改"), `${r.status} ${r.text?.slice(0,180)}`);
const legacyCleanupUpdatedAt = new Date().toISOString();
await B.prepare("INSERT INTO transactions(ledger_id,title,amount,type,account_id,currency,original_amount,original_currency,exchange_rate_micros,original_timezone,occurred_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").bind(L, "兼容清理回归·白条相关", 1234, "支出", cashId, "CNY", 1234, "CNY", 1000000, "Asia/Shanghai", legacyCleanupUpdatedAt, legacyCleanupUpdatedAt).run();
await B.prepare("UPDATE accounts SET current_balance=current_balance+? WHERE id=?").bind(1234, cashId).run();
const legacyCleanupBalanceBefore = (await q("SELECT current_balance balance FROM accounts WHERE id=?", cashId))[0]?.balance;
r = await call(billImport, "DELETE", `/api/bill-import?ledger=${L}`);
const legacyCleanupBalanceAfter = (await q("SELECT current_balance balance FROM accounts WHERE id=?", cashId))[0]?.balance;
check("兼容黑名单清理按版本冲销且恢复余额", r.status === 200 && legacyCleanupBalanceAfter === legacyCleanupBalanceBefore + 1234, `${r.status} ${r.text?.slice(0,180)} balance=${legacyCleanupBalanceBefore}->${legacyCleanupBalanceAfter}`);
r = await call(billImport, "DELETE", `/api/bill-import?ledger=${L}`);
const legacyCleanupBalanceAfterRetry = (await q("SELECT current_balance balance FROM accounts WHERE id=?", cashId))[0]?.balance;
check("兼容黑名单清理重复请求不二次改余额", r.status === 200 && r.json?.deleted === 0 && legacyCleanupBalanceAfterRetry === legacyCleanupBalanceAfter, `${r.status} ${r.text?.slice(0,180)}`);

describe("P2P/AI/健康");
r = await call(p2pDisc, "GET", "/api/p2p/discovery");
check("GET 发现元数据", r.status === 200 && r.json?.service, r.text?.slice(0,100));
r = await call(p2pDisc, "POST", "/api/p2p/discovery", { body: { room: "TESTROOM1", nodeId: "node-a", label: "测试设备 A" } });
check("POST 登记在线设备", r.status === 200, r.text?.slice(0,120));
r = await call(p2pDisc, "GET", "/api/p2p/discovery?room=TESTROOM1&node=node-b");
check("GET 自动发现在线设备", r.status === 200 && r.json?.peers?.some((peer) => peer.nodeId === "node-a"), r.text?.slice(0,180));
r = await call(p2pPackages, "POST", "/api/p2p/packages", { body: { room: "TESTROOM1", payload: '{"version":1}' } });
const packageId = r.json?.id;
check("POST 上传局域网同步包", r.status === 201 && packageId, r.text?.slice(0,150));
r = await call(p2pPackages, "GET", `/api/p2p/packages?room=TESTROOM1`);
check("GET 局域网同步包列表", r.status === 200 && r.json?.packages?.some((item) => item.id === packageId), r.text?.slice(0,150));
r = await call(p2pPackages, "GET", `/api/p2p/packages?room=TESTROOM1&id=${packageId}`);
check("GET 局域网同步包密文", r.status === 200 && r.json?.payload === '{"version":1}', r.text?.slice(0,150));
r = await call(p2pPackages, "DELETE", `/api/p2p/packages?room=TESTROOM1&id=${packageId}`);
check("DELETE 局域网同步包", r.status === 200, r.text?.slice(0,120));
r = await call(p2pSig, "POST", "/api/p2p/signals", { body: { room: "TESTROOM1", fromNode: "node-a", toNode: "node-b", kind: "offer", payload: {} } });
check("POST 信令", r.status === 201 || r.status === 200, r.text?.slice(0,120));
r = await call(p2pSig, "GET", "/api/p2p/signals?room=TESTROOM1&node=node-b&after=0");
check("GET 信令回读", r.status === 200 && JSON.stringify(r.json).includes("offer"), r.text?.slice(0,150));
r = await call(p2pCrdt, "GET", `/api/p2p/crdt?ledger=${L}&since=0`);
check("GET CRDT 全量", r.status === 200 && Array.isArray(r.json?.transactions), r.text?.slice(0,120));
r = await call(p2pCrdt, "POST", "/api/p2p/crdt", { body: { ledgerId: L, transactions: [{ crdtId: `crdt-boundary-${Date.now()}`, title: "同步边界测试", amount: 123, type: "支出", mood: "刚需", category: "餐饮", currency: "CNY", occurredAt: "2026-08-19T12:00:00.000Z", updatedAt: "2026-08-19T12:00:00.000Z", accountName: "现金池" }] } });
check("CRDT 合并接受有界合法流水", r.status === 200 && Number(r.json?.inserted) === 1, r.text?.slice(0,160));
r = await call(p2pCrdt, "POST", "/api/p2p/crdt", { body: { ledgerId: L, transactions: [{ crdtId: `crdt-invalid-${Date.now()}`, title: "非法同步", amount: 1.5, type: "未知", currency: "CNY", occurredAt: "x", updatedAt: "x", accountName: "现金池" }] } });
check("CRDT 合并跳过非法流水字段", r.status === 200 && Number(r.json?.inserted) === 0, r.text?.slice(0,160));
r = await call(aiChat, "POST", "/api/v1/ai/chat", { body: { ledgerId: L, message: "我这个月花了多少钱" } });
check("POST AI 问答(本地统计)", r.status === 200 && (r.json?.reply || r.json?.message || r.text.length > 10), r.text?.slice(0,150));
r = await call(health, "GET", "/api/app-update/health");
check("GET 健康检查", r.status === 200 && r.headers?.get("cache-control")?.includes("no-store") && r.headers?.get("x-content-type-options") === "nosniff" && Boolean(r.headers?.get("x-request-id")), r.text?.slice(0,120));
r = await call(healthz, "GET", "/api/health", { headers: { "x-request-id": "health-check-20260819" } });
check("GET 公开就绪探针", r.status === 200 && r.json?.status === "ok" && r.json?.checks?.database === "ok" && r.headers?.get("x-request-id") === "health-check-20260819" && r.headers?.get("x-content-type-options") === "nosniff", r.text?.slice(0,160));

process.exit(summary("套件2 · 业务模块") ? 1 : 0);
