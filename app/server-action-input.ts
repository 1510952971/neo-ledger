const MAX_MONEY_YUAN = 1_000_000_000;

export function boundedActionText(value: unknown, maximum: number, label: string) {
  if (typeof value !== "string") throw new Error(`${label}格式无效`);
  const text = value.trim();
  if (!text) return "";
  if (text.length > maximum) throw new Error(`${label}最多 ${maximum} 个字符`);
  return text;
}

export function actionPositiveInteger(value: unknown, label: string) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number) || number <= 0)
    throw new Error(`${label}必须是正整数`);
  return number;
}

export function actionOptionalPositiveInteger(value: unknown, label: string) {
  if (value == null || value === "" || value === 0 || value === "0") return 0;
  return actionPositiveInteger(value, label);
}

export function actionMoneyCents(value: unknown, label = "金额") {
  const yuan = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(yuan) || yuan <= 0 || yuan > MAX_MONEY_YUAN)
    throw new Error(`${label}必须大于 0 且不超过 ${MAX_MONEY_YUAN}`);
  const cents = Math.round(yuan * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0)
    throw new Error(`${label}超出系统精度范围`);
  return cents;
}

export function actionPercent(value: unknown, label = "比例") {
  const percent = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100)
    throw new Error(`${label}必须在 0—100 之间`);
  return percent;
}

export function actionTimezone(value: unknown) {
  const timezone = boundedActionText(value, 64, "时区") || "Asia/Shanghai";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  } catch {
    throw new Error("时区必须是有效的 IANA 时区");
  }
  return timezone;
}
