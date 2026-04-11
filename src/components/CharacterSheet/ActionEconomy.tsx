import { useState } from 'react';

// Per 2024 rules: Action, Bonus Action, Reaction reset each round; Movement tracked separately
interface ActionState {
  action: boolean;
  bonusAction: boolean;
  reaction: boolean;
  movedFeet: number;
}

interface ActionEconomyProps {
  speedFeet: number; // from character stats
}

const TOKEN = {
  action:      { label: 'Action',       key: 'action',      icon: '⚔️',  color: '#f59e0b' },
  bonusAction: { label: 'Bonus',        key: 'bonusAction', icon: '⚡',  color: '#8b5cf6' },
  reaction:    { label: 'Reaction',     key: 'reaction',    icon: '🛡️',  color: '#3b82f6' },
};

export default function ActionEconomy({ speedFeet }: ActionEconomyProps) {
  const [state, setState] = useState<ActionState>({
    action: false, bonusAction: false, reaction: false, movedFeet: 0,
  });

  function toggle(key: keyof Omit<ActionState,'movedFeet'>) {
    setState(s => ({ ...s, [key]: !s[key] }));
  }

  function addMove(feet: number) {
    setState(s => ({ ...s, movedFeet: Math.max(0, Math.min(speedFeet, s.movedFeet + feet)) }));
  }

  function reset() {
    setState({ action: false, bonusAction: false, reaction: false, movedFeet: 0 });
  }

  const movePct = speedFeet > 0 ? (state.movedFeet / speedFeet) * 100 : 0;
  const movingColor = movePct >= 100 ? '#ef4444' : movePct > 50 ? '#f59e0b' : '#22c55e';

  return (
    <div style={{
      background: 'var(--c-surface)',
      border: '1px solid var(--c-border)',
      borderRadius: 'var(--r-lg)',
      padding: 'var(--sp-3)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-2)' }}>
        <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--t-3)' }}>
          Turn Economy
        </span>
        <button
          onClick={reset}
          style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-3)', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '.08em', textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4, transition: 'color .15s' }}
          title="Reset all (new turn)"
        >
          ↺ New Turn
        </button>
      </div>

      {/* Action / Bonus / Reaction tokens */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 'var(--sp-2)' }}>
        {Object.values(TOKEN).map(t => {
          const used = state[t.key as keyof Omit<ActionState,'movedFeet'>];
          return (
            <button
              key={t.key}
              onClick={() => toggle(t.key as keyof Omit<ActionState,'movedFeet'>)}
              title={used ? `${t.label} used — click to undo` : `Mark ${t.label} used`}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                padding: '8px 4px',
                borderRadius: 8,
                border: `2px solid ${used ? t.color+'60' : t.color+'30'}`,
                background: used ? t.color+'22' : 'transparent',
                cursor: 'pointer', transition: 'all .15s',
                opacity: used ? 0.45 : 1,
                position: 'relative',
              }}
            >
              <span style={{ fontSize: 18, lineHeight: 1, filter: used ? 'grayscale(0.7)' : 'none' }}>{t.icon}</span>
              <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 8, color: used ? 'var(--t-3)' : t.color, letterSpacing: '.08em', textTransform: 'uppercase' }}>
                {t.label}
              </span>
              {used && (
                <div style={{
                  position: 'absolute', top: 4, right: 4, width: 8, height: 8,
                  borderRadius: '50%', background: '#ef4444',
                }} />
              )}
            </button>
          );
        })}
      </div>

      {/* Movement bar */}
      {speedFeet > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-3)', letterSpacing: '.08em', textTransform: 'uppercase' }}>
              Movement
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button onClick={() => addMove(-5)} style={{ background: 'none', border: '1px solid var(--c-border)', borderRadius: 3, color: 'var(--t-2)', fontSize: 11, width: 18, height: 18, cursor: 'pointer', lineHeight: 1, display:'flex', alignItems:'center', justifyContent:'center' }}>−</button>
              <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 11, color: movingColor, minWidth: 56, textAlign: 'center' }}>
                {state.movedFeet}/{speedFeet}ft
              </span>
              <button onClick={() => addMove(5)} style={{ background: 'none', border: '1px solid var(--c-border)', borderRadius: 3, color: 'var(--t-2)', fontSize: 11, width: 18, height: 18, cursor: 'pointer', lineHeight: 1, display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
            </div>
          </div>
          <div style={{ height: 4, background: 'var(--c-border)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${movePct}%`, background: movingColor, borderRadius: 2, transition: 'width .2s, background .2s' }} />
          </div>
        </div>
      )}
    </div>
  );
}
