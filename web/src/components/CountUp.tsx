'use client';

import { useEffect, useRef, useState } from 'react';

/* Counts up to a real value. Shows "—" until the value is known; never invents one. */
export default function CountUp({ value }: { value: number | null }) {
  const [shown, setShown] = useState<number | null>(null);
  const previous = useRef(0);

  useEffect(() => {
    if (value === null) { setShown(null); return; }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(value); previous.current = value; return; }
    const from = previous.current;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 900);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(from + (value - from) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
      else previous.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <>{shown === null ? '—' : shown}</>;
}
