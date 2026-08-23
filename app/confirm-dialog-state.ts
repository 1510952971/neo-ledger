"use client";

import { useReducer, type SetStateAction } from "react";

export type ConfirmDialogOptions = {
  title: string;
  message: string;
  tone: "danger" | "normal";
  confirmText: string;
  input?: { label: string; defaultValue: string; placeholder?: string };
};

export type ConfirmDialogState = {
  ask: (ConfirmDialogOptions & { resolve: (value: string | null) => void }) | null;
  value: string;
};

type ConfirmDialogAction =
  | { type: "open"; ask: ConfirmDialogState["ask"]; value: string }
  | { type: "value"; value: SetStateAction<string> }
  | { type: "close" };

export function initialConfirmDialogState(): ConfirmDialogState {
  return { ask: null, value: "" };
}

export function confirmDialogReducer(
  state: ConfirmDialogState,
  action: ConfirmDialogAction,
): ConfirmDialogState {
  if (action.type === "open") return { ask: action.ask, value: action.value };
  if (action.type === "close") return { ask: null, value: "" };
  const value = typeof action.value === "function" ? action.value(state.value) : action.value;
  return { ...state, value };
}

export function useConfirmDialogState() {
  const [state, dispatch] = useReducer(confirmDialogReducer, undefined, initialConfirmDialogState);
  return {
    ask: state.ask,
    askValue: state.value,
    setAskValue: (value: SetStateAction<string>) => dispatch({ type: "value", value }),
    confirmAsk: (options: ConfirmDialogOptions) =>
      new Promise<string | null>((resolve) =>
        dispatch({ type: "open", ask: { ...options, resolve }, value: options.input?.defaultValue ?? "" }),
      ),
    settleAsk: (value: string | null) => {
      state.ask?.resolve(value);
      dispatch({ type: "close" });
    },
  };
}
