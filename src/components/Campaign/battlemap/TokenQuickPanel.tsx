// Extracted verbatim from BattleMapV2.tsx (v2.636 decomposition step 3).
// See that file's header changelog for this code's full history.

import { abilityModifier } from '../../../rules/abilities';
import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import ChecksPanel from '../ChecksPanel';
import type { Character } from '../../../types';
import { useToast } from '../../shared/Toast';
import { ALL_CONDITIONS, COND_COLOR } from './shared';

/**
 * v2.226 — Token Quick Panel.
 *
 * Compact inline panel that opens when the DM (or any user) left-clicks
 * a token without dragging it. Shows core combat-relevant character
 * info at a glance: HP, AC, Speed, Conditions. Provides quick actions:
 *   - Damage / Heal / Set HP (DM only — writes to characters table)
 *   - Open full Character Sheet (router navigate)
 *   - Close
 *
 * Scope of v2.226: read-only HP/AC/Speed display + Damage/Heal/Set
 * controls + Open Sheet link. Conditions are shown as read-only chips.
 * v2.227+ will add inline condition apply/remove (which routes through
 * the combat-participants table — different from the characters table
 * that owns HP). Until then, condition changes happen on the full
 * character sheet or via the existing combat encounter UI.
 *
 * For tokens NOT linked to a character (NPCs, plain markers), the
 * panel is not opened; right-click context menu remains the way to
 * edit those.
 *
 * Position: anchored near the click point, but clamped so it never
 * goes off-screen. The panel has a fixed width and positions
 * itself with position:fixed.
 */
export function TokenQuickPanel(props: {
  character: {
    id: string;
    name: string;
    class_name: string;
    level: number;
    current_hp: number;
    max_hp: number;
    armor_class: number;
    active_conditions: string[];
    strength: number;
    dexterity: number;
    constitution: number;
    intelligence: number;
    wisdom: number;
    charisma: number;
    speed: number;
    // v2.229 — proficiency arrays so ChecksPanel can compute skill /
    // save modifiers and route Prompt Player correctly.
    saving_throw_proficiencies?: import('../../../types').AbilityKey[];
    skill_proficiencies?: string[];
    skill_expertises?: string[];
  };
  anchorX: number;
  anchorY: number;
  isDM: boolean;
  // v2.229 — needed for ChecksPanel's "Prompt Player" → campaign_chat insert.
  campaignId: string;
  onClose: () => void;
  onOpenSheet: () => void;
}) {
  const { character: c, anchorX, anchorY, isDM, campaignId, onClose, onOpenSheet } = props;
  const { showToast } = useToast();
  const [hpInput, setHpInput] = useState('');
  const [hpMode, setHpMode] = useState<'damage' | 'heal' | 'set'>('damage');
  const [applying, setApplying] = useState(false);
  // v2.227 — guard for in-flight condition writes. Prevents double-click
  // from racing two updates against an out-of-date base array.
  const [condBusy, setCondBusy] = useState(false);

  // v2.280.0 — Per-DM collapse state for the Default Stats and Ability
  // Checks sections. Persisted in localStorage so the DM's preference
  // survives page reloads. Default `false` (sections start expanded)
  // so a first-time user sees the full panel; once they collapse it
  // the choice sticks. Stored under per-section keys so toggling one
  // doesn't affect the other.
  const STATS_COLLAPSED_KEY = 'dndkeep:tokenpanel:stats_collapsed';
  const CHECKS_COLLAPSED_KEY = 'dndkeep:tokenpanel:checks_collapsed';
  const [statsCollapsed, setStatsCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try { return localStorage.getItem(STATS_COLLAPSED_KEY) === '1'; } catch { return false; }
  });
  const [checksCollapsed, setChecksCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try { return localStorage.getItem(CHECKS_COLLAPSED_KEY) === '1'; } catch { return false; }
  });
  const toggleStatsCollapsed = () => {
    setStatsCollapsed(prev => {
      const next = !prev;
      try {
        if (next) localStorage.setItem(STATS_COLLAPSED_KEY, '1');
        else localStorage.removeItem(STATS_COLLAPSED_KEY);
      } catch { /* ignore quota / storage errors */ }
      return next;
    });
  };
  const toggleChecksCollapsed = () => {
    setChecksCollapsed(prev => {
      const next = !prev;
      try {
        if (next) localStorage.setItem(CHECKS_COLLAPSED_KEY, '1');
        else localStorage.removeItem(CHECKS_COLLAPSED_KEY);
      } catch { /* ignore */ }
      return next;
    });
  };

  // Esc closes the panel.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // HP percent for the bar fill.
  const pct = c.max_hp > 0 ? Math.max(0, Math.min(1, c.current_hp / c.max_hp)) : 0;
  const hpColor = pct > 0.5 ? '#34d399' : pct > 0.25 ? '#fbbf24' : pct > 0 ? '#f87171' : '#6b7280';

  // Position calc: clamp inside viewport so panel doesn't fall off
  // the bottom or right edge. Width 280, max height ~360.
  const PANEL_W = 280;
  // v2.229 — bumped from 380 to 600 because the Checks panel adds
  // substantial content (skills + raw + saves + adv/dis/DC + actions).
  // With overflow:auto the panel still scrolls past this if needed.
  const PANEL_H = 600;
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

  // Modifier helper — D&D 5e ability modifier formula.
  const mod = (score: number) => abilityModifier(score);
  const modStr = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

  async function applyHp() {
    const n = parseInt(hpInput.trim(), 10);
    if (!Number.isFinite(n) || n <= 0) return;
    setApplying(true);
    try {
      let next = c.current_hp;
      if (hpMode === 'damage') next = Math.max(0, c.current_hp - n);
      else if (hpMode === 'heal') next = Math.min(c.max_hp, c.current_hp + n);
      else next = Math.max(0, Math.min(c.max_hp, n));
      const { error } = await supabase
        .from('characters')
        .update({ current_hp: next })
        .eq('id', c.id);
      if (error) {
        console.error('[TokenQuickPanel] HP update failed', error);
        showToast('Failed to update HP. Check console for details.', 'error');
        return;
      }
      setHpInput('');
    } finally {
      setApplying(false);
    }
  }

  // v2.227 — Direct write to characters.active_conditions (matches
  // v1's approach in BattleMap.tsx). Cascade rules from
  // src/lib/conditions.ts (Unconscious → Prone+Incapacitated, etc.)
  // are NOT applied here — same trade-off v1 makes. Cascades only
  // fire through the encounter pipeline (combat_participants); the
  // map-side panel is for quick adjustments, not full event-driven
  // condition changes. v2.228+ can route through applyCondition()
  // when a combat encounter is active.
  async function addCondition(cond: string) {
    if (condBusy) return;
    const current = c.active_conditions ?? [];
    if (current.includes(cond)) return;
    setCondBusy(true);
    try {
      const next = [...current, cond];
      const { error } = await supabase
        .from('characters')
        .update({ active_conditions: next })
        .eq('id', c.id);
      if (error) {
        console.error('[TokenQuickPanel] addCondition failed', error);
        showToast(`Failed to apply ${cond}.`, 'error');
      }
    } finally {
      setCondBusy(false);
    }
  }

  async function removeCondition(cond: string) {
    if (condBusy) return;
    const current = c.active_conditions ?? [];
    if (!current.includes(cond)) return;
    setCondBusy(true);
    try {
      const next = current.filter(x => x !== cond);
      const { error } = await supabase
        .from('characters')
        .update({ active_conditions: next })
        .eq('id', c.id);
      if (error) {
        console.error('[TokenQuickPanel] removeCondition failed', error);
        showToast(`Failed to remove ${cond}.`, 'error');
      }
    } finally {
      setCondBusy(false);
    }
  }

  function stop(e: React.MouseEvent) { e.stopPropagation(); }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9997,
        // Backdrop is invisible but catches outside clicks to close.
      }}
      onMouseDown={onClose}
    >
      <div
        style={{
          position: 'fixed',
          left, top,
          width: PANEL_W,
          maxHeight: PANEL_H,
          overflowY: 'auto',
          background: 'var(--c-card)',
          border: '1px solid var(--c-border)',
          borderRadius: 'var(--r-lg, 12px)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(167,139,250,0.25)',
          fontFamily: 'var(--ff-body)',
          color: 'var(--t-1)',
          padding: 14,
        }}
        onMouseDown={stop}
      >
        {/* Header — name, class/level, close */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 14, fontWeight: 700, color: 'var(--t-1)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {c.name}
            </div>
            <div style={{ fontSize: 10, color: 'var(--t-3)', letterSpacing: '0.04em', marginTop: 2 }}>
              {c.class_name} · Level {c.level}
            </div>
          </div>
          <button
            onClick={onClose}
            title="Close"
            style={{
              width: 24, height: 24, padding: 0,
              background: 'transparent', border: 'none',
              color: 'var(--t-3)', cursor: 'pointer',
              fontSize: 16, lineHeight: 1,
            }}
          >×</button>
        </div>

        {/* HP bar */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>HP</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: hpColor }}>
              {c.current_hp}<span style={{ fontSize: 10, color: 'var(--t-3)' }}>/{c.max_hp}</span>
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

        {/* v2.280.0 — Reordered. New flow:
              1. Header (above)
              2. HP bar (above)
              3. DM Controls (damage/heal/set)
              4. Open Character Sheet button (immediately below DM controls)
              5. Apply Condition picker (DM-only)
              6. Default Stats (AC, Speed, ability mods) — COLLAPSIBLE
              7. Ability Checks (ChecksPanel) — COLLAPSIBLE
              8. Active Conditions chips — moved to the bottom
            Pre-2.280 layout had Default Stats and ability mods up
            top (always visible) and Conditions just below them; that
            burned vertical real estate on info DMs rarely act on
            mid-combat. The frequently-needed surfaces (HP, DM
            controls, Open Sheet) are now above the fold; the
            informational surfaces collapse to a one-line header. */}

        {/* DM controls — damage / heal / set */}
        {isDM && (
          <div style={{ marginBottom: 12 }}>
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
                  flex: 1,
                  padding: '6px 8px',
                  background: 'var(--c-raised)',
                  border: '1px solid var(--c-border)',
                  borderRadius: 'var(--r-sm, 4px)',
                  color: 'var(--t-1)',
                  fontFamily: 'var(--ff-body)', fontSize: 12,
                  boxSizing: 'border-box' as const,
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') applyHp(); }}
              />
              <button
                onClick={applyHp}
                disabled={applying || !hpInput.trim()}
                style={{
                  padding: '6px 14px',
                  background: 'rgba(167,139,250,0.22)',
                  border: '1px solid rgba(167,139,250,0.5)',
                  borderRadius: 'var(--r-sm, 4px)',
                  color: '#a78bfa',
                  fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
                  cursor: (applying || !hpInput.trim()) ? 'not-allowed' : 'pointer',
                  opacity: (applying || !hpInput.trim()) ? 0.5 : 1,
                }}
              >
                {applying ? '…' : 'Apply'}
              </button>
            </div>
          </div>
        )}

        {/* v2.280.0 — Open full character sheet, moved up to sit
            directly below the DM Controls per spec. Renders for both
            DM and player surfaces; the navigation target itself
            handles permissions (RLS gates write access there). */}
        <button
          onClick={onOpenSheet}
          style={{
            width: '100%',
            padding: '8px 12px',
            background: 'rgba(167,139,250,0.15)',
            border: '1px solid rgba(167,139,250,0.45)',
            borderRadius: 'var(--r-sm, 4px)',
            color: '#a78bfa',
            fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
            letterSpacing: '0.04em', cursor: 'pointer',
            marginBottom: 12,
          }}
        >
          Open Character Sheet →
        </button>

        {/* v2.227 — Apply Condition picker (DM only). Lists every
            condition NOT already active as a clickable color chip;
            click → write to characters.active_conditions → Realtime
            updates the parent → this panel re-renders with the
            condition moved into the "active" chip row above. */}
        {isDM && (() => {
          const activeSet = new Set(c.active_conditions ?? []);
          const remaining = ALL_CONDITIONS.filter(cond => !activeSet.has(cond));
          if (remaining.length === 0) return null;
          return (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9, color: 'var(--t-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
                Apply Condition
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 3 }}>
                {remaining.map(cond => {
                  const color = COND_COLOR[cond] ?? '#9ca3af';
                  return (
                    <button
                      key={cond}
                      onClick={() => addCondition(cond)}
                      title={`Apply ${cond}`}
                      disabled={condBusy}
                      style={{
                        padding: '2px 7px',
                        background: color + '11',
                        border: `1px solid ${color}44`,
                        borderRadius: 999,
                        fontSize: 9, fontWeight: 600,
                        color,
                        fontFamily: 'var(--ff-body)',
                        cursor: condBusy ? 'wait' : 'pointer',
                        opacity: condBusy ? 0.6 : 1,
                      }}
                    >
                      {cond}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* v2.280.0 — Default Stats: collapsible. AC + Speed grid +
            STR/DEX/CON/INT/WIS/CHA mods. Default expanded; collapsed
            state persisted per-DM in localStorage. The header row is
            click-to-toggle so the affordance is consistent with the
            Ability Checks section below. */}
        <div style={{ marginBottom: 12 }}>
          <div
            onClick={toggleStatsCollapsed}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              cursor: 'pointer', userSelect: 'none' as const, marginBottom: 6,
            }}
            title={statsCollapsed ? 'Expand default stats' : 'Collapse default stats'}
          >
            <div style={{ fontSize: 9, color: 'var(--t-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Default Stats
            </div>
            <span style={{ fontSize: 10, color: 'var(--t-3)' }}>
              {statsCollapsed ? '▸' : '▾'}
            </span>
          </div>
          {!statsCollapsed && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                {[
                  { label: 'AC', value: c.armor_class },
                  { label: 'Speed', value: `${c.speed} ft` },
                ].map(stat => (
                  <div key={stat.label} style={{
                    padding: '6px 8px',
                    background: 'rgba(15,16,18,0.5)',
                    border: '1px solid var(--c-border)',
                    borderRadius: 'var(--r-sm, 4px)',
                    textAlign: 'center' as const,
                  }}>
                    <div style={{ fontSize: 9, color: 'var(--t-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                      {stat.label}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t-1)', marginTop: 2 }}>
                      {stat.value}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
                {[
                  ['STR', c.strength],
                  ['DEX', c.dexterity],
                  ['CON', c.constitution],
                  ['INT', c.intelligence],
                  ['WIS', c.wisdom],
                  ['CHA', c.charisma],
                ].map(([k, v]) => {
                  const m = mod(v as number);
                  return (
                    <div key={k as string} style={{
                      padding: '4px 0',
                      background: 'rgba(15,16,18,0.5)',
                      border: '1px solid var(--c-border)',
                      borderRadius: 'var(--r-sm, 4px)',
                      textAlign: 'center' as const,
                    }}>
                      <div style={{ fontSize: 8, color: 'var(--t-3)', letterSpacing: '0.04em' }}>{k as string}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-1)' }}>{modStr(m)}</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* v2.229 — Checks panel (DM only). v2.280.0: collapsible.
            Default expanded; persisted in localStorage. Same
            ChecksPanel component the Party tab renders, so the two
            surfaces stay structurally identical: skill picker, raw
            ability buttons, save buttons, adv/dis/DC controls,
            Roll Secret + Prompt Player. The character object is
            passed as-is (cast to Character — the slim shape from
            playerCharacters carries every field ChecksPanel reads). */}
        {isDM && (
          <div style={{ marginBottom: 12, paddingTop: 10, borderTop: '1px solid var(--c-border)' }}>
            <div
              onClick={toggleChecksCollapsed}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                cursor: 'pointer', userSelect: 'none' as const, marginBottom: 6,
              }}
              title={checksCollapsed ? 'Expand ability checks' : 'Collapse ability checks'}
            >
              <div style={{ fontSize: 9, color: 'var(--t-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Ability Checks
              </div>
              <span style={{ fontSize: 10, color: 'var(--t-3)' }}>
                {checksCollapsed ? '▸' : '▾'}
              </span>
            </div>
            {!checksCollapsed && (
              <ChecksPanel character={c as unknown as Character} campaignId={campaignId} />
            )}
          </div>
        )}

        {/* v2.227 — Active conditions chips, moved to bottom in v2.280.
            DM clicks the ✕ to remove; players see them read-only.
            Color-coded via COND_COLOR matching v1's palette. Writes
            flow through the characters table directly (same path v1
            uses) — Realtime propagates back to this panel and to
            character sheets. Bottom placement is per-spec: conditions
            are status info, not the primary actionable surface. */}
        {c.active_conditions && c.active_conditions.length > 0 && (
          <div>
            <div style={{ fontSize: 9, color: 'var(--t-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
              Conditions
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 4 }}>
              {c.active_conditions.map(cond => {
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
          </div>
        )}
      </div>
    </div>
  );
}
