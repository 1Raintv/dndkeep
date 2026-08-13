// Extracted verbatim from BattleMapV2.tsx (v2.636 decomposition step 3).
// See that file's header changelog for this code's full history.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBattleMapStore, type Token } from '../../../lib/stores/battleMapStore';
import * as tokensApi from '../../../lib/api/tokensApiRouter';
import { useModal } from '../../shared/Modal';
import { SIZE_OPTIONS, TOKEN_COLORS, type ContextMenuState } from './shared';

// v2.653.0 — the eight facings, 0° = up (matches Token.rotation's
// docstring and the renderer's notch). Same 45° increments the AoE
// cone/line picker snaps to.
const FACINGS: ReadonlyArray<{ deg: number; label: string; arrow: string }> = [
  { deg: 0,   label: 'North',     arrow: '↑' },
  { deg: 45,  label: 'Northeast', arrow: '↗' },
  { deg: 90,  label: 'East',      arrow: '→' },
  { deg: 135, label: 'Southeast', arrow: '↘' },
  { deg: 180, label: 'South',     arrow: '↓' },
  { deg: 225, label: 'Southwest', arrow: '↙' },
  { deg: 270, label: 'West',      arrow: '←' },
  { deg: 315, label: 'Northwest', arrow: '↖' },
];

export function TokenContextMenu(props: {
  state: ContextMenuState;
  // v2.282: gate Hide/Show on DM. Players who somehow trigger the
  // menu (e.g., right-clicking their own character token, since the
  // canvas right-click isn't currently isDM-gated) still see the
  // menu but get a slimmer set of actions — RLS would reject most
  // writes anyway, so showing them an action that 500s is worse
  // than not showing it.
  isDM: boolean;
  // v2.495.0 — Combat Phase 3.1: campaignId is required on every
  // tokensApi router call so the flag can be resolved per-call. The
  // menu calls updateToken (Hide/Show, rename, color, size) and
  // deleteToken from its handlers. Threaded through from BattleMapV2.
  campaignId: string;
  // v2.653.0 — cell size in world px, for the Duplicate offset (one
  // cell down-right). Lives on the scene, not the store.
  gridSizePx: number;
  onClose: () => void;
  onRequestUpload: (tokenId: string) => void;
  // v2.222 — when set, the menu shows a "View Character Sheet" item
  // for tokens linked to a character. Caller handles the navigate.
  onOpenCharacter?: (characterId: string) => void;
  // v2.358.0 — opens the quick panel that pre-v2.358 left-click used
  // to open auto. Caller resolves which panel based on token type
  // (PC quick panel for characterId, NPC quick panel for npcId, or
  // bare context menu for unlinked). Lets users still get to the
  // panel after we made plain left-click into "just select."
  onOpenQuickPanel?: (tokenId: string) => void;
  // v2.413.0 — drives the "Grant Player Control" submenu. The DM
  // picks a character; the token's player_id is set to that
  // character's owning user_id, granting drag rights via the
  // existing scene_tokens RLS UPDATE policy.
  playerCharacters?: Array<{
    id: string;
    name: string;
    user_id?: string | null;
  }>;
}) {
  const { state, isDM, campaignId, gridSizePx, onClose, onRequestUpload, onOpenCharacter, onOpenQuickPanel, playerCharacters } = props;
  const token = useBattleMapStore(s => s.tokens[state.tokenId]);
  const removeToken = useBattleMapStore(s => s.removeToken);
  const addToken = useBattleMapStore(s => s.addToken);
  const updateTokenFields = useBattleMapStore(s => s.updateTokenFields);
  const [submenu, setSubmenu] = useState<'none' | 'size' | 'color' | 'grant' | 'facing' | 'light'>('none');
  // v2.241 — modal handle for the rename prompt.
  const { prompt: promptModal } = useModal();

  useEffect(() => {
    function handler() {
      onClose();
    }
    function keyHandler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    const id = setTimeout(() => {
      window.addEventListener('mousedown', handler);
      window.addEventListener('keydown', keyHandler);
    }, 0);
    return () => {
      clearTimeout(id);
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('keydown', keyHandler);
    };
  }, [onClose]);

  if (!token) return null;

  // v2.213: commit discrete edits to DB after optimistic local update.
  function applyPatch(patch: Partial<Token>) {
    updateTokenFields(state.tokenId, patch);
    tokensApi.updateToken(state.tokenId, patch, { campaignId }).catch(err =>
      console.error('[BattleMapV2] token update commit failed', err)
    );
  }

  function applyDelete() {
    removeToken(state.tokenId);
    tokensApi.deleteToken(state.tokenId, { campaignId }).catch(err =>
      console.error('[BattleMapV2] token delete commit failed', err)
    );
  }

  /**
   * v2.653.0 — Duplicate. Copies the token one cell down-right, which
   * is the Roll20 convention and keeps the copy visible instead of
   * hidden exactly beneath the original.
   *
   * The copy is deliberately NOT linked to whatever the original was
   * linked to. `characterId` would put a second token for one PC on the
   * map, and both would fight over the same HP bar and turn ring;
   * `creatureId` is the sharper trap, because a creature-linked token
   * gets its own combatant + HP pool through the v2.310 sync trigger,
   * so a duplicate would silently spawn a second stat block the DM
   * never asked for. Duplicating is for scenery and quick mobs — the
   * roster's "Add NPCs" path is what makes a real second creature.
   */
  function applyDuplicate() {
    const copy: Token = {
      ...token,
      id: (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `token-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      x: token.x + gridSizePx,
      y: token.y + gridSizePx,
      characterId: null,
      npcId: null,
      creatureId: null,
      combatantId: null,
      // A duplicate is the DM's staging copy — don't hand control of it
      // to whoever could drive the original.
      playerId: null,
    };
    addToken(copy);
    tokensApi.createToken(copy, { campaignId }).catch(err => {
      console.error('[BattleMapV2] token duplicate commit failed', err);
      removeToken(copy.id);
    });
  }

  const menuWidth = 180;
  const menuHeight = 240;
  const leftRaw = state.clientX;
  const topRaw = state.clientY;
  const left = Math.min(leftRaw, (typeof window !== 'undefined' ? window.innerWidth : 1200) - menuWidth - 8);
  const top = Math.min(topRaw, (typeof window !== 'undefined' ? window.innerHeight : 800) - menuHeight - 8);

  const menuBaseStyle: React.CSSProperties = {
    position: 'fixed',
    left,
    top,
    minWidth: menuWidth,
    background: 'var(--c-card)',
    border: '1px solid var(--c-border)',
    borderRadius: 'var(--r-md, 8px)',
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    fontFamily: 'var(--ff-body)',
    fontSize: 12,
    color: 'var(--t-1)',
    padding: 4,
    zIndex: 9999,
  };

  const itemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 10px',
    cursor: 'pointer',
    borderRadius: 'var(--r-sm, 4px)',
  };

  function stop(e: React.MouseEvent) {
    e.stopPropagation();
  }

  // v2.663.0 — carried light. Only bites in a Dark scene, where sight
  // range became darkvision-driven: a creature with neither darkvision
  // nor a light genuinely sees nothing, and this is how the DM hands
  // them a torch. Radii are the RAW light-source totals (bright + dim),
  // since the fog is binary and cannot draw the two bands separately.
  if (submenu === 'light') {
    const LIGHTS: ReadonlyArray<{ ft: number; label: string; hint: string }> = [
      { ft: 0,   label: 'None',    hint: 'carries no light' },
      { ft: 20,  label: 'Candle',  hint: '5 ft bright + 5 dim' },
      { ft: 40,  label: 'Torch',   hint: '20 ft bright + 20 dim' },
      { ft: 60,  label: 'Lantern', hint: '30 ft bright + 30 dim' },
      { ft: 120, label: 'Daylight', hint: '60 ft bright + 60 dim' },
    ];
    const current = (token as any).lightRadiusFt ?? 0;
    return createPortal(
      <div style={menuBaseStyle} onMouseDown={stop}>
        <div style={{ ...itemStyle, color: 'var(--t-3)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
          Carried light
        </div>
        {LIGHTS.map(l => (
          <div
            key={l.ft}
            style={{
              ...itemStyle,
              background: current === l.ft ? 'rgba(167,139,250,0.12)' : undefined,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(167,139,250,0.18)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = current === l.ft ? 'rgba(167,139,250,0.12)' : 'transparent'; }}
            onClick={() => { applyPatch({ lightRadiusFt: l.ft } as any); onClose(); }}
          >
            <span>
              {l.label}
              <span style={{ color: 'var(--t-3)', fontSize: 10, marginLeft: 6 }}>
                {l.ft === 0 ? l.hint : `${l.ft} ft · ${l.hint}`}
              </span>
            </span>
            {current === l.ft && <span style={{ color: '#a78bfa', fontSize: 10 }}>✓</span>}
          </div>
        ))}
      </div>,
      document.body,
    );
  }

  if (submenu === 'size') {
    return createPortal(
      <div style={menuBaseStyle} onMouseDown={stop}>
        <div style={{ ...itemStyle, color: 'var(--t-3)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
          Size
        </div>
        {SIZE_OPTIONS.map(sz => (
          <div
            key={sz}
            style={{
              ...itemStyle,
              background: token.size === sz ? 'rgba(167,139,250,0.12)' : undefined,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(167,139,250,0.18)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = token.size === sz ? 'rgba(167,139,250,0.12)' : 'transparent'; }}
            onClick={() => { applyPatch({ size: sz }); onClose(); }}
          >
            <span style={{ textTransform: 'capitalize' as const }}>{sz}</span>
            {token.size === sz && <span style={{ color: '#a78bfa', fontSize: 10 }}>✓</span>}
          </div>
        ))}
      </div>,
      document.body,
    );
  }

  // v2.653.0 — Facing submenu. Eight compass points, matching the
  // 8-way direction snapping the cone/line AoE picker already uses, so
  // "facing" means the same thing everywhere on this map. Writes
  // Token.rotation, which has existed since v2.212 but had no UI and
  // no renderer until now.
  if (submenu === 'facing') {
    const current = ((token.rotation ?? 0) % 360 + 360) % 360;
    return createPortal(
      <div style={menuBaseStyle} onMouseDown={stop}>
        <div style={{ ...itemStyle, color: 'var(--t-3)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
          Facing
        </div>
        {FACINGS.map(({ deg, label, arrow }) => {
          const active = current === deg;
          return (
            <div
              key={deg}
              style={{ ...itemStyle, background: active ? 'rgba(167,139,250,0.12)' : undefined }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(167,139,250,0.18)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = active ? 'rgba(167,139,250,0.12)' : 'transparent'; }}
              onClick={() => { applyPatch({ rotation: deg }); onClose(); }}
            >
              <span><span style={{ display: 'inline-block', width: 16 }}>{arrow}</span> {label}</span>
              {active && <span style={{ color: '#a78bfa', fontSize: 10 }}>✓</span>}
            </div>
          );
        })}
      </div>,
      document.body,
    );
  }

  // v2.413.0 — Grant Player Control submenu. Lists campaign members
  // (via playerCharacters which carry user_id). Pick one to write
  // scene_tokens.player_id; pick "(no one)" to clear the grant.
  if (submenu === 'grant') {
    const currentGrant = (token as any).playerId as string | null;
    return createPortal(
      <div style={menuBaseStyle} onMouseDown={stop}>
        <div style={{ ...itemStyle, color: 'var(--t-3)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
          Player Control
        </div>
        <div
          style={{
            ...itemStyle,
            background: !currentGrant ? 'rgba(167,139,250,0.12)' : undefined,
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(167,139,250,0.18)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = !currentGrant ? 'rgba(167,139,250,0.12)' : 'transparent'; }}
          onClick={() => { applyPatch({ playerId: null } as any); onClose(); }}
        >
          <span style={{ color: 'var(--t-2)' }}>(no one)</span>
          {!currentGrant && <span style={{ color: '#a78bfa', fontSize: 10 }}>✓</span>}
        </div>
        {(playerCharacters ?? []).map(pc => {
          if (!pc.user_id) return null;
          const active = currentGrant === pc.user_id;
          return (
            <div
              key={pc.id}
              style={{
                ...itemStyle,
                background: active ? 'rgba(167,139,250,0.12)' : undefined,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(167,139,250,0.18)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = active ? 'rgba(167,139,250,0.12)' : 'transparent'; }}
              onClick={() => { applyPatch({ playerId: pc.user_id! } as any); onClose(); }}
            >
              <span>{pc.name}</span>
              {active && <span style={{ color: '#a78bfa', fontSize: 10 }}>✓</span>}
            </div>
          );
        })}
      </div>,
      document.body,
    );
  }

  if (submenu === 'color') {
    return createPortal(
      <div style={menuBaseStyle} onMouseDown={stop}>
        <div style={{ ...itemStyle, color: 'var(--t-3)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
          Color
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, padding: 6 }}>
          {TOKEN_COLORS.map(c => (
            <div
              key={c}
              onClick={() => { applyPatch({ color: c }); onClose(); }}
              style={{
                width: 44, height: 32,
                background: `#${c.toString(16).padStart(6, '0')}`,
                borderRadius: 4,
                cursor: 'pointer',
                border: token.color === c ? '2px solid #fff' : '2px solid transparent',
                boxSizing: 'border-box' as const,
              }}
              title={`#${c.toString(16).padStart(6, '0')}`}
            />
          ))}
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div style={menuBaseStyle} onMouseDown={stop}>
      <div style={{ ...itemStyle, color: 'var(--t-3)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
        {token.name || 'Token'}
      </div>
      {/* v2.358.0 — Open Quick Panel. Restores the pre-v2.358 left-
          click behavior as an explicit menu action. Renders for any
          token that has a quick panel — PCs and NPCs both. Cyan
          palette to distinguish from the purple "View Character
          Sheet" navigate-away action below. */}
      {onOpenQuickPanel && (token.characterId || token.npcId) && (
        <div
          style={{
            ...itemStyle,
            color: '#67e8f9',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(103,232,249,0.18)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
          onClick={() => {
            onOpenQuickPanel(state.tokenId);
            onClose();
          }}
        >
          Open Quick Panel
        </div>
      )}
      {/* v2.222 — quick-jump to the linked character sheet. Only
          renders when the token is bound to a character via
          characterId AND the parent provided a navigate handler.
          Visually offset (purple, separator) so it reads as a
          navigation action vs the edit ops below. */}
      {token.characterId && onOpenCharacter && (
        <div
          style={{
            ...itemStyle,
            color: '#a78bfa',
            borderBottom: '1px solid var(--c-border)',
            marginBottom: 4,
            paddingBottom: 8,
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(167,139,250,0.18)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
          onClick={() => {
            onOpenCharacter(token.characterId!);
            onClose();
          }}
        >
          View Character Sheet
        </div>
      )}
      {[
        // v2.411.0: Lock/Unlock toggle. DM-only. Locked tokens refuse
        // drag for everyone (DM included) until unlocked. Visual state
        // is communicated by a padlock glyph drawn above the token.
        // Place this FIRST so it's the most prominent DM control —
        // typically a DM locks scene-furniture tokens (statues, traps,
        // map markers) once at scene setup, and want it on the top of
        // the menu rather than buried below resize/recolor.
        ...(isDM ? [{
          label: (token as any).isLocked ? '✓ Unlock Token' : '⊘ Lock Token',
          onClick: () => {
            applyPatch({ isLocked: !(token as any).isLocked } as any);
            onClose();
          },
        }] : []),
        // v2.413.0: Grant Player Control. DM-only, non-PC tokens
        // only (PC tokens already have an owner via characterId).
        // Opens a submenu listing campaign members; pick one to set
        // scene_tokens.player_id, granting drag rights via the
        // existing RLS UPDATE policy. Selecting "(no one)" clears
        // the grant. Useful for familiars, summoned allies, NPC
        // companions, or any creature the DM wants a specific
        // player to maneuver during combat.
        ...(isDM && !token.characterId && playerCharacters && playerCharacters.length > 0 ? [{
          label: ((token as any).playerId
            ? '⚙ Player Control ▸'
            : '⚙ Grant Player Control ▸'),
          onClick: () => setSubmenu('grant'),
        }] : []),
        // v2.282: Hide/Show toggle. DM-only — RLS already gates the
        // write, but no point offering an action that will error.
        // Eye icon flips state on click; we close the menu after so
        // the DM gets immediate feedback (the token's alpha changes
        // via the optimistic store update). Skipped for tokens
        // linked to a character — the player NEEDS to see their PC,
        // and hiding it would just re-hide on every re-render
        // because it'd never appear in the player's RLS-filtered
        // SELECT anyway. Hide is meaningful for monsters/NPCs/marks.
        ...(isDM && !token.characterId ? [{
          label: token.visibleToAll ? '◉ Hide from Players' : '◉ Reveal to Players',
          onClick: () => {
            applyPatch({ visibleToAll: !token.visibleToAll });
            onClose();
          },
        }] : []),
        { label: 'Rename…', onClick: async () => {
          // v2.241 — was window.prompt.
          const next = await promptModal({
            title: 'Rename token',
            defaultValue: token.name,
            placeholder: 'Token name',
            confirmLabel: 'Save',
          });
          if (next !== null) {
            applyPatch({ name: next.trim() || token.name });
          }
          onClose();
        }},
        { label: 'Resize ▸', onClick: () => setSubmenu('size') },
        { label: 'Recolor ▸', onClick: () => setSubmenu('color') },
        // v2.653.0 — Facing (writes the long-dormant rotation column)
        // and Duplicate. Both DM-only: duplicating writes a new row,
        // which RLS refuses for players anyway.
        ...(isDM ? [
          { label: 'Facing ▸', onClick: () => setSubmenu('facing') },
          // v2.663.0 — DM-only: light changes what the whole party can
          // see, so it is a scene-authoring decision, not a player one.
          { label: '☀ Light ▸', onClick: () => setSubmenu('light') },
          { label: '⧉ Duplicate', onClick: () => { applyDuplicate(); onClose(); } },
        ] : []),
        // v2.215: portrait upload. Closes the menu and lets the parent
        // trigger the hidden file input for tokenId.
        { label: token.imageStoragePath ? 'Replace portrait…' : 'Upload portrait…', onClick: () => {
          onRequestUpload(state.tokenId);
          onClose();
        }},
        ...(token.imageStoragePath ? [{ label: 'Remove portrait', onClick: () => {
          applyPatch({ imageStoragePath: null });
          onClose();
        }}] : []),
      ].map(opt => (
        <div
          key={opt.label}
          style={itemStyle}
          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(167,139,250,0.12)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
          onClick={opt.onClick}
        >
          {opt.label}
        </div>
      ))}
      <div
        style={{ ...itemStyle, color: '#f87171', borderTop: '1px solid var(--c-border)', marginTop: 4, paddingTop: 8 }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(248,113,113,0.12)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
        onClick={() => {
          applyDelete();
          onClose();
        }}
      >
        Delete
      </div>
    </div>,
    document.body,
  );
}
