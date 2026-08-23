export const MAX_AI_MESSAGE_CHARS = 1000;
export const MAX_AI_ANSWER_CHARS = 20_000;

export type AiRequestPayload = { ledgerId: number; message: string };

export function normalizeAiRequestBody(body: unknown): AiRequestPayload | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const value = body as { ledgerId?: unknown; message?: unknown };
  if (
    typeof value.ledgerId !== "number" ||
    !Number.isSafeInteger(value.ledgerId) ||
    value.ledgerId <= 0 ||
    typeof value.message !== "string"
  )
    return null;
  const message = value.message.trim();
  if (!message || message.length > MAX_AI_MESSAGE_CHARS) return null;
  return { ledgerId: value.ledgerId, message };
}

export function normalizeAiModelAnswer(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const message = (body as { message?: unknown }).message;
  if (!message || typeof message !== "object" || Array.isArray(message)) return null;
  const content = (message as { content?: unknown }).content;
  if (typeof content !== "string" || !content.trim()) return null;
  return content.trim().slice(0, MAX_AI_ANSWER_CHARS);
}
