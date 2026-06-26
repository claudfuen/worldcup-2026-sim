"use client";

import { useState, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

// Lightweight, dependency-free hover/focus/tap tooltip. The panel is portalled to <body> and positioned
// with `position: fixed` from the trigger's bounding box, so it escapes the `overflow-x-auto` clipping that
// the bracket tree and the third-place table would otherwise impose. `pointer-events-none` means the panel
// never intercepts clicks — safe to render from inside a <tr> or an <a> (the portal also keeps the DOM
// valid). Read-only content only.
//
// `triggerProps` gives hover + keyboard-focus behaviour (use everywhere). `tapProps` adds tap-to-pin for
// touch devices, where there is no hover — opt in only where a tap won't also navigate (e.g. a table row,
// NOT a bracket slot that already links to its match page).
//
// Usage:
//   const tip = useHoverTip();
//   <tr {...tip.triggerProps} {...tip.tapProps}> … {tip.open && <HoverTipPanel pos={tip.pos}>…</HoverTipPanel>} </tr>

type TipPos = { left: number; top?: number; bottom?: number };

function place(el: Element): TipPos {
  const r = el.getBoundingClientRect();
  const left = Math.max(8, Math.min(r.left, window.innerWidth - 272)); // 256px panel + margin
  const below = r.bottom < window.innerHeight * 0.6; // flip above in the lower viewport so it stays on-screen
  return below ? { left, top: r.bottom + 6 } : { left, bottom: window.innerHeight - r.top + 6 };
}

export function useHoverTip() {
  const [pos, setPos] = useState<TipPos | null>(null);
  const [pinned, setPinned] = useState(false); // opened by tap; stays until an outside tap / scroll dismisses

  const show = (e: { currentTarget: Element }) => { if (!pinned) setPos(place(e.currentTarget)); };
  const hide = () => { if (!pinned) setPos(null); };
  const toggle = (e: { currentTarget: Element }) => {
    const next = !pinned;
    setPinned(next);
    setPos(next ? place(e.currentTarget) : null);
  };

  // While pinned, the next outside pointer or any scroll dismisses it. Deferred so the opening tap itself
  // doesn't immediately close it.
  useEffect(() => {
    if (!pinned) return;
    const close = () => { setPinned(false); setPos(null); };
    const id = setTimeout(() => {
      document.addEventListener("pointerdown", close, { once: true });
      window.addEventListener("scroll", close, { once: true, passive: true });
    }, 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", close);
    };
  }, [pinned]);

  return {
    pos,
    open: pos != null,
    triggerProps: { onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide },
    tapProps: { onClick: toggle },
  };
}

export function HoverTipPanel({ pos, children }: { pos: TipPos | null; children: ReactNode }) {
  if (!pos || typeof document === "undefined") return null;
  return createPortal(
    <div
      role="tooltip"
      style={{ position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom, zIndex: 60 }}
      className="border-border-strong bg-surface-raised/95 pointer-events-none w-64 rounded-xl border p-3 text-xs shadow-xl backdrop-blur supports-[backdrop-filter]:bg-surface-raised/85"
    >
      {children}
    </div>,
    document.body,
  );
}
