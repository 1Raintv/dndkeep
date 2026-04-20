import { createContext, useContext, useState, useCallback, useRef, lazy, Suspense, type ReactNode } from 'react';
import { logHistoryEvent } from '../lib/characterHistory';

// Lazy-load DiceRoller3D — it pulls in three.js + cannon-es (~600 KB).
// We only mount it when an actual dice roll is triggered, keeping that weight
// out of the initial bundle for users who haven't rolled yet.
const DiceRoller3D = lazy(() => import('../components/DiceRoller3D'));

export interface DiceRollEvent {
  result: number;      // the raw die result (primary die) — used for display hint only
  dieType: number;     // 4, 6, 8, 10, 12, 20, 100
  modifier?: number;   // + or - modifier added
  total?: number;      // final sum including all dice + modifier
  label?: string;      // "Stealth Check", "Attack Roll", etc.
  advantage?: boolean;
  disadvantage?: boolean;
  // Multi-dice support (e.g. 2d4+2, 8d6)
  allDice?: { die: number; value: number }[];
  expression?: string; // e.g. "2d4+2"
  flatBonus?: number;  // the +2 part
  // Physics callback — called with physics-detected result after dice settle
  onResult?: (allDice: {die:number, value:number}[], total:number) => void;
  // v2.82.0: Optional character history logging. When provided, triggerRoll
  // will append a 'roll' event to character_history so the roll appears in
  // the character's audit log. Previously rolls only surfaced in the campaign
  // action log, which left character history incomplete for things like
  // initiative, ability checks, and saves rolled outside combat.
  logHistory?: { characterId: string; userId: string };
}

interface DiceRollContextType {
  triggerRoll: (event: DiceRollEvent) => void;
  current: DiceRollEvent | null;
}

const DiceRollContext = createContext<DiceRollContextType>({
  triggerRoll: () => {},
  current: null,
});

export function useDiceRoll() {
  return useContext(DiceRollContext);
}

export function DiceRollProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<DiceRollEvent | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerRoll = useCallback((event: DiceRollEvent) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setCurrent(event);
    timeoutRef.current = setTimeout(() => setCurrent(null), 4500);

    // v2.82.0: opt-in history logging. Caller passes `logHistory` with the
    // character's ID and owner user ID; we build a short human-readable
    // description from the label + total and append it to character_history.
    // Fire-and-forget (logHistoryEvent never throws) — a failed log must not
    // break the dice roller UX.
    if (event.logHistory) {
      const label = event.label ?? 'Roll';
      const total = event.total ?? event.result;
      const desc = event.expression
        ? `${label}: ${event.expression} = ${total}`
        : event.modifier !== undefined && event.modifier !== 0
          ? `${label}: d${event.dieType}(${event.result}) ${event.modifier >= 0 ? '+' : ''}${event.modifier} = ${total}`
          : `${label}: d${event.dieType} = ${total}`;
      logHistoryEvent({
        characterId: event.logHistory.characterId,
        userId: event.logHistory.userId,
        eventType: 'roll',
        description: desc,
        newValue: total,
      });
    }
  }, []);

  return (
    <DiceRollContext.Provider value={{ triggerRoll, current }}>
      {children}
      {current && (
        <Suspense fallback={null}>
          <DiceRoller3D
            event={current}
            onDismiss={() => setCurrent(null)}
            onResult={current.onResult}
            skinId={typeof window!=='undefined'?localStorage.getItem('dndkeep_dice_skin')||'classic':'classic'}
          />
        </Suspense>
      )}
    </DiceRollContext.Provider>
  );
}

// ── The Visual Overlay ──────────────────────────────────────────────

function DiceRollOverlay({ event, onDismiss }: { event: DiceRollEvent; onDismiss: () => void }) {
  const { result, dieType, modifier, total, label, allDice, expression, flatBonus } = event;
  const isMultiDice = allDice && allDice.length > 1;
  const isNat20 = !isMultiDice && dieType === 20 && result === 20;
  const isNat1  = !isMultiDice && dieType === 20 && result === 1;
  const finalTotal = total ?? (modifier !== undefined ? result + modifier : result);
  const accentColor = isNat20 ? '#f0c040' : isNat1 ? '#e53935' : '#eef2f7';
  const glowColor   = isNat20 ? 'rgba(240,192,64,0.6)' : isNat1 ? 'rgba(229,57,53,0.5)' : 'rgba(255,255,255,0.2)';

  // Color per die type for multi-dice
  function dieColor(sides: number) {
    const map: Record<number,string> = { 4:'#a78bfa', 6:'#f59e0b', 8:'#22c55e', 10:'#60a5fa', 12:'#f472b6', 20:'#f0c040', 100:'#fb923c' };
    return map[sides] ?? '#eef2f7';
  }

  return (
    <div onClick={onDismiss} style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'all', cursor: 'pointer',
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)',
      animation: 'diceOverlayIn 150ms ease both',
    }}>
      <style>{`
        @keyframes diceOverlayIn { from{opacity:0} to{opacity:1} }
        @keyframes diceFlyIn {
          0%{transform:translateX(-100vw) rotate(-360deg) scale(0.3);opacity:0}
          50%{transform:translateX(30px) rotate(20deg) scale(1.1);opacity:1}
          70%{transform:translateX(-15px) rotate(-8deg) scale(0.98)}
          85%{transform:translateX(8px) rotate(3deg) scale(1.02)}
          100%{transform:translateX(0) rotate(0deg) scale(1);opacity:1}
        }
        @keyframes dieFlyInSmall {
          0%{transform:translateY(-60px) rotate(-180deg) scale(0.2);opacity:0}
          60%{transform:translateY(4px) rotate(8deg) scale(1.08);opacity:1}
          80%{transform:translateY(-2px) rotate(-2deg) scale(0.97)}
          100%{transform:translateY(0) rotate(0deg) scale(1);opacity:1}
        }
        @keyframes resultPop {
          0%{transform:scale(0) rotate(-20deg);opacity:0}
          60%{transform:scale(1.3) rotate(5deg);opacity:1}
          80%{transform:scale(0.9) rotate(-2deg)}
          100%{transform:scale(1) rotate(0deg);opacity:1}
        }
        @keyframes nat20Sparkle {
          0%,100%{box-shadow:0 0 30px rgba(240,192,64,0.8),0 0 60px rgba(240,192,64,0.4)}
          50%{box-shadow:0 0 60px rgba(240,192,64,1),0 0 120px rgba(240,192,64,0.6)}
        }
        @keyframes labelSlideUp {
          from{transform:translateY(12px);opacity:0}
          to{transform:translateY(0);opacity:1}
        }
      `}</style>

      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:20, userSelect:'none', padding:'0 20px', maxWidth:500 }}>
        {/* Label */}
        {label && (
          <div style={{ fontFamily:'var(--ff-body)', fontSize:'var(--fs-md)', fontWeight:700,
            color:'var(--t-2)', letterSpacing:'0.15em', textTransform:'uppercase',
            animation:'labelSlideUp 300ms 200ms ease both', textAlign:'center' }}>
            {label}
          </div>
        )}

        {isMultiDice ? (
          /* ── Multi-dice display ── */
          <>
            {/* Expression */}
            <div style={{ fontFamily:'var(--ff-body)', fontSize:13, fontWeight:700, color:'var(--t-3)',
              letterSpacing:'0.1em', animation:'labelSlideUp 200ms ease both' }}>
              {expression || `${allDice.length}d${allDice[0].die}`}{flatBonus ? `+${flatBonus}` : ''}
            </div>
            {/* Individual dice */}
            <div style={{ display:'flex', flexWrap:'wrap', gap:10, justifyContent:'center', maxWidth:400 }}>
              {allDice.map((d, i) => {
                const c = dieColor(d.die);
                const delay = 150 + i * 80;
                return (
                  <div key={i} style={{
                    width:72, height:72, borderRadius: d.die === 20 ? 12 : d.die === 6 ? 10 : '50%',
                    background:'linear-gradient(135deg, #1c2538 0%, #0c1018 100%)',
                    border:`2px solid ${c}`, display:'flex', flexDirection:'column',
                    alignItems:'center', justifyContent:'center', gap:2,
                    boxShadow:`0 4px 20px rgba(0,0,0,0.6), 0 0 12px ${c}40`,
                    animation:`dieFlyInSmall 450ms ${delay}ms cubic-bezier(0.34,1.56,0.64,1) both`,
                  }}>
                    <div style={{ fontFamily:'var(--ff-body)', fontWeight:900, fontSize:26,
                      color:c, lineHeight:1 }}>{d.value}</div>
                    <div style={{ fontFamily:'var(--ff-body)', fontSize:8, fontWeight:700,
                      color:`${c}80`, letterSpacing:'0.1em' }}>d{d.die}</div>
                  </div>
                );
              })}
              {/* Flat bonus chip */}
              {flatBonus !== undefined && flatBonus !== 0 && (
                <div style={{
                  width:72, height:72, borderRadius:10,
                  background:'rgba(255,255,255,0.04)', border:'2px solid rgba(255,255,255,0.2)',
                  display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                  animation:`dieFlyInSmall 450ms ${150 + allDice.length * 80}ms cubic-bezier(0.34,1.56,0.64,1) both`,
                }}>
                  <div style={{ fontFamily:'var(--ff-body)', fontWeight:900, fontSize:22,
                    color:'rgba(255,255,255,0.7)', lineHeight:1 }}>
                    {flatBonus > 0 ? '+' : ''}{flatBonus}
                  </div>
                  <div style={{ fontFamily:'var(--ff-body)', fontSize:8, fontWeight:700,
                    color:'rgba(255,255,255,0.3)', letterSpacing:'0.1em' }}>BONUS</div>
                </div>
              )}
            </div>
            {/* Total */}
            <div style={{ display:'flex', alignItems:'center', gap:12,
              animation:`labelSlideUp 300ms ${300 + allDice.length * 80}ms ease both` }}>
              <span style={{ fontFamily:'var(--ff-body)', fontSize:16, color:'var(--t-3)' }}>TOTAL</span>
              <span style={{ fontFamily:'var(--ff-body)', fontWeight:900, fontSize:64,
                color:'#eef2f7', lineHeight:1, textShadow:'0 0 30px rgba(255,255,255,0.3)' }}>
                {finalTotal}
              </span>
            </div>
          </>
        ) : (
          /* ── Single die display (original) ── */
          <>
            <div style={{
              width:160, height:160,
              background:'linear-gradient(135deg, #1c2538 0%, #0c1018 100%)',
              border:`3px solid ${accentColor}`,
              borderRadius: dieType===20 ? '24px' : dieType===6 ? '18px' : '50%',
              display:'flex', alignItems:'center', justifyContent:'center',
              animation:`diceFlyIn 550ms cubic-bezier(0.34,1.56,0.64,1) both, ${isNat20?'nat20Sparkle 800ms 600ms ease infinite':''}`,
              boxShadow:`0 8px 40px rgba(0,0,0,0.8), 0 0 30px ${glowColor}`,
              position:'relative', flexDirection:'column', gap:4,
            }}>
              <div style={{ position:'absolute', top:10, fontFamily:'var(--ff-body)', fontSize:11,
                fontWeight:700, color:`${accentColor}80`, letterSpacing:'0.1em' }}>d{dieType}</div>
              <div style={{ fontFamily:'var(--ff-body)', fontWeight:900,
                fontSize: result>=100?36:result>=10?56:72,
                color:accentColor, lineHeight:1,
                animation:'resultPop 400ms 400ms cubic-bezier(0.34,1.56,0.64,1) both',
                textShadow:`0 0 20px ${glowColor}` }}>{result}</div>
              {(isNat20||isNat1) && (
                <div style={{ position:'absolute', bottom:10, fontFamily:'var(--ff-body)', fontSize:9,
                  fontWeight:900, color:accentColor, letterSpacing:'0.15em', textTransform:'uppercase',
                  animation:'labelSlideUp 300ms 700ms ease both' }}>
                  {isNat20?'★ NATURAL 20 ★':'✕ NATURAL 1 ✕'}
                </div>
              )}
            </div>
            {modifier!==undefined && modifier!==0 && (
              <div style={{ fontFamily:'var(--ff-body)', fontSize:'var(--fs-lg)', fontWeight:700,
                color:'var(--t-2)', animation:'labelSlideUp 300ms 500ms ease both',
                display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ color:'var(--t-2)', fontSize:'var(--fs-sm)' }}>
                  {result} {modifier>=0?'+':''}{modifier}
                </span>
                <span style={{ color:'var(--t-2)' }}>=</span>
                <span style={{ color:accentColor, fontSize:'var(--fs-2xl)', fontWeight:900 }}>{finalTotal}</span>
              </div>
            )}
          </>
        )}

        <div style={{ fontFamily:'var(--ff-body)', fontSize:'var(--fs-xs)', color:'var(--t-2)',
          animation:'labelSlideUp 300ms 700ms ease both' }}>Click to dismiss</div>
      </div>
    </div>
  );
}
