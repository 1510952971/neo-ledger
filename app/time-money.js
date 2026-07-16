export const CURRENCY_TO_CNY = { CNY: 1, USD: 7.2, JPY: 0.0462, EUR: 7.85 };

export function dateKeyInZone(date = new Date(), timeZone = "Asia/Shanghai") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
}

export function localDateTimeToUtc(value, timeZone = "Asia/Shanghai") {
  const text = String(value || "").trim().replace(" ", "T");
  if (!text) return new Date().toISOString();
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(text)) {
    const explicit = new Date(text);
    if (Number.isNaN(explicit.getTime())) throw new Error("交易时间无效");
    return explicit.toISOString();
  }
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) throw new Error("交易时间无效");
  const desired = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4] || 0),
    minute: Number(match[5] || 0),
    second: Number(match[6] || 0),
  };
  let utc = Date.UTC(
    desired.year,
    desired.month - 1,
    desired.day,
    desired.hour,
    desired.minute,
    desired.second,
  );
  for (let pass = 0; pass < 3; pass++) {
    const actual = zonedParts(new Date(utc), timeZone);
    const desiredStamp = Date.UTC(desired.year, desired.month - 1, desired.day, desired.hour, desired.minute, desired.second);
    const actualStamp = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    utc += desiredStamp - actualStamp;
  }
  const result = new Date(utc);
  if (Number.isNaN(result.getTime())) throw new Error("交易时间无效");
  const verified = zonedParts(result, timeZone);
  if (
    verified.year !== desired.year ||
    verified.month !== desired.month ||
    verified.day !== desired.day ||
    verified.hour !== desired.hour ||
    verified.minute !== desired.minute ||
    verified.second !== desired.second
  )
    throw new Error("交易时间在该时区中不存在");
  return result.toISOString();
}

export function convertCurrencyCents(amount, fromCurrency, toCurrency, rates = CURRENCY_TO_CNY) {
  const from = rates[fromCurrency];
  const to = rates[toCurrency];
  if (!Number.isFinite(amount) || !from || !to) throw new Error("不支持的币种或汇率");
  const rate = from / to;
  return {
    convertedAmount: Math.round(amount * rate),
    exchangeRateMicros: Math.round(rate * 1_000_000),
  };
}
