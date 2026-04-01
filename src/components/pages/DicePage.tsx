import { useState, useRef, useEffect } from 'react';
import type { DiceType, RollResult, Character } from '../../types';
import { rollDice } from '../../lib/gameUtils';
import { useAuth } from '../../context/AuthContext';
import { appendRollLog, getRollLog, getCharacters } from '../../lib/supabase';
import { v4 as uuidv4 } from 'uuid';

const DICE: DiceType[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

interface DiceQueue {
  id: string;
  count: number;
  die: DiceType;
  modifier: number;
  label: string;
}

export default function DicePage() {
  const { user } = useAuth();
  const [queue, setQueue] = useState<DiceQueue[]>([]);
  const [log, setLog] = useState<RollResult[]>([]);
  const [lastRoll, setLastRoll] = useState<RollResult | null>(null);
  const [rolling, setRolling] = useState(false);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharId, setSelectedCharId] = useState<string>('');
  const [persistingId, setPersistingId] = useState<string | null>(null);

  // Refs so async callbacks always see the current value — no stale closures
  const userRef = useRef(user);
  const selectedCharIdRef = useRef(selectedCharId);
  const charactersRef = useRef(characters);
  userRef.current = user;
  selectedCharIdRef.current = selectedCharId;
  charactersRef.current = characters;

  // Load characters and recent roll log on mount
  useEffect(() => {
    if (!user) return;
    getCharacters(user.id).then(({ data }) => {
      setCharacters(data);
    });
    getRollLog(user.id, 40).then(({ data }) => {
      if (data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setLog((data as any[]).map((r: any) => ({
          id: r.id,
          label: r.label,
          dice_expression: r.dice_expression,
          individual_results: r.individual_results,
          modifier: 0,
          total: r.total,
          rolled_at: r.rolled_at,
        })));
      }
    });
  }, [user]);

  // selectedChar is read via charactersRef inside buildResult

  async function persistRoll(result: RollResult) {
    const currentUser = userRef.current;
    if (!currentUser) return;
    const currentCharId = selectedCharIdRef.current;
    setPersistingId(result.id);
    try {
      await appendRollLog({
        user_id: currentUser.id,
        character_id: currentCharId || null,
        campaign_id: null,
        label: result.label,
        dice_expression: result.dice_expression,
        individual_results: result.individual_results,
        total: result.total,
      });
    } catch {
      // Non-fatal — roll is in local log regardless
    } finally {
      setPersistingId(null);
    }
  }

  function addDie(die: DiceType) {
    const existing = queue.find(q => q.die === die && q.modifier === 0);
    if (existing) {
      setQueue(prev => prev.map(q => q.id === existing.id ? { ...q, count: q.count + 1 } : q));
    } else {
      setQueue(prev => [...prev, { id: uuidv4(), count: 1, die, modifier: 0, label: '' }]);
    }
  }

  function updateQueue(id: string, field: keyof DiceQueue, value: number | string) {
    setQueue(prev => prev.map(q => q.id === id ? { ...q, [field]: value } : q));
  }

  function removeFromQueue(id: string) {
    setQueue(prev => prev.filter(q => q.id !== id));
  }

  function buildResult(expression: string, allResults: number[], modifier: number, labelOverride?: string): RollResult {
    const char = charactersRef.current.find(c => c.id === selectedCharIdRef.current);
    return {
      id: uuidv4(),
      label: labelOverride ?? (char ? `${char.name}: ${expression}` : expression),
      dice_expression: expression,
      individual_results: allResults,
      modifier,
      total: allResults.reduce((a, b) => a + b, 0) + modifier,
      rolled_at: new Date().toISOString(),
    };
  }

  async function rollAll() {
    if (queue.length === 0) return;
    setRolling(true);
    await new Promise(r => setTimeout(r, 280));

    const allResults: number[] = [];
    let totalMod = 0;
    const parts: string[] = [];

    queue.forEach(q => {
      const sides = parseInt(q.die.slice(1), 10);
      const { results } = rollDice(q.count, sides, 0);
      allResults.push(...results);
      totalMod += q.modifier;
      const modStr = q.modifier !== 0 ? (q.modifier > 0 ? `+${q.modifier}` : String(q.modifier)) : '';
      parts.push(`${q.count}${q.die}${modStr}`);
    });

    const expression = parts.join(' + ');
    const labelText = queue.map(q => q.label).filter(Boolean).join(', ') || expression;
    const result = buildResult(expression, allResults, totalMod, labelText);

    setLastRoll(result);
    setLog(prev => [result, ...prev].slice(0, 100));
    setRolling(false);
    await persistRoll(result);
  }

  async function quickRoll(die: DiceType) {
    const sides = parseInt(die.slice(1), 10);
    const { results } = rollDice(1, sides, 0);
    const result = buildResult(`1${die}`, results, 0);
    setLastRoll(result);
    setLog(prev => [result, ...prev].slice(0, 100));
    await persistRoll(result);
  }

  async function clearLog() {
    setLog([]);
    setLastRoll(null);
  }

  const totalFromQueue = queue.reduce((sum, q) => sum + q.modifier, 0);

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-6)', flexWrap: 'wrap', gap: 'var(--sp-3)' }}>
        <h1>Dice Roller</h1>
        {characters.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
            <label style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', whiteSpace: 'nowrap' }}>
              Rolling as
            </label>
            <select
              value={selectedCharId}
              onChange={e => setSelectedCharId(e.target.value)}
              style={{ width: 'auto' }}
            >
              <option value="">— No character —</option>
              {characters.map(c => (
                <option key={c.id} value={c.id}>{c.name} (Lv {c.level} {c.class_name})</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Quick roll */}
      <div className="card" style={{ marginBottom: 'var(--sp-6)' }}>
        <div className="section-header">Quick Roll</div>
        <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
          {DICE.map(die => (
            <button
              key={die}
              onClick={() => quickRoll(die)}
              style={{
                fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)',
                padding: 'var(--sp-3) var(--sp-4)', borderRadius: 'var(--r-md)',
                border: '1px solid var(--c-gold-bdr)', background: '#080d14',
                color: 'var(--c-gold-l)', cursor: 'pointer', minWidth: 56, textAlign: 'center',
                transition: 'all var(--tr-fast)',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(201,146,42,0.12)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#080d14'; }}
            >
              {die}
            </button>
          ))}
        </div>
      </div>

      {/* Last roll result */}
      {lastRoll && (
        <div
          className="card card-gold animate-fade-in"
          style={{
            textAlign: 'center', marginBottom: 'var(--sp-6)',
            background: 'linear-gradient(135deg, var(--c-surface), var(--c-card))',
            animation: rolling ? 'roll-bounce 400ms ease both' : undefined,
          }}
        >
          <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 'var(--sp-2)' }}>
            {lastRoll.label}
          </div>
          <div style={{ fontFamily: 'var(--ff-brand)', fontSize: '4.5rem', fontWeight: 900, color: 'var(--c-gold-l)', lineHeight: 1, textShadow: '0 0 32px rgba(201,146,42,0.5)' }}>
            {lastRoll.total}
          </div>
          {lastRoll.individual_results.length > 1 && (
            <div style={{ marginTop: 'var(--sp-3)', display: 'flex', gap: 'var(--sp-2)', justifyContent: 'center', flexWrap: 'wrap' }}>
              {lastRoll.individual_results.map((r, i) => (
                <span key={i} style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', color: 'var(--t-2)', background: '#080d14', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', padding: '2px var(--sp-2)' }}>
                  {r}
                </span>
              ))}
              {lastRoll.modifier !== 0 && (
                <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', color: 'var(--c-gold-l)' }}>
                  {lastRoll.modifier > 0 ? `+${lastRoll.modifier}` : lastRoll.modifier}
                </span>
              )}
            </div>
          )}
          {persistingId === lastRoll.id && (
            <div style={{ marginTop: 'var(--sp-2)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', fontFamily: 'var(--ff-body)' }}>
              Saving to log...
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-6)' }}>
        {/* Dice queue */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-4)' }}>
            <div className="section-header" style={{ marginBottom: 0, borderBottom: 'none' }}>Dice Queue</div>
            <button className="btn-ghost btn-sm" onClick={() => setQueue([])}>Clear</button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', marginBottom: 'var(--sp-4)' }}>
            {DICE.map(die => (
              <button key={die} onClick={() => addDie(die)} className="btn-secondary btn-sm">{die}</button>
            ))}
          </div>

          {queue.length === 0 ? (
            <p style={{ color: 'var(--t-2)', fontSize: 'var(--fs-sm)', fontStyle: 'italic', fontFamily: 'var(--ff-body)' }}>
              Click dice above to build your roll
            </p>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginBottom: 'var(--sp-4)' }}>
                {queue.map(q => (
                  <div key={q.id} style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', padding: 'var(--sp-2)', background: '#080d14', borderRadius: 'var(--r-sm)' }}>
                    <button className="btn-secondary btn-sm btn-icon" onClick={() => updateQueue(q.id, 'count', Math.max(1, q.count - 1))}>-</button>
                    <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, color: 'var(--c-gold-l)', minWidth: 44, textAlign: 'center' }}>
                      {q.count}{q.die}
                    </span>
                    <button className="btn-secondary btn-sm btn-icon" onClick={() => updateQueue(q.id, 'count', q.count + 1)}>+</button>
                    <input
                      type="number"
                      value={q.modifier}
                      onChange={e => updateQueue(q.id, 'modifier', Number(e.target.value))}
                      style={{ width: 52 }}
                      title="Modifier"
                    />
                    <input
                      value={q.label}
                      onChange={e => updateQueue(q.id, 'label', e.target.value)}
                      placeholder="label"
                      style={{ flex: 1, fontSize: 'var(--fs-xs)' }}
                    />
                    <button className="btn-ghost btn-sm" onClick={() => removeFromQueue(q.id)} style={{ color: 'var(--t-2)' }}>✕</button>
                  </div>
                ))}
              </div>

              <div style={{ marginBottom: 'var(--sp-3)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
                {queue.map(q => `${q.count}${q.die}${q.modifier !== 0 ? (q.modifier > 0 ? `+${q.modifier}` : q.modifier) : ''}`).join(' + ')}
                {totalFromQueue !== 0 && ` (mod: ${totalFromQueue > 0 ? '+' : ''}${totalFromQueue})`}
              </div>

              <button
                className="btn-primary"
                onClick={rollAll}
                disabled={rolling}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                {rolling ? 'Rolling...' : 'Roll'}
              </button>
            </>
          )}
        </div>

        {/* Roll log */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-4)' }}>
            <div className="section-header" style={{ marginBottom: 0, borderBottom: 'none' }}>Roll Log</div>
            <button className="btn-ghost btn-sm" onClick={clearLog}>Clear</button>
          </div>

          {log.length === 0 ? (
            <p style={{ color: 'var(--t-2)', fontSize: 'var(--fs-sm)', fontStyle: 'italic', fontFamily: 'var(--ff-body)' }}>
              No rolls yet this session
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 420, overflowY: 'auto' }}>
              {log.map((r, i) => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--sp-2) var(--sp-3)', borderRadius: 'var(--r-sm)', background: i === 0 ? 'rgba(201,146,42,0.06)' : 'transparent', border: i === 0 ? '1px solid rgba(201,146,42,0.15)' : '1px solid transparent' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.label}
                    </div>
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)', fontFamily: 'var(--ff-body)' }}>
                      [{r.individual_results.join(', ')}]
                      {r.modifier !== 0 && ` ${r.modifier > 0 ? '+' : ''}${r.modifier}`}
                    </div>
                  </div>
                  <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-lg)', color: 'var(--c-gold-l)', marginLeft: 'var(--sp-3)', flexShrink: 0 }}>
                    {r.total}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
