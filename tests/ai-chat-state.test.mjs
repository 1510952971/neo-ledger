import assert from "node:assert/strict";
import test from "node:test";
import {
  aiChatReducer,
  initialAiChatState,
  MAX_CHAT_MESSAGES,
} from "../app/ai-chat-state.ts";
import {
  MAX_AI_ANSWER_CHARS,
  MAX_AI_MESSAGE_CHARS,
  normalizeAiModelAnswer,
  normalizeAiRequestBody,
} from "../app/ai-chat-core.ts";

test("AI chat starts with privacy-safe consent and a bounded greeting", () => {
  const state = initialAiChatState();
  assert.equal(state.consent, false);
  assert.equal(state.input, "");
  assert.equal(state.messages.length, 1);
  assert.equal(state.messages[0].role, "assistant");
});

test("AI chat appends messages, clears submitted input and caps history", () => {
  let state = initialAiChatState();
  state = aiChatReducer(state, { type: "input", value: "  预算如何？  " });
  state = aiChatReducer(state, { type: "user", content: "预算如何？" });
  assert.equal(state.input, "");
  assert.equal(state.messages.at(-1)?.role, "user");
  for (let index = 0; index < MAX_CHAT_MESSAGES + 4; index += 1)
    state = aiChatReducer(state, { type: "assistant", content: String(index) });
  assert.equal(state.messages.length, MAX_CHAT_MESSAGES);
  assert.equal(state.messages.at(-1)?.content, String(MAX_CHAT_MESSAGES + 3));
});

test("AI chat reset removes previous-ledger context and external consent", () => {
  let state = initialAiChatState();
  state = aiChatReducer(state, { type: "consent", value: true });
  state = aiChatReducer(state, { type: "user", content: "上一账本问题" });
  state = aiChatReducer(state, { type: "reset" });
  assert.equal(state.consent, false);
  assert.equal(state.messages.length, 1);
  assert.equal(state.messages.at(-1)?.content.includes("上一账本"), false);
});

test("AI protocol rejects unsafe request shapes and bounds model output", () => {
  assert.equal(normalizeAiRequestBody({ ledgerId: 0, message: "问题" }), null);
  assert.equal(normalizeAiRequestBody({ ledgerId: 1, message: { text: "问题" } }), null);
  assert.equal(normalizeAiRequestBody({ ledgerId: 1, message: "x".repeat(MAX_AI_MESSAGE_CHARS + 1) }), null);
  assert.equal(normalizeAiModelAnswer(null), null);
  assert.equal(normalizeAiModelAnswer({ message: { content: "  好的  " } }), "好的");
  assert.equal(
    normalizeAiModelAnswer({ message: { content: "x".repeat(MAX_AI_ANSWER_CHARS + 100) } }).length,
    MAX_AI_ANSWER_CHARS,
  );
});
