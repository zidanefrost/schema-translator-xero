"use client";

import { useEffect, useState } from "react";

/** Animates an integer from 0 to `value` with an ease-out curve. */
export default function CountUp({ value, duration = 700 }: { value: number; duration?: number }) {
  const [n, setN] = useState(0);

  useEffect(() => {
    let raf: number;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min((t - t0) / duration, 1);
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{n}</>;
}
