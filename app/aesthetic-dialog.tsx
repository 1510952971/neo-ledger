"use client";

import type { RefObject } from "react";
import type { ThemeName } from "./app-shell-state";

type AestheticDialogProps = {
  open: boolean;
  dialogRef: RefObject<HTMLDialogElement | null>;
  theme: ThemeName;
  onClose: () => void;
  onChooseTheme: (theme: ThemeName) => void;
};

const themes: Array<{
  id: ThemeName;
  icon: string;
  name: string;
  desc: string;
}> = [
  { id: "cream", icon: "🥛", name: "治愈奶卡", desc: "奶油米白 · 温柔松弛" },
  { id: "obsidian", icon: "⬛", name: "曜石极客", desc: "纯黑 · 荧光绿 · 霓虹紫" },
  { id: "glacier", icon: "🌊", name: "冰川极简", desc: "冷灰 · 冰蓝 · 理性清醒" },
  { id: "peach", icon: "🍑", name: "蜜桃多巴胺", desc: "粉橙 · 元气 · 快乐记账" },
];

export function AestheticDialog({
  open,
  dialogRef,
  theme,
  onClose,
  onChooseTheme,
}: AestheticDialogProps) {
  return (
    open && (
      <dialog
        className="expense-dialog aesthetic-dialog"
        ref={dialogRef}
        onCancel={onClose}
      >
        <div className="expense-form">
          <button type="button" className="close-button" onClick={onClose}>
            ×
          </button>
          <p className="eyebrow">THEME CENTER</p>
          <h2>🎨 换肤中心</h2>
          <p className="form-subtitle">选择你的财务人格，整站与图表同步换肤。</p>
          <div className="theme-grid">
            {themes.map((item) => (
              <button
                className={theme === item.id ? "selected" : ""}
                onClick={() => onChooseTheme(item.id)}
                key={item.id}
                type="button"
                aria-pressed={theme === item.id}
              >
                <span>{item.icon}</span>
                <strong>{item.name}</strong>
                <small>{item.desc}</small>
              </button>
            ))}
          </div>
        </div>
      </dialog>
    )
  );
}

