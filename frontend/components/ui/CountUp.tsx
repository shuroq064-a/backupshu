"use client";

import { useEffect, useState } from "react";

interface CountUpProps {
  to: number;
  ready?: boolean;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
}

export function CountUp({
  to,
  ready = true,
  duration = 1400,
  decimals = 0,
  prefix = "",
  suffix = "",
}: CountUpProps) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!ready) {
      setDisplay(0);
      return;
    }
    const start = performance.now();
    const from = 0;
    const diff = to - from;

    const step = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + diff * eased);
      if (progress < 1) requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
  }, [to, ready, duration]);

  const formatted = display.toFixed(decimals);

  return (
    <span>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
