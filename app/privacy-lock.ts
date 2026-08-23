"use client";

import { useCallback, useEffect, useReducer } from "react";
import { fetchClientJson } from "./client-api.ts";

export type PrivacyLockState = {
  enabled: boolean;
  locked: boolean;
  pin: string;
  error: string;
  pending: boolean;
};

type PrivacyLockAction =
  | { type: "pin"; value: string }
  | { type: "pending" }
  | { type: "configured"; enabled: boolean }
  | { type: "lock" }
  | { type: "unlocked" }
  | { type: "rejected"; error: string };

export function privacyLockReducer(state: PrivacyLockState, action: PrivacyLockAction): PrivacyLockState {
  if (action.type === "pin")
    return { ...state, pin: action.value.replace(/\D/g, "").slice(0, 4), error: "" };
  if (action.type === "pending") return { ...state, pending: true, error: "" };
  if (action.type === "configured")
    return { enabled: action.enabled, locked: action.enabled, pin: "", error: "", pending: false };
  if (action.type === "lock") return state.enabled ? { ...state, locked: true, pin: "", error: "" } : state;
  if (action.type === "unlocked") return { ...state, locked: false, pin: "", error: "", pending: false };
  return { ...state, pin: "", error: action.error, pending: false };
}

export function usePrivacyLock(initiallyEnabled: boolean) {
  const [state, dispatch] = useReducer(privacyLockReducer, {
    enabled: initiallyEnabled,
    locked: initiallyEnabled,
    pin: "",
    error: "",
    pending: false,
  });

  useEffect(() => {
    if (!state.enabled) return;
    let timer = window.setTimeout(() => dispatch({ type: "lock" }), 15 * 60 * 1000);
    const resetIdleTimer = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => dispatch({ type: "lock" }), 15 * 60 * 1000);
    };
    const lockWhenHidden = () => {
      if (document.hidden) dispatch({ type: "lock" });
      else resetIdleTimer();
    };
    const activityEvents = ["pointerdown", "keydown", "touchstart", "scroll"];
    activityEvents.forEach((event) => window.addEventListener(event, resetIdleTimer, { passive: true }));
    document.addEventListener("visibilitychange", lockWhenHidden);
    return () => {
      window.clearTimeout(timer);
      activityEvents.forEach((event) => window.removeEventListener(event, resetIdleTimer));
      document.removeEventListener("visibilitychange", lockWhenHidden);
    };
  }, [state.enabled]);

  const configure = useCallback(async (enabled: boolean, pin: string) => {
    dispatch({ type: "pending" });
    try {
      const { response, data } = await fetchClientJson<{ error?: string }>("/api/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, pin }),
      });
      if (!response.ok) {
        const error = data?.error ?? "设置失败";
        dispatch({ type: "rejected", error });
        return { ok: false as const, error };
      }
      dispatch({ type: "configured", enabled });
      return { ok: true as const };
    } catch {
      const error = "隐私锁设置请求失败";
      dispatch({ type: "rejected", error });
      return { ok: false as const, error };
    }
  }, []);

  const unlock = useCallback(async () => {
    if (state.pin.length !== 4 || state.pending) return false;
    dispatch({ type: "pending" });
    try {
      const { response } = await fetchClientJson<{ error?: string }>("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: state.pin }),
      });
      if (!response.ok) {
        dispatch({ type: "rejected", error: "安全码不正确，请再试一次" });
        return false;
      }
      dispatch({ type: "unlocked" });
      return true;
    } catch {
      dispatch({ type: "rejected", error: "暂时无法验证安全码" });
      return false;
    }
  }, [state.pending, state.pin]);

  return {
    ...state,
    setPin: (value: string) => dispatch({ type: "pin", value }),
    configure,
    unlock,
  };
}
