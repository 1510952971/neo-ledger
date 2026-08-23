"use client";

import { useEffect, type RefObject } from "react";

export function useConfirmDialogLifecycle(input: {
  open: boolean;
  dialogRef: RefObject<HTMLDialogElement | null>;
}) {
  const { open, dialogRef } = input;
  useEffect(() => {
    if (!open) return;
    const node = dialogRef.current;
    if (node && !node.open) node.showModal();
  }, [open, dialogRef]);
}
