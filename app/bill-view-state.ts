"use client";

import { useReducer, type SetStateAction } from "react";

export type BillRangeState = "all" | "day" | "week" | "month" | "year" | "custom";
export type BillDimensionState = "日" | "月" | "年";

export type BillViewState = {
  query: string;
  range: BillRangeState;
  anchorDate: string;
  startDate: string;
  endDate: string;
  page: { key: string; page: number };
  dimension: BillDimensionState;
  dateLabels: Record<number, string>;
};

type BillViewAction =
  | { type: "field"; key: keyof BillViewState; value: SetStateAction<BillViewState[keyof BillViewState]> }
  | { type: "reset-filters" };

export function initialBillViewState(): BillViewState {
  return {
    query: "",
    range: "all",
    anchorDate: "",
    startDate: "",
    endDate: "",
    page: { key: "", page: 1 },
    dimension: "月",
    dateLabels: {},
  };
}

export function billViewReducer(state: BillViewState, action: BillViewAction): BillViewState {
  if (action.type === "reset-filters")
    return { ...state, query: "", range: "all", startDate: "", endDate: "", page: { key: "", page: 1 } };
  const current = state[action.key];
  const value = typeof action.value === "function"
    ? (action.value as (previous: typeof current) => typeof current)(current)
    : action.value;
  return { ...state, [action.key]: value };
}

export function useBillViewState() {
  const [state, dispatch] = useReducer(billViewReducer, undefined, initialBillViewState);
  const setter = <Key extends keyof BillViewState>(key: Key) =>
    (value: SetStateAction<BillViewState[Key]>) =>
      dispatch({ type: "field", key, value } as BillViewAction);
  return {
    billQuery: state.query,
    billRange: state.range,
    billAnchorDate: state.anchorDate,
    billStartDate: state.startDate,
    billEndDate: state.endDate,
    billPageState: state.page,
    dimension: state.dimension,
    dateLabels: state.dateLabels,
    setBillQuery: setter("query"),
    setBillRange: setter("range"),
    setBillAnchorDate: setter("anchorDate"),
    setBillStartDate: setter("startDate"),
    setBillEndDate: setter("endDate"),
    setBillPageState: setter("page"),
    setDimension: setter("dimension"),
    setDateLabels: setter("dateLabels"),
    resetBillFilters: () => dispatch({ type: "reset-filters" }),
  };
}
