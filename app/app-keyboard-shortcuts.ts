"use client";

import { useEffect } from "react";
import type { ModuleTab } from "./mobile-bottom-nav";

type KeyboardShortcutsProps = {
  openEntryDialog: () => void;
  selectModule: (tab: ModuleTab) => void;
};

export function useAppKeyboardShortcuts({
  openEntryDialog,
  selectModule,
}: KeyboardShortcutsProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        openEntryDialog();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "1") {
        e.preventDefault();
        selectModule("dashboard");
      } else if ((e.metaKey || e.ctrlKey) && e.key === "2") {
        e.preventDefault();
        selectModule("assets");
      } else if ((e.metaKey || e.ctrlKey) && e.key === "3") {
        e.preventDefault();
        selectModule("bills");
      } else if ((e.metaKey || e.ctrlKey) && e.key === "4") {
        e.preventDefault();
        selectModule("planning");
      } else if ((e.metaKey || e.ctrlKey) && e.key === "5") {
        e.preventDefault();
        selectModule("analytics");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openEntryDialog, selectModule]);
}
