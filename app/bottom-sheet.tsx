"use client";

import React, { useEffect, useRef, useState } from "react";

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  eyebrow?: string;
  children: React.ReactNode;
  maxHeight?: string;
  showHandle?: boolean;
};

export function BottomSheet({
  open,
  onClose,
  title,
  eyebrow,
  children,
  maxHeight = "90dvh",
  showHandle = true,
}: BottomSheetProps) {
  const [startY, setStartY] = useState<number | null>(null);
  const [currentTranslateY, setCurrentTranslateY] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleTouchStart = (e: React.TouchEvent) => {
    setStartY(e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startY === null) return;
    const deltaY = e.touches[0].clientY - startY;
    if (deltaY > 0) {
      // 只能向下滑动
      setCurrentTranslateY(deltaY);
    }
  };

  const handleTouchEnd = () => {
    if (currentTranslateY > 90) {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(10);
      }
      onClose();
    }
    setStartY(null);
    setCurrentTranslateY(0);
  };

  return (
    <div className="bottom-sheet-overlay" onClick={onClose} role="presentation">
      <div
        className="bottom-sheet-panel"
        ref={sheetRef}
        style={{
          maxHeight,
          transform: `translateY(${currentTranslateY}px)`,
          transition: startY !== null ? "none" : "transform 0.28s cubic-bezier(0.2, 0.9, 0.3, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title || "底部面板"}
      >
        {showHandle && (
          <div
            className="bottom-sheet-drag-area"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div className="bottom-sheet-handle" />
          </div>
        )}

        {(title || eyebrow) && (
          <div className="bottom-sheet-header">
            <div>
              {eyebrow && <p className="eyebrow">{eyebrow}</p>}
              {title && <h2>{title}</h2>}
            </div>
            <button
              type="button"
              className="bottom-sheet-close"
              onClick={onClose}
              aria-label="关闭"
            >
              ×
            </button>
          </div>
        )}

        <div className="bottom-sheet-body">{children}</div>
      </div>
    </div>
  );
}
