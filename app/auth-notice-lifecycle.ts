"use client";

import { useEffect, useEffectEvent } from "react";

export function hasAuthNotice(search: string) {
  const query = new URLSearchParams(search);
  return query.has("auth_notice") || query.has("auth_error");
}

export function useAuthNoticeLifecycle(input: { openAuth: () => void }) {
  const openAuth = useEffectEvent(input.openAuth);

  useEffect(() => {
    if (!hasAuthNotice(window.location.search)) return;
    const frame = window.requestAnimationFrame(openAuth);
    return () => window.cancelAnimationFrame(frame);
  }, []);
}
