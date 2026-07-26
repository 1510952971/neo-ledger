import { transactionAccountDelta } from "./split-core.js";

const MOODS = new Set(["悦己", "刚需", "冲动"]);

export function transactionBalanceDelta(
  type,
  amount,
  splitMode = null,
  splitWithMemberId = 0,
) {
  return transactionAccountDelta(
    type,
    amount,
    splitMode,
    splitWithMemberId,
  );
}

export function normalizeTransactionEdit(input) {
  const id = Number(input?.id);
  const ledgerId = Number(input?.ledgerId);
  const accountId = Number(input?.accountId);
  const amount = Math.round(Number(input?.amount) * 100);
  const type = String(input?.type || "");
  const title = String(input?.title || "")
    .trim()
    .slice(0, 40);
  const mood = String(input?.mood || "");
  const category = String(input?.category || "").trim();
  const incomeCategory = String(input?.incomeCategory || "").trim();
  const occurredAt = String(input?.occurredAt || "").trim();
  const originalTimezone = String(
    input?.originalTimezone || "Asia/Shanghai",
  ).trim();
  const expectedUpdatedAt = String(input?.expectedUpdatedAt || "").trim();
  if (!Number.isInteger(id) || id <= 0) throw new Error("账单不存在");
  if (!Number.isInteger(ledgerId) || ledgerId <= 0)
    throw new Error("账本不存在");
  if (!Number.isInteger(accountId) || accountId <= 0)
    throw new Error("请选择账户");
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("请输入正确金额");
  if (!(type === "支出" || type === "收入")) throw new Error("请选择收支类型");
  if (!title) throw new Error("请输入账单名称");
  if (type === "支出" && !MOODS.has(mood)) throw new Error("请选择消费情绪");
  if (type === "支出" && !category) throw new Error("请选择消费分类");
  if (type === "收入" && !incomeCategory) throw new Error("请选择收入分类");
  if (!occurredAt) throw new Error("请选择发生时间");
  if (!originalTimezone) throw new Error("时区无效");
  if (!expectedUpdatedAt) throw new Error("账单版本无效，请刷新后重试");
  return {
    id,
    ledgerId,
    accountId,
    amount,
    type,
    title,
    mood: type === "支出" ? mood : null,
    category: type === "支出" ? category : null,
    incomeCategory: type === "收入" ? incomeCategory : null,
    occurredAt,
    originalTimezone,
    expectedUpdatedAt,
  };
}
