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
      if (entry.individual_results.includes(20)) return 'var(--color-gold-bright)';
      if (entry.individual_results.includes(1)) return 'var(--color-crimson-bright)';
    }
    return 'var(--text-primary)';
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', padding: 'var(--space-4)' }}>
        <div className="spinner" style={{ width: 14, height: 14 }} />
        <span className="loading-text">Loading roll history…</span>
      </div>
    );
  }

  if (compact) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 200, overflowY: 'auto' }}>
        {rolls.length === 0 ? (
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', padding: 'var(--space-2)', textAlign: 'center' }}>
            No rolls yet this session
          </div>
        ) : rolls.map(r => (
          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px var(--space-2)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', minWidth: 0 }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 9, color: 'var(--text-muted)', flexShrink: 0 }}>{formatTime(r.rolled_at)}</span>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
            </div>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-sm)', color: rollColor(r), flexShrink: 0, marginLeft: 8 }}>
              {r.total}
            </span>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          {rolls.length} roll{rolls.length !== 1 ? 's' : ''} logged
        </div>
        {rolls.length > 0 && (
          <button className="btn-ghost btn-sm" onClick={clearHistory} style={{ fontSize: 'var(--text-xs)', color: 'var(--color-crimson-bright)' }}>
            Clear History
          </button>
        )}
      </div>

      {rolls.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)', fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)' }}>
          No rolls recorded yet. Roll dice from your sheet and they'll appear here.
        </div>
      ) : (
        Object.entries(grouped).map(([date, entries]) => (
          <div key={date}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>
              {date}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {entries.map(r => (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-sunken)',
                  border: `1px solid ${r.individual_results.includes(20) && r.dice_expression.includes('d20') ? 'rgba(201,146,42,0.3)' : r.individual_results.includes(1) && r.dice_expression.includes('d20') ? 'rgba(127,29,29,0.3)' : 'transparent'}`,
                }}>
                  <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', minWidth: 0 }}>
                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: 9, color: 'var(--text-muted)', flexShrink: 0, minWidth: 36 }}>
                      {formatTime(r.rolled_at)}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.label}
                      </div>
                      <div style={{ fontFamily: 'var(--font-heading)', fontSize: 9, color: 'var(--text-muted)' }}>
                        {r.dice_expression}
                        {r.individual_results.length > 1 && ` [${r.individual_results.join(', ')}]`}
                      </div>
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, marginLeft: 'var(--space-3)', textAlign: 'right' }}>
                    <span style={{
                      fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 'var(--text-lg)',
                      color: rollColor(r),
                      textShadow: r.individual_results.includes(20) && r.dice_expression.includes('d20') ? '0 0 8px rgba(201,146,42,0.5)' : 'none',
                    }}>
                      {r.total}
                    </span>
                    {r.individual_results.includes(20) && r.dice_expression.includes('d20') && (
                      <div style={{ fontFamily: 'var(--font-heading)', fontSize: 9, color: 'var(--color-gold-bright)' }}>NAT 20</div>
                    )}
                    {r.individual_results.includes(1) && r.dice_expression.includes('d20') && (
                      <div style={{ fontFamily: 'var(--font-heading)', fontSize: 9, color: 'var(--color-crimson-bright)' }}>FUMBLE</div>
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
