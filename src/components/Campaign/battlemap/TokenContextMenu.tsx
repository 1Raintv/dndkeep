// Extracted verbatim from BattleMapV2.tsx (v2.636 decomposition step 3).
// See that file's header changelog for this code's full history.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBattleMapStore, type Token } from '../../../lib/stores/battleMapStore';
import * as tokensApi from '../../../lib/api/tokensApiRouter';
import { SIZE_OPTIONS, TOKEN_COLORS, type ContextMenuState } from './shared';
import {useMapMenuPosition} from './useMapMenuPosition';
import './TokenContextMenu.css';
import {useTokenMenuSave} from './useTokenMenuSave';

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

const COLOR_NAMES: Record<(typeof TOKEN_COLORS)[number],string> = {
  0xa78bfa:'Purple',0x60a5fa:'Blue',0xf87171:'Red',
  0x34d399:'Green',0xfbbf24:'Yellow',0xf472b6:'Pink',
};

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
  const [submenu, setSubmenu] = useState<'none' | 'size' | 'color' | 'grant' | 'facing' | 'light' | 'rename'>('none');
  const {ref:menuRef,left,top}=useMapMenuPosition(state.clientX,state.clientY,`${state.tokenId}:${submenu}:${!!token}`);
  const [draftName,setDraftName]=useState('');
  const returnOption=useRef<{tokenId:string;label:string} | null>(null);
  const {busy,pending,error,setError,run}=useTokenMenuSave(state.tokenId,onClose);
  useEffect(()=>{if(error && menuRef.current)menuRef.current.scrollTop=0;},[error,menuRef]);

  useEffect(()=>{
    // v2.717 — Tab starts within the current token menu; submenus start at Back.
    // v2.739 — restore the originating action, scrolling it back into view.
    const returning=submenu==='none' && returnOption.current?.tokenId===state.tokenId;
    const origin=returning?[...menuRef.current?.querySelectorAll<HTMLButtonElement>('button[data-token-option]')??[]].find(button=>button.dataset.tokenOption===returnOption.current?.label):undefined;
    const target=origin??menuRef.current?.querySelector<HTMLInputElement | HTMLButtonElement>(submenu==='rename'?'input':'button');
    target?.focus({preventScroll:!origin});
    if(target instanceof HTMLInputElement)target.select();
  },[submenu,state.tokenId,menuRef]);

  useEffect(() => {
    function handler(event:PointerEvent) {
      if(!pending.current && !menuRef.current?.contains(event.target as Node)) onClose();
    }
    function keyHandler(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();e.stopImmediatePropagation();
        // One press backs out one level; holding Escape must not close the map.
        if(!pending.current && !e.repeat && !e.isComposing) {
          if(submenu!=='none'){setError('');setSubmenu('none');}else onClose();
        }
        return;
      }
      // v2.738 — menu navigation must not become an underlying token nudge.
      const menu=menuRef.current;
      if(!menu || !menu.contains(e.target as Node) || e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey)return;
      if(e.target instanceof Element && e.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])'))return;
      if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;
      const buttons=[...menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')].filter(button=>button.getClientRects().length>0);
      e.preventDefault();e.stopImmediatePropagation();
      if(!buttons.length)return;
      const index=buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:e.key==='ArrowDown'?(index+1)%buttons.length:index<0?buttons.length-1:(index-1+buttons.length)%buttons.length;
      buttons[next].focus();
    }
    // v2.715 — the topmost menu owns Escape before map/fullscreen listeners.
    window.addEventListener('keydown', keyHandler, true);
    // Pixi opens this menu during pointerdown; do not dismiss it with that same event.
    const id=setTimeout(()=>window.addEventListener('pointerdown', handler),0);
    return () => {
      clearTimeout(id);
      window.removeEventListener('pointerdown', handler);
      window.removeEventListener('keydown', keyHandler, true);
    };
  }, [onClose,menuRef,pending,submenu,setError]);

  if (!token) return null;

  function applyPatch(patch: Partial<Token>) {
    if(token.combatantId && ('isLocked' in patch || 'playerId' in patch)) {
      setError('Locking and player-control changes are not available for this token type yet.');return;
    }
    void run('Save token',()=>tokensApi.updateToken(state.tokenId,patch,{campaignId}),()=>updateTokenFields(state.tokenId,patch));
  }

  function applyDelete() {
    void run('Delete token',()=>tokensApi.deleteToken(state.tokenId,{campaignId}),()=>removeToken(state.tokenId));
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
    void run('Duplicate token',()=>tokensApi.createToken(copy,{campaignId}),()=>addToken(useBattleMapStore.getState().tokens[copy.id]??copy));
  }


  const menuBaseStyle: React.CSSProperties = {
    position: 'fixed',
    left,
    top,
    width: 280,
    boxSizing: 'border-box',
    overflowY: 'auto',
    overscrollBehavior: 'contain',
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
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 10px',
    minHeight: 40,
    boxSizing: 'border-box',
    cursor: 'pointer',
    borderRadius: 'var(--r-sm, 4px)',
  };

  function stop(e: React.MouseEvent) {
    e.stopPropagation();
  }
  const feedback=busy?<p role="status">Saving token…</p>:error?<p role="alert">{error}</p>:null;

  const backButton=<button type="button" disabled={busy} data-menu-back aria-label="Back to token options"
    onClick={()=>{setError('');setSubmenu('none');}}
    style={{display:'block',position:'sticky',top:0,zIndex:1,width:'100%',minHeight:44,padding:'8px 10px',textAlign:'left',font:'inherit',fontWeight:600,color:'var(--t-1)',background:'var(--c-card)',border:'1px solid var(--c-border)',borderRadius:4,cursor:'pointer'}}>
    ← Back to token options
  </button>;

  // v2.719 — keep rename inside the menu: no competing modal/Escape handlers,
  // and a rejected save retains the draft for a direct retry.
  if(submenu==='rename')return createPortal(
    <div ref={menuRef} role="region" aria-label="Token options" aria-busy={busy} className="map-token-options" style={menuBaseStyle} onClick={stop}>
      {feedback}{backButton}
      <form onSubmit={e=>{e.preventDefault();if(!busy && draftName.trim())applyPatch({name:draftName.trim()});}} style={{padding:10}}>
        <label htmlFor="token-rename-input" style={{display:'block',marginBottom:8,fontWeight:600}}>Token name</label>
        <input id="token-rename-input" value={draftName} disabled={busy} onChange={e=>setDraftName(e.target.value)}
          style={{width:'100%',boxSizing:'border-box',minHeight:44,fontSize:16,padding:8,color:'var(--t-1)',background:'var(--c-card)',border:'1px solid var(--c-border)',borderRadius:4}}/>
        <div style={{display:'flex',gap:8,marginTop:12}}>
          <button type="button" disabled={busy} style={itemStyle} onClick={()=>{setError('');setSubmenu('none');}}>Cancel</button>
          <button type="submit" disabled={busy || !draftName.trim()} style={itemStyle}>Save name</button>
        </div>
      </form>
    </div>,document.body);

  // v2.663.0 — carried light. Only bites in a Dark scene, where sight
  // range became darkvision-driven: a creature with neither darkvision
  // nor a light genuinely sees nothing, and this is how the DM hands
  // them a torch. Radii are the RAW light-source totals (bright + dim).
  // v2.666.0 — the two bands now render separately, and Candle was
  // corrected from 20 ft to 10: its own hint said 5 + 5, but the stored
  // total said 20, so a candle lit as far as a torch's bright band. It
  // went unnoticed while the fog was binary — one flat disc, no band to
  // check the number against. `lightBandsFt` halves these totals, which
  // is exact for all four (every RAW light sheds dim for exactly as far
  // again as it sheds bright).
  if (submenu === 'light') {
    const LIGHTS: ReadonlyArray<{ ft: number; label: string; hint: string }> = [
      { ft: 0,   label: 'None',    hint: 'carries no light' },
      { ft: 10,  label: 'Candle',  hint: '5 ft bright + 5 dim' },
      { ft: 40,  label: 'Torch',   hint: '20 ft bright + 20 dim' },
      { ft: 60,  label: 'Lantern', hint: '30 ft bright + 30 dim' },
      { ft: 120, label: 'Daylight', hint: '60 ft bright + 60 dim' },
    ];
    // v2.668.0 — light colours. Deliberately a short, opinionated list
    // rather than a colour wheel: this gets set mid-session with a right
    // click, and six named moods are faster to pick from than a
    // gradient. `null` is untinted and always first, so there is a way
    // back to plain white.
    const LIGHT_COLOURS: ReadonlyArray<{ value: number | null; label: string; hint: string }> = [
      { value: null,      label: 'Neutral',   hint: 'untinted white light' },
      { value: 0xff8a3d,  label: 'Firelight', hint: 'torch, brazier, hearth' },
      { value: 0x9ad8ff,  label: 'Cold',      hint: 'moonlight, Continual Flame' },
      { value: 0x7cf5a0,  label: 'Sickly',    hint: 'fey, poison, cult shrines' },
      { value: 0xc08aff,  label: 'Arcane',    hint: 'portals, wizardry' },
      { value: 0xff5c5c,  label: 'Infernal',  hint: 'alarm, hellish light' },
    ];
    const current = (token as any).lightRadiusFt ?? 0;
    const currentColour = (token as any).lightColor ?? null;
    return createPortal(
      <div ref={menuRef} className="map-token-options" role="region" aria-label="Token options" style={menuBaseStyle} onMouseDown={stop} aria-busy={busy}>
      {feedback}
        {backButton}
        <div style={{ ...itemStyle, color: 'var(--t-3)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
          Carried light
        </div>
        {LIGHTS.map(l => (
          <button type="button" disabled={busy}
            key={l.ft}
            style={{
              ...itemStyle,
              background: current === l.ft ? 'rgba(167,139,250,0.12)' : undefined,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(167,139,250,0.18)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = current === l.ft ? 'rgba(167,139,250,0.12)' : 'transparent'; }}
            onClick={() => { applyPatch({ lightRadiusFt: l.ft } as any); }}
          >
            <span>
              {l.label}
              <span style={{ color: 'var(--t-3)', fontSize: 10, marginLeft: 6 }}>
                {l.ft === 0 ? l.hint : `${l.ft} ft · ${l.hint}`}
              </span>
            </span>
            {current === l.ft && <span style={{ color: '#a78bfa', fontSize: 10 }}>✓</span>}
          </button>
        ))}
        {/* v2.668.0 — light COLOUR. Only offered once the token actually
            carries a light: a colour picker on an unlit token would set
            a value nothing renders. Neutral (null) is the default and
            the first swatch, so a DM can always get back to plain
            white. */}
        {current > 0 && (
          <>
            <div style={{ ...itemStyle, color: 'var(--t-3)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, paddingTop: 8 }}>
              Colour
            </div>
            <div className="map-token-palette">
              {LIGHT_COLOURS.map(c => {
                const selected = (currentColour ?? null) === c.value;
                return (
                  <button
                    key={c.label}
                    type="button" disabled={busy}
                    className="map-token-swatch"
                    title={`${c.label} — ${c.hint}`}
                    aria-pressed={selected}
                    onClick={() => { applyPatch({ lightColor: c.value } as any); }}
                  >
                    <span className="map-token-swatch-chip" aria-hidden="true" style={{background:c.value === null
                        ? 'linear-gradient(135deg,#fff8e7 50%,#cbd5e1 50%)'
                        : `#${c.value.toString(16).padStart(6, '0')}`}}>{selected && <span className="map-token-swatch-check">✓</span>}</span>
                    <span>{c.label}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>,
      document.body,
    );
  }

  if (submenu === 'size') {
    return createPortal(
      <div ref={menuRef} className="map-token-options" role="region" aria-label="Token options" style={menuBaseStyle} onMouseDown={stop} aria-busy={busy}>
      {feedback}
        {backButton}
        <div style={{ ...itemStyle, color: 'var(--t-3)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
          Size
        </div>
        {SIZE_OPTIONS.map(sz => (
          <button type="button" disabled={busy}
            key={sz}
            style={{
              ...itemStyle,
              background: token.size === sz ? 'rgba(167,139,250,0.12)' : undefined,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(167,139,250,0.18)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = token.size === sz ? 'rgba(167,139,250,0.12)' : 'transparent'; }}
            onClick={() => { applyPatch({ size: sz }); }}
          >
            <span style={{ textTransform: 'capitalize' as const }}>{sz}</span>
            {token.size === sz && <span style={{ color: '#a78bfa', fontSize: 10 }}>✓</span>}
          </button>
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
      <div ref={menuRef} className="map-token-options" role="region" aria-label="Token options" style={menuBaseStyle} onMouseDown={stop} aria-busy={busy}>
      {feedback}
        {backButton}
        <div style={{ ...itemStyle, color: 'var(--t-3)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
          Facing
        </div>
        {FACINGS.map(({ deg, label, arrow }) => {
          const active = current === deg;
          return (
            <button type="button" disabled={busy}
              key={deg}
              style={{ ...itemStyle, background: active ? 'rgba(167,139,250,0.12)' : undefined }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(167,139,250,0.18)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = active ? 'rgba(167,139,250,0.12)' : 'transparent'; }}
              onClick={() => { applyPatch({ rotation: deg }); }}
            >
              <span><span style={{ display: 'inline-block', width: 16 }}>{arrow}</span> {label}</span>
              {active && <span style={{ color: '#a78bfa', fontSize: 10 }}>✓</span>}
            </button>
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
      <div ref={menuRef} className="map-token-options" role="region" aria-label="Token options" style={menuBaseStyle} onMouseDown={stop} aria-busy={busy}>
      {feedback}
        {backButton}
        <div style={{ ...itemStyle, color: 'var(--t-3)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
          Player Control
        </div>
        <button type="button" disabled={busy}
          style={{
            ...itemStyle,
            background: !currentGrant ? 'rgba(167,139,250,0.12)' : undefined,
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(167,139,250,0.18)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = !currentGrant ? 'rgba(167,139,250,0.12)' : 'transparent'; }}
          onClick={() => { applyPatch({ playerId: null } as any); }}
        >
          <span style={{ color: 'var(--t-2)' }}>(no one)</span>
          {!currentGrant && <span style={{ color: '#a78bfa', fontSize: 10 }}>✓</span>}
        </button>
        {(playerCharacters ?? []).map(pc => {
          if (!pc.user_id) return null;
          const active = currentGrant === pc.user_id;
          return (
            <button type="button" disabled={busy}
              key={pc.id}
              style={{
                ...itemStyle,
                background: active ? 'rgba(167,139,250,0.12)' : undefined,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(167,139,250,0.18)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = active ? 'rgba(167,139,250,0.12)' : 'transparent'; }}
              onClick={() => { applyPatch({ playerId: pc.user_id! } as any); }}
            >
              <span>{pc.name}</span>
              {active && <span style={{ color: '#a78bfa', fontSize: 10 }}>✓</span>}
            </button>
          );
        })}
      </div>,
      document.body,
    );
  }

  if (submenu === 'color') {
    return createPortal(
      <div ref={menuRef} className="map-token-options" role="region" aria-label="Token options" style={menuBaseStyle} onMouseDown={stop} aria-busy={busy}>
      {feedback}
        {backButton}
        <div style={{ ...itemStyle, color: 'var(--t-3)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
          Color
        </div>
        <div className="map-token-palette">
          {TOKEN_COLORS.map(c => (
            <button type="button" disabled={busy}
              key={c}
              className="map-token-swatch"
              onClick={() => { applyPatch({ color: c }); }}
              title={`#${c.toString(16).padStart(6, '0')}`}
              aria-label={`Token color ${COLOR_NAMES[c]}`}
              aria-pressed={token.color===c}
            >
              <span className="map-token-swatch-chip" aria-hidden="true" style={{background:`#${c.toString(16).padStart(6, '0')}`}}>{token.color===c && <span className="map-token-swatch-check">✓</span>}</span>
              <span>{COLOR_NAMES[c]}</span>
            </button>
          ))}
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div ref={menuRef} className="map-token-options" role="region" aria-label="Token options" style={menuBaseStyle} onMouseDown={stop} aria-busy={busy}>
      {feedback}
      <div style={{ ...itemStyle, color: 'var(--t-3)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
        {token.name || 'Token'}
      </div>
      {/* v2.358.0 — Open Quick Panel. Restores the pre-v2.358 left-
          click behavior as an explicit menu action. Renders for any
          token that has a quick panel — PCs and NPCs both. Cyan
          palette to distinguish from the purple "View Character
          Sheet" navigate-away action below. */}
      {onOpenQuickPanel && (token.characterId || token.npcId) && (
        <button type="button" disabled={busy}
          style={{
            ...itemStyle,
            color: '#67e8f9',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(103,232,249,0.18)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          onClick={() => {
            onOpenQuickPanel(state.tokenId);
            onClose();
          }}
        >
          Open Quick Panel
        </button>
      )}
      {/* v2.222 — quick-jump to the linked character sheet. Only
          renders when the token is bound to a character via
          characterId AND the parent provided a navigate handler.
          Visually offset (purple, separator) so it reads as a
          navigation action vs the edit ops below. */}
      {token.characterId && onOpenCharacter && (
        <button type="button" disabled={busy}
          style={{
            ...itemStyle,
            color: '#a78bfa',
            borderBottom: '1px solid var(--c-border)',
            marginBottom: 4,
            paddingBottom: 8,
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(167,139,250,0.18)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          onClick={() => {
            onOpenCharacter(token.characterId!);
            onClose();
          }}
        >
          View Character Sheet
        </button>
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

          },
        }] : []),
        { label: 'Rename…', onClick: () => {setDraftName(token.name);setError('');setSubmenu('rename');}},
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
          { label: '⧉ Duplicate', onClick: () => { applyDuplicate(); } },
        ] : []),
        // v2.215: portrait upload. Closes the menu and lets the parent
        // trigger the hidden file input for tokenId.
        { label: token.imageStoragePath ? 'Replace portrait…' : 'Upload portrait…', onClick: () => {
          onRequestUpload(state.tokenId);
          onClose();
        }},
        ...(token.imageStoragePath ? [{ label: 'Remove portrait', onClick: () => {
          applyPatch({ imageStoragePath: null });

        }}] : []),
      ].map(opt => (
        <button type="button" disabled={busy}
          key={opt.label}
          data-token-option={opt.label}
          style={itemStyle}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(167,139,250,0.12)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          onClick={()=>{returnOption.current={tokenId:state.tokenId,label:opt.label};opt.onClick();}}
        >
          {opt.label}
        </button>
      ))}
      <button type="button" disabled={busy}
        style={{ ...itemStyle, color: '#f87171', borderTop: '1px solid var(--c-border)', marginTop: 4, paddingTop: 8 }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(248,113,113,0.12)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
        onClick={() => {
          applyDelete();

        }}
      >
        Delete
      </button>
    </div>,
    document.body,
  );
}
