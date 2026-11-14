'use client';

import { useState } from 'react';

/* Pure-CSS timeline (see neo.css). It hides itself after ~3s even if JS never runs,
   so it can never get stuck. Tap or press any key to skip. */
export default function SplashScreen() {
  const [skipped, setSkipped] = useState(false);
  if (skipped) return null;
  const letters = 'ORCHESTRA'.split('');
  return (
    <div className="splash" role="presentation" onClick={() => setSkipped(true)} onKeyDown={() => setSkipped(true)} aria-hidden="true">
      <div className="splash-blocks">
        <i /><i /><i /><i /><i />
      </div>
      <div className="splash-center">
        <div className="splash-word">
          {letters.map((letter, index) => (
            <span key={index} style={{ animationDelay: `${0.55 + index * 0.07}s` }}>{letter}</span>
          ))}
        </div>
        <div className="splash-tag">BUILD. HIRE. TRADE. RUN AI AGENTS.</div>
        <div className="splash-bar"><b /></div>
        <small className="splash-skip">TAP TO SKIP</small>
      </div>
    </div>
  );
}
