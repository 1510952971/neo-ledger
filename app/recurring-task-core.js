const cycles = new Set(["每天", "每周", "每月", "每季", "每年"]);
const types = new Set(["支出", "收入"]);

export function normalizeRecurringTask(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("周期任务请求格式无效");
  const allowed = new Set(["id", "ledgerId", "name", "amount", "type", "accountId", "cycle", "category", "nextRunDate", "reminderDays"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) throw new Error("周期任务包含不支持的字段");
  const ledgerId = Number(input.ledgerId);
  const accountId = Number(input.accountId);
  const amountValue = Number(input.amount);
  const amount = Math.round(amountValue * 100);
  const name = String(input.name ?? "").trim();
  const type = String(input.type ?? "");
  const cycle = String(input.cycle ?? "");
  const category = String(input.category ?? "").trim();
  const nextRunDate = String(input.nextRunDate ?? "");
  const reminderDays = Number(input.reminderDays ?? 1);
  if (!Number.isInteger(ledgerId) || ledgerId <= 0) throw new Error("账本不存在");
  if (!name || name.length > 40) throw new Error("名称需为 1–40 个字符");
  if (!Number.isFinite(amountValue) || !Number.isInteger(amount) || amount <= 0 || amount > 99_999_999_999) throw new Error("请输入有效金额");
  if (!types.has(type)) throw new Error("请选择支出或收入");
  if (!Number.isInteger(accountId) || accountId <= 0) throw new Error("请选择账户");
  if (!cycles.has(cycle)) throw new Error("请选择有效周期");
  if (!category) throw new Error("请选择分类");
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(nextRunDate) || !Number.isFinite(Date.parse(`${nextRunDate}T12:00:00Z`)) || new Date(`${nextRunDate}T12:00:00Z`).toISOString().slice(0, 10) !== nextRunDate) throw new Error("请选择正确的首次执行日期");
  if (!Number.isInteger(reminderDays) || reminderDays < 0 || reminderDays > 30) throw new Error("提醒提前天数需为 0–30 天");
  return { ledgerId, accountId, amount, name, type, cycle, category, nextRunDate, reminderDays };
}

export function nextRecurringTaskDate(dateKey, cycle) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(dateKey);
  if (!match) throw new Error("周期日期无效");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.toISOString().slice(0, 10) !== dateKey) throw new Error("周期日期无效");
  if (cycle === "每天" || cycle === "每周") {
    date.setUTCDate(date.getUTCDate() + (cycle === "每天" ? 1 : 7));
    return date.toISOString().slice(0, 10);
  }
  const months = cycle === "每月" ? 1 : cycle === "每季" ? 3 : cycle === "每年" ? 12 : 0;
  if (!months) throw new Error("周期类型无效");
  const absoluteMonth = year * 12 + month - 1 + months;
  const targetYear = Math.floor(absoluteMonth / 12);
  const targetMonth = absoluteMonth % 12 + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0, 12)).getUTCDate();
  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}
