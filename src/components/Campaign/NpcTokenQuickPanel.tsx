import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../shared/Toast';

/**
 * v2.243.0 — Phase Q.1 pt 31: NPC quick panel.
 *
 * Mirrors v2.226's character TokenQuickPanel but pointed at the
 * `npcs` table. When a DM clicks an NPC-linked token (one with
 * `npcId` set, typically created via v2.242's roster bulk-add),
 * this panel anchors near the click and exposes:
 *   - HP bar + name + AC + roster origin subtitle
 *   - Damage / Heal / Set HP input (DM-only)
 *   - Active conditions chips with apply / remove (DM-only)
 *   - Reveal / Hide toggle for visible_to_players
 *   - Close on Esc or backdrop click
 *
 * Loading: the panel does its own one-shot fetch by npcId on mount
 * because BattleMapV2 doesn't maintain an npcs cache. A Realtime
 * channel keyed on this single npc id keeps the panel state in
 * sync with edits from elsewhere (e.g., NPCManager) and with the
 * panel's own writes (no optimistic local update — let the channel
 * echo it).
 *
 * Conditions: writes go through `npcs.conditions text[]` directly,
 * matching v1's pattern (and the character panel's). No combat
 * cascade routing here — same trade-off as character panel.
 */

interface NpcRow {
  id: string;
  campaign_id: string | null;
  name: string;
  race: string | null;          // doubles as monster type for roster-spawned NPCs
  hp: number | null;
  max_hp: number | null;
  ac: number | null;
  conditions: string[] | null;
  visible_to_players: boolean;
  in_combat: boolean;
}

// Mirror of the character panel's COND_COLOR. Kept inline so the panel
// is self-contained — if the palette ever moves to a shared module,
// both panels can adopt it together.
const COND_COLOR: Record<string, string> = {
  Blinded: '#94a3b8',
  Charmed: '#f472b6',
  Deafened: '#94a3b8',
  Frightened: '#fb923c',
  Grappled: '#a78bfa',
  Incapacitated: '#ef4444',
  Invisible: '#60a5fa',
  Paralyzed: '#ef4444',
  Petrified: '#78716c',
  Poisoned: '#22c55e',
  Prone: '#fbbf24',
  Restrained: '#a78bfa',
  Stunned: '#ef4444',
  Unconscious: '#dc2626',
  Exhaustion: '#7c3aed',
};

const ALL_CONDITIONS: string[] = Object.keys(COND_COLOR);

interface Props {
  npcId: string;
  anchorX: number;
  anchorY: number;
  isDM: boolean;
  onClose: () => void;
}

export default function NpcTokenQuickPanel({ npcId, anchorX, anchorY, isDM, onClose }: Props) {
  const { showToast } = useToast();
  const [npc, setNpc] = useState<NpcRow | null>(null);
  const [hpInput, setHpInput] = useState('');
  const [hpMode, setHpMode] = useState<'damage' | 'heal' | 'set'>('damage');
  const [applying, setApplying] = useState(false);
  const [condBusy, setCondBusy] = useState(false);
  const [showCondPicker, setShowCondPicker] = useState(false);

  // Initial fetch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('npcs')
        .select('id, campaign_id, name, race, hp, max_hp, ac, conditions, visible_to_players, in_combat')
        .eq('id', npcId)
        .single();
      if (cancelled) return;
      if (error || !data) {
        console.error('[NpcTokenQuickPanel] fetch failed', error);
        return;
      }
      setNpc(data as NpcRow);
    })();
    return () => { cancelled = true; };
  }, [npcId]);

  // Realtime sync — listen for UPDATE events on this specific npc id.
  // The filter scoping reduces channel chatter when the campaign has
  // many NPCs. Cleaned up on unmount.
  useEffect(() => {
    const channel = supabase
      .channel(`npc:${npcId}`)
      .on(
        'postgres_changes' as any,
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'npcs',
          filter: `id=eq.${npcId}`,
        },
        (payload: any) => {
          const next = payload.new;
          if (next?.id === npcId) {
            setNpc(prev => prev ? { ...prev, ...next } : (next as NpcRow));
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [npcId]);

  // Esc closes.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Position calc — same logic as character panel (clamp inside viewport).
  const PANEL_W = 280;
  const PANEL_H = 420;
  const margin = 8;
  let left = Math.max(margin, anchorX + 14);
  if (typeof window !== 'undefined') {
    if (left + PANEL_W + margin > window.innerWidth) {
      left = Math.max(margin, anchorX - PANEL_W - 14);
    }
  }
  let top = Math.max(margin, anchorY - PANEL_H / 2);
  if (typeof window !== 'undefined') {
    if (top + PANEL_H + margin > window.innerHeight) {
      top = Math.max(margin, window.innerHeight - PANEL_H - margin);
    }
  }

  const applyHp = useCallback(async () => {
    if (!npc) return;
    const n = parseInt(hpInput.trim(), 10);
    if (!Number.isFinite(n) || n <= 0) return;
    const currHp = npc.hp ?? 0;
    const maxHp = npc.max_hp ?? 0;
    let next = currHp;
    if (hpMode === 'damage') next = Math.max(0, currHp - n);
    else if (hpMode === 'heal') next = Math.min(maxHp || currHp + n, currHp + n);
    else next = Math.max(0, maxHp > 0 ? Math.min(maxHp, n) : n);
    setApplying(true);
    try {
      const { error } = await supabase
        .from('npcs')
        .update({ hp: next, updated_at: new Date().toISOString() })
        .eq('id', npc.id);
      if (error) {
        console.error('[NpcTokenQuickPanel] HP update failed', error);
        showToast('Failed to update HP. Check console for details.', 'error');
        return;
      }
      setHpInput('');
    } finally {
      setApplying(false);
    }
  }, [npc, hpInput, hpMode, showToast]);

  const addCondition = useCallback(async (cond: string) => {
    if (!npc || condBusy) return;
    const current = npc.conditions ?? [];
    if (current.includes(cond)) return;
    setCondBusy(true);
    try {
      const next = [...current, cond];
      const { error } = await supabase
        .from('npcs')
        .update({ conditions: next, updated_at: new Date().toISOString() })
        .eq('id', npc.id);
      if (error) {
        console.error('[NpcTokenQuickPanel] addCondition failed', error);
        showToast(`Failed to apply ${cond}.`, 'error');
      }
    } finally {
      setCondBusy(false);
    }
  }, [npc, condBusy, showToast]);

  const removeCondition = useCallback(async (cond: string) => {
    if (!npc || condBusy) return;
    const current = npc.conditions ?? [];
    if (!current.includes(cond)) return;
    setCondBusy(true);
    try {
      const next = current.filter(x => x !== cond);
      const { error } = await supabase
        .from('npcs')
        .update({ conditions: next, updated_at: new Date().toISOString() })
        .eq('id', npc.id);
      if (error) {
        console.error('[NpcTokenQuickPanel] removeCondition failed', error);
        showToast(`Failed to remove ${cond}.`, 'error');
      }
    } finally {
      setCondBusy(false);
    }
  }, [npc, condBusy, showToast]);

  const toggleVisibility = useCallback(async () => {
    if (!npc) return;
    try {
      const { error } = await supabase
        .from('npcs')
        .update({ visible_to_players: !npc.visible_to_players, updated_at: new Date().toISOString() })
        .eq('id', npc.id);
      if (error) {
        console.error('[NpcTokenQuickPanel] visibility toggle failed', error);
        showToast('Failed to update visibility.', 'error');
      }
    } catch (err) {
      console.error('[NpcTokenQuickPanel] visibility toggle threw', err);
    }
  }, [npc, showToast]);

  function stop(e: React.MouseEvent) { e.stopPropagation(); }

  // Loading state — fetch hasn't returned yet. Render a tiny stub so
  // the panel anchors don't visibly flicker.
  if (!npc) {
    return (
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 9997 }}
        onMouseDown={onClose}
      >
        <div
          style={{
            position: 'fixed', left, top,
            width: PANEL_W, padding: 14,
            background: 'var(--c-card)',
            border: '1px solid var(--c-border)',
            borderRadius: 'var(--r-lg, 12px)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            color: 'var(--t-3)', fontFamily: 'var(--ff-body)', fontSize: 12,
          }}
          onMouseDown={stop}
        >
          Loading…
        </div>
      </div>
    );
  }

  // Loaded — render the panel.
  const currHp = npc.hp ?? 0;
  const maxHp = npc.max_hp ?? 0;
  const pct = maxHp > 0 ? Math.max(0, Math.min(1, currHp / maxHp)) : 0;
  const hpColor = pct > 0.5 ? '#34d399' : pct > 0.25 ? '#fbbf24' : pct > 0 ? '#f87171' : '#6b7280';
  const conditions = npc.conditions ?? [];
  const availableConds = ALL_CONDITIONS.filter(c => !conditions.includes(c));

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9997 }}
      onMouseDown={onClose}
    >
      <div
        style={{
          position: 'fixed', left, top,
          width: PANEL_W,
          maxHeight: PANEL_H,
          overflowY: 'auto',
          background: 'var(--c-card)',
          border: '1px solid var(--c-border)',
          borderRadius: 'var(--r-lg, 12px)',
          // Red-tinted shadow ring (NPC = hostile by default in v2.242).
          boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(239,68,68,0.30)',
          fontFamily: 'var(--ff-body)',
          color: 'var(--t-1)',
          padding: 14,
        }}
        onMouseDown={stop}
      >
        {/* Header — name, type subtitle, close */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 14, fontWeight: 700, color: 'var(--t-1)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {npc.name}
            </div>
            <div style={{ fontSize: 10, color: 'var(--t-3)', letterSpacing: '0.04em', marginTop: 2 }}>
              {npc.race || 'NPC'}{npc.in_combat && ' · in combat'}
            </div>
          </div>
          <button
            onClick={onClose}
            title="Close"
            style={{
              width: 24, height: 24, padding: 0,
              background: 'transparent', border: 'none',
              color: 'var(--t-3)', cursor: 'pointer',
              fontSize: 16, lineHeight: 1, minHeight: 0, minWidth: 0,
            }}
          >×</button>
        </div>

        {/* HP bar */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>HP</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: hpColor }}>
              {currHp}<span style={{ fontSize: 10, color: 'var(--t-3)' }}>/{maxHp}</span>
            </span>
          </div>
          <div style={{
            height: 8, background: 'rgba(15,16,18,0.85)',
            border: '1px solid var(--c-border)',
            borderRadius: 4, overflow: 'hidden' as const,
          }}>
            <div style={{
              width: `${pct * 100}%`, height: '100%',
              background: hpColor, transition: 'width 0.2s, background 0.2s',
            }} />
          </div>
        </div>

        {/* AC + Visibility */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <div style={{
            background: 'var(--c-raised)',
            border: '1px solid var(--c-border)',
            borderRadius: 'var(--r-sm, 4px)',
            padding: '6px 8px',
            textAlign: 'center' as const,
          }}>
            <div style={{ fontSize: 9, color: 'var(--t-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>AC</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t-1)' }}>{npc.ac ?? '—'}</div>
          </div>
          <button
            onClick={isDM ? toggleVisibility : undefined}
            disabled={!isDM}
            title={isDM
              ? (npc.visible_to_players ? 'Hide from players' : 'Reveal to players')
              : 'Visibility (DM only)'}
            style={{
              background: npc.visible_to_players ? 'rgba(52,211,153,0.18)' : 'var(--c-raised)',
              border: `1px solid ${npc.visible_to_players ? 'rgba(52,211,153,0.55)' : 'var(--c-border)'}`,
              borderRadius: 'var(--r-sm, 4px)',
              padding: '6px 8px',
              textAlign: 'center' as const,
              cursor: isDM ? 'pointer' : 'default',
              minHeight: 0,
            }}
          >
            <div style={{ fontSize: 9, color: 'var(--t-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Players</div>
            <div style={{
              fontSize: 12, fontWeight: 700,
              color: npc.visible_to_players ? '#34d399' : 'var(--t-3)',
            }}>
              {npc.visible_to_players ? 'Visible' : 'Hidden'}
            </div>
          </button>
        </div>

        {/* Active conditions chips. DM clicks ✕ to remove, "+" to open picker. */}
        <div style={{ marginBottom: 12 }}>
          <div style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            marginBottom: 4,
          }}>
            <span style={{ fontSize: 9, color: 'var(--t-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Conditions
            </span>
            {isDM && (
              <button
                onClick={() => setShowCondPicker(s => !s)}
                style={{
                  background: 'transparent', border: 'none',
                  color: 'var(--t-3)', cursor: 'pointer',
                  fontSize: 10, fontWeight: 700, padding: 0, minHeight: 0, minWidth: 0,
                }}
              >
                {showCondPicker ? '✕ close' : '+ apply'}
              </button>
            )}
          </div>
          {conditions.length === 0 ? (
            <div style={{ fontSize: 10, color: 'var(--t-3)', fontStyle: 'italic' as const }}>
              None applied.
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 4 }}>
              {conditions.map(cond => {
                const color = COND_COLOR[cond] ?? '#9ca3af';
                return (
                  <span
                    key={cond}
                    onClick={isDM ? () => removeCondition(cond) : undefined}
                    title={isDM ? `Remove ${cond}` : cond}
                    style={{
                      padding: '2px 8px',
                      background: color + '22',
                      border: `1px solid ${color}55`,
                      borderRadius: 999,
                      fontSize: 10, fontWeight: 700,
                      color,
                      cursor: isDM ? 'pointer' : 'default',
                      opacity: condBusy ? 0.6 : 1,
                      pointerEvents: condBusy ? 'none' : 'auto',
                      userSelect: 'none' as const,
                    }}
                  >
                    {cond}{isDM && ' ✕'}
                  </span>
                );
              })}
            </div>
          )}
          {/* Picker — DM only, expanded with all unapplied conditions. */}
          {isDM && showCondPicker && availableConds.length > 0 && (
            <div style={{
              marginTop: 6, padding: 6,
              background: 'var(--c-raised)',
              border: '1px solid var(--c-border)',
              borderRadius: 'var(--r-sm, 4px)',
              display: 'flex', flexWrap: 'wrap' as const, gap: 3,
            }}>
              {availableConds.map(cond => {
                const color = COND_COLOR[cond] ?? '#9ca3af';
                return (
                  <button
                    key={cond}
                    onClick={() => { addCondition(cond); }}
                    style={{
                      padding: '2px 8px',
                      background: 'transparent',
                      border: `1px solid ${color}55`,
                      borderRadius: 999,
                      fontSize: 10, fontWeight: 700,
                      color,
                      cursor: 'pointer',
                      opacity: condBusy ? 0.5 : 1,
                      minHeight: 0,
                    }}
                  >
                    + {cond}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* DM controls — damage / heal / set */}
        {isDM && (
          <div>
            <div style={{ fontSize: 9, color: 'var(--t-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
              DM Controls
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginBottom: 6 }}>
              {(['damage', 'heal', 'set'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setHpMode(m)}
                  style={{
                    padding: '6px 4px',
                    background: hpMode === m
                      ? (m === 'damage' ? 'rgba(248,113,113,0.25)' : m === 'heal' ? 'rgba(52,211,153,0.25)' : 'rgba(167,139,250,0.25)')
                      : 'var(--c-raised)',
                    border: `1px solid ${hpMode === m
                      ? (m === 'damage' ? 'rgba(248,113,113,0.6)' : m === 'heal' ? 'rgba(52,211,153,0.6)' : 'rgba(167,139,250,0.6)')
                      : 'var(--c-border)'}`,
                    borderRadius: 'var(--r-sm, 4px)',
                    color: hpMode === m
                      ? (m === 'damage' ? '#f87171' : m === 'heal' ? '#34d399' : '#a78bfa')
                      : 'var(--t-2)',
                    fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
                    textTransform: 'capitalize' as const, cursor: 'pointer',
                    minHeight: 0,
                  }}
                >{m}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                type="number"
                value={hpInput}
                onChange={(e) => setHpInput(e.target.value)}
                placeholder="Amount"
                min={0}
                style={{
                  flex: 1, padding: '6px 8px',
                  background: 'var(--c-raised)',
                  border: '1px solid var(--c-border)',
                  borderRadius: 'var(--r-sm, 4px)',
                  color: 'var(--t-1)',
                  fontFamily: 'var(--ff-body)', fontSize: 12,
                  boxSizing: 'border-box' as const,
                  outline: 'none',
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') applyHp(); }}
              />
              <button
                onClick={applyHp}
                disabled={applying || !hpInput.trim()}
                style={{
                  padding: '6px 12px',
                  background: hpMode === 'damage' ? 'rgba(248,113,113,0.18)'
                    : hpMode === 'heal' ? 'rgba(52,211,153,0.18)'
                    : 'rgba(167,139,250,0.18)',
                  border: `1px solid ${hpMode === 'damage' ? 'rgba(248,113,113,0.55)'
                    : hpMode === 'heal' ? 'rgba(52,211,153,0.55)'
                    : 'rgba(167,139,250,0.55)'}`,
                  borderRadius: 'var(--r-sm, 4px)',
                  color: hpMode === 'damage' ? '#f87171'
                    : hpMode === 'heal' ? '#34d399'
                    : '#a78bfa',
                  fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
                  cursor: applying || !hpInput.trim() ? 'not-allowed' : 'pointer',
                  opacity: applying || !hpInput.trim() ? 0.5 : 1,
                  minHeight: 0,
                  textTransform: 'capitalize' as const,
                }}
              >
                {applying ? '…' : hpMode}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
