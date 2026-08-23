"use client";

import { useReducer, type SetStateAction } from "react";

export type TransactionEntryType = "支出" | "收入";
export type TransactionEntrySplitMode =
  | "全额由我支付"
  | "全额由对方支付"
  | "按比例平摊";

export type TransactionEntryState<Preview, Mood extends string, Category extends string> = {
  entryType: TransactionEntryType;
  reflection: string;
  mood: Mood;
  category: Category;
  incomeCategory: Category;
  accountId: number;
  importText: string;
  parsedAmount: string;
  parsedTitle: string;
  parsedPreview: Preview | null;
  receiptUrl: string;
  scanning: boolean;
  splitMode: TransactionEntrySplitMode;
  splitMemberId: number;
  mySharePercent: number;
};

type TransactionEntryAction<Preview, Mood extends string, Category extends string> =
  | {
      type: "field";
      key: keyof TransactionEntryState<Preview, Mood, Category>;
      value: SetStateAction<
        TransactionEntryState<Preview, Mood, Category>[keyof TransactionEntryState<Preview, Mood, Category>]
      >;
    }
  | { type: "reset-import" }
  | { type: "reset-split" };

export function initialTransactionEntryState<Preview, Mood extends string, Category extends string>(input: {
  category: Category;
  incomeCategory: Category;
  accountId: number;
  mood: Mood;
}): TransactionEntryState<Preview, Mood, Category> {
  return {
    entryType: "支出",
    reflection: "",
    mood: input.mood,
    category: input.category,
    incomeCategory: input.incomeCategory,
    accountId: input.accountId,
    importText: "",
    parsedAmount: "",
    parsedTitle: "",
    parsedPreview: null,
    receiptUrl: "",
    scanning: false,
    splitMode: "全额由我支付",
    splitMemberId: 0,
    mySharePercent: 50,
  };
}

export function transactionEntryReducer<Preview, Mood extends string, Category extends string>(
  state: TransactionEntryState<Preview, Mood, Category>,
  action: TransactionEntryAction<Preview, Mood, Category>,
) {
  if (action.type === "reset-import")
    return { ...state, importText: "", parsedAmount: "", parsedTitle: "", parsedPreview: null };
  if (action.type === "reset-split")
    return { ...state, splitMemberId: 0, splitMode: "全额由我支付" as const, mySharePercent: 50 };
  const current = state[action.key];
  const value = typeof action.value === "function"
    ? (action.value as (previous: typeof current) => typeof current)(current)
    : action.value;
  return { ...state, [action.key]: value };
}

export function useTransactionEntryState<Preview, Mood extends string, Category extends string>(input: {
  category: Category;
  incomeCategory: Category;
  accountId: number;
  mood: Mood;
}) {
  const [state, dispatch] = useReducer(
    transactionEntryReducer<Preview, Mood, Category>,
    input,
    initialTransactionEntryState<Preview, Mood, Category>,
  );
  const setter = <Key extends keyof TransactionEntryState<Preview, Mood, Category>>(key: Key) =>
    (value: SetStateAction<TransactionEntryState<Preview, Mood, Category>[Key]>) =>
      dispatch({ type: "field", key, value } as TransactionEntryAction<Preview, Mood, Category>);
  return {
    ...state,
    setEntryType: setter("entryType"),
    setReflection: setter("reflection"),
    setMood: setter("mood"),
    setCategory: setter("category"),
    setIncomeCategory: setter("incomeCategory"),
    setAccountId: setter("accountId"),
    setImportText: setter("importText"),
    setParsedAmount: setter("parsedAmount"),
    setParsedTitle: setter("parsedTitle"),
    setParsedPreview: setter("parsedPreview"),
    setReceiptUrl: setter("receiptUrl"),
    setScanning: setter("scanning"),
    setSplitMode: setter("splitMode"),
    setSplitMemberId: setter("splitMemberId"),
    setMySharePercent: setter("mySharePercent"),
    resetImport: () => dispatch({ type: "reset-import" }),
    resetSplit: () => dispatch({ type: "reset-split" }),
  };
}
