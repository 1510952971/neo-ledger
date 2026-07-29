export function cleanAutomationText(value) {
  return String(value ?? "")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseAutomationText(value) {
  const raw = cleanAutomationText(value);
  const amountHit =
    raw.match(/(?:人民币|CNY|RMB|¥|￥)\s*([0-9,]+(?:\.\d{1,2})?)\s*元?/i) ||
    raw.match(
      /(?:消费|支出|扣款|交易|支付|入账|收入|到账|退款)[^0-9]{0,10}([0-9,]+(?:\.\d{1,2})?)\s*元?/i,
    );
  const amount = amountHit
    ? Math.round(Number(amountHit[1].replaceAll(",", "")) * 100)
    : 0;
  const type =
    /入账|收入|到账|退款|收款/.test(raw) && !/消费|支出|扣款/.test(raw)
      ? "收入"
      : "支出";
  const source = /支付宝/.test(raw)
    ? "支付宝"
    : /微信/.test(raw)
      ? "微信"
      : raw.match(/【([^】]+)】/)?.[1] || "自动记账";
  const merchant =
    raw
      .match(/(?:商户|向|于)([^，。]{2,24})(?:消费|支出|扣款|支付|付款)/)?.[1]
      ?.replace(/账户\d+/g, "")
      .trim() ||
    raw.match(/(?:收款方|付款方)[:：]?\s*([^，。]{2,24})/)?.[1]?.trim() ||
    `${source}${type}`;
  return { raw, amount, type, source, merchant: merchant.slice(0, 40) };
}

export function inferAutomationCategory(merchant) {
  const value = String(merchant ?? "");
  if (/咖啡|拿铁|星巴克|瑞幸|库迪|茶饮|奶茶/.test(value)) return "咖啡";
  if (/地铁|滴滴|公交|打车|出行/.test(value)) return "交通";
  if (/淘宝|京东|拼多多|购物|超市/.test(value)) return "购物";
  if (/电影|游戏|娱乐/.test(value)) return "娱乐";
  return "餐饮";
}
