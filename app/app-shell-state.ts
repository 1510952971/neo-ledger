"use client";

import { useCallback, useReducer, type SetStateAction } from "react";
import type { ClientAuthUser } from "./auth-panel.tsx";

export type ShellTab = "dashboard" | "assets" | "bills" | "planning" | "analytics";
export type ThemeName = "cream" | "obsidian" | "glacier" | "peach";
export type ShellToast = { kind: "warning" | "success"; message: string };
export type ShellDialogKey =
  | "entryOpen"
  | "budgetOpen"
  | "dataOpen"
  | "authOpen"
  | "noticeOpen"
  | "ledgerMenuOpen"
  | "aestheticOpen"
  | "installmentOpen"
  | "badgeOpen";

export type AppShellState = {
  tab: ShellTab;
  currentAuthUser: ClientAuthUser | null;
  sidebarCollapsed: boolean;
  entryOpen: boolean;
  budgetOpen: boolean;
  dataOpen: boolean;
  authOpen: boolean;
  noticeOpen: boolean;
  ledgerMenuOpen: boolean;
  theme: ThemeName;
  aestheticOpen: boolean;
  installmentOpen: boolean;
  badgeOpen: boolean;
  badgeFocusCode: string | null;
  chartReady: boolean;
  toast: ShellToast | null;
};

type Updater<T> = SetStateAction<T>;
type AppShellAction =
  | { type: "tab"; value: Updater<ShellTab> }
  | { type: "auth-user"; value: Updater<ClientAuthUser | null> }
  | { type: "sidebar"; value: Updater<boolean> }
  | { type: "dialog"; key: ShellDialogKey; value: Updater<boolean> }
  | { type: "theme"; value: Updater<ThemeName> }
  | { type: "badge-focus"; value: Updater<string | null> }
  | { type: "chart-ready"; value: Updater<boolean> }
  | { type: "toast"; value: Updater<ShellToast | null> };

const resolve = <T,>(current: T, value: Updater<T>) =>
  typeof value === "function"
    ? (value as (previous: T) => T)(current)
    : value;

export const initialAppShellState = (
  initialTheme: ThemeName,
  authUser: ClientAuthUser | null,
): AppShellState => ({
  tab: "dashboard",
  currentAuthUser: authUser,
  sidebarCollapsed: false,
  entryOpen: false,
  budgetOpen: false,
  dataOpen: false,
  authOpen: false,
  noticeOpen: false,
  ledgerMenuOpen: false,
  theme: initialTheme,
  aestheticOpen: false,
  installmentOpen: false,
  badgeOpen: false,
  badgeFocusCode: null,
  chartReady: false,
  toast: null,
});

export function appShellReducer(
  state: AppShellState,
  action: AppShellAction,
): AppShellState {
  if (action.type === "tab") return { ...state, tab: resolve(state.tab, action.value) };
  if (action.type === "auth-user")
    return { ...state, currentAuthUser: resolve(state.currentAuthUser, action.value) };
  if (action.type === "sidebar")
    return { ...state, sidebarCollapsed: resolve(state.sidebarCollapsed, action.value) };
  if (action.type === "dialog")
    return { ...state, [action.key]: resolve(state[action.key], action.value) };
  if (action.type === "theme") return { ...state, theme: resolve(state.theme, action.value) };
  if (action.type === "badge-focus")
    return { ...state, badgeFocusCode: resolve(state.badgeFocusCode, action.value) };
  if (action.type === "chart-ready")
    return { ...state, chartReady: resolve(state.chartReady, action.value) };
  return { ...state, toast: resolve(state.toast, action.value) };
}

export function useAppShellState({
  initialTheme,
  authUser,
}: {
  initialTheme: ThemeName;
  authUser: ClientAuthUser | null;
}) {
  const [state, dispatch] = useReducer(
    appShellReducer,
    { initialTheme, authUser },
    ({ initialTheme: theme, authUser: user }) => initialAppShellState(theme, user),
  );
  const setTab = useCallback((value: Updater<ShellTab>) => dispatch({ type: "tab", value }), []);
  const setCurrentAuthUser = useCallback(
    (value: Updater<ClientAuthUser | null>) => dispatch({ type: "auth-user", value }),
    [],
  );
  const setSidebarCollapsed = useCallback(
    (value: Updater<boolean>) => dispatch({ type: "sidebar", value }),
    [],
  );
  const setEntryOpen = useCallback(
    (value: Updater<boolean>) => dispatch({ type: "dialog", key: "entryOpen", value }),
    [],
  );
  const setBudgetOpen = useCallback(
    (value: Updater<boolean>) => dispatch({ type: "dialog", key: "budgetOpen", value }),
    [],
  );
  const setDataOpen = useCallback(
    (value: Updater<boolean>) => dispatch({ type: "dialog", key: "dataOpen", value }),
    [],
  );
  const setAuthOpen = useCallback(
    (value: Updater<boolean>) => dispatch({ type: "dialog", key: "authOpen", value }),
    [],
  );
  const setNoticeOpen = useCallback(
    (value: Updater<boolean>) => dispatch({ type: "dialog", key: "noticeOpen", value }),
    [],
  );
  const setLedgerMenuOpen = useCallback(
    (value: Updater<boolean>) => dispatch({ type: "dialog", key: "ledgerMenuOpen", value }),
    [],
  );
  const setAestheticOpen = useCallback(
    (value: Updater<boolean>) => dispatch({ type: "dialog", key: "aestheticOpen", value }),
    [],
  );
  const setInstallmentOpen = useCallback(
    (value: Updater<boolean>) => dispatch({ type: "dialog", key: "installmentOpen", value }),
    [],
  );
  const setBadgeOpen = useCallback(
    (value: Updater<boolean>) => dispatch({ type: "dialog", key: "badgeOpen", value }),
    [],
  );
  const setTheme = useCallback(
    (value: Updater<ThemeName>) => dispatch({ type: "theme", value }),
    [],
  );
  const setBadgeFocusCode = useCallback(
    (value: Updater<string | null>) => dispatch({ type: "badge-focus", value }),
    [],
  );
  const setChartReady = useCallback(
    (value: Updater<boolean>) => dispatch({ type: "chart-ready", value }),
    [],
  );
  const setToast = useCallback(
    (value: Updater<ShellToast | null>) => dispatch({ type: "toast", value }),
    [],
  );
  return {
    ...state,
    setTab,
    setCurrentAuthUser,
    setSidebarCollapsed,
    setEntryOpen,
    setBudgetOpen,
    setDataOpen,
    setAuthOpen,
    setNoticeOpen,
    setLedgerMenuOpen,
    setAestheticOpen,
    setInstallmentOpen,
    setBadgeOpen,
    setTheme,
    setBadgeFocusCode,
    setChartReady,
    setToast,
  };
}
