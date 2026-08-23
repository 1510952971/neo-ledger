"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadNotificationData,
  markNotificationsRead,
  type PendingFlow,
  type SystemNotice,
} from "./notification-actions.ts";

export type { PendingFlow, SystemNotice } from "./notification-actions.ts";
export { notificationUrls } from "./notification-actions.ts";
export function noticesMarkedRead(rows: SystemNotice[]) {
  return rows.map((item) => ({ ...item, read: true }));
}

function showDesktopNotice(ledgerId: number, title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (window.Notification.permission !== "granted") return;
  try {
    new window.Notification(title, {
      body,
      tag: `neo-ledger-${ledgerId}`,
    });
  } catch {}
}

export function useNotificationCenter({ ledgerId, active }: { ledgerId: number; active: boolean }) {
  const [pendingFlows, setPendingFlows] = useState<PendingFlow[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [notices, setNotices] = useState<SystemNotice[]>([]);
  const requestId = useRef(0);
  const seenLedgerId = useRef<number | null>(null);
  const seenNoticeIds = useRef<Set<number> | null>(null);
  const seenPendingIds = useRef<Set<number> | null>(null);
  const reload = useCallback(async () => {
    const currentRequest = ++requestId.current;
    try {
      const { pending, notice } = await loadNotificationData({ ledgerId });
      if (currentRequest !== requestId.current) return;
      const pendingRows = pending.response.ok && Array.isArray(pending.data) ? pending.data : [];
      const noticeRows = notice.response.ok && Array.isArray(notice.data) ? notice.data : [];
      if (seenLedgerId.current !== ledgerId) {
        seenLedgerId.current = ledgerId;
        seenNoticeIds.current = null;
        seenPendingIds.current = null;
      }
      if (seenNoticeIds.current && seenPendingIds.current) {
        const newNotice = noticeRows.find((item) => !seenNoticeIds.current?.has(item.id) && !item.read);
        const newPending = pendingRows.find((item) => !seenPendingIds.current?.has(item.id));
        if (newNotice) {
          showDesktopNotice(ledgerId, newNotice.title || "Neo Ledger", newNotice.message);
        } else if (newPending) {
          showDesktopNotice(ledgerId, "收到待确认账单", `${newPending.title} ¥${(newPending.amount / 100).toFixed(2)}`);
        }
      }
      seenNoticeIds.current = new Set(noticeRows.map((item) => item.id));
      seenPendingIds.current = new Set(pendingRows.map((item) => item.id));
      if (pending.response.ok && Array.isArray(pending.data)) {
        setPendingFlows(pending.data);
        setPendingTotal(Number(pending.response.headers.get("x-total-count") || pendingRows.length));
      }
      if (notice.response.ok && Array.isArray(notice.data)) setNotices(noticeRows);
    } catch {}
  }, [ledgerId]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void reload());
    const timer = window.setInterval(() => void reload(), active ? 3000 : 5000);
    const refresh = () => void reload();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [active, reload]);
  const requestDesktopNotifications = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return false;
    if (window.Notification.permission === "default") {
      return (await window.Notification.requestPermission()) === "granted";
    }
    return window.Notification.permission === "granted";
  }, []);
  const markRead = useCallback(() => {
    setNotices(noticesMarkedRead);
    void markNotificationsRead({ ledgerId })
      .then(({ response }) => { if (!response.ok) void reload(); })
      .catch(() => void reload());
  }, [ledgerId, reload]);
  return { pendingFlows, pendingTotal, notices, reload, markRead, requestDesktopNotifications };
}
