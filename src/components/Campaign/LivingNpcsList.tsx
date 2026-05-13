// v2.492.0 — Living NPCs list view.
//
// Inside the NPCs tab, a toggle switches between two views:
//   - "Bestiary"     — the existing NPCManager content (homebrew_monsters
//                      templates: role, faction, relationship, lore).
//   - "Living NPCs"  — THIS component. Reads `combatants` (the persistent
//                      per-token runtime state introduced in v2.309
//                      Combat Phase 3) and shows every NPC combatant in
//                      the campaign with live HP and a dead-state
//                      indicator.
//
// Why a separate component:
//   The two views answer different questions. Bestiary answers "what
//   monsters/NPCs exist in my campaign?" (template-level). Living NPCs
//   answers "what's the current state of each token I've placed?"
//   (instance-level). Two ancient red dragons spawned from the same
//   bestiary entry are two rows here, one row there. Sharing the
//   NPCManager component would muddle the read path and the row model;
//   a sibling is cleaner.
//
// Data source. `combatants` table, scoped to:
//   - campaign_id = this campaign
//   - definition_type != 'character' (characters get the Party tab)
//
// Dead rows are shown grayed out / strikethrough inline rather than
// hidden (DM preference: a dead Lich is still narratively relevant,
// and bringing it back via heal would un-dead it on the next write).
//
// DM interaction: inline damage/heal buttons per row. Set HP for
// arbitrary edits is reachable via the existing NpcTokenQuickPanel
// (one click on the map token); duplicating the "set" mode here would
// crowd the row.
//
// Realtime: subscribes to combatants UPDATE events filtered on
// campaign_id. Same channel pattern as NpcTokenQuickPanel's v2.385
// subscription. INSERT/DELETE are not subscribed (a new placement
// flows through scene_tokens trigger → combatants insert, but the
// DM is unlikely to be on this tab at the same moment; reload is
// fine and avoids churn).

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';

interface LivingNpcsListProps {
  campaignId: string;
  isOwner: boolean;
}

interface CombatantRow {
  id: string;
  name: string;
  definition_type: string;
  definition_id: string | null;
  current_hp: number;
  max_hp: number;
  temp_hp: number;
  is_dead: boolean;
  is_stable: boolean;
  active_conditions: string[];
  updated_at: string;
}

// Threshold colors mirror NpcTokenQuickPanel's hpColor logic so the
// list visually agrees with the panel.
function hpColor(curr: number, max: number): string {
  if (max <= 0) return 'var(--t-2)';
  const pct = curr / max;
  if (pct <= 0) return 'var(--c-red-l)';
  if (pct < 0.25) return '#f87171';
  if (pct < 0.5) return '#fbbf24';
  return 'var(--hp-full)';
}

export default function LivingNpcsList({ campaignId, isOwner }: LivingNpcsListProps) {
  const [rows, setRows] = useState<CombatantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // hpInput is keyed by combatant id so each row tracks its own
  // pending amount independently. busy is a set of combatant ids
  // with in-flight writes — disables both buttons on that row.
  const [hpInputs, setHpInputs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const reload = useCallback(async () => {
    // v2.493: types regenerated, combatants table now properly typed.
    const { data, error } = await supabase
      .from('combatants')
      .select('id, name, definition_type, definition_id, current_hp, max_hp, temp_hp, is_dead, is_stable, active_conditions, updated_at')
      .eq('campaign_id', campaignId)
      .neq('definition_type', 'character')
      .order('is_dead', { ascending: true })   // living first
      .order('name', { ascending: true });
    if (error) {
      console.error('[LivingNpcsList] load failed', error);
      setRows([]);
    } else {
      setRows((data ?? []) as CombatantRow[]);
    }
    setLoading(false);
  }, [campaignId]);

  useEffect(() => {
    setLoading(true);
    reload();
  }, [reload]);

  // Realtime: keep the list in sync with HP edits from the map panel,
  // combat damage, end-of-encounter writes, etc. Filter is on campaign_id
  // so we don't get churn from other campaigns.
  useEffect(() => {
    const channel = supabase
      .channel(`living_npcs:${campaignId}`)
      .on(
        'postgres_changes' as any,
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'combatants',
          filter: `campaign_id=eq.${campaignId}`,
        },
        (payload: { new: CombatantRow }) => {
          const next = payload.new;
          // Ignore characters — same filter as the load query.
          if (next.definition_type === 'character') return;
          setRows(prev => {
            const idx = prev.findIndex(r => r.id === next.id);
            if (idx === -1) return prev;
            const updated = [...prev];
            updated[idx] = { ...updated[idx], ...next };
            return updated;
          });
        },
      )
      .on(
        'postgres_changes' as any,
        {
          event: 'INSERT',
          schema: 'public',
          table: 'combatants',
          filter: `campaign_id=eq.${campaignId}`,
        },
        () => {
          // Re-fetch on INSERT — cheap and keeps the sort order
          // (living first, then by name) correct without re-implementing
          // the order client-side.
          reload();
        },
      )
      .on(
        'postgres_changes' as any,
        {
          event: 'DELETE',
          schema: 'public',
          table: 'combatants',
          filter: `campaign_id=eq.${campaignId}`,
        },
        (payload: { old: { id: string } }) => {
          setRows(prev => prev.filter(r => r.id !== payload.old.id));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [campaignId, reload]);

  // Damage/heal handler. Mirrors NpcTokenQuickPanel.applyHp — same
  // table, same is_dead policy, same clamps. Lives here too rather
  // than centralized in a helper because the inline button-pair
  // interaction is row-local and the panel passes through a 3-mode
  // selector (damage/heal/set) we explicitly don't need.
  const applyHp = useCallback(async (row: CombatantRow, mode: 'damage' | 'heal') => {
    const raw = (hpInputs[row.id] ?? '').trim();
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) return;
    let next = row.current_hp;
    if (mode === 'damage') {
      next = Math.max(0, row.current_hp - n);
    } else {
      // Heal clamped to max_hp when known; if max is 0 (rare,
      // shouldn't happen for real creatures) we allow free heal.
      next = row.max_hp > 0 ? Math.min(row.max_hp, row.current_hp + n) : row.current_hp + n;
    }
    // is_dead policy: true iff HP dropped to 0 AND max_hp > 0.
    // A heal from 0 → positive un-dies the row, matching combat
    // behavior. Stable flag is left alone — that's a death-save
    // construct managed elsewhere.
    const isDead = next <= 0 && row.max_hp > 0;
    setBusy(prev => {
      const s = new Set(prev);
      s.add(row.id);
      return s;
    });
    try {
      // v2.493: types regenerated, combatants table now properly typed.
      const { error } = await supabase
        .from('combatants')
        .update({
          current_hp: next,
          is_dead: isDead,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      if (error) {
        console.error('[LivingNpcsList] hp update failed', error);
      } else {
        // Optimistically update local state — the realtime channel
        // will also fire but the round-trip is visible without this.
        setRows(prev => prev.map(r => r.id === row.id
          ? { ...r, current_hp: next, is_dead: isDead }
          : r,
        ));
        setHpInputs(prev => ({ ...prev, [row.id]: '' }));
      }
    } finally {
      setBusy(prev => {
        const s = new Set(prev);
        s.delete(row.id);
        return s;
      });
    }
  }, [hpInputs]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r => r.name.toLowerCase().includes(q));
  }, [rows, search]);

  const livingCount = useMemo(() => rows.filter(r => !r.is_dead).length, [rows]);
  const deadCount = rows.length - livingCount;

  if (loading) {
    return <div className="loading-text" style={{ padding: 'var(--sp-4)' }}>Loading NPCs…</div>;
  }

  if (rows.length === 0) {
    return (
      <div style={{
        padding: 'var(--sp-4)',
        border: '1px dashed var(--c-border)',
        borderRadius: 'var(--r-lg)',
        color: 'var(--t-2)',
        fontSize: 'var(--fs-sm)',
        textAlign: 'center' as const,
      }}>
        No NPC tokens yet. Place a creature from the bestiary onto a map
        scene to create a tracked combatant.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
      {/* Controls row */}
      <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name…"
          style={{ flex: 1, minWidth: 160, fontSize: 'var(--fs-sm)' }}
        />
        <div style={{
          fontFamily: 'var(--ff-body)',
          fontSize: 'var(--fs-xs)',
          color: 'var(--t-2)',
        }}>
          {livingCount} living · {deadCount} dead
        </div>
      </div>

      {/* Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
        {filtered.map(row => {
          const isBusy = busy.has(row.id);
          const color = hpColor(row.current_hp, row.max_hp);
          const pct = row.max_hp > 0 ? Math.max(0, Math.min(1, row.current_hp / row.max_hp)) : 0;
          const dim = row.is_dead;
          return (
            <div key={row.id} style={{
              border: `1px solid ${dim ? 'var(--c-border)' : color + '40'}`,
              borderRadius: 'var(--r-lg)',
              background: '#080d14',
              opacity: dim ? 0.55 : 1,
              padding: 'var(--sp-3) var(--sp-4)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--sp-3)',
              flexWrap: 'wrap',
              transition: 'all var(--tr-fast)',
            }}>
              {/* Name + meta + conditions */}
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                  <span style={{
                    fontFamily: 'var(--ff-body)',
                    fontWeight: 600,
                    fontSize: 'var(--fs-sm)',
                    color: dim ? 'var(--t-2)' : 'var(--t-1)',
                    textDecoration: dim ? 'line-through' : 'none',
                  }}>
                    {row.name}
                  </span>
                  {dim && (
                    <span style={{
                      fontFamily: 'var(--ff-body)',
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--c-red-l)',
                      background: 'rgba(248,113,113,0.10)',
                      border: '1px solid rgba(248,113,113,0.35)',
                      padding: '1px 6px',
                      borderRadius: 999,
                    }}>Dead</span>
                  )}
                  {row.active_conditions && row.active_conditions.length > 0 && (
                    <span style={{
                      fontFamily: 'var(--ff-body)',
                      fontSize: 'var(--fs-xs)',
                      color: 'var(--t-2)',
                    }}>
                      {row.active_conditions.join(', ')}
                    </span>
                  )}
                </div>
              </div>

              {/* HP bar */}
              <div style={{ width: 140, flexShrink: 0 }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontFamily: 'var(--ff-body)',
                  fontSize: 10,
                  marginBottom: 2,
                }}>
                  <span style={{ color: 'var(--t-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>HP</span>
                  <span style={{ color, fontWeight: 700 }}>
                    {row.current_hp}<span style={{ color: 'var(--t-3)' }}>/{row.max_hp}</span>
                    {row.temp_hp > 0 && (
                      <span style={{ color: '#60a5fa', marginLeft: 4 }}>+{row.temp_hp}</span>
                    )}
                  </span>
                </div>
                <div style={{
                  height: 6,
                  background: 'var(--c-raised)',
                  borderRadius: 999,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${pct * 100}%`,
                    height: '100%',
                    background: color,
                    transition: 'width var(--tr-base)',
                  }} />
                </div>
              </div>

              {/* Inline HP edit — DM only */}
              {isOwner && (
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                  <input
                    type="number"
                    min={0}
                    value={hpInputs[row.id] ?? ''}
                    onChange={e => setHpInputs(prev => ({ ...prev, [row.id]: e.target.value }))}
                    placeholder="Amount"
                    style={{
                      width: 64,
                      padding: '4px 6px',
                      background: 'var(--c-raised)',
                      border: '1px solid var(--c-border)',
                      borderRadius: 'var(--r-sm, 4px)',
                      color: 'var(--t-1)',
                      fontFamily: 'var(--ff-body)',
                      fontSize: 12,
                      boxSizing: 'border-box' as const,
                      outline: 'none',
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') applyHp(row, 'damage');
                    }}
                  />
                  <button
                    onClick={() => applyHp(row, 'damage')}
                    disabled={isBusy || !(hpInputs[row.id] ?? '').trim()}
                    title="Apply damage"
                    style={{
                      padding: '4px 10px',
                      background: 'rgba(248,113,113,0.18)',
                      border: '1px solid rgba(248,113,113,0.55)',
                      borderRadius: 'var(--r-sm, 4px)',
                      color: '#f87171',
                      fontFamily: 'var(--ff-body)',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: isBusy ? 'not-allowed' : 'pointer',
                      opacity: isBusy || !(hpInputs[row.id] ?? '').trim() ? 0.5 : 1,
                      minHeight: 0,
                    }}
                  >
                    {isBusy ? '…' : 'Dmg'}
                  </button>
                  <button
                    onClick={() => applyHp(row, 'heal')}
                    disabled={isBusy || !(hpInputs[row.id] ?? '').trim()}
                    title="Heal (un-dies if dead)"
                    style={{
                      padding: '4px 10px',
                      background: 'rgba(52,211,153,0.18)',
                      border: '1px solid rgba(52,211,153,0.55)',
                      borderRadius: 'var(--r-sm, 4px)',
                      color: '#34d399',
                      fontFamily: 'var(--ff-body)',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: isBusy ? 'not-allowed' : 'pointer',
                      opacity: isBusy || !(hpInputs[row.id] ?? '').trim() ? 0.5 : 1,
                      minHeight: 0,
                    }}
                  >
                    {isBusy ? '…' : 'Heal'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && rows.length > 0 && (
        <div style={{
          padding: 'var(--sp-3)',
          color: 'var(--t-2)',
          fontSize: 'var(--fs-sm)',
          textAlign: 'center' as const,
        }}>
          No NPCs match "{search}".
        </div>
      )}
    </div>
  );
}
