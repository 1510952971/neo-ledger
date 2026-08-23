"use client";

import { useReducer, type SetStateAction } from "react";

export type BillImportState<Item, Summary, Batch> = {
  items: Item[];
  error: string;
  status: string;
  summary: Summary | null;
  batches: Batch[];
  manualAccountKeys: string[];
  accountActionKey: string;
};

type FieldAction<Item, Summary, Batch> = {
  type: "field";
  key: keyof BillImportState<Item, Summary, Batch>;
  value: SetStateAction<BillImportState<Item, Summary, Batch>[keyof BillImportState<Item, Summary, Batch>]>;
};
type BillImportAction<Item, Summary, Batch> = FieldAction<Item, Summary, Batch> | { type: "begin" };

export function initialBillImportState<Item, Summary, Batch>(): BillImportState<Item, Summary, Batch> {
  return { items: [], error: "", status: "", summary: null, batches: [], manualAccountKeys: [], accountActionKey: "" };
}

export function billImportReducer<Item, Summary, Batch>(state: BillImportState<Item, Summary, Batch>, action: BillImportAction<Item, Summary, Batch>) {
  if (action.type === "begin")
    return { ...state, items: [], error: "", status: "正在读取账单文件…", summary: null, manualAccountKeys: [], accountActionKey: "" };
  const current = state[action.key];
  const value = typeof action.value === "function"
    ? (action.value as (previous: typeof current) => typeof current)(current)
    : action.value;
  return { ...state, [action.key]: value };
}

export function useBillImportState<Item, Summary, Batch>() {
  const [state, dispatch] = useReducer(billImportReducer<Item, Summary, Batch>, undefined, initialBillImportState<Item, Summary, Batch>);
  const setter = <Key extends keyof BillImportState<Item, Summary, Batch>>(key: Key) =>
    (value: SetStateAction<BillImportState<Item, Summary, Batch>[Key]>) =>
      dispatch({ type: "field", key, value } as FieldAction<Item, Summary, Batch>);
  return {
    ...state,
    begin: () => dispatch({ type: "begin" }),
    setItems: setter("items"),
    setError: setter("error"),
    setStatus: setter("status"),
    setSummary: setter("summary"),
    setBatches: setter("batches"),
    setManualAccountKeys: setter("manualAccountKeys"),
    setAccountActionKey: setter("accountActionKey"),
  };
}
