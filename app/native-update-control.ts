"use client";

import { useCallback, useReducer } from "react";
import { fetchClientJson } from "./client-api.ts";

export type NativeUpdateInfo = {
  latestVersion: string;
  tag: string | null;
  releaseName: string;
  notes: string;
  publishedAt: string | null;
  releaseUrl: string;
  githubAssets: Record<string, string>;
  serviceAssets: Record<string, string>;
};

export type NativeUpdateState = {
  info: NativeUpdateInfo | null;
  checking: boolean;
  error: string;
};

type NativeUpdateAction =
  | { type: "check-start" }
  | { type: "check-success"; info: NativeUpdateInfo }
  | { type: "failure"; error: string };

export const initialNativeUpdateState: NativeUpdateState = {
  info: null,
  checking: false,
  error: "",
};

export function nativeUpdateReducer(
  state: NativeUpdateState,
  action: NativeUpdateAction,
): NativeUpdateState {
  if (action.type === "check-start") return { ...state, checking: true, error: "" };
  if (action.type === "check-success") return { info: action.info, checking: false, error: "" };
  return { ...state, checking: false, error: action.error };
}

export function useNativeUpdateControl() {
  const [state, dispatch] = useReducer(nativeUpdateReducer, initialNativeUpdateState);

  const check = useCallback(async () => {
    if (state.checking) return null;
    dispatch({ type: "check-start" });
    try {
      const { response, data } = await fetchClientJson<NativeUpdateInfo & { error?: string }>(
        `/api/native-update?ts=${Date.now()}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(data?.error || "检查原生客户端更新失败");
      if (!data || typeof data.latestVersion !== "string" || !data.tag) {
        throw new Error("原生客户端更新信息格式无效");
      }
      dispatch({ type: "check-success", info: data });
      return data;
    } catch (error) {
      dispatch({ type: "failure", error: error instanceof Error ? error.message : "检查原生客户端更新失败" });
      return null;
    }
  }, [state.checking]);

  return { ...state, check };
}

