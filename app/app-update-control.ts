"use client";

import { useCallback, useReducer } from "react";
import { fetchClientJson } from "./client-api.ts";

export type AppUpdateInfo = {
  currentVersion: string;
  latestVersion: string;
  tag: string | null;
  available: boolean;
  releaseName: string;
  notes: string;
  publishedAt: string | null;
  releaseUrl: string;
  canApply: boolean;
};

export type AppUpdateState = {
  info: AppUpdateInfo | null;
  checking: boolean;
  applying: boolean;
  error: string;
};

type AppUpdateAction =
  | { type: "check-start" }
  | { type: "check-success"; info: AppUpdateInfo }
  | { type: "failure"; error: string }
  | { type: "apply-start" }
  | { type: "applied" };

export const initialAppUpdateState: AppUpdateState = { info: null, checking: false, applying: false, error: "" };

export function appUpdateReducer(state: AppUpdateState, action: AppUpdateAction): AppUpdateState {
  if (action.type === "check-start") return { ...state, checking: true, error: "" };
  if (action.type === "check-success") return { info: action.info, checking: false, applying: false, error: "" };
  if (action.type === "apply-start") return { ...state, checking: false, applying: true, error: "" };
  if (action.type === "applied") return { ...state, checking: false, applying: false, error: "" };
  return { ...state, checking: false, applying: false, error: action.error };
}

export function useAppUpdateControl() {
  const [state, dispatch] = useReducer(appUpdateReducer, initialAppUpdateState);

  const check = useCallback(async () => {
    if (state.checking || state.applying) return null;
    dispatch({ type: "check-start" });
    try {
      const { response, data } = await fetchClientJson<AppUpdateInfo & { error?: string }>("/api/app-update", { cache: "no-store" });
      if (!response.ok) throw new Error(data?.error || "检查更新失败");
      if (!data || typeof data.latestVersion !== "string") throw new Error("更新信息格式无效");
      const info = data;
      dispatch({ type: "check-success", info });
      return info;
    } catch (error) {
      dispatch({ type: "failure", error: error instanceof Error ? error.message : "检查更新失败" });
      return null;
    }
  }, [state.applying, state.checking]);

  const apply = useCallback(async (input: {
    confirm: (info: AppUpdateInfo) => Promise<boolean>;
    onApplied: (version: string) => void;
  }) => {
    const info = state.info;
    if (!info?.available || !info.tag || state.applying) return;
    if (!(await input.confirm(info))) return;
    dispatch({ type: "apply-start" });
    try {
      const { response, data } = await fetchClientJson<{ error?: string }>("/api/app-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag: info.tag }),
      });
      if (!response.ok) throw new Error(data?.error || "启动更新失败");
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        try {
          const { response: health, data: healthData } = await fetchClientJson<{ version?: string }>("/api/app-update/health", { cache: "no-store" });
          if (health.ok && healthData?.version === info.latestVersion) {
            dispatch({ type: "applied" });
            input.onApplied(info.latestVersion);
            return;
          }
        } catch {}
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
      }
      dispatch({ type: "failure", error: "程序重启超时；原版本会自动回滚，请查看终端状态" });
    } catch (error) {
      dispatch({ type: "failure", error: error instanceof Error ? error.message : "启动更新失败" });
    }
  }, [state.applying, state.info]);

  return { ...state, check, apply };
}
