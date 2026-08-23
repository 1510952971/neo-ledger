"use client";

import { useCallback, useEffect, useState } from "react";

export function useOnboardingState(ledgerId: number) {
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    try {
      // The browser preference is external state; synchronize it after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDismissed(window.localStorage.getItem(`neo-ledger:onboarding-dismissed:${ledgerId}`) === "1");
    } catch {
      setDismissed(false);
    }
  }, [ledgerId]);
  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      window.localStorage.setItem(`neo-ledger:onboarding-dismissed:${ledgerId}`, "1");
    } catch {
      // Private browsing may disallow storage; the in-memory dismissal still applies.
    }
  }, [ledgerId]);
  return { dismissed, dismiss };
}
