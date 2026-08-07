// Extracted verbatim from BattleMapV2.tsx (v2.636 decomposition step 3).
// See that file's header changelog for this code's full history.

import { useCallback, useState } from 'react';
import type { BattleMapV2Props } from '../BattleMapV2';

/**
 * v2.231.0 — Party Vitals strip.
 *
 * Always-on horizontal strip rendered BELOW the canvas wrapper
 * inside BattleMapV2. Read-only at-a-glance view: every PC in the
 * campaign appears as a card with name + HP bar + AC chip + spell-
 * slot pips (only for casters with at least one slot defined).
 *
 * No interactions — clicks/edits go through TokenQuickPanel (DM)
 * or the character's own sheet (player). This is purely "look,
 * don't touch" so the table stays compact and DMs can scan vitals
 * mid-combat without opening anything.
 *
 * Hides itself when there are no PCs to avoid an empty bar.
 */
// v2.270.0 — localStorage key for the floating party panel's
// collapsed state. Per-user (not per-campaign) since the preference
// is about UI density rather than table-specific state.
export const PARTY_PANEL_COLLAPSED_KEY = 'dndkeep:battlemap_v2:party_panel_collapsed';

export function PartyVitalsBar(props: {
  characters: BattleMapV2Props['playerCharacters'];
  /** v2.239.0 — clicking a card asks the parent to pan the map to
   *  this character's linked token. Optional: if absent (e.g. embed
   *  contexts where the bar is purely informational), the cards
   *  render non-interactive. */
  onCharacterClick?: (characterId: string) => void;
}) {
  const { characters, onCharacterClick } = props;

  // v2.270.0 — collapsed state, persisted across sessions. Lazy-init
  // from localStorage so we don't flash the wrong state on mount.
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(PARTY_PANEL_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggleCollapsed = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      try {
        if (next) localStorage.setItem(PARTY_PANEL_COLLAPSED_KEY, '1');
        else localStorage.removeItem(PARTY_PANEL_COLLAPSED_KEY);
      } catch { /* ignore quota / disabled-storage errors */ }
      return next;
    });
  }, []);

  if (!characters || characters.length === 0) return null;

  // v2.270.0 — common positioning for both collapsed handle and
  // expanded panel. Anchored bottom-left of the parent (the canvas
  // wrapper, which is position: relative). Bottom inset of 12px keeps
  // it off the canvas edge; left inset matches.
  const anchorStyle: React.CSSProperties = {
    position: 'absolute' as const,
    bottom: 12,
    left: 12,
    zIndex: 30, // above canvas, below modals (200+) and tooltips
  };

  if (collapsed) {
    // Compact handle: just a "Party (N)" pill. Click to expand.
    return (
      <button
        onClick={toggleCollapsed}
        title="Show party vitals"
        style={{
          ...anchorStyle,
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 12px',
          background: 'rgba(15,16,18,0.85)',
          backdropFilter: 'blur(6px)',
          border: '1px solid var(--c-border)',
          borderRadius: 999,
          fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase' as const,
          color: 'var(--t-2)',
          cursor: 'pointer',
          transition: 'background 0.12s, border-color 0.12s',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(15,16,18,0.95)';
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--c-border-m)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(15,16,18,0.85)';
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--c-border)';
        }}
      >
        <span>⬡</span>
        <span>Party · {characters.length}</span>
        <span style={{ opacity: 0.6, fontSize: 9 }}>▴</span>
      </button>
    );
  }

  return (
    <div
      style={{
        ...anchorStyle,
        // v2.270.0 — size to content with a max-width cap. Anchored
        // bottom-left; the help hint sits at bottom-right and the
        // two coexist as long as neither pushes past the other. The
        // max-width cap (calc 100% - 240px) leaves clearance for the
        // hint at the right; on narrow viewports the panel will
        // scroll its cards horizontally before bleeding into the
        // hint zone.
        maxWidth: 'calc(100% - 240px)',
        display: 'flex',
        alignItems: 'stretch',
        gap: 8,
        padding: '8px 12px',
        // Translucent background so the canvas reads through. Higher
        // opacity than the cards inside so the panel chrome remains
        // legible.
        background: 'rgba(15,16,18,0.78)',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--c-border)',
        borderRadius: 'var(--r-md, 8px)',
        overflowX: 'auto' as const,
        boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
      }}
    >
      <div style={{
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        padding: '0 6px',
        borderRight: '1px solid var(--c-border)',
        paddingRight: 12,
      }}>
        <div style={{
          fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 800,
          letterSpacing: '0.12em', textTransform: 'uppercase' as const,
          color: 'var(--t-3)',
        }}>
          Party
        </div>
        <button
          onClick={toggleCollapsed}
          title="Collapse party panel"
          style={{
            marginTop: 4,
            padding: '2px 8px',
            background: 'transparent',
            border: '1px solid var(--c-border)',
            borderRadius: 'var(--r-sm, 4px)',
            color: 'var(--t-3)',
            fontSize: 10, fontWeight: 700,
            cursor: 'pointer',
            letterSpacing: '0.04em',
            transition: 'background 0.12s, color 0.12s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--c-raised)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--t-1)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--t-3)';
          }}
        >
          ▾ Hide
        </button>
      </div>
      {characters.map(c => {
        const pct = c.max_hp > 0 ? Math.max(0, Math.min(1, c.current_hp / c.max_hp)) : 0;
        const hpColor = pct > 0.5 ? '#34d399' : pct > 0.25 ? '#fbbf24' : pct > 0 ? '#f87171' : '#6b7280';
        // v2.280.0 — Spell slots removed from the in-canvas party panel.
        // Per-DM feedback: slot dots clutter the at-a-glance HP read,
        // and DMs cross-reference slots in the character sheet anyway.
        // The full slot UI continues to live in CharacterSheet
        // (player-side) and PartyDashboard (DM Party tab); only this
        // floating canvas overlay is HP-only now.
        return (
          <div
            key={c.id}
            onClick={onCharacterClick ? () => onCharacterClick(c.id) : undefined}
            title={onCharacterClick ? `Pan map to ${c.name}` : undefined}
            style={{
              flexShrink: 0,
              minWidth: 160,
              display: 'flex',
              flexDirection: 'column' as const,
              gap: 4,
              padding: '6px 10px',
              background: 'rgba(15,16,18,0.5)',
              border: '1px solid var(--c-border)',
              borderRadius: 'var(--r-sm, 4px)',
              cursor: onCharacterClick ? 'pointer' : 'default',
              transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={onCharacterClick ? (e) => {
              (e.currentTarget as HTMLDivElement).style.background = 'rgba(96,165,250,0.08)';
              (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(96,165,250,0.4)';
            } : undefined}
            onMouseLeave={onCharacterClick ? (e) => {
              (e.currentTarget as HTMLDivElement).style.background = 'rgba(15,16,18,0.5)';
              (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--c-border)';
            } : undefined}
          >
            <div style={{
              display: 'flex', alignItems: 'baseline', gap: 6, justifyContent: 'space-between',
            }}>
              <span style={{
                fontFamily: 'var(--ff-body)',
                fontSize: 12, fontWeight: 700,
                color: 'var(--t-1)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {c.name}
              </span>
              <span style={{
                flexShrink: 0,
                fontFamily: 'var(--ff-stat)',
                fontSize: 10, fontWeight: 700,
                color: 'var(--t-3)',
                padding: '1px 6px',
                background: 'rgba(96,165,250,0.15)',
                border: '1px solid rgba(96,165,250,0.4)',
                borderRadius: 'var(--r-sm, 4px)',
              }} title="Armor Class">
                AC {c.armor_class}
              </span>
            </div>

            {/* HP bar */}
            <div>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                fontSize: 9, fontWeight: 700, color: 'var(--t-3)',
                letterSpacing: '0.04em', textTransform: 'uppercase' as const,
              }}>
                <span>HP</span>
                <span style={{ color: hpColor }}>{c.current_hp}<span style={{ color: 'var(--t-3)' }}>/{c.max_hp}</span></span>
              </div>
              <div style={{
                height: 5,
                background: 'rgba(15,16,18,0.85)',
                border: '1px solid var(--c-border)',
                borderRadius: 3,
                overflow: 'hidden' as const,
                marginTop: 2,
              }}>
                <div style={{
                  width: `${pct * 100}%`, height: '100%',
                  background: hpColor, transition: 'width 0.2s, background 0.2s',
                }} />
              </div>
            </div>

            {/* v2.280.0 — Spell slots removed from this overlay. Slots
                continue to render in the full character sheet and the
                Party tab; the floating canvas panel is HP+AC only. */}
          </div>
        );
      })}
    </div>
  );
}
