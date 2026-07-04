"use client";

import { useEffect } from "react";

/** Tracks the cursor over any .card and feeds its position to the CSS spotlight. */
export default function SpotlightFX() {
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const card = (e.target as HTMLElement | null)?.closest?.(".card") as HTMLElement | null;
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    }
    document.addEventListener("mousemove", onMove, { passive: true });
    return () => document.removeEventListener("mousemove", onMove);
  }, []);

  return null;
}
