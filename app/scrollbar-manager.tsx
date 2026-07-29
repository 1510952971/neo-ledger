"use client";

import { useEffect } from "react";

const REVEALED_CLASS = "scrollbar-revealed";
const EDGE_SIZE = 14;

function isScrollable(element: HTMLElement, axis: "x" | "y") {
  const style = window.getComputedStyle(element);
  const overflow = axis === "y" ? style.overflowY : style.overflowX;
  if (overflow === "hidden" || overflow === "clip") return false;
  return axis === "y"
    ? element.scrollHeight > element.clientHeight
    : element.scrollWidth > element.clientWidth;
}

export function ScrollbarManager() {
  useEffect(() => {
    let revealed: HTMLElement | null = null;

    function hideScrollbar() {
      revealed?.classList.remove(REVEALED_CLASS);
      revealed = null;
    }

    function revealAtPointer(event: PointerEvent) {
      if (event.pointerType === "touch") {
        hideScrollbar();
        return;
      }

      const scrollingElement = document.scrollingElement as HTMLElement | null;
      const candidates: HTMLElement[] = [];
      let element = document.elementFromPoint(event.clientX, event.clientY);
      while (element instanceof HTMLElement) {
        candidates.push(element);
        element = element.parentElement;
      }
      if (scrollingElement && !candidates.includes(scrollingElement))
        candidates.push(scrollingElement);

      const next = candidates.find((candidate) => {
        const root = candidate === scrollingElement;
        const rect = root
          ? { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
          : candidate.getBoundingClientRect();
        const nearVerticalEdge =
          isScrollable(candidate, "y") &&
          event.clientX >= rect.right - EDGE_SIZE &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom;
        const nearHorizontalEdge =
          isScrollable(candidate, "x") &&
          event.clientY >= rect.bottom - EDGE_SIZE &&
          event.clientY <= rect.bottom &&
          event.clientX >= rect.left &&
          event.clientX <= rect.right;
        return nearVerticalEdge || nearHorizontalEdge;
      });

      if (next === revealed) return;
      hideScrollbar();
      if (next) {
        next.classList.add(REVEALED_CLASS);
        revealed = next;
      }
    }

    document.addEventListener("pointermove", revealAtPointer, {
      capture: true,
      passive: true,
    });
    document.addEventListener("pointerleave", hideScrollbar);
    window.addEventListener("blur", hideScrollbar);
    return () => {
      hideScrollbar();
      document.removeEventListener("pointermove", revealAtPointer, true);
      document.removeEventListener("pointerleave", hideScrollbar);
      window.removeEventListener("blur", hideScrollbar);
    };
  }, []);

  return null;
}
