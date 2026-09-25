import { redactScreenshotRecognitionText } from "./screenshot-recognition-core.js";

const allowedFields = new Set(["amount", "title", "type", "category", "occurredAt"]);

export function normalizeScreenshotRecognitionAiRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  if (keys.some((key) => !["consent", "text"].includes(key))) return null;
  if (value.consent !== true || typeof value.text !== "string") return null;
  const text = redactScreenshotRecognitionText(value.text).trim();
  if (!text || text.length > 4000) return null;
  return { text };
}

function readModelPayload(value) {
  const content = value?.message?.content ?? value?.response ?? value;
  if (typeof content === "string") {
    const normalized = content.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
    try {
      return JSON.parse(normalized);
    } catch {
      return null;
    }
  }
  return content && typeof content === "object" && !Array.isArray(content)
    ? content
    : null;
}

export function normalizeScreenshotRecognitionAiResponse(value) {
  const candidate = readModelPayload(value);
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const output = {};
  for (const [key, raw] of Object.entries(candidate)) {
    if (!allowedFields.has(key)) continue;
    if (key === "amount") {
      const amount = Number(raw);
      if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) continue;
      output.amount = Math.round(amount * 100) / 100;
    } else if (key === "type") {
      if (raw === "收入" || raw === "支出") output.type = raw;
    } else if (typeof raw === "string") {
      const text = redactScreenshotRecognitionText(raw).replace(/[\r\n\t]+/gu, " ").trim();
      if (key === "occurredAt") {
        if (/^20\d{2}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?(?:Z|[+-]\d{2}:?\d{2})?)?$/u.test(text)) {
          const date = new Date(text);
          const dateOnly = text.slice(0, 10);
          const validCalendarDate = new Date(`${dateOnly}T00:00:00.000Z`).toISOString().slice(0, 10) === dateOnly;
          if (Number.isFinite(date.getTime()) && validCalendarDate) output.occurredAt = date.toISOString();
        }
      } else if (text) {
        output[key] = text.slice(0, key === "title" ? 120 : 80);
      }
    }
  }
  return Object.keys(output).length ? output : null;
}
