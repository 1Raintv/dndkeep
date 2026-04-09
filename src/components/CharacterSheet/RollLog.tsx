import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';

interface RollEntry {
  id: string;
  label: string;
  dice_expression: string;
  individual_results: number[];
  total: number;
  rolled_at: string;
  modifier?: number;
}

interface Reaction {
  id: string;
  roll_id: string;
  user_id: string;
  character_name: string;
  emoji: string;
}

interface RollLogProps {
  characterId: string;
  userId: string;
  characterName?: string;
}

const REACTION_OPTIONS = ['👍', '🎲', '😮', '💀', '🔥', '😬'];

export default function RollLog({ characterId, userId, characterName }: RollLogProps) {
  const [rolls, setRolls] = useState<RollEntry[]>([]);
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{x: number; y: number} | null>(null);
  const [loading, setLoading] = useState(true);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadRolls();

    // Realtime: new rolls
    const rollCh = supabase.channel(`roll-log-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'roll_logs', filter: `user_id=eq.${userId}` },
        payload => setRolls(prev => [payload.new as RollEntry, ...prev].slice(0, 100)))
      .subscribe();

    // Realtime: reaction changes
    const reactCh = supabase.channel(`roll-reactions-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'roll_log_reactions' },
        () => loadReactions())
      .subscribe();

    return () => { supabase.removeChannel(rollCh); supabase.removeChannel(reactCh); };
  }, [userId]);

  // Close menu on outside click
  useEffect(() => {
    if (!openMenu) return;
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenu(null);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenu]);

  async function loadRolls() {
    const { data } = await supabase.from('roll_logs')
      .select('id, label, dice_expression, individual_results, total, rolled_at, modifier')
      .eq('user_id', userId)
      .order('rolled_at', { ascending: false })
      .limit(100);
    if (data) {
      setRolls(data as RollEntry[]);
      await loadReactions(data.map(r => r.id));
    }
    setLoading(false);
  }

  async function loadReactions(rollIds?: string[]) {
    const ids = rollIds ?? rolls.map(r => r.id);
    if (!ids.length) return;
    const { data } = await supabase.from('roll_log_reactions')
      .select('id, roll_id, user_id, character_name, emoji')
      .in('roll_id', ids);
    if (data) {
      const grouped: Record<string, Reaction[]> = {};
      for (const r of data as Reaction[]) {
        if (!grouped[r.roll_id]) grouped[r.roll_id] = [];
        grouped[r.roll_id].push(r);
      }
      setReactions(grouped);
    }
  }

  async function react(rollId: string, emoji: string) {
    const existing = (reactions[rollId] ?? []).find(r => r.user_id === userId);
    if (existing?.emoji === emoji) {
      // Remove reaction
      await supabase.from('roll_log_reactions').delete().eq('id', existing.id);
      setReactions(prev => ({
        ...prev,
        [rollId]: (prev[rollId] ?? []).filter(r => r.id !== existing.id),
      }));
    } else if (existing) {
      // Change reaction
      await supabase.from('roll_log_reactions').update({ emoji }).eq('id', existing.id);
      setReactions(prev => ({
        ...prev,
        [rollId]: (prev[rollId] ?? []).map(r => r.id === existing.id ? { ...r, emoji } : r),
      }));
    } else {
      // New reaction
      const { data } = await supabase.from('roll_log_reactions')
        .insert({ roll_id: rollId, user_id: userId, character_name: characterName ?? 'Unknown', emoji })
        .select().single();
      if (data) {
        setReactions(prev => ({ ...prev, [rollId]: [...(prev[rollId] ?? []), data as Reaction] }));
      }
    }
    setOpenMenu(null);
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

  // Group reactions by emoji and collect who reacted
  function groupReactions(rollId: string) {
    const list = reactions[rollId] ?? [];
    const groups: Record<string, string[]> = {};
    for (const r of list) {
      if (!groups[r.emoji]) groups[r.emoji] = [];
      groups[r.emoji].push(r.character_name || 'Someone');
    }
    return Object.entries(groups);
  }

  function myReaction(rollId: string) {
    return (reactions[rollId] ?? []).find(r => r.user_id === userId)?.emoji ?? '';
  }

  return (
    <>
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div className="section-header" style={{ marginBottom: 6, flexShrink: 0 }}>
        <span>Roll Log</span>
        <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--t-3)',
          fontWeight: 400, letterSpacing: 0, textTransform: 'none', marginLeft: 'auto' }}>
          {rolls.length} rolls
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0,
        display: 'flex', flexDirection: 'column', gap: 3, paddingRight: 2 }}>
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
          const isOpen = openMenu === roll.id;
          const myEmoji = myReaction(roll.id);
          const grouped = groupReactions(roll.id);

          return (
            <div key={roll.id} style={{
              borderRadius: 'var(--r-md)',
              background: natBadge?.text === 'NAT 20' ? 'rgba(240,192,64,0.05)'
                        : natBadge?.text === 'NAT 1'  ? 'rgba(248,113,113,0.05)'
                        : 'var(--c-raised)',
              border: `1px solid ${natBadge ? natBadge.color + '30' : 'var(--c-border)'}`,
              padding: '5px 8px',
            }}>
              {/* Main row: time · name · label · expr · nat · reaction btn · total */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>

                {/* Time — first */}
                <span style={{ fontSize: 9, color: 'var(--t-3)', flexShrink: 0, fontFamily: 'var(--ff-mono)' }}>
                  {formatTime(roll.rolled_at)}
                </span>

                <span style={{ color: 'var(--c-border-m)', fontSize: 9, flexShrink: 0 }}>·</span>

                {/* Roller name */}
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--c-gold-l)',
                  flexShrink: 0, maxWidth: 64, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {characterName ?? 'You'}
                </span>

                <span style={{ color: 'var(--c-border-m)', fontSize: 9, flexShrink: 0 }}>·</span>

                {/* Label if meaningful */}
                {displayLabel ? (
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t-1)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                    {displayLabel}
                  </span>
                ) : (
                  <span style={{ fontSize: 10, color: 'var(--t-2)', fontFamily: 'var(--ff-mono)',
                    flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {roll.dice_expression}
                    {roll.individual_results?.length > 1 && ` [${roll.individual_results.join('+')}]`}
                  </span>
                )}

                {/* Dice expr only shown when label is different */}
                {displayLabel && (
                  <span style={{ fontSize: 10, color: 'var(--t-3)', fontFamily: 'var(--ff-mono)',
                    flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {roll.dice_expression}
                  </span>
                )}

                {/* Nat badge */}
                {natBadge && (
                  <span style={{ fontSize: 8, fontWeight: 800, color: natBadge.color,
                    background: natBadge.color + '18', border: `1px solid ${natBadge.color}40`,
                    borderRadius: 3, padding: '1px 4px', flexShrink: 0, letterSpacing: '0.05em' }}>
                    {natBadge.text}
                  </span>
                )}

                {/* Reaction button + floating menu */}
                <div style={{ position: 'relative', flexShrink: 0 }}
                  ref={isOpen ? menuRef : undefined}>
                  <button
                    onClick={e => {
                      if (isOpen) { setOpenMenu(null); setMenuPos(null); return; }
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setMenuPos({ x: r.right, y: r.top });
                      setOpenMenu(roll.id);
                    }}
                    title="React"
                    style={{ fontSize: 12, background: 'none', border: 'none', cursor: 'pointer',
                      padding: '0 2px', lineHeight: 1, minHeight: 0,
                      color: myEmoji ? 'var(--t-1)' : 'var(--t-3)' }}>
                    {myEmoji || '＋'}
                  </button>


                </div>

                {/* Total */}
                <span style={{ fontFamily: 'var(--ff-stat)', fontWeight: 900, fontSize: 18,
                  color: totalColor, lineHeight: 1, flexShrink: 0, minWidth: 24, textAlign: 'right',
                  textShadow: natBadge?.text === 'NAT 20' ? '0 0 10px rgba(240,192,64,0.5)' : 'none' }}>
                  {roll.total}
                </span>
              </div>

              {/* Reaction pills — multi-user, shown below if any exist */}
              {grouped.length > 0 && (
                <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                  {grouped.map(([emoji, names]) => (
                    <button
                      key={emoji}
                      onClick={() => react(roll.id, emoji)}
                      title={names.join(', ')}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 3,
                        fontSize: 11, cursor: 'pointer', padding: '1px 6px', borderRadius: 999,
                        background: myEmoji === emoji ? 'rgba(201,146,42,0.15)' : 'var(--c-surface)',
                        border: `1px solid ${myEmoji === emoji ? 'var(--c-gold-bdr)' : 'var(--c-border)'}`,
                        minHeight: 0, transition: 'all 0.1s',
                      }}>
                      <span>{emoji}</span>
                      <span style={{ fontFamily: 'var(--ff-body)', fontSize: 10,
                        color: myEmoji === emoji ? 'var(--c-gold-l)' : 'var(--t-2)', fontWeight: 600 }}>
                        {names.length}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>

    {/* Emoji picker portal — renders at document body level, escapes all overflow clipping */}
    {openMenu && menuPos && createPortal(
      <div
        ref={menuRef}
        style={{
          position: 'fixed',
          right: window.innerWidth - menuPos.x + 4,
          top: menuPos.y - 44,
          zIndex: 9999,
          background: 'var(--c-card)',
          border: '1px solid var(--c-border-m)',
          borderRadius: 10,
          padding: '5px 6px',
          display: 'flex',
          gap: 4,
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {REACTION_OPTIONS.map(emoji => {
          const curMyEmoji = (reactions[openMenu] ?? []).find(r => r.user_id === userId)?.emoji ?? '';
          return (
            <button key={emoji} onClick={() => react(openMenu, emoji)}
              style={{
                fontSize: 16, cursor: 'pointer', padding: '2px 4px', borderRadius: 6,
                background: curMyEmoji === emoji ? 'var(--c-raised)' : 'none',
                border: 'none', minHeight: 0,
                transform: curMyEmoji === emoji ? 'scale(1.25)' : 'scale(1)',
                transition: 'transform 0.1s',
              }}>
              {emoji}
            </button>
          );
        })}
      </div>,
      document.body
    )}
    </>
  );
}
