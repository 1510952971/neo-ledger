import { isValidDateKey, toPositiveCents } from "../savings-goals/rules.js";

const cycles = new Set(["每月", "每季", "每年"]);

export function normalizeSubscriptionInput(body) {
  const ledgerId = Number(body.ledgerId ?? 1);
  const name = String(body.name ?? "").trim().slice(0, 30);
  const amount = toPositiveCents(body.amount, "请输入正确的扣款金额");
  const accountId = Number(body.accountId);
  const cycle = String(body.cycle ?? "");
  const category = String(body.category ?? "").trim();
  const nextChargeDate = String(body.nextChargeDate ?? "");

  if (!Number.isInteger(ledgerId) || ledgerId <= 0)
    throw new Error("账本不存在");
  if (!name) throw new Error("请输入订阅名称");
  if (!Number.isInteger(accountId) || accountId <= 0)
    throw new Error("请选择扣款账户");
  if (!cycles.has(cycle)) throw new Error("请选择续费周期");
  if (!category) throw new Error("请选择消费分类");
  if (!isValidDateKey(nextChargeDate))
    throw new Error("请选择正确的续费日期");

  return {
    ledgerId,
    name,
    amount,
    accountId,
    cycle,
    category,
    nextChargeDate,
  };
}
