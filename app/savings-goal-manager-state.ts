"use client";

import { useReducer, type SetStateAction } from "react";

export type SavingsGoalManagerState<Item> = {
  goalList: Item[];
  goalPage: number;
  goalOpen: boolean;
  savingGoal: Item | null;
  goalError: string;
};

type SavingsGoalManagerAction<Item> =
  | {
      type: "field";
      key: keyof SavingsGoalManagerState<Item>;
      value: SetStateAction<SavingsGoalManagerState<Item>[keyof SavingsGoalManagerState<Item>]>;
    }
  | { type: "open"; goal: Item | null }
  | { type: "close" };

export function initialSavingsGoalManagerState<Item>(items: Item[]): SavingsGoalManagerState<Item> {
  return {
    goalList: items,
    goalPage: 1,
    goalOpen: false,
    savingGoal: null,
    goalError: "",
  };
}

export function savingsGoalManagerReducer<Item>(
  state: SavingsGoalManagerState<Item>,
  action: SavingsGoalManagerAction<Item>,
): SavingsGoalManagerState<Item> {
  if (action.type === "open") {
    return { ...state, goalOpen: true, savingGoal: action.goal, goalError: "" };
  }
  if (action.type === "close") {
    return { ...state, goalOpen: false, savingGoal: null, goalError: "" };
  }
  const current = state[action.key];
  const value = typeof action.value === "function"
    ? (action.value as (previous: typeof current) => typeof current)(current)
    : action.value;
  return { ...state, [action.key]: value };
}

export function useSavingsGoalManagerState<Item>(items: Item[]) {
  const [state, dispatch] = useReducer(
    savingsGoalManagerReducer<Item>,
    items,
    initialSavingsGoalManagerState<Item>,
  );
  const setter = <Key extends keyof SavingsGoalManagerState<Item>>(key: Key) =>
    (value: SetStateAction<SavingsGoalManagerState<Item>[Key]>) =>
      dispatch({ type: "field", key, value } as SavingsGoalManagerAction<Item>);
  return {
    ...state,
    setGoalList: setter("goalList"),
    setGoalPage: setter("goalPage"),
    setGoalOpen: setter("goalOpen"),
    setSavingGoal: setter("savingGoal"),
    setGoalError: setter("goalError"),
    openSavingsGoalEditor: (goal: Item | null) => dispatch({ type: "open", goal }),
    closeSavingsGoalEditor: () => dispatch({ type: "close" }),
  };
}
