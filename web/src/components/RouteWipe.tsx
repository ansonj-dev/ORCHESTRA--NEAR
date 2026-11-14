'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

/* Black / yellow / lilac panels sweep across on every route change. Runs in a layout
   effect so it starts before the new page paints. */
export default function RouteWipe() {
  const pathname = usePathname();
  const first = useRef(true);
  const [run, setRun] = useState(0);

  useLayoutEffect(() => {
    if (first.current) { first.current = false; return; }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setRun((value) => value + 1);
  }, [pathname]);

  if (!run) return null;
  return (
    <div className="route-wipe" key={run} aria-hidden="true">
      <i /><i /><i />
    </div>
  );
}
