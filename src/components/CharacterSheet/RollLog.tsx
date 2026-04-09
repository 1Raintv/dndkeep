import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';

interface RollEntry {
  id: string;
  label: string;
  dice_expression: string;
  individual_results: number[];
  total: number;
  rolled_at: string;
  character_name?: string;
}

interface RollLogProps {
  characterId: string;
  userId: string;
  characterName?: string;
}

const REACTIONS = ['👍', '🎲', '😮', '💀', '🔥', '😬'];

export default function RollLog({ characterId, userId, characterName }: RollLogProps) {
  const [rolls, setRolls] = useState<RollEntry[]>([]);
  const [reactions, setReactions] = useState<Record<string, string>>({});
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const menuRef = useRef<HTMLDivElement>(null);

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

  // Close reaction menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    }
    if (openMenu) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [openMenu]);

  async function loadRolls() {
    const { data } = await supabase
      .from('roll_logs')
      .select('id, label, dice_expression, individual_results, total, rolled_at')
      .eq('user_id', userId)
      .order('rolled_at', { ascending: false })
      .limit(100);
    if (data) setRolls(data as RollEntry[]);
    setLoading(false);
  }

  function toggleReaction(rollId: string, emoji: string) {
    setReactions(prev => ({ ...prev, [rollId]: prev[rollId] === emoji ? '' : emoji }));
    setOpenMenu(null);
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // A roll label is "meaningful" if it isn't just the dice expression itself
  function getDisplayLabel(roll: RollEntry) {
    const expr = roll.dice_expression?.toLowerCase();
    const label = roll.label?.toLowerCase();
    // If label is just the expression (e.g. "1d20" = "1d20"), hide the expression
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
      <div className="section-header" style={{ marginBottom: 6, flexShrink: 0 }}>
        <span>Roll Log</span>
        <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--t-3)',
          fontWeight: 400, letterSpacing: 0, textTransform: 'none', marginLeft: 'auto' }}>
          {rolls.length} rolls
        </span>
      </div>

      {/* Scrollable list */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, display: 'flex',
        flexDirection: 'column', gap: 3, paddingRight: 2 }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div className="spinner" style={{ width: 14, height: 14 }} />
          </div>
        ) : rolls.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 8px', color: 'var(--t-3)', fontSize: 12 }}>
            No rolls yet.<br />Click ability scores or skills to roll.
          </div>
        ) : rolls.map(roll => {
          const displayLabel = getDisplayLabel(roll);
          const natBadge = getNatBadge(roll);
          const totalColor = getTotalColor(roll);
          const reaction = reactions[roll.id] ?? '';
          const isOpen = openMenu === roll.id;

          return (
            <div key={roll.id} style={{
              borderRadius: 'var(--r-md)',
              background: natBadge?.text === 'NAT 20' ? 'rgba(240,192,64,0.05)'
                        : natBadge?.text === 'NAT 1'  ? 'rgba(248,113,113,0.05)'
                        : 'var(--c-raised)',
              border: `1px solid ${natBadge ? natBadge.color + '30' : 'var(--c-border)'}`,
              padding: '5px 8px',
              position: 'relative',
            }}>
              {/* Single-line layout: roller · label · expr · nat badge · time | reaction btn | total */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>

                {/* Roller name */}
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--c-gold-l)',
                  flexShrink: 0, maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {characterName ?? 'You'}
                </span>

                <span style={{ color: 'var(--c-border-m)', fontSize: 9, flexShrink: 0 }}>·</span>

                {/* Label (if meaningful) */}
                {displayLabel && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t-1)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                    {displayLabel}
                  </span>
                )}

                {/* Dice expression */}
                <span style={{ fontSize: 10, color: 'var(--t-3)', fontFamily: 'var(--ff-mono)',
                  flexShrink: 0, whiteSpace: 'nowrap' }}>
                  {roll.dice_expression}
                  {roll.individual_results?.length > 1 && (
                    <span style={{ color: 'var(--t-3)' }}> [{roll.individual_results.join('+')}]</span>
                  )}
                </span>

                {/* Nat badge */}
                {natBadge && (
                  <span style={{ fontSize: 8, fontWeight: 800, color: natBadge.color,
                    background: natBadge.color + '18', border: `1px solid ${natBadge.color}40`,
                    borderRadius: 3, padding: '1px 4px', flexShrink: 0, letterSpacing: '0.05em' }}>
                    {natBadge.text}
                  </span>
                )}

                {/* Time */}
                <span style={{ fontSize: 9, color: 'var(--t-3)', flexShrink: 0, marginLeft: 'auto' }}>
                  {formatTime(roll.rolled_at)}
                </span>

                {/* Reaction toggle button */}
                <div style={{ position: 'relative', flexShrink: 0 }} ref={isOpen ? menuRef : undefined}>
                  <button
                    onClick={() => setOpenMenu(isOpen ? null : roll.id)}
                    style={{ fontSize: 12, background: 'none', border: 'none', cursor: 'pointer',
                      padding: '0 2px', lineHeight: 1, minHeight: 0,
                      color: reaction ? 'var(--t-1)' : 'var(--t-3)',
                      transition: 'transform 0.1s',
                    }}
                    title="React"
                  >
                    {reaction || '＋'}
                  </button>

                  {/* Floating reaction menu */}
                  {isOpen && (
                    <div style={{
                      position: 'absolute', right: 0, bottom: 22, zIndex: 50,
                      background: 'var(--c-card)', border: '1px solid var(--c-border-m)',
                      borderRadius: 10, padding: '5px 6px',
                      display: 'flex', gap: 4,
                      boxShadow: 'var(--shadow-lg)',
                      animation: 'fadeIn 0.1s ease',
                    }}>
                      {REACTIONS.map(emoji => (
                        <button key={emoji} onClick={() => toggleReaction(roll.id, emoji)}
                          style={{
                            fontSize: 16, background: reaction === emoji ? 'var(--c-raised)' : 'none',
                            border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 6,
                            minHeight: 0, transition: 'transform 0.1s',
                            transform: reaction === emoji ? 'scale(1.25)' : 'scale(1)',
                          }}>
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Total */}
                <span style={{ fontFamily: 'var(--ff-stat)', fontWeight: 900, fontSize: 18,
                  color: totalColor, lineHeight: 1, flexShrink: 0, minWidth: 24, textAlign: 'right',
                  textShadow: natBadge?.text === 'NAT 20' ? '0 0 10px rgba(240,192,64,0.5)' : 'none' }}>
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
