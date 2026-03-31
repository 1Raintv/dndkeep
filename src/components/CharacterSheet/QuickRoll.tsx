import { useState } from 'react';
import { rollDie } from '../../lib/gameUtils';
import { supabase } from '../../lib/supabase';

interface DiceInQueue { die: number; count: number; }
interface RollResultDie { die: number; value: number; index: number; dropped?: boolean; }
interface RollSet { id: number; dice: RollResultDie[]; total: number; label: string; }

const DICE = [4, 6, 8, 10, 12, 20, 100] as const;
const DIE_COLORS: Record<number, string> = {
  4: '#e879f9', 6: '#60a5fa', 8: '#34d399', 10: '#fb923c',
  12: '#a78bfa', 20: 'var(--color-gold-bright)', 100: '#f87171',
};
function dieColor(d: number) { return DIE_COLORS[d] ?? 'var(--text-gold)'; }
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
  const [adv, setAdv] = useState<'normal'|'advantage'|'disadvantage'>('normal');

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
    setTimeout(async () => {
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

      if (characterId) {
        await logRoll({
          campaignId, characterId, characterName,
          label: label || expression,
          expression,
          results: dice.map(d => d.value),
          total,
        });
      }
    }, 150);
  }

  const totalDice = queue.reduce((s, d) => s + d.count, 0);
  const has20 = queue.some(d => d.die === 20);

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Dice Roller"
        style={{
          position: 'fixed', bottom: 'var(--space-10)', right: 'var(--space-4)',
          zIndex: 90, width: 52, height: 52, borderRadius: '50%',
          background: open
            ? 'linear-gradient(160deg, var(--color-crimson) 0%, var(--color-blood) 100%)'
            : 'linear-gradient(160deg, #8a5e18 0%, var(--color-gold-dim) 50%, #7a5216 100%)',
          border: `2px solid ${open ? 'var(--color-crimson-bright)' : 'var(--color-gold)'}`,
          boxShadow: open ? 'var(--shadow-crimson)' : 'var(--shadow-gold), 0 4px 16px rgba(0,0,0,0.5)',
          cursor: 'pointer', transition: 'all var(--transition-fast)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: open ? 18 : 26, color: 'var(--color-bone)',
        }}
      >
        {open ? '✕' : '🎲'}
        {totalDice > 0 && !open && (
          <div style={{
            position: 'absolute', top: -4, right: -4, width: 18, height: 18,
            borderRadius: '50%', background: 'var(--color-crimson-bright)', color: 'white',
            fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid var(--bg-page)',
          }}>
            {totalDice}
          </div>
        )}
      </button>

      {open && (
        <div className="animate-fade-in" style={{
          position: 'fixed', bottom: 76, right: 'var(--space-4)',
          zIndex: 89, width: 296,
          background: 'linear-gradient(160deg, var(--color-charcoal) 0%, var(--color-obsidian) 100%)',
          border: '1px solid var(--border-gold)', borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-lg), var(--shadow-gold)', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-xs)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-gold)' }}>
              Dice Roller
            </span>
            {queue.length > 0 && (
              <button onClick={clearQueue} style={{ fontFamily: 'var(--font-heading)', fontSize: 9, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                clear all
              </button>
            )}
          </div>

          {/* Die grid */}
          <div style={{ padding: 'var(--space-3)', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-2)' }}>
            {DICE.map(d => {
              const count = queue.find(q => q.die === d)?.count ?? 0;
              return (
                <button key={d}
                  onClick={() => addDie(d)}
                  onContextMenu={e => { e.preventDefault(); removeDie(d); }}
                  title={`Click to add d${d} · right-click to remove`}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 2, padding: 'var(--space-2) var(--space-1)',
                    borderRadius: 'var(--radius-md)', position: 'relative',
                    border: count > 0 ? `2px solid ${dieColor(d)}` : '1px solid var(--border-subtle)',
                    background: count > 0 ? `${dieColor(d)}18` : 'var(--bg-sunken)',
                    cursor: 'pointer', transition: 'all var(--transition-fast)',
                  }}>
                  {count > 0 && (
                    <div style={{
                      position: 'absolute', top: -6, right: -6, width: 16, height: 16,
                      borderRadius: '50%', background: dieColor(d), color: 'var(--bg-page)',
                      fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 9,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: '1.5px solid var(--bg-page)',
                    }}>{count}</div>
                  )}
                  <span style={{ fontSize: 18, lineHeight: 1, color: count > 0 ? dieColor(d) : 'var(--text-muted)' }}>⬡</span>
                  <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 10, color: count > 0 ? dieColor(d) : 'var(--text-muted)' }}>d{d}</span>
                </button>
              );
            })}
          </div>

          {/* Queue + Roll */}
          {queue.length > 0 && (
            <div style={{ padding: '0 var(--space-3) var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {/* Queue chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {queue.map(({ die, count }) => (
                  <span key={die} style={{
                    fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 11,
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
                    const c = mode === 'advantage' ? 'var(--hp-full)' : mode === 'disadvantage' ? 'var(--color-crimson-bright)' : 'var(--text-gold)';
                    return (
                      <button key={mode} onClick={() => setAdv(mode)} style={{
                        flex: 1, fontFamily: 'var(--font-heading)', fontSize: 8, fontWeight: 700,
                        letterSpacing: '0.04em', textTransform: 'uppercase',
                        padding: '3px 2px', borderRadius: 4, cursor: 'pointer',
                        border: active ? `1px solid ${c}` : '1px solid var(--border-subtle)',
                        background: active ? `${c}20` : 'transparent',
                        color: active ? c : 'var(--text-muted)',
                      }}>
                        {mode === 'normal' ? 'Normal' : mode === 'advantage' ? 'Adv' : 'Dis'}
                      </button>
                    );
                  })}
                </div>
              )}

              <button className="btn-gold" onClick={rollAll} disabled={rolling}
                style={{ width: '100%', justifyContent: 'center', fontSize: 'var(--text-sm)', fontWeight: 700 }}>
                {rolling ? 'Rolling…' : `🎲 Roll ${buildExpr(queue)}`}
              </button>
            </div>
          )}

          {/* Result */}
          {lastRoll && (
            <div key={lastRoll.id} className="animate-fade-in" style={{
              borderTop: '1px solid var(--border-subtle)',
              padding: 'var(--space-3) var(--space-4)',
            }}>
              {lastRoll.label && (
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>
                  {lastRoll.label}
                </div>
              )}

              {/* Individual dice results */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 'var(--space-2)' }}>
                {lastRoll.dice.map((d, i) => {
                  const nat = isNat(d.die, d.value);
                  const dropped = d.dropped;
                  const color = dropped ? 'var(--text-muted)' : nat === 'crit' || nat === 'max' ? 'var(--color-gold-bright)' : nat === 'fumble' ? 'var(--color-crimson-bright)' : dieColor(d.die);
                  return (
                    <div key={i} style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      padding: '4px 8px', borderRadius: 6, position: 'relative',
                      border: `1px solid ${dropped ? 'var(--border-subtle)' : color}50`,
                      background: dropped ? 'transparent' : `${color}10`,
                      opacity: dropped ? 0.4 : 1,
                    }}>
                      {dropped && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ width: '85%', height: 1.5, background: 'var(--text-muted)', transform: 'rotate(-15deg)', borderRadius: 1 }} />
                      </div>}
                      <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 'var(--text-xl)', lineHeight: 1, color }}>{d.value}</span>
                      <span style={{ fontFamily: 'var(--font-heading)', fontSize: 8, color: 'var(--text-muted)' }}>d{d.die}</span>
                      {nat && !dropped && <span style={{ fontSize: 7, color, fontFamily: 'var(--font-heading)', fontWeight: 700 }}>
                        {nat === 'crit' ? '★CRIT' : nat === 'max' ? 'MAX' : '✗MISS'}
                      </span>}
                    </div>
                  );
                })}
              </div>

              {/* Total */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
                <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Total</span>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'var(--text-3xl)', lineHeight: 1, color: 'var(--text-primary)' }}>
                  {lastRoll.total}
                </span>
                {adv !== 'normal' && has20 && (
                  <span style={{ fontFamily: 'var(--font-heading)', fontSize: 9, padding: '1px 5px', borderRadius: 3, color: adv === 'advantage' ? 'var(--hp-full)' : 'var(--color-crimson-bright)', background: adv === 'advantage' ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.12)' }}>
                    {adv === 'advantage' ? 'ADV' : 'DIS'}
                  </span>
                )}
              </div>
            </div>
          )}

          {!queue.length && !lastRoll && (
            <div style={{ padding: 'var(--space-3) var(--space-4) var(--space-4)', textAlign: 'center', fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              Click dice to add them · right-click to remove<br/>
              <span style={{ fontSize: 9, opacity: 0.6 }}>Mix any dice before rolling</span>
            </div>
          )}
        </div>
      )}
    </>
  );
}
