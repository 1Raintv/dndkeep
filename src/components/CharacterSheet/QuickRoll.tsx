import { useState } from 'react';
import { createPortal } from 'react-dom';
import { rollDie } from '../../lib/gameUtils';
import { supabase } from '../../lib/supabase';
import { useDiceRoll } from '../../context/DiceRollContext';
import { DICE_SKINS } from '../DiceRoller3D';

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
  userId?: string | null;
  characterName?: string; label: string; expression: string;
  results: number[]; total: number; modifier?: number;
}) {
  if (!p.characterId) return;
  // Write to roll_logs (character's personal history) 
  await supabase.from('roll_logs').insert({
    user_id: p.userId ?? p.characterId,
    character_id: p.characterId,
    campaign_id: p.campaignId ?? null,
    character_name: p.characterName ?? '',
    label: p.label || p.expression,
    dice_expression: p.expression,
    individual_results: p.results,
    total: p.total,
    modifier: p.modifier ?? 0,
  });
  // Also write to action_logs if in a campaign (shared roll log)
  if (p.campaignId) {
    await supabase.from('action_logs').insert({
      campaign_id: p.campaignId,
      character_id: p.characterId,
      character_name: p.characterName ?? '',
      action_type: 'roll',
      action_name: p.label || p.expression,
      dice_expression: p.expression,
      individual_results: p.results,
      total: p.total,
    });
  }
}

interface QuickRollProps {
  characterId?: string;
  characterName?: string;
  campaignId?: string | null;
  userId?: string;
}

export default function QuickRoll({ characterId, characterName, campaignId, userId }: QuickRollProps) {
  const [open, setOpen] = useState(false);
  const [queue, setQueue] = useState<DiceInQueue[]>([]);
  const [label, setLabel] = useState('');

  const [rolling, setRolling] = useState(false);
  const [activeSkin, setActiveSkin] = useState(() =>
    typeof window!=='undefined'?localStorage.getItem('dndkeep_dice_skin')||'classic':'classic'
  );
  function chooseSkin(id:string){
    setActiveSkin(id);
    localStorage.setItem('dndkeep_dice_skin',id);
  }
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

      setRolling(false);

      // Trigger visual dice animation — physics determines the result
      const primaryDie = queue[0];
      const keptDice = finalDice.filter(d => !d.dropped);
      const totalDiceCount = queue.reduce((s, d) => s + d.count, 0);
      triggerRoll({
        result: 0, // placeholder — physics will detect actual result
        dieType: primaryDie?.die ?? 20,
        label: label || expression,
        advantage: adv === 'advantage',
        disadvantage: adv === 'disadvantage',
        allDice: totalDiceCount > 1 ? keptDice.map(d => ({ die: d.die, value: d.value })) : undefined,
        expression: totalDiceCount > 1 ? expression : undefined,
        // DB write happens after physics detects the actual top faces
        onResult: characterId ? async (physDice, physTotal) => {
          await logRoll({
            campaignId, characterId, characterName, userId,
            label: label || expression,
            expression,
            results: physDice.map(d => d.value),
            total: physTotal,
          });
        } : undefined,
      });
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
            ? 'linear-gradient(160deg, #7f1d1d 0%, #450a0a 100%)'
            : 'linear-gradient(160deg, #8a5e18 0%, var(--c-gold) 50%, #7a5216 100%)',
          border: `2px solid ${open ? '#f87171' : 'var(--c-gold)'}`,
          boxShadow: open ? '0 4px 20px rgba(239,68,68,0.4), 0 2px 8px rgba(0,0,0,0.6)' : 'var(--shadow-gold), 0 4px 16px rgba(0,0,0,0.5)',
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
          <div style={{ padding: 'var(--sp-3) var(--sp-4)', borderBottom: '1px solid var(--c-border)' }}>
            <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-xs)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--c-gold-l)' }}>
              Dice Roller
            </span>
          </div>

          {/* Die grid — padding-top accommodates the badge overflow so it never affects layout */}
          <div style={{ padding: 'var(--sp-3)', paddingTop: 14, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--sp-2)' }}>
            {DICE.map(d => {
              const count = queue.find(q => q.die === d)?.count ?? 0;
              return (
                <button key={d}
                  onClick={() => addDie(d)}
                  onContextMenu={e => { e.preventDefault(); e.stopPropagation(); removeDie(d); }}
                  title={`Click to add d${d} · right-click to remove`}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 2, padding: 'var(--sp-2) var(--sp-1)',
                    borderRadius: 'var(--r-md)', position: 'relative',
                    border: count > 0 ? `2px solid ${dieColor(d)}` : '2px solid var(--c-border)',
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

          {/* Controls — queue chips (fixed height) + roll button */}
          <div style={{ padding: '0 var(--sp-3) var(--sp-3)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            <div style={{ height: 26, display: 'flex', flexWrap: 'nowrap', gap: 4, alignItems: 'center', overflow: 'hidden' }}>
              {queue.length === 0 ? (
                <span style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-3)', fontStyle: 'italic' }}>
                  Click dice to add them
                </span>
              ) : queue.map(({ die, count }) => (
                <span key={die} style={{
                  fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 11, flexShrink: 0,
                  color: dieColor(die), background: `${dieColor(die)}15`,
                  border: `1px solid ${dieColor(die)}50`,
                  borderRadius: 4, padding: '2px 8px',
                }}>{count}d{die}</span>
              ))}
            </div>
            {/* Skin picker */}
            <div style={{ display:'flex', gap:4, alignItems:'center', marginBottom:2 }}>
              <span style={{ fontFamily:'var(--ff-body)', fontSize:9, color:'var(--t-3)', letterSpacing:'.1em', textTransform:'uppercase', marginRight:2 }}>Skin</span>
              {DICE_SKINS.map(s=>(
                <button key={s.id} onClick={()=>chooseSkin(s.id)}
                  title={s.name+(s.free?'':' (Premium)')}
                  style={{
                    width:20, height:20, borderRadius:4,
                    border:activeSkin===s.id?'2px solid var(--c-gold)':'2px solid var(--c-border)',
                    background:s.id==='classic'?'#8b5cf6':s.id==='obsidian'?'#1a0a0a':s.id==='gold'?'#d97706':s.id==='ice'?'#0ea5e9':'#991b1b',
                    cursor:'pointer', padding:0, position:'relative', flexShrink:0,
                    outline:activeSkin===s.id?'1px solid rgba(255,200,50,0.5)':'none',
                    outlineOffset:1,
                    opacity: s.free?1:1,
                  }}>
                  {!s.free&&<span style={{position:'absolute',top:-4,right:-4,fontSize:7,lineHeight:1}}>💎</span>}
                </button>
              ))}
            </div>
            <button className="btn-gold" onClick={rollAll} disabled={rolling || queue.length === 0}
              style={{ width: '100%', justifyContent: 'center', fontSize: 'var(--fs-sm)', fontWeight: 700,
                opacity: (rolling || queue.length === 0) ? 0.45 : 1 }}>
              {rolling ? '🎲 Rolling…' : '🎲 Roll'}
            </button>
          </div>



        </div>
      )}
    </>
  , document.body);
}
