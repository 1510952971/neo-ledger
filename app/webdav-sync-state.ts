"use client";

import { useReducer, useRef } from "react";

export type WebDavSyncMode = "smart" | "upload" | "download";

export type WebDavSyncState = {
  status: string;
  syncing: boolean;
  mode: WebDavSyncMode | null;
};

type WebDavSyncAction =
  | { type: "select"; mode: WebDavSyncMode }
  | { type: "begin"; mode: WebDavSyncMode }
  | { type: "status"; value: string }
  | { type: "finish" };

export const initialWebDavSyncState: WebDavSyncState = {
  status: "尚未同步",
  syncing: false,
  mode: null,
};

export function webDavSyncReducer(
  state: WebDavSyncState,
  action: WebDavSyncAction,
): WebDavSyncState {
  if (action.type === "select") return { ...state, mode: action.mode };
  if (action.type === "begin")
    return { ...state, mode: action.mode, syncing: true };
  if (action.type === "status") return { ...state, status: action.value };
  return { ...state, syncing: false };
}

export function useWebDavSyncState() {
  const [state, dispatch] = useReducer(
    webDavSyncReducer,
    initialWebDavSyncState,
  );
  const lockRef = useRef(false);

  return {
    ...state,
    select: (mode: WebDavSyncMode) => dispatch({ type: "select", mode }),
    setStatus: (value: string) => dispatch({ type: "status", value }),
    begin: (mode: WebDavSyncMode) => {
      if (lockRef.current) return false;
      lockRef.current = true;
      dispatch({ type: "begin", mode });
      return true;
    },
    finish: () => {
      lockRef.current = false;
      dispatch({ type: "finish" });
    },
  };
}
