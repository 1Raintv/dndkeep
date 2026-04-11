import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface RollEntry {
  id: string;
  label: string;
  dice_expression: string;
  individual_results: number[];
  total: number;
  rolled_at: string;
}

interface RollHistoryProps {
  characterId: string;
  userId: string;
  /** If provided, shows a compact inline version */
  compact?: boolean;
}

export default function RollHistory({ characterId, userId, compact = false }: RollHistoryProps) {
  const [rolls, setRolls] = useState<RollEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRolls();

    // Realtime subscription
    const channel = supabase
      .channel(`roll-history-${characterId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'roll_logs',
        filter: `character_id=eq.${characterId}`,
      }, payload => {
        setRolls(prev => [payload.new as RollEntry, ...prev].slice(0, 50));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [characterId]);

  async function loadRolls() {
    const { data } = await supabase
      .from('roll_logs')
      .select('id, label, dice_expression, individual_results, total, rolled_at')
      .eq('character_id', characterId)
      .order('rolled_at', { ascending: false })
      .limit(50);

    if (data) setRolls(data as RollEntry[]);
    setLoading(false);
  }

  async function clearHistory() {
    await supabase.from('roll_logs').delete().eq('character_id', characterId);
    setRolls([]);
  }

  /** Parse "1d4+2d6+1d20" → [4, 6, 6, 20] */
  function parseDiceTypes(expr: string): number[] {
    const types: number[] = [];
    // Split on + but not inside numbers, handle expressions like "1d4+1d10+1d100"
    expr.split('+').forEach(part => {
      const m = part.trim().match(/^(\d+)?d(\d+)$/i);
      if (m) {
        const count = parseInt(m[1] || '1');
        const sides = parseInt(m[2]);
        for (let i = 0; i < count; i++) types.push(sides);
      }
    });
    return types;
  }

  function dieColor(sides: number): string {
    const map: Record<number, string> = {
      4: '#a78bfa', 6: '#f87171', 8: '#4ade80',
      10: '#60a5fa', 12: '#f472b6', 20: '#fbbf24', 100: '#f87171'
    };
    return map[sides] ?? 'var(--t-2)';
  }

  function formatTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function rollColor(entry: RollEntry) {
    // Check for nat 20 or nat 1 on d20 rolls
    if (entry.dice_expression.includes('d20')) {
      if (entry.individual_results.includes(20)) return 'var(--c-gold-l)';
      if (entry.individual_results.includes(1)) return 'var(--c-red-l)';
    }
    return 'var(--t-1)';
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', padding: 'var(--sp-4)' }}>
        <div className="spinner" style={{ width: 14, height: 14 }} />
        <span className="loading-text">Loading roll history…</span>
      </div>
    );
  }

  if (compact) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 200, overflowY: 'auto' }}>
        {rolls.length === 0 ? (
          <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', padding: 'var(--sp-2)', textAlign: 'center' }}>
            No rolls yet — tap any stat to roll!
          </div>
        ) : rolls.map(r => (
          <div key={r.id} style={{ padding: '4px var(--sp-2)', borderBottom: '1px solid var(--c-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', minWidth: 0 }}>
                <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-3)', flexShrink: 0 }}>{formatTime(r.rolled_at)}</span>
                <span style={{ fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 600, color: 'var(--t-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
              </div>
              <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 900, fontSize: 14, color: rollColor(r), flexShrink: 0, marginLeft: 8 }}>{r.total}</span>
            </div>
            {(() => {
              const types = parseDiceTypes(r.dice_expression);
              const results = r.individual_results ?? [];
              if (types.length > 1 && types.length === results.length) {
                return (
                  <div style={{ display: 'flex', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                    {types.map((die, i) => (
                      <span key={i} style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: dieColor(die) }}>
                        d{die}:<b>{results[i]}</b>
                      </span>
                    ))}
                  </div>
                );
              }
              return null;
            })()}
          </div>
        ))}
      </div>
    );
  }

  // Group rolls by date
  const grouped: Record<string, RollEntry[]> = {};
  for (const roll of rolls) {
    const key = formatDate(roll.rolled_at);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(roll);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
          {rolls.length} roll{rolls.length !== 1 ? 's' : ''} logged
        </div>
        {rolls.length > 0 && (
          <button className="btn-ghost btn-sm" onClick={clearHistory} style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-red-l)' }}>
            Clear History
          </button>
        )}
      </div>

      {rolls.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 'var(--sp-8)', color: 'var(--t-2)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)' }}>
          The dice await your command. Roll from any skill, ability, or weapon and every result will be recorded here.
        </div>
      ) : (
        Object.entries(grouped).map(([date, entries]) => (
          <div key={date}>
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t-2)', marginBottom: 'var(--sp-2)' }}>
              {date}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {entries.map(r => (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: 'var(--sp-2) var(--sp-3)',
                  borderRadius: 'var(--r-sm)',
                  background: '#080d14',
                  border: `1px solid ${r.individual_results.includes(20) && r.dice_expression.includes('d20') ? 'rgba(201,146,42,0.3)' : r.individual_results.includes(1) && r.dice_expression.includes('d20') ? 'rgba(127,29,29,0.3)' : 'transparent'}`,
                }}>
                  <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center', minWidth: 0 }}>
                    <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-2)', flexShrink: 0, minWidth: 36 }}>
                      {formatTime(r.rolled_at)}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--t-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.label}
                      </div>
                      {/* Per-die breakdown: d4: 3 · d10: 7 · d100: 40 */}
                      {(() => {
                        const types = parseDiceTypes(r.dice_expression);
                        const results = r.individual_results ?? [];
                        // If we can match types to results, show labeled breakdown
                        if (types.length > 0 && types.length === results.length) {
                          return (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: 2, alignItems: 'center' }}>
                              {types.map((die, i) => (
                                <span key={i} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
                                  <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 900, fontSize: 13, color: dieColor(die), lineHeight: 1 }}>{results[i]}</span>
                                  <span style={{ fontFamily: 'var(--ff-body)', fontSize: 8, color: dieColor(die) + '99', letterSpacing: '.06em', lineHeight: 1 }}>d{die}</span>
                                </span>
                              ))}
                            </div>
                          );
                        }
                        // Fallback: show raw expression + results
                        return (
                          <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-2)' }}>
                            {r.dice_expression}
                            {results.length > 1 && ` [${results.join(', ')}]`}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, marginLeft: 'var(--sp-3)', textAlign: 'right' }}>
                    <span style={{
                      fontFamily: 'var(--ff-body)', fontWeight: 900, fontSize: 'var(--fs-lg)',
                      color: rollColor(r),
                      textShadow: r.individual_results.includes(20) && r.dice_expression.includes('d20') ? '0 0 8px rgba(201,146,42,0.5)' : 'none',
                    }}>
                      {r.total}
                    </span>
                    {r.individual_results.includes(20) && r.dice_expression.includes('d20') && (
                      <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--c-gold-l)' }}>NAT 20</div>
                    )}
                    {r.individual_results.includes(1) && r.dice_expression.includes('d20') && (
                      <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--c-red-l)' }}>FUMBLE</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
