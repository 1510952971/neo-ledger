const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function partsFromDateKey(dateKey) {
  const match = String(dateKey || "").match(DATE_KEY_PATTERN);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  const maximumDay = new Date(year, month, 0).getDate();
  if (day < 1 || day > maximumDay) return null;
  return { year, month, day };
}

function dateKeyFromParts(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function utcDateKey(date) {
  return dateKeyFromParts(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

export function normalizeBillAnchor(dateKey, fallbackKey) {
  if (partsFromDateKey(dateKey)) return dateKey;
  return partsFromDateKey(fallbackKey) ? fallbackKey : "";
}

export function shiftBillAnchor(dateKey, range, amount) {
  const parts = partsFromDateKey(dateKey);
  if (!parts || !Number.isInteger(amount)) return dateKey;
  if (range === "day" || range === "week") {
    const date = new Date(
      Date.UTC(parts.year, parts.month - 1, parts.day + amount * (range === "week" ? 7 : 1)),
    );
    return utcDateKey(date);
  }
  if (range === "month") {
    const absoluteMonth = parts.year * 12 + parts.month - 1 + amount;
    const year = Math.floor(absoluteMonth / 12);
    const month = ((absoluteMonth % 12) + 12) % 12 + 1;
    const day = Math.min(parts.day, new Date(year, month, 0).getDate());
    return dateKeyFromParts(year, month, day);
  }
  if (range === "year") {
    const year = parts.year + amount;
    const day = Math.min(parts.day, new Date(year, parts.month, 0).getDate());
    return dateKeyFromParts(year, parts.month, day);
  }
  return dateKey;
}

export function setBillAnchorMonth(dateKey, monthKey) {
  const parts = partsFromDateKey(dateKey);
  const match = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
  if (!parts || !match) return dateKey;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return dateKey;
  const day = Math.min(parts.day, new Date(year, month, 0).getDate());
  return dateKeyFromParts(year, month, day);
}

export function setBillAnchorYear(dateKey, nextYear) {
  const parts = partsFromDateKey(dateKey);
  const year = Number(nextYear);
  if (!parts || !Number.isInteger(year) || year < 1 || year > 9999)
    return dateKey;
  const day = Math.min(parts.day, new Date(year, parts.month, 0).getDate());
  return dateKeyFromParts(year, parts.month, day);
}

export function billWeekValue(dateKey) {
  const parts = partsFromDateKey(dateKey);
  if (!parts) return "";
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const weekday = (date.getUTCDay() + 6) % 7;
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - weekday);
  const thursday = new Date(monday);
  thursday.setUTCDate(monday.getUTCDate() + 3);
  const weekYear = thursday.getUTCFullYear();
  const januaryFourth = new Date(Date.UTC(weekYear, 0, 4));
  const januaryWeekday = (januaryFourth.getUTCDay() + 6) % 7;
  januaryFourth.setUTCDate(januaryFourth.getUTCDate() - januaryWeekday);
  const week =
    Math.round((monday.getTime() - januaryFourth.getTime()) / 604_800_000) + 1;
  return `${weekYear}-W${String(week).padStart(2, "0")}`;
}

export function dateKeyFromBillWeek(weekValue, fallbackKey) {
  const match = String(weekValue || "").match(/^(\d{4})-W(\d{2})$/);
  if (!match) return fallbackKey;
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > 53) return fallbackKey;
  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const weekday = (januaryFourth.getUTCDay() + 6) % 7;
  januaryFourth.setUTCDate(
    januaryFourth.getUTCDate() - weekday + (week - 1) * 7,
  );
  const dateKey = utcDateKey(januaryFourth);
  return billWeekValue(dateKey) === weekValue ? dateKey : fallbackKey;
}

export function billPeriodLabel(range, dateKey) {
  const parts = partsFromDateKey(dateKey);
  if (!parts) return "";
  if (range === "day") return `${parts.year} 年 ${parts.month} 月 ${parts.day} 日`;
  if (range === "month") return `${parts.year} 年 ${parts.month} 月`;
  if (range === "year") return `${parts.year} 年`;
  if (range === "week") {
    const start = dateKeyFromBillWeek(billWeekValue(dateKey), dateKey);
    const end = shiftBillAnchor(start, "day", 6);
    return `${start} 至 ${end}`;
  }
  return "";
}
