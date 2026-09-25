const CORRECTION_FIELDS = new Set(["amount", "title", "type", "occurredAt"]);

export function redactScreenshotRecognitionText(input) {
  let value = String(input ?? "").slice(0, 8000);
  value = value.replace(
    /(订单号|交易单号|交易号|流水号|参考号|商户单号)\s*[:：]?\s*[A-Za-z0-9_-]{6,}/giu,
    "$1：[编号已隐藏]",
  );
  value = value.replace(
    /(详细地址|收货地址|联系地址|门店地址|地址)\s*[:：]?[^\r\n]+/gu,
    "$1：[地址已隐藏]",
  );
  value = value.replace(/(?<!\d)\d{17}[0-9Xx](?!\d)/gu, "[证件号已隐藏]");
  value = value.replace(/(?<!\d)(?:\d[ -]?){15,18}\d(?!\d)/gu, "[卡号已隐藏]");
  value = value.replace(/(?<!\d)1[3-9]\d{9}(?!\d)/gu, "[手机号已隐藏]");
  return value.slice(0, 4000);
}

export function normalizeScreenshotRecognition(item) {
  const source = String(item.source ?? "移动端记账").trim().slice(0, 60) || "移动端记账";
  const rawCompleteness = Number(item.recognitionCompleteness);
  const recognitionCompleteness = Number.isFinite(rawCompleteness)
    ? Math.max(0, Math.min(100, Math.round(rawCompleteness)))
    : null;
  const rawText = typeof item.recognitionText === "string" ? item.recognitionText : "";
  const recognitionText = rawText.trim()
    ? redactScreenshotRecognitionText(rawText)
    : null;

  const rawCorrections = item.recognitionCorrections;
  const corrections = {};
  if (rawCorrections && typeof rawCorrections === "object" && !Array.isArray(rawCorrections)) {
    for (const [field, entry] of Object.entries(rawCorrections)) {
      if (!CORRECTION_FIELDS.has(field) || !entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const recognized = entry.recognized;
      const confirmed = entry.confirmed;
      if (!["string", "number"].includes(typeof recognized) || !["string", "number"].includes(typeof confirmed)) continue;
      corrections[field] = {
        recognized: redactScreenshotRecognitionText(String(recognized)).slice(0, 120),
        confirmed: redactScreenshotRecognitionText(String(confirmed)).slice(0, 120),
      };
    }
  }
  const recognitionCorrectionsJson = Object.keys(corrections).length
    ? JSON.stringify(corrections).slice(0, 2000)
    : null;

  return { source, recognitionText, recognitionCompleteness, recognitionCorrectionsJson };
}
