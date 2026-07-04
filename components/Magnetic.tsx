"use client";

import { useRef, type ReactNode } from "react";

/** Child leans toward the cursor while hovered and springs back on leave. */
export default function Magnetic({
  children,
  strength = 0.25,
  className = "",
}: {
  children: ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      className={`inline-block transition-transform duration-300 ease-out will-change-transform ${className}`}
      onMouseMove={(e) => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) * strength;
        const dy = (e.clientY - (r.top + r.height / 2)) * strength;
        el.style.transform = `translate(${dx}px, ${dy}px)`;
      }}
      onMouseLeave={() => {
        const el = ref.current;
        if (el) el.style.transform = "";
      }}
    >
      {children}
    </div>
  );
}
