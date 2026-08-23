"use client";

import { useReducer, type SetStateAction } from "react";

export type TransactionEditState<Draft> = {
  open: boolean;
  draft: Draft | null;
  error: string;
};

type TransactionEditAction<Draft> =
  | { type: "field"; key: keyof TransactionEditState<Draft>; value: SetStateAction<TransactionEditState<Draft>[keyof TransactionEditState<Draft>]> }
  | { type: "open"; draft: Draft }
  | { type: "close" };

export function initialTransactionEditState<Draft>(): TransactionEditState<Draft> {
  return { open: false, draft: null, error: "" };
}

export function transactionEditReducer<Draft>(
  state: TransactionEditState<Draft>,
  action: TransactionEditAction<Draft>,
) {
  if (action.type === "open") return { open: true, draft: action.draft, error: "" };
  if (action.type === "close") return { open: false, draft: null, error: "" };
  const current = state[action.key];
  const value = typeof action.value === "function"
    ? (action.value as (previous: typeof current) => typeof current)(current)
    : action.value;
  return { ...state, [action.key]: value };
}

export function useTransactionEditState<Draft>() {
  const [state, dispatch] = useReducer(
    transactionEditReducer<Draft>,
    undefined,
    initialTransactionEditState<Draft>,
  );
  const setter = <Key extends keyof TransactionEditState<Draft>>(key: Key) =>
    (value: SetStateAction<TransactionEditState<Draft>[Key]>) =>
      dispatch({ type: "field", key, value } as TransactionEditAction<Draft>);
  return {
    ...state,
    setOpen: setter("open"),
    setDraft: setter("draft"),
    setError: setter("error"),
    openEditor: (draft: Draft) => dispatch({ type: "open", draft }),
    closeEditor: () => dispatch({ type: "close" }),
  };
}
