"use client";

import { useEffect, useReducer, useRef, useTransition } from "react";
import { fetchClientJson } from "./client-api.ts";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export const INITIAL_AI_MESSAGE: ChatMessage = {
  role: "assistant",
  content:
    "晚上好，我已经读完你的聚合财务摘要。可以问我：哪笔钱花得最冤，或者按现在速度多久能买 Mac？",
};

export const MAX_CHAT_MESSAGES = 40;

export type AiChatState = {
  messages: ChatMessage[];
  consent: boolean;
  input: string;
};

type AiChatAction =
  | { type: "input"; value: string }
  | { type: "consent"; value: boolean }
  | { type: "user"; content: string }
  | { type: "assistant"; content: string }
  | { type: "reset" };

export const initialAiChatState = (): AiChatState => ({
  messages: [INITIAL_AI_MESSAGE],
  consent: false,
  input: "",
});

const appendMessage = (messages: ChatMessage[], message: ChatMessage) =>
  [...messages, message].slice(-MAX_CHAT_MESSAGES);

export function aiChatReducer(
  state: AiChatState,
  action: AiChatAction,
): AiChatState {
  if (action.type === "input") return { ...state, input: action.value };
  if (action.type === "consent") return { ...state, consent: action.value };
  if (action.type === "user")
    return {
      ...state,
      input: "",
      messages: appendMessage(state.messages, {
        role: "user",
        content: action.content,
      }),
    };
  if (action.type === "assistant")
    return {
      ...state,
      messages: appendMessage(state.messages, {
        role: "assistant",
        content: action.content,
      }),
    };
  return initialAiChatState();
}

type AiChatResponse = { answer?: string; error?: string };

export function useAiChatState({ ledgerId }: { ledgerId: number }) {
  const [state, dispatch] = useReducer(
    aiChatReducer,
    undefined,
    initialAiChatState,
  );
  const [pending, startTransition] = useTransition();
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    dispatch({ type: "reset" });
    return () => {
      requestRef.current?.abort();
      requestRef.current = null;
    };
  }, [ledgerId]);

  function ask() {
    const question = state.input.trim();
    if (!question || pending) return;
    dispatch({ type: "user", content: question });
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    startTransition(async () => {
      let result: AiChatResponse = {};
      try {
        const { response, data: payload } = await fetchClientJson<unknown>("/api/v1/ai/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-neo-ai-consent": state.consent ? "true" : "false",
          },
          body: JSON.stringify({ ledgerId, message: question }),
          signal: controller.signal,
        });
        result = {
          answer:
            typeof payload === "object" &&
            payload !== null &&
            !Array.isArray(payload) &&
            typeof (payload as { answer?: unknown }).answer === "string"
              ? (payload as { answer: string }).answer
              : undefined,
          error:
            typeof payload === "object" &&
            payload !== null &&
            !Array.isArray(payload) &&
            typeof (payload as { error?: unknown }).error === "string"
              ? (payload as { error: string }).error
              : undefined,
        };
        if (!response.ok && !result.error)
          result.error = "财富智囊暂时无法响应，请稍后重试。";
      } catch (error) {
        if (controller.signal.aborted) return;
        result = {
          error:
            error instanceof Error && error.message
              ? "财富智囊连接失败，请检查网络后重试。"
              : "财富智囊暂时掉线了。",
        };
      } finally {
        if (requestRef.current === controller) requestRef.current = null;
      }
      if (controller.signal.aborted) return;
      dispatch({
        type: "assistant",
        content: result.answer ?? result.error ?? "财富智囊暂时掉线了。",
      });
    });
  }

  return {
    messages: state.messages,
    consent: state.consent,
    input: state.input,
    pending,
    setInput: (value: string) => dispatch({ type: "input", value }),
    setConsent: (value: boolean) => dispatch({ type: "consent", value }),
    ask,
  };
}
