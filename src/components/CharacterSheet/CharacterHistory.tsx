// v2.75.0 — Character history timeline.
//
// Renders rows from public.character_history (append-only audit log) for
// the current character, newest first. The user can't delete or edit rows
// from the UI — RLS also blocks it at the DB level.
//
// Kept intentionally simple: just a readable timeline of everything that
// has happened. Pairs with RollHistory / ActionLog in the History tab to
// cover both "what changed" (this component) and "what was rolled" (those).

import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';

interface HistoryRow {
  id: string;
  event_type: string;
  field: string | null;
  description: string;
  created_at: string;
}

const ICONS: Record<string, string> = {
  field_change:        '✎',
  hp_change:           '❤',
  temp_hp_change:      '✦',
  spell_slot_used:     '◇',
  spell_slot_restored: '◆',
  condition_added:     '⚠',
  condition_removed:   '✓',
  exhaustion_change:   '☠',
  concentration_start: '◉',
  concentration_end:   '○',
  rest:                '☾',
  level_up:            '★',
  inspiration_change:  '✧',
  spell_cast:          '✨',
  roll:                '🎲',
  other:               '•',
};

const COLORS: Record<string, string> = {
  field_change:        'var(--t-2)',
  hp_change:           '#f87171',
  temp_hp_change:      '#60a5fa',
  spell_slot_used:     '#a78bfa',
  spell_slot_restored: '#34d399',
  condition_added:     '#f59e0b',
  condition_removed:   '#34d399',
  exhaustion_change:   'var(--c-red-l)',
  concentration_start: '#c084fc',
  concentration_end:   'var(--t-3)',
  rest:                '#fbbf24',
  level_up:            'var(--c-gold-l)',
  inspiration_change:  'var(--c-gold-l)',
  spell_cast:          '#a78bfa',
  roll:                'var(--c-gold-l)',
  other:               'var(--t-3)',
};

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.floor((now - then) / 1000);
  if (sec < 10) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

interface Props {
  characterId: string;
  limit?: number;    // initial page size
  maxHeight?: number;
}

export default function CharacterHistory({ characterId, limit = 100, maxHeight = 500 }: Props) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'combat' | 'progression' | 'edits'>('all');
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Initial load + realtime subscription
  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from('character_history')
        .select('id,event_type,field,description,created_at')
        .eq('character_id', characterId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (!active) return;
      if (data) {
        setRows(data as HistoryRow[]);
        setHasMore(data.length === limit);
      }
      setLoading(false);
    })();

    // Realtime: new entries appear at the top as they happen
    const ch = supabase
      .channel(`character-history-${characterId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'character_history',
        filter: `character_id=eq.${characterId}`,
      }, payload => {
        const row = payload.new as HistoryRow;
        setRows(prev => {
          // Dedup — initial load may race with realtime on a just-inserted row
          if (prev.some(r => r.id === row.id)) return prev;
          return [row, ...prev];
        });
      })
      .subscribe();

    return () => { active = false; supabase.removeChannel(ch); };
  }, [characterId, limit]);

  async function loadMore() {
    if (loadingMore || !rows.length) return;
    setLoadingMore(true);
    const oldest = rows[rows.length - 1].created_at;
    const { data } = await supabase
      .from('character_history')
      .select('id,event_type,field,description,created_at')
      .eq('character_id', characterId)
      .lt('created_at', oldest)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (data) {
      setRows(prev => [...prev, ...(data as HistoryRow[])]);
      setHasMore(data.length === limit);
    }
    setLoadingMore(false);
  }

  const filtered = rows.filter(r => {
    if (filter === 'all') return true;
    if (filter === 'combat') {
      return ['hp_change', 'temp_hp_change', 'condition_added', 'condition_removed',
              'exhaustion_change', 'concentration_start', 'concentration_end',
              'spell_slot_used', 'spell_slot_restored', 'spell_cast', 'roll'].includes(r.event_type);
    }
    if (filter === 'progression') {
      return ['level_up', 'rest', 'inspiration_change'].includes(r.event_type)
        || r.field === 'experience_points'
        || r.field === 'max_hp'
        || r.field === 'known_spells'
        || r.field === 'prepared_spells';
    }
    if (filter === 'edits') {
      return r.event_type === 'field_change' || r.event_type === 'other';
    }
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['all', 'combat', 'progression', 'edits'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '3px 10px', borderRadius: 999, cursor: 'pointer', minHeight: 0,
              border: filter === f ? '2px solid var(--c-gold)' : '1px solid var(--c-border-m)',
              background: filter === f ? 'var(--c-gold-bg)' : 'var(--c-raised)',
              color: filter === f ? 'var(--c-gold-l)' : 'var(--t-2)',
              fontSize: 11, fontWeight: filter === f ? 700 : 500,
              textTransform: 'capitalize',
            }}
          >
            {f}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--t-3)' }}>
          {filtered.length} event{filtered.length === 1 ? '' : 's'}
        </span>
      </div>

      <div
        ref={listRef}
        style={{
          background: 'var(--c-card)', border: '1px solid var(--c-border)',
          borderRadius: 'var(--r-md)',
          maxHeight, overflowY: 'auto',
          padding: 6,
        }}
      >
        {loading ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--t-3)', fontSize: 12 }}>
            Loading history…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--t-3)', fontSize: 12 }}>
            No events yet — changes you make to this character will appear here.
          </div>
        ) : (
          <>
            {filtered.map(row => {
              const icon = ICONS[row.event_type] ?? ICONS.other;
              const color = COLORS[row.event_type] ?? COLORS.other;
              return (
                <div
                  key={row.id}
                  title={formatAbsolute(row.created_at)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    padding: '6px 8px', borderBottom: '1px solid var(--c-border)',
                  }}
                >
                  <div style={{
                    fontSize: 14, lineHeight: 1, color, width: 18, textAlign: 'center', flexShrink: 0,
                    marginTop: 1,
                  }}>
                    {icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: 'var(--t-1)', lineHeight: 1.4, wordBreak: 'break-word' }}>
                      {row.description}
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--t-3)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {formatRelative(row.created_at)}
                  </div>
                </div>
              );
            })}
            {hasMore && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                style={{
                  width: '100%', padding: '8px', marginTop: 6,
                  background: 'transparent', border: '1px dashed var(--c-border-m)',
                  borderRadius: 'var(--r-sm)', cursor: loadingMore ? 'default' : 'pointer',
                  color: 'var(--t-3)', fontSize: 11, fontFamily: 'var(--ff-body)',
                }}
              >
                {loadingMore ? 'Loading…' : 'Load older events'}
              </button>
            )}
          </>
        )}
      </div>

      <div style={{ fontSize: 9, color: 'var(--t-3)', textAlign: 'center' }}>
        This log is permanent and cannot be cleared. Events persist until the character is deleted.
      </div>
    </div>
  );
}
