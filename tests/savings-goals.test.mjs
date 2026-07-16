import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateGoalContribution,
  isValidDateKey,
  toPositiveCents,
} from "../app/api/savings-goals/rules.js";
import { normalizeSubscriptionInput } from "../app/api/subscriptions/rules.js";
import {
  matchStatementAccount,
  parseImageStatementText,
  parseCsvRows,
  parseTabularStatement,
  partitionStatementImports,
  statementAccountKey,
  suggestStatementAccount,
} from "../app/bill-import-core.js";

test("converts user amounts to integer cents", () => {
  assert.equal(toPositiveCents("12.345"), 1235);
  assert.throws(() => toPositiveCents("0"), /正确金额/);
  assert.throws(() => toPositiveCents("not-a-number"), /正确金额/);
});

test("accepts only real ISO date keys", () => {
  assert.equal(isValidDateKey("2028-02-29"), true);
  assert.equal(isValidDateKey("2027-02-29"), false);
  assert.equal(isValidDateKey("2027-13-01"), false);
  assert.equal(isValidDateKey("27-01-01"), false);
});

test("caps a contribution at the remaining goal amount", () => {
  assert.deepEqual(
    calculateGoalContribution({
      targetAmount: 100_00,
      savedAmount: 90_00,
      requestedAmount: 50_00,
      accountBalance: 10_00,
    }),
    {
      appliedAmount: 10_00,
      savedAmount: 100_00,
      remainingAmount: 0,
      completed: true,
    },
  );
});

test("keeps a normal contribution unchanged", () => {
  assert.deepEqual(
    calculateGoalContribution({
      targetAmount: 100_00,
      savedAmount: 20_00,
      requestedAmount: 15_00,
      accountBalance: 50_00,
    }),
    {
      appliedAmount: 15_00,
      savedAmount: 35_00,
      remainingAmount: 65_00,
      completed: false,
    },
  );
});

test("rejects completed goals and insufficient balances", () => {
  assert.throws(
    () =>
      calculateGoalContribution({
        targetAmount: 100_00,
        savedAmount: 100_00,
        requestedAmount: 1_00,
        accountBalance: 10_00,
      }),
    /已经完成/,
  );
  assert.throws(
    () =>
      calculateGoalContribution({
        targetAmount: 100_00,
        savedAmount: 20_00,
        requestedAmount: 15_00,
        accountBalance: 14_99,
      }),
    /余额不足/,
  );
});

test("normalizes subscription fields for create and edit", () => {
  assert.deepEqual(
    normalizeSubscriptionInput({
      ledgerId: "2",
      name: "  iCloud+  ",
      amount: "6.00",
      accountId: "8",
      cycle: "每月",
      category: "娱乐",
      nextChargeDate: "2026-08-01",
    }),
    {
      ledgerId: 2,
      name: "iCloud+",
      amount: 600,
      accountId: 8,
      cycle: "每月",
      category: "娱乐",
      nextChargeDate: "2026-08-01",
    },
  );
});

test("rejects invalid subscription cycles and dates", () => {
  const valid = {
    ledgerId: 1,
    name: "视频会员",
    amount: 25,
    accountId: 1,
    cycle: "每月",
    category: "娱乐",
    nextChargeDate: "2026-08-01",
  };
  assert.throws(
    () => normalizeSubscriptionInput({ ...valid, cycle: "每天" }),
    /续费周期/,
  );
  assert.throws(
    () =>
      normalizeSubscriptionInput({ ...valid, nextChargeDate: "2026-02-30" }),
    /续费日期/,
  );
});

test("parses a WeChat statement by its real headers", () => {
  const parsed = parseTabularStatement(
    parseCsvRows(`微信支付账单明细
交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,商户单号,备注
2018-08-10 07:57:14,商户消费,爱奇艺,爱奇艺VIP会员1个月自动续费,支出,6,零钱,支付成功,wx-1,m-1,/
2018-08-07 16:26:20,微信红包,朋友,/,收入,25,/,已存入零钱,wx-2,m-2,/
`),
    "微信支付账单.xlsx",
  );
  assert.equal(parsed.source, "wechat");
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.items[0].merchant, "爱奇艺VIP会员1个月自动续费");
  assert.equal(parsed.items[0].category, "娱乐");
  assert.equal(parsed.items[1].type, "收入");
});

test("does not double count Meituan repayment rows", () => {
  const parsed = parseTabularStatement(
    parseCsvRows(`美团交易账单明细
交易创建时间,交易成功时间,交易类型,订单标题,收/支,支付方式,订单金额,实付金额,交易单号,商家单号,备注
2025-07-11 22:33:00,2025-07-11 22:33:01,支付,骑行,支出,美团月付,1.50,1.50,mt-1,m-1,/
2025-07-12 08:00:00,2025-07-12 08:00:01,还款,月付还款,支出,银行卡,100.00,100.00,mt-2,m-2,/
`),
    "美团账单.csv",
  );
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.skipped, 1);
  assert.equal(parsed.items[0].amount, 1.5);
  assert.equal(
    parsed.totalRows,
    parsed.items.length + parsed.filtered + parsed.unconfirmed + parsed.truncated,
  );
});

test("maps platform payment methods to the matching ledger account", () => {
  const accounts = [
    { id: 1, name: "微信钱包", type: "资产", currency: "CNY" },
    { id: 2, name: "花呗", type: "负债", currency: "CNY" },
    { id: 3, name: "招商银行信用卡(7686)", type: "负债", currency: "CNY" },
  ];
  assert.equal(matchStatementAccount("零钱", "wechat", accounts)?.id, 1);
  assert.equal(matchStatementAccount("花呗&红包", "alipay", accounts)?.id, 2);
  assert.equal(
    matchStatementAccount("招商银行信用卡(7686)", "jd", accounts)?.id,
    3,
  );
  assert.equal(
    matchStatementAccount("零钱", "wechat", accounts, "USD"),
    null,
  );
  assert.equal(
    matchStatementAccount("招商银行信用卡", "jd", [
      ...accounts,
      { id: 4, name: "招商银行信用卡(1234)", type: "负债", currency: "CNY" },
    ]),
    null,
  );
  assert.equal(
    matchStatementAccount("招商银行信用卡(4629)", "jd", accounts),
    null,
  );
  assert.equal(
    matchStatementAccount("中国银行储蓄卡(4629)", "中国银行", [
      ...accounts,
      { id: 5, name: "招商银行储蓄卡(4629)", type: "资产", currency: "CNY" },
    ]),
    null,
  );
  assert.equal(
    matchStatementAccount("中国银行储蓄卡(4629)", "中国银行", [
      ...accounts,
      { id: 6, name: "中国银行储蓄卡(4629)", type: "资产", currency: "CNY" },
    ])?.id,
    6,
  );
});

test("suggests a missing statement account without changing its currency", () => {
  assert.deepEqual(
    suggestStatementAccount("中国银行储蓄卡(0770)", "中国银行", "CNY"),
    {
      name: "中国银行储蓄卡(0770)",
      type: "资产",
      currency: "CNY",
    },
  );
  assert.deepEqual(
    suggestStatementAccount("花呗", "支付宝", "CNY"),
    { name: "花呗", type: "负债", currency: "CNY" },
  );
  assert.equal(
    statementAccountKey({ paymentMethod: "零钱", currency: "CNY" }),
    "零钱\u0000CNY",
  );
});

test("only auto-imports safely mapped non-duplicate statement rows", () => {
  const mapped = { importKey: "mapped", accountId: 7 };
  const duplicate = {
    importKey: "duplicate",
    accountId: 7,
    possibleDuplicate: true,
  };
  const unmapped = { importKey: "unmapped", accountId: 0 };
  const result = partitionStatementImports([mapped, duplicate, unmapped]);
  assert.deepEqual(result.automatic, [mapped]);
  assert.deepEqual(result.review, [duplicate, unmapped]);
});

test("parses WeChat wallet screenshots with month and balance rows", () => {
  const parsed = parseImageStatementText(
    `零钱明细
2026年6月
扫码付款-给营养早餐 -5.00
6月22日 08:17
零钱余额 0.03
拼多多平台商户 -2.25
8月19日 10:01
零钱余额 5.03`,
    "微信零钱.jpg",
    new Date("2026-07-15T12:00:00+08:00"),
  );
  assert.equal(parsed.source, "wechat-image");
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.items[0].occurredAt, "2026-06-22 08:17:00");
  assert.equal(parsed.items[1].occurredAt, "2026-06-19 10:01:00");
  assert.equal(parsed.items[1].amount, 2.25);
});

test("parses Alipay screenshot income and relative dates", () => {
  const parsed = parseImageStatementText(
    `搜索交易记录
7月
支出 ¥478.13 收入 ¥0.00
农耕记·湘菜小炒·盖码饭 -15.90
餐饮美食
今天 11:13
余额宝-收益发放 0.43
投资理财
今天 06:19`,
    "支付宝.jpg",
    new Date("2026-07-15T21:00:00+08:00"),
  );
  assert.equal(parsed.source, "alipay-image");
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.items[0].type, "支出");
  assert.equal(parsed.items[1].type, "收入");
  assert.equal(parsed.items[1].incomeCategory, "理财收益");
});

test("filters screenshot repayments and keeps itemized purchases", () => {
  const parsed = parseImageStatementText(
    `账单
6月
【黄金暴击】酥鸭盖饭1人份 -16.70
食品酒饮
06-13 17:51 共1件
白条自动还款 33.94
白条
06-13 09:31
京东外部商户 -0.01
其他
06-12 21:27`,
    "京东.jpg",
    new Date("2026-07-15T12:00:00+08:00"),
  );
  assert.equal(parsed.source, "jd-image");
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.skipped, 1);
  assert.equal(parsed.items[0].category, "餐饮");
});

test("parses bank app screenshots and ignores credit-card repayment", () => {
  const parsed = parseImageStatementText(
    `收支记录
2026.07 全部账户
07月15日 星期三
财付通-扫码付款
网上消费(借记卡0770) 人民币元 - 17.00
07月14日 星期二
财付通-富贵年华
网上消费(借记卡0770) 人民币元 - 22.12
代收-招商银行(信用卡还款)
信用卡还款(借记卡4629) 人民币元 - 110.85 不计入`,
    "银行卡.jpg",
    new Date("2026-07-15T12:00:00+08:00"),
  );
  assert.equal(parsed.source, "bank-image");
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.skipped, 1);
  assert.equal(parsed.items[0].paymentMethod, "银行卡(0770)");
  assert.equal(parsed.items[1].occurredAt, "2026-07-14 00:00:00");
  assert.equal(
    parsed.totalRows,
    parsed.items.length + parsed.filtered + parsed.unconfirmed + parsed.truncated,
  );
});
