"use client";

import { useReducer, type SetStateAction } from "react";

type BillDataRevisionState = {
  billDataRevision: number;
  optimisticDeletedTransactionIds: Set<number>;
};

type BillDataRevisionAction =
  | { type: "set-revision"; value: SetStateAction<number> }
  | { type: "set-deleted-ids"; value: SetStateAction<Set<number>> };

function reducer(state: BillDataRevisionState, action: BillDataRevisionAction): BillDataRevisionState {
  if (action.type === "set-revision") {
    const value = typeof action.value === "function" ? action.value(state.billDataRevision) : action.value;
    return { ...state, billDataRevision: value };
  }
  if (action.type === "set-deleted-ids") {
    const value = typeof action.value === "function" ? action.value(state.optimisticDeletedTransactionIds) : action.value;
    return { ...state, optimisticDeletedTransactionIds: value };
  }
  return state;
}

export function useBillDataRevisionState() {
  const [state, dispatch] = useReducer(reducer, {
    billDataRevision: 0,
    optimisticDeletedTransactionIds: new Set<number>(),
  });

  return {
    billDataRevision: state.billDataRevision,
    optimisticDeletedTransactionIds: state.optimisticDeletedTransactionIds,
    setBillDataRevision: (value: SetStateAction<number>) =>
      dispatch({ type: "set-revision", value }),
    setOptimisticDeletedTransactionIds: (value: SetStateAction<Set<number>>) =>
      dispatch({ type: "set-deleted-ids", value }),
  };
}
