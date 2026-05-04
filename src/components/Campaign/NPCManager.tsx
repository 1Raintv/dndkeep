import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { getActiveEncounter, npcToSeed, addParticipantToEncounter } from '../../lib/combatEncounter';
// v2.351.0 — Unified Creatures Manager. The old inline form (story
// fields only, 720px modal) is replaced by CreatureFormModal which
// covers combat stats too. Catalog import via CatalogImportModal.
import CreatureFormModal from './CreatureFormModal';
import CatalogImportModal from './CatalogImportModal';
import {
  createCreature, updateCreature, deleteCreature, importFromCatalog,
  type CreatureRow,
} from '../../lib/api/creatures';
// v2.354.0 — folder browser sidebar + place-on-map flow.
import CreatureFolderBrowser from './CreatureFolderBrowser';
import * as tokensApi from '../../lib/api/tokensApiRouter';
// v2.390.0 — Direct API access for the cold-fetch path. tokensApiRouter
// can't be used here because its useNewPath cache is only set after
// BattleMapV2 mounts, and this cold-fetch fires precisely when the DM
// has not opened the Battle Map tab yet. We read the flag explicitly
// via getUseCombatantsFlag and route accordingly.
import * as scenesApi from '../../lib/api/scenes';
import * as sceneTokensApi from '../../lib/api/sceneTokens';
import * as scenePlacementsApi from '../../lib/api/scenePlacements';
import { useBattleMapStore } from '../../lib/stores/battleMapStore';
import type { Token, TokenSize } from '../../lib/stores/battleMapStore';

interface NPC {
  id: string;
  name: string;
  role: string;
  race: string;
  location: string;
  faction: string;
  relationship: string;
  status: string;
  description: string;
  notes: string;
  last_seen: string;
  is_alive: boolean;
  // v2.175.0 — Phase Q.0 pt 16: combat stats (already present in the
  // `npcs` DB table with sensible defaults). Exposed so the new
  // "Add to Combat" button has HP/AC to seed the participant row.
  // v2.351.0 — extended further to cover the unified creature shape
  // so the rebuilt form can read/write all combat fields.
  ac?: number;
  hp?: number;
  max_hp?: number;
  dex?: number;
  speed?: number;
  str?: number;
  con?: number;
  int?: number;
  wis?: number;
  cha?: number;
  cr?: string;
  xp?: number;
  type?: string;
  size?: string;
  attack_name?: string;
  attack_bonus?: number;
  attack_damage?: string;
  // v2.351.0 — folder + visibility + image
  folder_id?: string | null;
  image_url?: string | null;
  visible_to_players?: boolean;
}

interface NPCManagerProps {
  campaignId: string;
  isOwner: boolean;
}

const ROLES = ['ally', 'enemy', 'neutral', 'merchant', 'quest-giver', 'boss', 'unknown'];

const ROLE_COLORS: Record<string, string> = {
  ally: '#34d399', enemy: '#f87171', neutral: '#94a3b8',
  merchant: '#fbbf24', 'quest-giver': '#a78bfa', boss: '#ef4444', unknown: '#64748b',
};

const ROLE_ICONS: Record<string, string> = {
  ally: '', enemy: '', neutral: '', merchant: '',
  'quest-giver': '', boss: '', unknown: '',
};

const empty = (): Partial<NPC> => ({
  name: '', role: 'neutral', race: '', location: '', faction: '',
  relationship: 'neutral', status: 'alive', description: '', notes: '',
  last_seen: '', is_alive: true,
});

export default function NPCManager({ campaignId, isOwner }: NPCManagerProps) {
  const [npcs, setNpcs] = useState<NPC[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [showDead, setShowDead] = useState(false);
  const [editing, setEditing] = useState<Partial<NPC> | null>(null);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  // v2.175.0 — Phase Q.0 pt 16: transient state for the Add to Combat
  // button. addingNpcId disables the button while the request is
  // in-flight; addToCombatStatus holds post-result feedback keyed by
  // NPC id ('added' flashes for 3s; 'no-encounter' sticks until the
  // DM starts combat or clicks again).
  const [addingNpcId, setAddingNpcId] = useState<string | null>(null);
  const [addToCombatStatus, setAddToCombatStatus] = useState<Record<string, 'added' | 'no-encounter' | 'error'>>({});
  // v2.351.0 — catalog import picker open state. Opens over the form
  // modal when the user clicks "Import from Catalog" inside the form.
  const [catalogImportOpen, setCatalogImportOpen] = useState(false);
  // v2.354.0 — folder browser selection + place-on-map status.
  // selectedFolderId: 'all' | 'unfiled' | <uuid>; defaults to 'all'.
  // placingId tracks per-creature placement-in-flight UI.
  const [selectedFolderId, setSelectedFolderId] = useState<string | null | 'all' | 'unfiled'>('all');
  const [placingId, setPlacingId] = useState<string | null>(null);
  const [placeStatus, setPlaceStatus] = useState<Record<string, 'placed' | 'no-scene' | 'error'>>({});

  // v2.387.0 — Derive real placement state from the live battle-map
  // store rather than the session-local `placeStatus` map (which was
  // only set after a click in THIS session and reset on every page
  // reload, so the "✓ On Map" indicator was lying about everything
  // placed in prior sessions). The store is the source of truth on
  // the map tab; we mirror its tokens to a creatureId → count map
  // and key the button label off that.
  //
  // Cold-store guard: if the DM hasn't visited the Battle Map tab
  // this session, the store has no tokens for the active scene. We
  // do a one-shot DB fetch to prime correct counts. Subsequent
  // realtime updates flow through whatever channels BattleMapV2 sets
  // up when the DM does open the map tab.
  const storeTokens = useBattleMapStore(s => s.tokens);
  const storeSceneId = useBattleMapStore(s => s.currentSceneId);
  const [coldFetchedCounts, setColdFetchedCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    // If the store is already primed for any scene, skip — the live
    // store IS the truth and the cold cache would just race it.
    if (Object.keys(storeTokens).length > 0) {
      setColdFetchedCounts({});
      return;
    }
    let cancelled = false;
    (async () => {
      // v2.390.0 — Aligned with BattleMapV2's mount behavior (pick
      // listScenes()[0], same `created_at ASC` order). Previously
      // ordered by `updated_at DESC` here, which could disagree with
      // the scene the user actually ends up looking at on the map.
      // Same fix as the v2.389 startCombatFromMap alignment.
      //
      // v2.390.0 — Also flag-aware. If `use_combatants_for_battlemap`
      // is on for this campaign, count placements not scene_tokens.
      // The cold-fetch path can't piggy-back on tokensApiRouter's
      // cached flag (BattleMapV2 hasn't mounted yet by definition
      // when the cold-fetch fires), so we read the flag directly.
      const scenes = await scenesApi.listScenes(campaignId);
      if (cancelled || scenes.length === 0) return;
      const sceneId = scenes[0].id;

      const useNewPath = await scenePlacementsApi.getUseCombatantsFlag(campaignId);
      if (cancelled) return;
      const tokens = useNewPath
        ? await scenePlacementsApi.listPlacements(sceneId)
        : await sceneTokensApi.listTokens(sceneId);
      if (cancelled) return;

      const counts: Record<string, number> = {};
      for (const t of tokens) {
        if (t.creatureId) counts[t.creatureId] = (counts[t.creatureId] ?? 0) + 1;
      }
      setColdFetchedCounts(counts);
    })().catch(err => {
      console.error('[NPCManager] cold-store fetch failed', err);
    });
    return () => { cancelled = true; };
  }, [campaignId, storeTokens]);

  // Live count for each NPC. Prefer the store when it has anything
  // for the current scene; fall back to the cold-fetched cache.
  function placedCount(creatureId: string): number {
    if (storeSceneId) {
      let n = 0;
      for (const t of Object.values(storeTokens)) {
        if (t.sceneId === storeSceneId && t.creatureId === creatureId) n++;
      }
      if (n > 0 || Object.keys(storeTokens).length > 0) return n;
    }
    return coldFetchedCounts[creatureId] ?? 0;
  }

  // v2.354.0 — Quick Create modal (the user's "click button, type
  // name, maybe HP, that's it" path). Distinct from `editing` which
  // opens the full CreatureFormModal.
  const [quickName, setQuickName] = useState('');
  const [quickHp, setQuickHp] = useState('');
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  // v2.354.0 — top-level "Add Monster" button opens the catalog
  // picker directly (no form first). Distinct from the in-form
  // catalog import via catalogImportOpen.
  const [topLevelCatalogOpen, setTopLevelCatalogOpen] = useState(false);

  useEffect(() => { load(); }, [campaignId]);

  async function load() {
    const { data } = await supabase.from('homebrew_monsters').select('*')
      .eq('campaign_id', campaignId).order('name');
    setNpcs((data ?? []) as NPC[]);
    setLoading(false);
  }

  async function save() {
    if (!editing?.name?.trim()) return;
    setSaving(true);
    try {
      if ((editing as NPC).id) {
        await updateCreature((editing as NPC).id, editing as Partial<CreatureRow>);
      } else {
        await createCreature({
          ...(editing as Partial<CreatureRow>),
          name: editing.name.trim(),
          campaign_id: campaignId,
        });
      }
      await load();
      setEditing(null);
    } catch (err) {
      console.error('[NPCManager] save failed', err);
    } finally {
      setSaving(false);
    }
  }

  async function handleCatalogPick(catalogId: string) {
    // v2.351.0 — copy the selected catalog row into homebrew_monsters,
    // drop into the current campaign + the form's folder selection,
    // then close the picker and refresh the list. The form closes too
    // (the new creature is now persisted; user can re-open to edit).
    setCatalogImportOpen(false);
    try {
      await importFromCatalog({
        catalogMonsterId: catalogId,
        campaignId,
        folderId: editing?.folder_id ?? null,
      });
      await load();
      setEditing(null);
    } catch (err) {
      console.error('[NPCManager] catalog import failed', err);
    }
  }

  async function toggleAlive(npc: NPC) {
    await updateCreature(npc.id, {
      is_alive: !npc.is_alive,
      status: npc.is_alive ? 'dead' : 'alive',
    });
    setNpcs(prev => prev.map(n => n.id === npc.id ? { ...n, is_alive: !n.is_alive, status: n.is_alive ? 'dead' : 'alive' } : n));
  }

  async function deleteNPC(id: string) {
    await deleteCreature(id);
    setNpcs(prev => prev.filter(n => n.id !== id));
  }

  // v2.175.0 — Phase Q.0 pt 16: add an NPC row as a participant in the
  // currently active encounter. Resolves the campaign's active
  // encounter first; if none exists, surfaces a "no encounter" state
  // on the button so the DM knows they need to start combat. On
  // success, initiative is auto-rolled and turn order recomputed via
  // addParticipantToEncounter. The DM can add the same NPC multiple
  // times if they want multiple combatants of that stat block — no
  // dedupe (RAW, an encounter can have 3 bandits with identical
  // stats). Each insert gets its own participant_id via
  // gen_random_uuid.
  async function addToCombat(npc: NPC) {
    setAddingNpcId(npc.id);
    try {
      const enc = await getActiveEncounter(campaignId);
      if (!enc) {
        setAddToCombatStatus(prev => ({ ...prev, [npc.id]: 'no-encounter' }));
        setTimeout(() => setAddToCombatStatus(prev => {
          const copy = { ...prev };
          delete copy[npc.id];
          return copy;
        }), 4000);
        return;
      }
      const seed = npcToSeed(npc, /* hiddenFromPlayers */ false);
      const participant = await addParticipantToEncounter(
        enc.id, campaignId, seed,
        enc.initiative_mode as 'auto_all' | 'player_agency',
      );
      if (!participant) {
        setAddToCombatStatus(prev => ({ ...prev, [npc.id]: 'error' }));
        return;
      }
      setAddToCombatStatus(prev => ({ ...prev, [npc.id]: 'added' }));
      setTimeout(() => setAddToCombatStatus(prev => {
        const copy = { ...prev };
        delete copy[npc.id];
        return copy;
      }), 3000);
    } finally {
      setAddingNpcId(null);
    }
  }

  // v2.354.0 — Place a creature on the active battle map scene.
  // Reads currentSceneId from the battleMap store (set when the user
  // visits the map tab; persists across tab switches in-session).
  // If no scene has ever been visited this session, the field is null
  // and we surface a "no-scene" status so the DM knows to open the
  // map first. Placement creates a scene_token at the scene center
  // (the DM can drag from there) plus, if there's an active
  // encounter, adds the creature to combat_participants so it shows
  // up in initiative + becomes a valid target for spells.
  async function placeOnMap(npc: NPC) {
    setPlacingId(npc.id);
    try {
      const sceneId = useBattleMapStore.getState().currentSceneId;
      if (!sceneId) {
        setPlaceStatus(prev => ({ ...prev, [npc.id]: 'no-scene' }));
        setTimeout(() => setPlaceStatus(prev => {
          const copy = { ...prev };
          delete copy[npc.id];
          return copy;
        }), 4000);
        return;
      }
      // Look up the scene's grid info to compute a placement point
      // at the world center. We can't use viewport center here
      // (NPCManager isn't on the map tab), so center-of-scene is the
      // sensible default — the DM drags from there.
      const { data: scene } = await supabase
        .from('scenes')
        .select('grid_size_px, width_cells, height_cells')
        .eq('id', sceneId)
        .single();
      const gridPx = (scene?.grid_size_px ?? 60) as number;
      const wCells = (scene?.width_cells ?? 30) as number;
      const hCells = (scene?.height_cells ?? 20) as number;
      const cx = (wCells * gridPx) / 2;
      const cy = (hCells * gridPx) / 2;
      // Snap to cell center.
      const x = Math.floor(cx / gridPx) * gridPx + gridPx / 2;
      const y = Math.floor(cy / gridPx) * gridPx + gridPx / 2;
      // Map size string → TokenSize. Defaults to medium.
      const sizeRaw = ((npc.size ?? 'medium') as string).toLowerCase();
      const validSizes: TokenSize[] = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'];
      const tokenSize: TokenSize = (validSizes as string[]).includes(sizeRaw)
        ? (sizeRaw as TokenSize)
        : 'medium';
      const newToken: Token = {
        id: (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : `token-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        sceneId,
        x, y,
        size: tokenSize,
        rotation: 0,
        name: npc.name,
        // Default purple — same fallback BattleMapV2 uses.
        color: 0xa78bfa,
        imageStoragePath: null,
        characterId: null,
        npcId: npc.id,        // legacy mirror for existing readers
        creatureId: npc.id,   // post-v2.350 canonical link
        visibleToAll: npc.visible_to_players ?? true,
        isLocked: false,
      };
      // Optimistic store update so the token appears immediately if
      // the user switches to the map tab.
      useBattleMapStore.getState().addToken(newToken);
      // Server commit. tokensApiRouter handles legacy + new path.
      await tokensApi.createToken(newToken, { campaignId });
      // If there's an active encounter, also add to combat. Same
      // contract as the existing addToCombat flow — initiative is
      // auto-rolled in auto_all mode.
      try {
        const enc = await getActiveEncounter(campaignId);
        if (enc) {
          const seed = npcToSeed(npc, !(npc.visible_to_players ?? true));
          await addParticipantToEncounter(enc.id, campaignId, seed);
        }
      } catch (combatErr) {
        // Placement still succeeded; the combat add is best-effort.
        console.warn('[NPCManager] placeOnMap: combat add failed', combatErr);
      }
      setPlaceStatus(prev => ({ ...prev, [npc.id]: 'placed' }));
      setTimeout(() => setPlaceStatus(prev => {
        const copy = { ...prev };
        delete copy[npc.id];
        return copy;
      }), 3000);
    } catch (err) {
      console.error('[NPCManager] placeOnMap failed', err);
      setPlaceStatus(prev => ({ ...prev, [npc.id]: 'error' }));
      setTimeout(() => setPlaceStatus(prev => {
        const copy = { ...prev };
        delete copy[npc.id];
        return copy;
      }), 4000);
    } finally {
      setPlacingId(null);
    }
  }

  // v2.354.0 — Quick Create. The user's exact words: "they click
  // this button, they can type in a name and maybe health and that's
  // about it." Everything else takes a sensible default via
  // createCreature's defaults branch. Drops the creature into the
  // currently-selected folder (or unfiled if 'all'/'unfiled' is
  // selected) so the DM doesn't have to file it after creation.
  async function handleQuickCreate() {
    const name = quickName.trim();
    if (!name) return;
    const hpNum = quickHp ? parseInt(quickHp, 10) : null;
    const folderForNew =
      selectedFolderId === 'all' || selectedFolderId === 'unfiled'
        ? null
        : selectedFolderId;
    try {
      await createCreature({
        name,
        hp: hpNum,
        max_hp: hpNum,
        campaign_id: campaignId,
        folder_id: folderForNew,
      });
      setQuickName('');
      setQuickHp('');
      setQuickCreateOpen(false);
      await load();
    } catch (err) {
      console.error('[NPCManager] quick create failed', err);
    }
  }

  // v2.354.0 — Top-level "Add Monster" button picks straight from
  // the catalog (no form first). The selected catalog row gets
  // copied into the currently-selected folder.
  async function handleAddMonsterFromCatalog(catalogId: string) {
    const folderForNew =
      selectedFolderId === 'all' || selectedFolderId === 'unfiled'
        ? null
        : selectedFolderId;
    try {
      await importFromCatalog({
        catalogMonsterId: catalogId,
        campaignId,
        folderId: folderForNew,
      });
      setTopLevelCatalogOpen(false);
      await load();
    } catch (err) {
      console.error('[NPCManager] add monster failed', err);
    }
  }

  const filtered = npcs.filter(n => {
    if (!showDead && !n.is_alive) return false;
    if (filterRole && n.role !== filterRole) return false;
    if (search && !n.name.toLowerCase().includes(search.toLowerCase()) && !n.location.toLowerCase().includes(search.toLowerCase()) && !n.faction.toLowerCase().includes(search.toLowerCase())) return false;
    // v2.354.0 — folder filter. 'all' shows everything; 'unfiled'
    // shows folder_id null; specific folder id matches that folder.
    if (selectedFolderId === 'unfiled' && n.folder_id != null) return false;
    if (
      selectedFolderId !== 'all' &&
      selectedFolderId !== 'unfiled' &&
      selectedFolderId !== null &&
      n.folder_id !== selectedFolderId
    ) return false;
    return true;
  });

  const grouped = ROLES.reduce<Record<string, NPC[]>>((acc, role) => {
    const group = filtered.filter(n => n.role === role);
    if (group.length) acc[role] = group;
    return acc;
  }, {});

  if (loading) return <div className="loading-text" style={{ padding: 'var(--sp-4)' }}>Loading NPCs…</div>;

  return (
    // v2.354.0 — Outer flex-row with folder browser sidebar on the
    // left, existing column on the right. The sidebar uses fixed
    // 220px width via its own internal styles; the right side flexes.
    <div style={{ display: 'flex', gap: 'var(--sp-4)', alignItems: 'flex-start' }}>
      <CreatureFolderBrowser
        campaignId={campaignId}
        selectedFolderId={selectedFolderId}
        onSelect={setSelectedFolderId}
        isOwner={isOwner}
      />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
      {/* Controls */}
      <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, location, faction…"
          style={{ flex: 1, minWidth: 160, fontSize: 'var(--fs-sm)' }}
        />
        <select value={filterRole} onChange={e => setFilterRole(e.target.value)} style={{ fontSize: 'var(--fs-sm)', width: 'auto' }}>
          <option value="">All Roles</option>
          {ROLES.map(r => <option key={r} value={r}>{ROLE_ICONS[r]} {r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', textTransform: 'none', letterSpacing: 0, marginBottom: 0 }}>
          <input type="checkbox" checked={showDead} onChange={e => setShowDead(e.target.checked)} />
          Show deceased
        </label>
        {isOwner && (
          <>
            <button
              className="btn-secondary btn-sm"
              onClick={() => setQuickCreateOpen(true)}
              title="Quick-create an NPC with just a name and HP. Opens a small form."
            >
              + Quick NPC
            </button>
            <button
              className="btn-secondary btn-sm"
              onClick={() => setTopLevelCatalogOpen(true)}
              title="Add a monster from the bestiary catalog into this campaign / folder."
            >
              + Add Monster
            </button>
            <button className="btn-gold btn-sm" onClick={() => setEditing(empty())}>
              + New NPC
            </button>
          </>
        )}
      </div>

      <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
        {filtered.length} NPC{filtered.length !== 1 ? 's' : ''} · {npcs.filter(n => !n.is_alive).length} deceased
      </div>

      {/* Grouped NPC list */}
      {Object.entries(grouped).map(([role, group]) => (
        <div key={role}>
          <div className="section-header">
            {ROLE_ICONS[role]} {role.charAt(0).toUpperCase() + role.slice(1)}s
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            {group.map(npc => {
              const roleColor = ROLE_COLORS[npc.role] ?? '#94a3b8';
              const isExpanded = expanded === npc.id;
              return (
                <div key={npc.id} style={{
                  border: `1px solid ${npc.is_alive ? roleColor + '30' : 'var(--c-border)'}`,
                  borderRadius: 'var(--r-lg)',
                  background: '#080d14',
                  opacity: npc.is_alive ? 1 : 0.55,
                  overflow: 'hidden',
                  transition: 'all var(--tr-fast)',
                }}>
                  {/* NPC row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-3) var(--sp-4)', cursor: 'pointer' }}
                    onClick={() => setExpanded(isExpanded ? null : npc.id)}>
                    {/* Role dot */}
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: roleColor, flexShrink: 0, boxShadow: `0 0 6px ${roleColor}` }} />
                    {/* Name + meta */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 600, fontSize: 'var(--fs-sm)', color: npc.is_alive ? 'var(--t-1)' : 'var(--t-2)' }}>
                          {npc.name}
                          {!npc.is_alive && ' '}
                        </span>
                        {npc.race && <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>{npc.race}</span>}
                        {npc.faction && (
                          <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 600, color: 'var(--c-purple-l)', background: 'rgba(91,63,168,0.12)', padding: '1px 6px', borderRadius: 999, border: '1px solid rgba(91,63,168,0.25)' }}>
                            {npc.faction}
                          </span>
                        )}
                      </div>
                      {npc.location && (
                        <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', marginTop: 1 }}>
                          {npc.location}{npc.last_seen ? ` · Last seen: ${npc.last_seen}` : ''}
                        </div>
                      )}
                    </div>
                    {/* Relationship badge */}
                    <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: roleColor, background: `${roleColor}15`, border: `1px solid ${roleColor}40`, padding: '2px 7px', borderRadius: 999, flexShrink: 0 }}>
                      {npc.relationship}
                    </span>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="animate-fade-in" style={{ padding: 'var(--sp-3) var(--sp-4)', borderTop: '1px solid var(--c-border)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
                      {npc.description && (
                        <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', lineHeight: 1.6, margin: 0 }}>{npc.description}</p>
                      )}
                      {npc.notes && (
                        <div>
                          <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t-2)', marginBottom: 4 }}>DM Notes</div>
                          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', lineHeight: 1.6, margin: 0, fontStyle: 'italic' }}>{npc.notes}</p>
                        </div>
                      )}
                      {isOwner && (
                        <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap', alignItems: 'center' }}>
                          <button className="btn-secondary btn-sm" onClick={() => setEditing(npc)}>Edit</button>
                          <button
                            className="btn-secondary btn-sm"
                            onClick={() => toggleAlive(npc)}
                            style={{ color: npc.is_alive ? 'var(--c-red-l)' : 'var(--hp-full)' }}
                          >
                            {npc.is_alive ? 'Mark Dead' : 'Revive'}
                          </button>
                          {/* v2.175.0 — Phase Q.0 pt 16: add this NPC to
                              the active encounter. Checks for an active
                              encounter first; if none exists we tell the
                              DM they need to start combat (button does
                              not silently fail). Dead NPCs cannot be
                              added (RAW — dead things don't roll init).
                              Feedback is inline: flash the button label
                              on success, keep error state visible. */}
                          {/* v2.354.0 — Place on Map. Drops a token
                              for this creature at the active scene's
                              center; if there's an active encounter,
                              also adds to combat_participants so it
                              shows up in initiative + becomes
                              targetable by spells. Dead NPCs can
                              still be placed (lore corpses, etc.). */}
                          {isOwner && (() => {
                            // v2.387.0 — Button reads from real placement
                            // count. Color/label tiers:
                            //   placing → "Placing…"
                            //   no-scene/error → red flash from
                            //     placeStatus (still session-local — only
                            //     a click can produce these)
                            //   N>0 → green "✓ N on map · +Place"
                            //   N=0 → blue default
                            // Click still places another (legit case:
                            // multiple goblins) but the DM sees what
                            // they're stacking before clicking.
                            const n = placedCount(npc.id);
                            const status = placeStatus[npc.id];
                            const isPlacing = placingId === npc.id;
                            const labelColor =
                              status === 'no-scene' || status === 'error' ? 'var(--c-red-l)'
                              : n > 0 ? 'var(--hp-full)'
                              : 'var(--c-blue-l, #93c5fd)';
                            const label =
                              isPlacing ? 'Placing…'
                              : status === 'no-scene' ? 'Open Map First'
                              : status === 'error' ? '✕ Failed'
                              : n > 0 ? `✓ ${n} on map · +Place`
                              : '🗺 Place on Map';
                            const tooltip =
                              n > 0
                                ? `${n} token${n === 1 ? '' : 's'} of this creature already on the active scene. Click to place another.`
                                : 'Place this creature as a token on the active battle map scene.';
                            return (
                              <button
                                className="btn-secondary btn-sm"
                                onClick={() => placeOnMap(npc)}
                                disabled={isPlacing}
                                style={{ color: labelColor }}
                                title={tooltip}
                              >
                                {label}
                              </button>
                            );
                          })()}
                          {npc.is_alive && (
                            <button
                              className="btn-secondary btn-sm"
                              onClick={() => addToCombat(npc)}
                              disabled={addingNpcId === npc.id}
                              style={{
                                color: addToCombatStatus[npc.id] === 'added' ? 'var(--hp-full)'
                                     : addToCombatStatus[npc.id] === 'no-encounter' ? 'var(--c-red-l)'
                                     : 'var(--c-gold-l)',
                              }}
                              title="Adds this NPC to the active combat encounter. Initiative is rolled automatically."
                            >
                              {addingNpcId === npc.id ? 'Adding…'
                               : addToCombatStatus[npc.id] === 'added' ? '✓ In Combat'
                               : addToCombatStatus[npc.id] === 'no-encounter' ? 'No Active Encounter'
                               : '⚔ Add to Combat'}
                            </button>
                          )}
                          <button className="btn-ghost btn-sm" onClick={() => deleteNPC(npc.id)} style={{ color: 'var(--c-red-l)', marginLeft: 'auto' }}>
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 'var(--sp-8)', color: 'var(--t-2)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)' }}>
          {npcs.length === 0
            ? `No NPCs yet.${isOwner ? ' Add your first NPC to track allies, enemies, and notable characters.' : ''}`
            : 'No NPCs match your filter.'}
        </div>
      )}

      {/* v2.351.0 — Unified Creature form modal. Replaces the v2.169
          inline form which was 720px wide and only had story fields.
          New shape is 1100px, two-column, with combat stats on the
          left and story fields on the right. Catalog import via the
          inline button → CatalogImportModal. */}
      {editing && (
        <CreatureFormModal
          creature={editing as Partial<CreatureRow>}
          campaignId={campaignId}
          onChange={c => setEditing(c as Partial<NPC>)}
          onSave={save}
          onClose={() => setEditing(null)}
          onOpenCatalogImport={() => setCatalogImportOpen(true)}
          saving={saving}
        />
      )}

      {/* v2.351.0 — Catalog import picker (over the form modal). */}
      {catalogImportOpen && (
        <CatalogImportModal
          onPick={handleCatalogPick}
          onClose={() => setCatalogImportOpen(false)}
        />
      )}

      {/* v2.354.0 — Top-level Add Monster catalog picker. Same
          component as the in-form catalog import, but the picked
          monster lands directly in the current folder without
          opening the form first. */}
      {topLevelCatalogOpen && (
        <CatalogImportModal
          onPick={handleAddMonsterFromCatalog}
          onClose={() => setTopLevelCatalogOpen(false)}
        />
      )}

      {/* v2.354.0 — Quick Create NPC modal. Just name + HP, per
          user request. Submit creates the row with sensible defaults
          for everything else (10 in every stat, AC 10, speed 30,
          neutral role, current folder). */}
      {quickCreateOpen && (
        <div
          className="modal-overlay"
          onClick={() => setQuickCreateOpen(false)}
          style={{ zIndex: 31000 }}
        >
          <div
            className="modal"
            style={{ maxWidth: 380, width: '92vw', padding: '20px 24px' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: 'var(--sp-3)' }}>Quick NPC</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
              <div>
                <label>Name *</label>
                <input
                  value={quickName}
                  onChange={e => setQuickName(e.target.value)}
                  placeholder="Goblin, Innkeeper, Mom…"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter' && quickName.trim()) handleQuickCreate();
                    if (e.key === 'Escape') setQuickCreateOpen(false);
                  }}
                />
              </div>
              <div>
                <label>HP (optional)</label>
                <input
                  type="number"
                  value={quickHp}
                  onChange={e => setQuickHp(e.target.value)}
                  placeholder="10"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && quickName.trim()) handleQuickCreate();
                    if (e.key === 'Escape') setQuickCreateOpen(false);
                  }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--sp-3)', marginTop: 'var(--sp-4)', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setQuickCreateOpen(false)}>Cancel</button>
              <button
                className="btn-gold"
                onClick={handleQuickCreate}
                disabled={!quickName.trim()}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
