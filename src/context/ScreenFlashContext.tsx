// v2.85.0 — Reusable screen-edge flash primitive for HP-change feedback.
//
// The hook exposes `flashEdge(color)` which renders a fixed, non-blocking
// overlay with a radial gradient (transparent center → tinted edges) for
// ~1.7 seconds. Used for healing (green) and damage (red) events.
//
// Design note: this is the canonical primitive for any future feature that
// changes a player's HP — potions today, damage input tomorrow, healing
// spells after that. Consumers don't need to build their own visual feedback;
// they call flashEdge('heal') or flashEdge('damage') at the moment the
// change should be visible (usually inside a DiceRollEvent.onResult callback
// so the flash fires AFTER dice physics settle, not the moment the user clicks).
//
// Mounted at the root (alongside DiceRollProvider) so it's available app-wide.
// `pointer-events: none` on the overlay means it never blocks clicks.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

type FlashColor = 'heal' | 'damage';

interface ScreenFlashContextType {
  flashEdge: (color: FlashColor) => void;
}

const ScreenFlashContext = createContext<ScreenFlashContextType>({
  flashEdge: () => {},
});

export function useScreenFlash() {
  return useContext(ScreenFlashContext);
}

export function ScreenFlashProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<FlashColor | null>(null);
  // Nonce changes every trigger so rapid successive flashes restart the
  // animation rather than being ignored (useful for e.g. multi-hit damage).
  const [nonce, setNonce] = useState(0);

  const flashEdge = useCallback((color: FlashColor) => {
    setActive(color);
    setNonce(n => n + 1);
  }, []);

  useEffect(() => {
    if (active === null) return;
    // Total animation is ~1700ms (400 fade-in + 500 hold + 800 fade-out).
    // Set a 1800ms timeout to clear state just after animation completes.
    const t = window.setTimeout(() => setActive(null), 1800);
    return () => window.clearTimeout(t);
  }, [nonce, active]);

  return (
    <ScreenFlashContext.Provider value={{ flashEdge }}>
      {children}
      {active && <EdgeFlashOverlay key={nonce} color={active} />}
    </ScreenFlashContext.Provider>
  );
}

function EdgeFlashOverlay({ color }: { color: FlashColor }) {
  // Heal = emerald green (matches our --c-green-l accent used on potions,
  // healing spells, positive HP changes throughout the app).
  // Damage = soft crimson (not too aggressive — we don't want to disorient
  // a user who just took damage; they should see red in their peripheral
  // vision, not be blinded).
  const rgb = color === 'heal' ? '52, 211, 153' : '239, 68, 68';

  return (
    <>
      <style>{`
        @keyframes dndkeep-edge-flash {
          0%   { opacity: 0; }
          23%  { opacity: 1; }    /* 400ms fade in */
          53%  { opacity: 1; }    /* 500ms hold */
          100% { opacity: 0; }    /* 800ms fade out */
        }
      `}</style>
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          // Radial gradient — transparent at center, tinted at edges.
          // The 40% midpoint keeps the tinted edge roughly in the outer
          // third of the viewport regardless of aspect ratio.
          background: `radial-gradient(ellipse at center,
            rgba(${rgb}, 0) 40%,
            rgba(${rgb}, 0.15) 70%,
            rgba(${rgb}, 0.42) 100%)`,
          // Mix with what's underneath so the page isn't just covered in a wash.
          mixBlendMode: 'screen',
          zIndex: 9997, // sit just under the 3D dice overlay (9999) but above page content
          animation: 'dndkeep-edge-flash 1700ms ease both',
        }}
      />
    </>
  );
}
