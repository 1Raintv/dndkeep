import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface RollEntry {
  id: string;
  label: string;
  dice_expression: string;
  individual_results: number[];
  total: number;
  rolled_at: string;
  character_name: string;
}

interface RollLogProps {
  characterId: string;
  userId: string;
  characterName?: string;
}

export default function RollLog({ characterId, userId, characterName }: RollLogProps) {
  const [rolls, setRolls] = useState<RollEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRolls();
    const channel = supabase
      .channel(`roll-log-${userId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'roll_logs',
        filter: `user_id=eq.${userId}`,
      }, payload => {
        setRolls(prev => [payload.new as RollEntry, ...prev].slice(0, 100));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  async function loadRolls() {
    const { data } = await supabase
      .from('roll_logs')
      .select('id, label, dice_expression, individual_results, total, rolled_at, character_name')
      .eq('user_id', userId)
      .order('rolled_at', { ascending: false })
      .limit(100);
    if (data) setRolls(data as RollEntry[]);
    setLoading(false);
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  }

  function getDisplayLabel(roll: RollEntry) {
    const expr = roll.dice_expression?.toLowerCase().trim();
    const label = roll.label?.toLowerCase().trim();
    return label === expr ? null : roll.label;
  }

  function getTotalColor(roll: RollEntry) {
    if (roll.dice_expression?.includes('d20')) {
      if (roll.individual_results?.includes(20)) return '#f0c040';
      if (roll.individual_results?.includes(1))  return '#f87171';
    }
    return 'var(--c-gold-l)';
  }

  function getNatBadge(roll: RollEntry) {
    if (!roll.dice_expression?.includes('d20')) return null;
    if (roll.individual_results?.includes(20)) return { text: 'NAT 20', color: '#f0c040' };
    if (roll.individual_results?.includes(1))  return { text: 'NAT 1',  color: '#f87171' };
    return null;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 8, flexShrink: 0,
        fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
        letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4ade80',
      }}>
        <span>Roll Log</span>
        <span style={{ color: 'var(--t-3)', fontWeight: 400, letterSpacing: 0, textTransform: 'none' }}>
          {rolls.length} rolls
        </span>
      </div>

      {/* Scrollable list */}
      <div style={{
        flex: 1, overflowY: 'auto', minHeight: 0,
        display: 'flex', flexDirection: 'column', gap: 2,
      }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div className="spinner" style={{ width: 14, height: 14 }} />
          </div>
        ) : rolls.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 8px', color: 'var(--t-3)', fontSize: 12 }}>
            No rolls yet.<br/>Click ability scores or skills to roll.
          </div>
        ) : rolls.map(roll => {
          const displayLabel = getDisplayLabel(roll);
          const natBadge = getNatBadge(roll);
          const totalColor = getTotalColor(roll);

          return (
            <div key={roll.id} style={{
              borderRadius: 6,
              background: natBadge?.text === 'NAT 20' ? 'rgba(240,192,64,0.06)'
                        : natBadge?.text === 'NAT 1'  ? 'rgba(248,113,113,0.06)'
                        : 'rgba(255,255,255,0.03)',
              border: `1px solid ${natBadge ? natBadge.color + '25' : 'rgba(255,255,255,0.06)'}`,
              padding: '5px 8px',
            }}>
              {/* Single row: time · name · label/expr · nat badge | total */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>

                {/* Time */}
                <span style={{ fontSize: 10, color: 'var(--t-3)', flexShrink: 0, fontFamily: 'var(--ff-mono)' }}>
                  {formatTime(roll.rolled_at)}
                </span>

                <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: 9, flexShrink: 0 }}>·</span>

                {/* Name — per-row from DB, fallback to prop */}
                <span style={{
                  fontSize: 10, fontWeight: 700, color: '#4ade80',
                  flexShrink: 0, maxWidth: 80,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {roll.character_name || characterName || 'You'}
                </span>

                <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: 9, flexShrink: 0 }}>·</span>

                {/* Label or expression */}
                <span style={{
                  fontSize: 11, fontWeight: displayLabel ? 600 : 400,
                  color: displayLabel ? 'var(--t-1)' : 'var(--t-3)',
                  fontFamily: displayLabel ? 'var(--ff-body)' : 'var(--ff-mono)',
                  flex: 1, minWidth: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {displayLabel ?? roll.dice_expression}
                </span>

                {/* Show expr if label is different */}
                {displayLabel && (
                  <span style={{
                    fontSize: 9, color: 'var(--t-3)', fontFamily: 'var(--ff-mono)',
                    flexShrink: 0, whiteSpace: 'nowrap',
                  }}>
                    {roll.dice_expression}
                  </span>
                )}

                {/* Nat badge */}
                {natBadge && (
                  <span style={{
                    fontSize: 8, fontWeight: 800, color: natBadge.color,
                    background: natBadge.color + '15',
                    border: `1px solid ${natBadge.color}35`,
                    borderRadius: 3, padding: '1px 4px', flexShrink: 0,
                  }}>
                    {natBadge.text}
                  </span>
                )}

                {/* Total */}
                <span style={{
                  fontFamily: 'var(--ff-stat)', fontWeight: 900, fontSize: 18,
                  color: totalColor, lineHeight: 1, flexShrink: 0,
                  minWidth: 28, textAlign: 'right',
                  textShadow: natBadge?.text === 'NAT 20' ? '0 0 8px rgba(240,192,64,0.5)' : 'none',
                }}>
                  {roll.total}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
