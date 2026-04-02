import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';

interface RollEntry {
  id: string;
  label: string;
  dice_expression: string;
  individual_results: number[];
  total: number;
  rolled_at: string;
  reactions?: Record<string, string>; // reaction emoji keyed by local id
}

interface RollLogProps {
  characterId: string;
  userId: string;
}

const REACTIONS = ['👍', '👎', '😮', '😢'];

export default function RollLog({ characterId, userId }: RollLogProps) {
  const [rolls, setRolls] = useState<RollEntry[]>([]);
  const [reactions, setReactions] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadRolls();
    const channel = supabase
      .channel(`roll-log-${characterId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'roll_logs',
        filter: `character_id=eq.${characterId}`,
      }, payload => {
        setRolls(prev => [payload.new as RollEntry, ...prev].slice(0, 60));
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
      .limit(60);
    if (data) setRolls(data as RollEntry[]);
    setLoading(false);
  }

  function toggleReaction(rollId: string, emoji: string) {
    setReactions(prev => {
      const current = prev[rollId];
      return { ...prev, [rollId]: current === emoji ? '' : emoji };
    });
  }

  function rollColor(entry: RollEntry) {
    if (entry.dice_expression?.includes('d20')) {
      if (entry.individual_results?.includes(20)) return '#f0c040';
      if (entry.individual_results?.includes(1)) return 'var(--stat-str)';
    }
    return 'var(--t-1)';
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const isNat20 = (r: RollEntry) => r.dice_expression?.includes('d20') && r.individual_results?.includes(20);
  const isNat1 = (r: RollEntry) => r.dice_expression?.includes('d20') && r.individual_results?.includes(1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="section-header" style={{ marginBottom: 8, flexShrink: 0 }}>
        <span>Roll Log</span>
        <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--t-3)', fontWeight: 400, letterSpacing: 0, textTransform: 'none', marginLeft: 'auto' }}>
          {rolls.length} rolls
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, paddingRight: 2 }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div className="spinner" style={{ width: 14, height: 14 }} />
          </div>
        ) : rolls.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 8px', color: 'var(--t-3)', fontSize: 12 }}>
            No rolls yet.<br />Click ability scores or skills to roll.
          </div>
        ) : rolls.map(roll => {
          const nat20 = isNat20(roll);
          const nat1 = isNat1(roll);
          const reaction = reactions[roll.id] ?? '';
          const col = rollColor(roll);

          return (
            <div key={roll.id} style={{
              borderRadius: 'var(--r-md)', padding: '7px 10px',
              background: nat20 ? 'rgba(240,192,64,0.06)' : nat1 ? 'rgba(248,113,113,0.06)' : 'var(--c-card)',
              border: `1px solid ${nat20 ? 'rgba(240,192,64,0.2)' : nat1 ? 'rgba(248,113,113,0.2)' : 'var(--c-border)'}`,
              transition: 'all var(--tr-fast)',
            }}>
              {/* Top row: label + total */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, justifyContent: 'space-between' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--t-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {roll.label || roll.dice_expression}
                  </div>
                  <div style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--t-3)', marginTop: 1 }}>
                    {roll.dice_expression}
                    {roll.individual_results?.length > 1 && ` [${roll.individual_results.join(', ')}]`}
                    <span style={{ marginLeft: 6 }}>{formatTime(roll.rolled_at)}</span>
                  </div>
                  {(nat20 || nat1) && (
                    <div style={{ fontSize: 9, fontWeight: 800, color: col, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 2 }}>
                      {nat20 ? 'Natural 20' : 'Natural 1'}
                    </div>
                  )}
                </div>

                {/* Total */}
                <div style={{ fontFamily: 'var(--ff-stat)', fontWeight: 700, fontSize: 22, color: col, lineHeight: 1, flexShrink: 0, textShadow: nat20 ? '0 0 12px rgba(240,192,64,0.6)' : 'none' }}>
                  {roll.total}
                </div>
              </div>

              {/* Reaction row */}
              <div style={{ display: 'flex', gap: 3, marginTop: 6 }}>
                {REACTIONS.map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => toggleReaction(roll.id, emoji)}
                    style={{
                      fontSize: 13, padding: '1px 5px', borderRadius: 999, cursor: 'pointer',
                      background: reaction === emoji ? 'var(--c-gold-bg)' : 'transparent',
                      border: `1px solid ${reaction === emoji ? 'var(--c-gold-bdr)' : 'var(--c-border)'}`,
                      minHeight: 0, transition: 'all var(--tr-fast)',
                      transform: reaction === emoji ? 'scale(1.15)' : 'scale(1)',
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
