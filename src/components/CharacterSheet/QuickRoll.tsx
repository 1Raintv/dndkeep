import { useState } from 'react';
import { createPortal } from 'react-dom';
import { rollDie } from '../../lib/gameUtils';
import { supabase } from '../../lib/supabase';
import { useDiceRoll } from '../../context/DiceRollContext';

interface DiceInQueue { die: number; count: number; }
interface RollResultDie { die: number; value: number; index: number; dropped?: boolean; }
interface RollSet { id: number; dice: RollResultDie[]; total: number; label: string; }

const DICE = [4, 6, 8, 10, 12, 20, 100] as const;
const DIE_COLORS: Record<number, string> = {
  4: '#e879f9', 6: '#60a5fa', 8: '#34d399', 10: '#fb923c',
  12: '#a78bfa', 20: 'var(--c-gold-l)', 100: '#f87171',
};
function dieColor(d: number) { return DIE_COLORS[d] ?? 'var(--c-gold-l)'; }
function isNat(die: number, v: number) {
  if (die === 20) return v === 20 ? 'crit' : v === 1 ? 'fumble' : null;
  return v === die ? 'max' : null;
}

export async function logRoll(p: {
  campaignId?: string | null; characterId?: string | null;
  characterName?: string; label: string; expression: string;
  results: number[]; total: number;
}) {
  if (!p.characterId) return;
  await supabase.from('action_logs').insert({
    campaign_id: p.campaignId ?? null,
    character_id: p.characterId,
    character_name: p.characterName ?? '',
    action_type: 'roll',
    action_name: p.label || p.expression,
    dice_expression: p.expression,
    individual_results: p.results,
    total: p.total,
  });
}

interface QuickRollProps {
  characterId?: string;
  characterName?: string;
  campaignId?: string | null;
}

export default function QuickRoll({ characterId, characterName, campaignId }: QuickRollProps) {
  const [open, setOpen] = useState(false);
  const [queue, setQueue] = useState<DiceInQueue[]>([]);
  const [label, setLabel] = useState('');
  const [lastRoll, setLastRoll] = useState<RollSet | null>(null);
  const [rolling, setRolling] = useState(false);
  const { triggerRoll } = useDiceRoll();
  const [adv, setAdv] = useState<'normal'|'advantage'|'disadvantage'>('normal');
  const [animValues, setAnimValues] = useState<Record<number, number>>({}); // die index → displayed value during animation

  function addDie(die: number) {
    setQueue(q => {
      const ex = q.find(d => d.die === die);
      return ex ? q.map(d => d.die === die ? { ...d, count: d.count + 1 } : d) : [...q, { die, count: 1 }];
    });
  }
  function removeDie(die: number) {
    setQueue(q => {
      const ex = q.find(d => d.die === die);
      if (!ex) return q;
      return ex.count <= 1 ? q.filter(d => d.die !== die) : q.map(d => d.die === die ? { ...d, count: d.count - 1 } : d);
    });
  }
  function clearQueue() { setQueue([]); setLabel(''); setAdv('normal'); }
  function buildExpr(q: DiceInQueue[]) { return q.map(d => `${d.count}d${d.die}`).join(' + '); }

  async function rollAll() {
    if (!queue.length) return;
    setRolling(true);

    // Animate random values cycling for each die slot
    const dieSlots = queue.flatMap(({ die, count }) => Array.from({ length: count }, () => die));
    let tick = 0;
    const interval = setInterval(() => {
      tick++;
      const fakeVals: Record<number, number> = {};
      dieSlots.forEach((die, i) => { fakeVals[i] = Math.ceil(Math.random() * die); });
      setAnimValues(fakeVals);
    }, 80);

    setTimeout(async () => {
      clearInterval(interval);
      setAnimValues({});
      // For advantage/disadvantage, always roll 2d20
      const effectiveQueue = queue.map(d =>
        d.die === 20 && adv !== 'normal' ? { ...d, count: Math.max(2, d.count) } : d
      );

      const dice: RollResultDie[] = [];
      let idx = 0;
      for (const { die, count } of effectiveQueue) {
        for (let i = 0; i < count; i++) dice.push({ die, value: rollDie(die), index: idx++ });
      }

      // Handle advantage/disadvantage on d20s
      const has20 = queue.some(d => d.die === 20);
      let finalDice = dice;
      let total = 0;

      if (adv !== 'normal' && has20) {
        const origCount = queue.find(d => d.die === 20)?.count ?? 1;
        const d20s = dice.filter(d => d.die === 20);
        const others = dice.filter(d => d.die !== 20);
        const sorted = [...d20s].sort((a, b) => adv === 'advantage' ? b.value - a.value : a.value - b.value);
        const kept = sorted.slice(0, origCount);
        const dropped = sorted.slice(origCount).map(d => ({ ...d, dropped: true }));
        finalDice = [...kept, ...dropped, ...others];
        total = [...kept, ...others].reduce((s, d) => s + d.value, 0);
      } else {
        total = dice.reduce((s, d) => s + d.value, 0);
      }

      const expression = buildExpr(queue);
      const set: RollSet = { id: Date.now(), dice: finalDice, total, label: label || expression };
      setLastRoll(set);
      setRolling(false);

      // Trigger visual dice animation
      const primaryDie = queue[0];
      const keptDice = finalDice.filter(d => !d.dropped);
      const primaryResult = keptDice.find(d => d.die === (primaryDie?.die ?? 20));
      const totalDiceCount = queue.reduce((s, d) => s + d.count, 0);
      triggerRoll({
        result: primaryResult?.value ?? total,
        dieType: primaryDie?.die ?? 20,
        total: totalDiceCount > 1 ? total : undefined,
        label: label || expression,
        advantage: adv === 'advantage',
        disadvantage: adv === 'disadvantage',
        allDice: totalDiceCount > 1 ? keptDice.map(d => ({ die: d.die, value: d.value })) : undefined,
        expression: totalDiceCount > 1 ? expression : undefined,
      });

      if (characterId) {
        await logRoll({
          campaignId, characterId, characterName,
          label: label || expression,
          expression,
          results: dice.map(d => d.value),
          total,
        });
      }
    }, 900);
  }

  const totalDice = queue.reduce((s, d) => s + d.count, 0);
  const has20 = queue.some(d => d.die === 20);

  return createPortal(
    <>
      <style>{`
        @keyframes diceShake {
          0%   { transform: translate(-1px, -1px) rotate(-3deg) scale(1.05); }
          25%  { transform: translate(1px, -2px) rotate(2deg) scale(1.08); }
          50%  { transform: translate(-1px, 1px) rotate(-1deg) scale(1.04); }
          75%  { transform: translate(2px, 1px) rotate(3deg) scale(1.07); }
          100% { transform: translate(0px, 2px) rotate(-2deg) scale(1.05); }
        }
        @keyframes diceLand {
          0%   { transform: scale(1.4) rotate(-8deg); }
          60%  { transform: scale(0.92) rotate(2deg); }
          80%  { transform: scale(1.06) rotate(-1deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
        .dice-land { animation: diceLand 0.35s cubic-bezier(0.34,1.56,0.64,1) both; }
      `}</style>
      <button
        onClick={() => setOpen(o => !o)}
        title="Dice Roller"
        style={{
          position: 'fixed', bottom: 'var(--sp-10)', right: 'var(--sp-4)',
          zIndex: 90, width: 52, height: 52, borderRadius: '50%',
          background: open
            ? 'linear-gradient(160deg, var(--color-crimson) 0%, rgba(107,20,20,1) 100%)'
            : 'linear-gradient(160deg, #8a5e18 0%, var(--c-gold) 50%, #7a5216 100%)',
          border: `2px solid ${open ? 'var(--c-red-l)' : 'var(--c-gold)'}`,
          boxShadow: open ? 'var(--shadow-crimson)' : 'var(--shadow-gold), 0 4px 16px rgba(0,0,0,0.5)',
          cursor: 'pointer', transition: 'all var(--tr-fast)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: open ? 18 : 26, color: 'var(--t-1)',
        }}
      >
        {open ? '✕' : '🎲'}
        {totalDice > 0 && !open && (
          <div style={{
            position: 'absolute', top: -4, right: -4, width: 18, height: 18,
            borderRadius: '50%', background: 'var(--c-red-l)', color: 'white',
            fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid var(--c-bg)',
          }}>
            {totalDice}
          </div>
        )}
      </button>

      {open && (
        <div className="animate-fade-in" style={{
          position: 'fixed', bottom: 76, right: 'var(--sp-4)',
          zIndex: 89, width: 296,
          background: 'linear-gradient(160deg, #1a1f2e 0%, #0d1117 100%)',
          border: '1px solid var(--c-gold-bdr)', borderRadius: 'var(--r-xl)',
          boxShadow: 'var(--shadow-lg), var(--shadow-gold)', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: 'var(--sp-3) var(--sp-4)', borderBottom: '1px solid var(--c-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-xs)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--c-gold-l)' }}>
              Dice Roller
            </span>
            {queue.length > 0 && (
              <button onClick={clearQueue} style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-2)', background: 'none', border: 'none', cursor: 'pointer' }}>
                clear all
              </button>
            )}
          </div>

          {/* Die grid */}
          <div style={{ padding: 'var(--sp-3)', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--sp-2)' }}>
            {DICE.map(d => {
              const count = queue.find(q => q.die === d)?.count ?? 0;
              return (
                <button key={d}
                  onClick={() => addDie(d)}
                  onContextMenu={e => { e.preventDefault(); removeDie(d); }}
                  title={`Click to add d${d} · right-click to remove`}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 2, padding: 'var(--sp-2) var(--sp-1)',
                    borderRadius: 'var(--r-md)', position: 'relative',
                    border: count > 0 ? `2px solid ${dieColor(d)}` : '1px solid var(--c-border)',
                    background: count > 0 ? `${dieColor(d)}18` : '#080d14',
                    cursor: 'pointer', transition: 'all var(--tr-fast)',
                  }}>
                  {count > 0 && (
                    <div style={{
                      position: 'absolute', top: -6, right: -6, width: 16, height: 16,
                      borderRadius: '50%', background: dieColor(d), color: 'var(--c-bg)',
                      fontFamily: 'var(--ff-body)', fontWeight: 900, fontSize: 9,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: '1.5px solid var(--c-bg)',
                    }}>{count}</div>
                  )}
                  <span style={{ fontSize: 18, lineHeight: 1, color: count > 0 ? dieColor(d) : 'var(--t-2)' }}>⬡</span>
                  <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 10, color: count > 0 ? dieColor(d) : 'var(--t-2)' }}>d{d}</span>
                </button>
              );
            })}
          </div>

          {/* Queue + Roll */}
          {queue.length > 0 && (
            <div style={{ padding: '0 var(--sp-3) var(--sp-3)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
              {/* Queue chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {queue.map(({ die, count }) => (
                  <span key={die} style={{
                    fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 11,
                    color: dieColor(die), background: `${dieColor(die)}15`,
                    border: `1px solid ${dieColor(die)}50`,
                    borderRadius: 4, padding: '2px 8px',
                  }}>
                    {count}d{die}
                  </span>
                ))}
              </div>

              {/* Label */}
              <input
                value={label}
                onChange={e => setLabel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && rollAll()}
                placeholder='Label (e.g. "Fireball damage")'
                style={{ fontSize: 11, padding: '4px 8px' }}
              />

              {/* Adv/Dis toggle — only when d20 in queue */}
              {has20 && (
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['normal', 'advantage', 'disadvantage'] as const).map(mode => {
                    const active = adv === mode;
                    const c = mode === 'advantage' ? 'var(--hp-full)' : mode === 'disadvantage' ? 'var(--c-red-l)' : 'var(--c-gold-l)';
                    return (
                      <button key={mode} onClick={() => setAdv(mode)} style={{
                        flex: 1, fontFamily: 'var(--ff-body)', fontSize: 8, fontWeight: 700,
                        letterSpacing: '0.04em', textTransform: 'uppercase',
                        padding: '3px 2px', borderRadius: 4, cursor: 'pointer',
                        border: active ? `1px solid ${c}` : '1px solid var(--c-border)',
                        background: active ? `${c}20` : 'transparent',
                        color: active ? c : 'var(--t-2)',
                      }}>
                        {mode === 'normal' ? 'Normal' : mode === 'advantage' ? 'Adv' : 'Dis'}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Animated dice during roll */}
              {rolling && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', padding: '6px 0' }}>
                  {queue.flatMap(({ die, count }) => Array.from({ length: count }, (_, i) => ({ die, i }))).map(({ die, i }, idx) => (
                    <div key={idx} style={{
                      width: 40, height: 40, borderRadius: 8,
                      border: `2px solid ${dieColor(die)}`,
                      background: `${dieColor(die)}20`,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      animation: 'diceShake 0.08s ease-in-out infinite alternate',
                    }}>
                      <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 900, fontSize: 16, lineHeight: 1, color: dieColor(die) }}>
                        {animValues[idx] ?? die}
                      </span>
                      <span style={{ fontFamily: 'var(--ff-body)', fontSize: 8, color: 'var(--t-2)' }}>d{die}</span>
                    </div>
                  ))}
                </div>
              )}
              <button className="btn-gold" onClick={rollAll} disabled={rolling}
                style={{ width: '100%', justifyContent: 'center', fontSize: 'var(--fs-sm)', fontWeight: 700,
                  opacity: rolling ? 0.5 : 1 }}>
                {rolling ? '🎲 Rolling…' : `🎲 Roll ${buildExpr(queue)}`}
              </button>
            </div>
          )}

          {/* Result */}
          {lastRoll && (
            <div key={lastRoll.id} className="animate-fade-in" style={{
              borderTop: '1px solid var(--c-border)',
              padding: 'var(--sp-3) var(--sp-4)',
            }}>
              {lastRoll.label && (
                <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', marginBottom: 'var(--sp-2)' }}>
                  {lastRoll.label}
                </div>
              )}

              {/* Individual dice results */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 'var(--sp-2)' }}>
                {lastRoll.dice.map((d, i) => {
                  const nat = isNat(d.die, d.value);
                  const dropped = d.dropped;
                  const color = dropped ? 'var(--t-2)' : nat === 'crit' || nat === 'max' ? 'var(--c-gold-l)' : nat === 'fumble' ? 'var(--c-red-l)' : dieColor(d.die);
                  return (
                    <div key={i} className={!dropped ? "dice-land" : ""} style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      padding: '4px 8px', borderRadius: 6, position: 'relative',
                      border: `1px solid ${dropped ? 'var(--c-border)' : color}50`,
                      background: dropped ? 'transparent' : `${color}10`,
                      opacity: dropped ? 0.4 : 1,
                    }}>
                      {dropped && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ width: '85%', height: 1.5, background: 'var(--t-2)', transform: 'rotate(-15deg)', borderRadius: 1 }} />
                      </div>}
                      <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 900, fontSize: 'var(--fs-xl)', lineHeight: 1, color }}>{d.value}</span>
                      <span style={{ fontFamily: 'var(--ff-body)', fontSize: 8, color: 'var(--t-2)' }}>d{d.die}</span>
                      {nat && !dropped && <span style={{ fontSize: 7, color, fontFamily: 'var(--ff-body)', fontWeight: 700 }}>
                        {nat === 'crit' ? '★CRIT' : nat === 'max' ? 'MAX' : '✗MISS'}
                      </span>}
                    </div>
                  );
                })}
              </div>

              {/* Total */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-2)' }}>
                <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Total</span>
                <span style={{ fontFamily: 'var(--ff-brand)', fontWeight: 900, fontSize: 'var(--fs-3xl)', lineHeight: 1, color: 'var(--t-1)' }}>
                  {lastRoll.total}
                </span>
                {adv !== 'normal' && has20 && (
                  <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, padding: '1px 5px', borderRadius: 3, color: adv === 'advantage' ? 'var(--hp-full)' : 'var(--c-red-l)', background: adv === 'advantage' ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.12)' }}>
                    {adv === 'advantage' ? 'ADV' : 'DIS'}
                  </span>
                )}
              </div>
            </div>
          )}

          {!queue.length && !lastRoll && (
            <div style={{ padding: 'var(--sp-3) var(--sp-4) var(--sp-4)', textAlign: 'center', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
              Click dice to add them · right-click to remove<br/>
              <span style={{ fontSize: 9, opacity: 0.6 }}>Mix any dice before rolling</span>
            </div>
          )}
        </div>
      )}
    </>
  , document.body);
}
