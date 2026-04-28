import { useState, useEffect, lazy, Suspense, type FormEvent } from 'react';
import type { Campaign, Character, CampaignMember } from '../../types';
// v2.296.0 — useCampaign import dropped. Was used to read the now-
// retired sessionState/updateSessionState fields off CampaignContext;
// after the v2.296 plumbing cleanup the dashboard no longer needs
// any context state from CampaignContext (route params drive the
// campaign id directly).
import { useAuth } from '../../context/AuthContext';
import {
  getCharactersByCampaign, getCampaignMembers, lookupProfileByEmail, getCharacters, supabase,
  addCampaignMember, removeCampaignMember, refreshCampaignJoinCode, type MemberWithProfile,
} from '../../lib/supabase';
// v2.286.0 — InitiativeTracker import dropped. The legacy player-side
// view it provided was retired in this ship; the player session tab
// now renders an inline pointer to the InitiativeStrip (the modern
// combat surface mounted at the bottom of the page).
import DMlobby from './DMlobby';
import CombatEventLog from '../shared/CombatEventLog';
// v2.283.0 — confirm modal + toast for the strengthened remove-player
// flow. Confirm is a hard requirement: removing a player is destructive
// (deletes campaign_members row, unassigns their PCs from the campaign);
// silent click would be a UX foot-gun.
import { useModal } from '../shared/Modal';
import { useToast } from '../shared/Toast';
import PartyChat from './PartyChat';
import DMScreen from './DMScreen';
import SessionScheduler from './SessionScheduler';
import NPCManager from './NPCManager';
// v2.276.0 — AISummary import removed alongside the Recap tab.
import DiscordSettings from './DiscordSettings';
import PartyDashboard from './PartyDashboard';
// v2.267.0 — v1 BattleMap import removed. v2 is the only renderer.
// v2.289.0 — v1 BattleMap.tsx file deleted from the tree (1695 lines)
// after v2.286 retired its last importer (DMlobby). To rollback to a
// pre-v2 renderer would now require either restoring the file from
// git history or treating it as a from-scratch rewrite — which is
// fine because BattleMapV2 has been the production renderer for
// many months by this point. No live code reaches the v1 path.
// v2.210.0 — Phase Q.1 pt 3: BattleMapV2 is lazy-loaded so Pixi
// (~500KB) only downloads when a user actually opens the map tab AND
// flips the v2 toggle. Keeps the main-bundle cost zero for anyone
// who never touches the preview feature.
const BattleMapV2 = lazy(() => import('./BattleMapV2'));
import { CombatProvider } from '../../context/CombatContext';
import InitiativeStrip from '../Combat/InitiativeStrip';
import StartCombatButton from '../Combat/StartCombatButton';
import AttackResolutionModal from '../Combat/AttackResolutionModal';
import ReactionPromptModal from '../Combat/ReactionPromptModal';
import LegendaryResistancePromptModal from '../Combat/LegendaryResistancePromptModal';
import ErrorBoundary from '../ErrorBoundary';
import CampaignSettings from './CampaignSettings';

interface CampaignDashboardProps {
  campaign: Campaign;
  onBack: () => void;
}

export default function CampaignDashboard({ campaign: campaignProp, onBack }: CampaignDashboardProps) {
  const { user } = useAuth();
  // v2.296.0 — sessionState/updateSessionState removed from
  // CampaignContext. The session_states table was dropped this ship
  // and the prop chain that used to thread these through to DMScreen,
  // DMlobby, NpcTokenQuickPanel, and BattleMapV2 was a no-op shim
  // since v2.291–v2.294. Modern combat state flows via useCombat().
  // v2.283.0 — confirm modal + toast handles for the remove-player
  // flow. ModalProvider + ToastProvider are mounted at app root so
  // the hooks always resolve; calling here is safe even though the
  // component is also rendered inside CombatProvider further down.
  const { confirm: confirmModal } = useModal();
  const { showToast } = useToast();
  // v2.194.0 — Phase Q.0 pt 35: lift campaign state into the
  // dashboard so settings updates propagate to PartyDashboard
  // immediately. Previously the settings modal kept its own local
  // `current` state and the parent's `campaign` prop never refreshed
  // — flipping Award XP in Settings required a full page reload
  // before the Party tab's DM Controls picked it up.
  //
  // We seed from the prop and re-sync if the prop changes (e.g. the
  // user navigates between campaigns without unmounting the dashboard).
  const [campaign, setCampaign] = useState(campaignProp);
  useEffect(() => { setCampaign(campaignProp); }, [campaignProp.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [members, setMembers] = useState<(CampaignMember & { display_name: string | null; email: string })[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  // v2.244 — Phase Q.1 pt 32: NPC combat state for the BattleMap.
  // Mirrors the `characters` state pattern: load on mount, keep live
  // via Realtime UPDATE/INSERT/DELETE on `npcs`. We only project the
  // canvas-relevant subset (id/hp/conditions/etc.); social-graph fields
  // stay in NPCManager which has its own load.
  const [npcs, setNpcs] = useState<Array<{
    id: string;
    name: string;
    hp: number | null;
    max_hp: number | null;
    ac: number | null;
    conditions: string[] | null;
    is_alive: boolean | null;
    visible_to_players: boolean | null;
  }>>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  // v2.283.0 — Characters tab dropped. Its only unique function was
  // letting a player assign their unassigned PC to this campaign;
  // that flow now lives inside the Members tab as the
  // AssignMyCharacterPanel below. The roster-of-PCs grid the
  // Characters tab also rendered duplicated the Party tab one-to-one
  // v2.335.0 — P4: Members tab is hidden from the dashboard tab strip
  // for DMs since membership management lives in Settings now (see
  // CampaignSettings → Members). Players still see Members on the
  // dashboard for AssignMyCharacterPanel + read-only roster. Default
  // tab differs by role: DMs land on Party (the live roster), players
  // land on Members (where they assign their PC and see who else is in).
  // Inlined comparison rather than referencing `isOwner` because
  // `isOwner` is declared after this hook (TDZ).
  const [activeTab, setActiveTab] = useState<'members' | 'session' | 'party' | 'log' | 'chat' | 'schedule' | 'npcs' | 'dm' | 'discord' | 'map'>(campaignProp.owner_id === user?.id ? 'party' : 'members');
  // Handle deep-link ?tab=map from character sheet Map button
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab === 'map') setActiveTab('map');
  }, []);
  const [joinCode, setJoinCode] = useState<string>(campaign.join_code ?? '');
  const [refreshingCode, setRefreshingCode] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  // v2.276.0 — Notes tab removed. The campaigns.notes column is left
  // alone (would-be-destructive migration; harmless to leave). The
  // textarea, autosave timer, realtime subscription, and loader
  // function were dropped from this component.
  // Derived from props/context — after all hooks
  const isOwner = campaign.owner_id === user?.id;

  useEffect(() => {
    loadMembers();
    loadCharacters();
    loadNpcs();

    // v2.276.0 — campaign-notes realtime channel removed alongside
    // the Notes tab. The `campaigns.notes` column is no longer read
    // by any component; future readers should treat the column as
    // legacy. character + npc realtime subs continue below.

    // Realtime: character HP / conditions sync — keeps BattleMap and party panel live
    const charsChannel = supabase
      .channel(`campaign-chars-${campaign.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'characters',
        filter: `campaign_id=eq.${campaign.id}`,
      }, (payload: { new: Record<string, unknown> }) => {
        if (!payload.new?.id) return;
        setCharacters(prev => prev.map(c =>
          c.id === payload.new.id
            ? { ...c, ...(payload.new as Partial<typeof c>) }
            : c
        ));
      })
      .subscribe();

    // v2.244 — Realtime: NPC HP / conditions sync. The v2.243.1 migration
    // added `npcs` to `supabase_realtime`, so UPDATE echoes flow here for
    // the BattleMap to render damaged-state overlays + condition icons
    // live as the DM works the panel. INSERT covers roster bulk-add (so
    // newly placed NPC tokens get HP bars without a full reload), DELETE
    // covers DM cleanup.
    const npcsChannel = supabase
      .channel(`campaign-npcs-${campaign.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'npcs',
        filter: `campaign_id=eq.${campaign.id}`,
      }, (payload: { new: Record<string, unknown> }) => {
        if (!payload.new?.id) return;
        setNpcs(prev => prev.map(n =>
          n.id === payload.new.id ? { ...n, ...(payload.new as any) } : n
        ));
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'npcs',
        filter: `campaign_id=eq.${campaign.id}`,
      }, (payload: { new: Record<string, unknown> }) => {
        if (!payload.new?.id) return;
        setNpcs(prev => prev.some(n => n.id === payload.new.id)
          ? prev
          : [...prev, payload.new as any]);
      })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'npcs',
        filter: `campaign_id=eq.${campaign.id}`,
      }, (payload: { old: Record<string, unknown> }) => {
        if (!payload.old?.id) return;
        setNpcs(prev => prev.filter(n => n.id !== payload.old.id));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(charsChannel);
      supabase.removeChannel(npcsChannel);
    };
  }, [campaign.id]);

  async function loadMembers() {
    const { data } = await getCampaignMembers(campaign.id);
    setMembers(data.map((m: MemberWithProfile) => ({
      ...m,
      display_name: m.profiles?.display_name ?? null,
      email: m.profiles?.email ?? '',
    })));
  }

  async function loadCharacters() {
    const { data } = await getCharactersByCampaign(campaign.id);
    setCharacters(data);
  }

  // v2.244 — load just the canvas-relevant subset of npcs columns. The
  // narrow projection avoids round-tripping social-graph fields the
  // BattleMap doesn't use (notes, faction, last_seen, etc.).
  async function loadNpcs() {
    const { data, error } = await supabase
      .from('homebrew_monsters')
      .select('id, name, hp, max_hp, ac, conditions, is_alive, visible_to_players')
      .eq('campaign_id', campaign.id);
    if (error) {
      console.error('[CampaignDashboard] loadNpcs failed', error);
      return;
    }
    setNpcs((data ?? []) as any);
  }

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteError(null);

    const { data: found, error: lookupErr } = await lookupProfileByEmail(inviteEmail);
    if (lookupErr || !found) {
      setInviteError('No DNDKeep account found for that email address.');
      setInviting(false);
      return;
    }

    const { error } = await addCampaignMember(campaign.id, found.id);
    if (error) setInviteError(error.message);
    else { setInviteEmail(''); await loadMembers(); }
    setInviting(false);
  }

  async function removeMember(userId: string) {
    if (userId === campaign.owner_id) return;
    // v2.283.0 — was: silent delete. Now confirms first, surfaces a
    // toast on failure, and unassigns the player's PCs from this
    // campaign (otherwise their character rows keep `campaign_id =
    // this.id` and look like orphaned ghosts in the Party tab and
    // RLS-filtered queries). Owner cannot be removed (guard above);
    // RLS additionally enforces this server-side.
    const m = members.find(x => x.user_id === userId);
    const displayName = m?.display_name ?? m?.email ?? 'this player';
    const ok = await confirmModal({
      title: 'Remove player?',
      message: `${displayName} will be removed from the campaign. Their character(s) will be unassigned but not deleted — they can rejoin via the invite code.`,
      confirmLabel: 'Remove',
      cancelLabel: 'Cancel',
      danger: true,
    });
    if (!ok) return;
    // Unassign this user's PCs from the campaign FIRST, then drop the
    // membership row. Reverse order would leave the membership row
    // gone (RLS would block the character UPDATE) and orphan the PCs.
    const { error: unassignErr } = await supabase
      .from('characters')
      .update({ campaign_id: null })
      .eq('campaign_id', campaign.id)
      .eq('user_id', userId);
    if (unassignErr) {
      console.error('[CampaignDashboard] PC unassign failed:', unassignErr);
      showToast(`Couldn't remove player: ${unassignErr.message}`, 'error');
      return;
    }
    const { error } = await removeCampaignMember(campaign.id, userId);
    if (error) {
      console.error('[CampaignDashboard] removeCampaignMember failed:', error);
      showToast(`Couldn't remove player: ${error.message}`, 'error');
      return;
    }
    await loadMembers();
    await loadCharacters();
    showToast(`${displayName} removed from the campaign.`, 'success');
  }

  async function handleRefreshCode() {
    setRefreshingCode(true);
    const { data } = await refreshCampaignJoinCode(campaign.id);
    if (data) setJoinCode(data);
    setRefreshingCode(false);
  }

  async function handleCopyCode() {
    if (!joinCode) return;
    try {
      await navigator.clipboard.writeText(joinCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      // Fallback: select text manually
    }
  }

  // v2.286.0 — toggleCombat removed. The legacy boolean-flip combat
  // start (campaign_sessions.combat_active) was retired in favor of
  // the modern combat_encounters pipeline. Combat now starts via the
  // header <StartCombatButton> in this dashboard, which calls
  // startEncounter() and seeds combat_participants. The boolean
  // column stays in the schema for now to avoid a coupled migration;
  // schema cleanup is its own future ship.

  return (
    <CombatProvider campaignId={campaign.id}>
    <div style={{ paddingBottom: 72 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', marginBottom: 'var(--sp-6)', flexWrap: 'wrap' }}>
        <button className="btn-ghost btn-sm" onClick={onBack}>Back</button>
        <div style={{ flex: 1 }}>
          <h2 style={{ marginBottom: 'var(--sp-1)' }}>{campaign.name}</h2>
          {campaign.setting && (
            <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', fontFamily: 'var(--ff-body)' }}>
              {campaign.setting}
            </p>
          )}
        </div>

        {/* Invite code — always visible in header */}
        {joinCode && (
          <button
            onClick={handleCopyCode}
            title="Click to copy join code"
            style={{
              display: 'flex', alignItems: 'center', gap: 'var(--sp-2)',
              padding: 'var(--sp-2) var(--sp-3)',
              background: codeCopied ? 'var(--c-green-bg)' : 'var(--c-gold-bg)',
              border: `1px solid ${codeCopied ? 'rgba(5,150,105,0.4)' : 'var(--c-gold-bdr)'}`,
              borderRadius: 'var(--r-lg)', cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: codeCopied ? 'var(--c-green-l)' : 'var(--c-gold-l)' }}>
              {codeCopied ? '✓ Copied!' : 'Invite Code:'}
            </span>
            <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 800, fontSize: 'var(--fs-md)', letterSpacing: '0.12em', color: codeCopied ? 'var(--c-green-l)' : 'var(--c-gold-xl)' }}>
              {joinCode}
            </span>
          </button>
        )}
        <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
          <button
            className="btn-ghost btn-sm"
            onClick={() => setActiveTab('map')}
            style={{ color: activeTab === 'map' ? 'var(--c-gold-l)' : 'var(--t-2)', fontSize: 12 }}
            title="Battle Map"
          >
            Map
          </button>
          {isOwner && <StartCombatButton campaignId={campaign.id} />}
          {isOwner && (
            <CampaignSettingsButton
              campaign={campaign}
              onBack={onBack}
              onCampaignUpdate={updates => setCampaign(c => ({ ...c, ...updates }))}
              onMembersChanged={() => {
                // v2.335.0 — P4: refresh the dashboard's own members copy
                // + join code state when DM invites/removes/refreshes via
                // Settings. Settings has its own state but the dashboard
                // also caches members for the Party / Combat / DMlobby
                // mounts that don't refetch on their own.
                loadMembers();
                // Re-pull the campaign row to pick up a new join_code if
                // the DM regenerated. Cheaper than threading the new code
                // up through Settings → button → dashboard.
                supabase.from('campaigns').select('join_code').eq('id', campaign.id).single().then(({ data }) => {
                  if (data?.join_code) setCampaign(c => ({ ...c, join_code: data.join_code }));
                });
              }}
            />
          )}
        </div>
      </div>

      {/* Tabs */}
      {/* v2.276.0 — Removed Recap and Notes tabs. Recap (AI session
          summaries) was rarely used and the AISummary component is
          dropped from imports. Notes was a freeform per-campaign
          textarea — content is preserved in the campaigns.notes column
          but no longer surfaced in the UI; planned chat surface in
          v2.288 supersedes the freeform-notes use case. */}
      <div className="tabs">
        {/* v2.335.0 — P4: Members tab hidden for DMs. The DM manages
            invites + removals from Settings → Members now. Players
            keep the dashboard tab so they can still assign their PC
            and see the roster. */}
        {([...(isOwner ? [] : ['members'] as const), 'party', ...(isOwner ? ['dm'] : []), 'map', 'session', 'log', 'chat', 'npcs', 'schedule', ...(isOwner ? ['discord'] : [])] as const).map(tab => {
          const labels: Record<string, string> = {
            members: 'Members', session: 'Combat',
            party: 'Party', log: 'Log', chat: 'Chat',
            schedule: 'Schedule', npcs: 'NPCs',
            dm: 'DM Screen', discord: 'Discord', map: 'Battle Map',
          };
          return (
            <button key={tab} className={`tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab as typeof activeTab)}>
              {labels[tab] ?? tab}
            </button>
          );
        })}
      </div>

      <ErrorBoundary section={activeTab}>
      <div key={activeTab} className="animate-fade-in">
        {/* Members tab */}
        {activeTab === 'members' && (
          <div style={{ maxWidth: 600 }}>

            {/* Invite Code panel — DM only */}
            {isOwner && (
              <div className="panel" style={{ marginBottom: 'var(--sp-6)' }}>
                <div className="section-header">Invite Code</div>
                <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', marginBottom: 'var(--sp-3)', lineHeight: 1.6 }}>
                  Share this code with players. They enter it on the Campaigns page to join.
                </p>
                <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{
                    fontFamily: 'var(--ff-body)', fontWeight: 900,
                    fontSize: '2rem', letterSpacing: '0.25em',
                    color: 'var(--c-gold-l)', background: '#080d14',
                    border: '2px solid var(--c-gold-bdr)',
                    borderRadius: 'var(--r-md)',
                    padding: 'var(--sp-2) var(--sp-6)',
                    minWidth: 180, textAlign: 'center',
                  }}>
                    {joinCode || '——'}
                  </div>
                  <button
                    className="btn-gold btn-sm"
                    onClick={handleCopyCode}
                    disabled={!joinCode}
                  >
                    {codeCopied ? 'Copied' : 'Copy Code'}
                  </button>
                  <button
                    className="btn-secondary btn-sm"
                    onClick={handleRefreshCode}
                    disabled={refreshingCode}
                    title="Generate a new invite code — the old one will stop working"
                  >
                    {refreshingCode ? 'Refreshing...' : 'New Code'}
                  </button>
                </div>
                <p style={{ marginTop: 'var(--sp-2)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', fontFamily: 'var(--ff-body)' }}>
                  Generating a new code invalidates the current one.
                </p>
              </div>
            )}

            {/* Email invite (also DM only) */}
            {isOwner && (
              <form onSubmit={handleInvite} style={{ display: 'flex', gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)' }}>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="Or invite by email address..."
                  style={{ flex: 1 }}
                />
                <button type="submit" className="btn-secondary" disabled={inviting}>
                  {inviting ? 'Inviting...' : 'Invite'}
                </button>
              </form>
            )}
            {inviteError && (
              <div style={{ marginBottom: 'var(--sp-4)', background: 'rgba(155,28,28,0.15)', border: '1px solid rgba(107,20,20,1)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)', fontSize: 'var(--fs-sm)', color: '#fca5a5', fontFamily: 'var(--ff-body)' }}>
                {inviteError}
              </div>
            )}
            <div className="section-header">Players ({members.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
              {members.map(m => (
                <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--sp-3) var(--sp-4)', background: 'var(--c-raised)', borderRadius: 'var(--r-md)', border: '1px solid var(--c-border)' }}>
                  <div>
                    <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 600, color: 'var(--t-1)', fontSize: 'var(--fs-sm)' }}>
                      {m.display_name ?? m.email}
                      {m.user_id === user?.id && <span style={{ color: 'var(--t-2)', marginLeft: 'var(--sp-2)' }}>(you)</span>}
                    </div>
                    {m.display_name && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>{m.email}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
                    <span className={m.role === 'dm' ? 'badge badge-gold' : 'badge badge-muted'}>{m.role.toUpperCase()}</span>
                    {isOwner && m.user_id !== campaign.owner_id && (
                      // v2.283.0 — was: btn-ghost btn-sm with --t-2 color
                      // (visually muted, easy to miss). Bumped to a red-
                      // tinted destructive style so the action's nature is
                      // clear at a glance, matching how the Delete-token
                      // affordance reads in the BattleMap context menu.
                      <button
                        onClick={() => removeMember(m.user_id)}
                        title={`Remove ${m.display_name ?? m.email} from this campaign`}
                        style={{
                          fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
                          padding: '4px 10px',
                          background: 'rgba(248,113,113,0.10)',
                          border: '1px solid rgba(248,113,113,0.35)',
                          borderRadius: 'var(--r-sm, 4px)',
                          color: '#f87171',
                          cursor: 'pointer',
                          letterSpacing: '0.04em',
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* v2.283.0 — Assign-my-PC panel (formerly the Characters
                tab). For players, this is where they hook their
                unassigned PC into the campaign and unassign it later
                if they want to leave. The DM sees nothing here —
                they don't have PCs to assign and the per-player
                roster is in the Party tab. */}
            <AssignMyCharacterPanel
              campaignId={campaign.id}
              userId={user?.id ?? ''}
              onRefresh={loadCharacters}
            />
          </div>
        )}

        {/* Session tab — DM Lobby for owners, read-only tracker for players */}
        {activeTab === 'session' && (
          isOwner ? (
            <DMlobby
              campaign={campaign}
              playerCharacters={characters.map(c => ({
                id: c.id, name: c.name, current_hp: c.current_hp, max_hp: c.max_hp,
                armor_class: c.armor_class, class_name: c.class_name,
                level: c.level,
                // v2.292.0 — was: conditions: []. The previous bug
                // path wrote conditions into sessionState.initiative_order
                // and merged them client-side; the prop never carried
                // real values. Now the canonical column flows through
                // and the DMlobby Players-tab Conditions UI shows the
                // actual state in sync with the character sheet.
                conditions: [],
                active_conditions: c.active_conditions ?? [],
              }))}
              members={members}
              isOwner={isOwner}
              /* v2.286.0 — onToggleCombat dropped. The legacy button
                 it drove is gone; modern combat starts via the
                 header <StartCombatButton>. */
              /* v2.296.0 — sessionState/onUpdateSession dropped from
                 mount. session_states table dropped this ship; the
                 props were a no-op shim since v2.292. */
            />
          ) : (
            // v2.286.0 — Player-side session tab. Was the legacy
            // <InitiativeTracker> reading sessionState.initiative_order;
            // that data isn't populated by modern combat starts (which
            // write to combat_participants instead). Replaced with a
            // pointer to the InitiativeStrip at the bottom of the page,
            // which auto-mounts whenever the DM has an active encounter
            // and is the actual surface players interact with.
            <div style={{ maxWidth: 600 }}>
              <div style={{
                padding: '20px 24px',
                background: 'var(--c-card)',
                border: '1px solid var(--c-border)',
                borderRadius: 'var(--r-lg, 12px)',
                fontFamily: 'var(--ff-body)',
              }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--c-gold-l)', marginBottom: 8 }}>
                  Combat
                </div>
                <div style={{ fontSize: 14, color: 'var(--t-1)', lineHeight: 1.5, marginBottom: 8 }}>
                  When your DM starts an encounter, the initiative strip appears at the bottom of the page automatically.
                </div>
                <div style={{ fontSize: 12, color: 'var(--t-3)', lineHeight: 1.5 }}>
                  You'll see whose turn it is, your remaining action / bonus / reaction / movement budget, and prompts for attacks, saves, and reactions as they come in. No setup required from your side.
                </div>
              </div>
            </div>
          )
        )}

        {/* v2.276.0 — Notes tab content block removed. */}

        {/* Party tab — real-time HP/conditions for all members */}
        {activeTab === 'party' && (
          <PartyDashboard campaignId={campaign.id} isOwner={isOwner} campaign={campaign} />
        )}

        {/* Log tab */}
        {activeTab === 'log' && (
          <div style={{ maxWidth: 720 }}>
            <p style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', marginBottom: 'var(--sp-3)' }}>
              {/* v2.93.0: unified combat_events view with Player / DM / NPC / Monster filters */}
              Live feed of every attack, spell, condition, and roll in this campaign. Filter by actor or event type.
            </p>
            <CombatEventLog campaignId={campaign.id} mode="campaign" maxHeight={560} />
          </div>
        )}

        {/* Party chat */}
        {activeTab === 'chat' && (
          <div style={{ maxWidth: 600, height: 520, display: 'flex', flexDirection: 'column', background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-xl)', overflow: 'hidden' }}>
            <PartyChat
              campaignId={campaign.id}
              characterName={characters.find(c => c.user_id === user?.id)?.name ?? (isOwner ? 'DM' : 'Unknown')}
              avatarUrl={characters.find(c => c.user_id === user?.id)?.avatar_url}
            />
          </div>
        )}

        {/* DM Screen — owner only */}
        {activeTab === 'dm' && isOwner && (
          <DMScreen
            campaign={campaign}
            /* v2.296.0 — sessionState/onUpdateSession dropped from
               mount. session_states table dropped this ship; the
               props were a no-op shim since v2.291. */
          />
        )}

        {/* Session Scheduler */}
        {activeTab === 'schedule' && (
          <div>
            <h3 style={{ marginBottom: 'var(--sp-2)' }}>Session Scheduler</h3>
            <p style={{ color: 'var(--t-2)', fontSize: 'var(--fs-sm)', marginBottom: 'var(--sp-4)' }}>
              Find a time that works for everyone. Results sync with Discord if connected.
            </p>
            <SessionScheduler campaignId={campaign.id} isOwner={isOwner} />
          </div>
        )}

        {/* NPC Manager */}
        {activeTab === 'npcs' && (
          <div>
            <h3 style={{ marginBottom: 'var(--sp-2)' }}>NPCs</h3>
            <p style={{ color: 'var(--t-2)', fontSize: 'var(--fs-sm)', marginBottom: 'var(--sp-4)' }}>
              Track allies, enemies, merchants, and notable characters your party encounters.
            </p>
            <NPCManager campaignId={campaign.id} isOwner={isOwner} />
          </div>
        )}

        {/* v2.276.0 — Recap (AI Session Summary) tab content block
            removed. AISummary component is no longer imported. */}

        {/* v2.95.0 — Phase C: one unified Battle Map for everyone.
            DM gets full controls; players get view-all + drag-own-token-only via myCharacterId.
            v2.208.0 — Phase Q.1 pt 1: feature-flag toggle between v1 (the
            existing primitive map) and v2 (the PixiJS rewrite).
            v2.267.0 — v1 is no longer reachable. v2 is the default + only
            renderer. The localStorage flag `dndkeep:battlemap_v2:*` and the
            toggle ribbon are removed. v1 (`<BattleMap>` import) and the
            old PlayerBattleMap stay in the codebase as dead code so a
            rollback ship can re-mount them if v2 hits a P0 — but they're
            not user-reachable. v1 was missing every feature the v2 backlog
            added (walls, fog, drawings, ruler, FX, NPC roster, attunement
            tokens, etc.) so leaving it as the default was confusing — DMs
            kept reporting "walls don't work" because they were on v1. */}
        {activeTab === 'map' && (() => {
          const commonProps = {
            campaignId: campaign.id,
            isDM: isOwner,
            userId: user?.id ?? '',
            myCharacterId: characters.find(c => c.user_id === user?.id)?.id ?? null,
            playerCharacters: characters.map(c => ({
              id: c.id, name: c.name, class_name: c.class_name, level: c.level,
              current_hp: c.current_hp, max_hp: c.max_hp, armor_class: c.armor_class,
              active_conditions: c.active_conditions ?? [],
              strength: c.strength, dexterity: c.dexterity, constitution: c.constitution,
              intelligence: c.intelligence, wisdom: c.wisdom, charisma: c.charisma,
              speed: c.speed,
              // v2.229 — needed by ChecksPanel (rendered in TokenQuickPanel)
              // for skill/save modifier computation.
              saving_throw_proficiencies: c.saving_throw_proficiencies ?? [],
              skill_proficiencies: c.skill_proficiencies ?? [],
              skill_expertises: c.skill_expertises ?? [],
              // v2.231 — needed by PartyVitalsBar to render slot pips.
              spell_slots: c.spell_slots ?? {},
            })),
            // v2.296.0 — sessionState/onUpdateSession dropped from
            // mount. session_states table dropped this ship; the
            // props were a no-op shim. The "v2.231 initiative bar"
            // referenced below was retired earlier in the unification
            // arc and never depended on session_states data anyway.
            //   was: sessionState: sessionState ?? null,
            //   was: onUpdateSession: updateSessionState,
            // v2.244 — NPC combat state for token visual feedback (HP
            // bars, condition icons, dead overlay). Filtered to NPCs with
            // numeric HP so plain marker NPCs (no HP/AC) don't show empty
            // HP bars. Players only see NPCs flagged visible_to_players;
            // the DM sees everything regardless.
            npcs: npcs
              .filter(n => n.hp != null && n.max_hp != null && n.max_hp > 0)
              .filter(n => isOwner || n.visible_to_players === true)
              .map(n => ({
                id: n.id,
                name: n.name,
                current_hp: n.hp ?? 0,
                max_hp: n.max_hp ?? 1,
                conditions: n.conditions ?? [],
              })),
          };
          return (
            <div className="battlemap-fullwidth">
              <Suspense fallback={
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  minHeight: 400, padding: 'var(--sp-6, 32px)',
                  background: 'var(--c-card)', border: '1px solid var(--c-border)',
                  borderRadius: 'var(--r-lg, 12px)',
                  fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-3)',
                }}>
                  Loading Battle Map…
                </div>
              }>
                <BattleMapV2 {...commonProps} />
              </Suspense>
            </div>
          );
        })()}

        {activeTab === 'discord' && isOwner && (
          <div>
            <h3 style={{ marginBottom: 'var(--sp-2)' }}>Discord Integration</h3>
            <p style={{ color: 'var(--t-2)', fontSize: 'var(--fs-sm)', marginBottom: 'var(--sp-4)' }}>
              Link your Discord server for scheduling commands and session alerts.
            </p>
            <DiscordSettings campaignId={campaign.id} />
          </div>
        )}
      </div>
      </ErrorBoundary>
    </div>
    {/* v2.96.0 — Phase D: bottom initiative strip renders when active encounter exists */}
    <InitiativeStrip isDM={isOwner} />
    {/* v2.97.0 — Phase E: auto-opens when a pending attack is in flight (DM only) */}
    <AttackResolutionModal campaignId={campaign.id} isDM={isOwner} />
    {/* v2.98.0 — Phase E: reaction prompt for target player on hit */}
    <ReactionPromptModal campaignId={campaign.id} />
    {/* v2.139.0 — Phase M pt 2: DM-only LR prompt on failed monster saves */}
    <LegendaryResistancePromptModal campaignId={campaign.id} isDM={isOwner} />
    </CombatProvider>
  );
}

// ── Campaign Settings Button — self-contained to avoid minifier scope issues ──
// v2.194.0 — Phase Q.0 pt 35: accepts onCampaignUpdate callback that
// bubbles changes up to CampaignDashboard's lifted state. The button
// still keeps a local `current` so the modal renders with up-to-date
// values mid-edit, but every change ALSO fires the parent callback so
// PartyDashboard (which reads from dashboard's state) re-renders with
// fresh settings. Without this, toggling Award XP in the modal updated
// `current` in the modal but the parent's `campaign` prop was stale,
// so the Party tab's DM Controls didn't surface the toggle until the
// user reloaded the page.
function CampaignSettingsButton({
  campaign,
  onBack,
  onCampaignUpdate,
  onMembersChanged,
}: {
  campaign: Campaign;
  onBack: () => void;
  onCampaignUpdate?: (updates: Partial<Campaign>) => void;
  /** v2.335.0 — P4: bubbles up when the DM acts on membership inside
   *  Settings (invite, remove, refresh code) so the dashboard can
   *  resync its own members list + join code without a refresh. */
  onMembersChanged?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(campaign);
  return (
    <>
      <button
        className="btn-secondary btn-sm"
        onClick={() => setOpen(true)}
        title="Campaign Settings"
      >
        Settings
      </button>
      {open && (
        <CampaignSettings
          campaign={current}
          onClose={() => setOpen(false)}
          onDeleted={() => { setOpen(false); onBack(); }}
          onUpdated={updates => {
            setCurrent(c => ({ ...c, ...updates }));
            onCampaignUpdate?.(updates);
          }}
          onMembersChanged={onMembersChanged}
        />
      )}
    </>
  );
}

// ── Assign My Character Panel ────────────────────────────────────────────────
// v2.283.0 — Rewrite of the former CharactersTab. Mounted at the
// bottom of the Members tab. Scope is intentionally narrower than
// the old tab:
//   - SHOWS: the current user's PCs that are NOT yet in this campaign
//     (with an "Assign to Campaign" button each), plus the current
//     user's PC IF it's already assigned (with an "Unassign" button).
//   - DROPS: the full party-roster card grid the old tab rendered.
//     That UI duplicated the Party tab one-to-one (HP bar, AC, name,
//     class/level) and was the main reason this surface felt
//     redundant. Party tab remains the canonical party state view.
//
// Self-contained: does its own getCharacters fetch for the user's
// own roster (independent of the dashboard's `characters` prop,
// which only contains *assigned* PCs). The `characters` prop is no
// longer threaded — the panel filters its self-fetched roster by
// `campaign_id == campaignId` directly, which is more accurate
// (the dashboard's `characters` only contains the user's *assigned*
// PCs in this campaign anyway, but the filter is now scoped here).
function AssignMyCharacterPanel({ campaignId, userId, onRefresh }: {
  campaignId: string;
  userId: string;
  onRefresh: () => void;
}) {
  const [myChars, setMyChars] = useState<Character[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (userId) {
      getCharacters(userId).then(({ data }) => setMyChars(data ?? []));
    }
  }, [userId]);

  async function assign(charId: string) {
    setBusy(charId);
    await supabase.from('characters').update({ campaign_id: campaignId }).eq('id', charId);
    await onRefresh();
    const { data } = await getCharacters(userId);
    setMyChars(data ?? []);
    setBusy(null);
  }

  async function unassign(charId: string) {
    setBusy(charId);
    await supabase.from('characters').update({ campaign_id: null }).eq('id', charId);
    await onRefresh();
    const { data } = await getCharacters(userId);
    setMyChars(data ?? []);
    setBusy(null);
  }

  // The user's PCs split into "in this campaign" and "not yet
  // assigned anywhere". Characters assigned to OTHER campaigns are
  // intentionally hidden — their other campaign owns them; offering
  // to reassign would be a footgun.
  const myAssigned = myChars.filter(c => c.campaign_id === campaignId);
  const myUnassigned = myChars.filter(c => c.campaign_id == null);

  // No PCs to show? Render nothing — the panel is for players, not
  // the DM, and a DM with no characters of their own shouldn't see
  // an empty header. Players who haven't created a PC yet get a
  // pointer to the character creator.
  if (myAssigned.length === 0 && myUnassigned.length === 0) return null;

  return (
    <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--c-border)' }}>
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--c-gold-l)', marginBottom: 10 }}>
        Your Characters
      </div>

      {myAssigned.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: myUnassigned.length > 0 ? 16 : 0 }}>
          {myAssigned.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--c-raised)', border: '1px solid var(--c-border)', borderRadius: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--c-card)', border: '1px solid var(--c-border)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, color: 'var(--c-gold-l)' }}>
                {c.avatar_url ? <img src={c.avatar_url} width={36} height={36} style={{ objectFit: 'cover' }} alt="" /> : c.name[0]}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--t-1)' }}>{c.name}</div>
                <div style={{ fontSize: 11, color: 'var(--t-3)' }}>
                  Lv {c.level} {c.class_name} · {c.species} <span style={{ marginLeft: 6, color: 'var(--c-gold-l)' }}>· In this campaign</span>
                </div>
              </div>
              <button
                onClick={() => unassign(c.id)}
                disabled={busy === c.id}
                title="Remove this character from the campaign (does not delete the character)"
                style={{
                  fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
                  padding: '4px 10px',
                  background: 'rgba(248,113,113,0.10)',
                  border: '1px solid rgba(248,113,113,0.35)',
                  borderRadius: 'var(--r-sm, 4px)',
                  color: '#f87171',
                  cursor: 'pointer',
                  letterSpacing: '0.04em',
                  opacity: busy === c.id ? 0.5 : 1,
                }}
              >
                {busy === c.id ? 'Unassigning…' : 'Unassign'}
              </button>
            </div>
          ))}
        </div>
      )}

      {myUnassigned.length > 0 && (
        <>
          {myAssigned.length > 0 && (
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t-3)', marginBottom: 6 }}>
              Available to assign
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {myUnassigned.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--c-raised)', border: '1px solid var(--c-border)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, color: 'var(--c-gold-l)' }}>
                  {c.avatar_url ? <img src={c.avatar_url} width={36} height={36} style={{ objectFit: 'cover' }} alt="" /> : c.name[0]}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--t-1)' }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--t-3)' }}>Lv {c.level} {c.class_name} · {c.species}</div>
                </div>
                <button
                  onClick={() => assign(c.id)}
                  disabled={busy === c.id}
                  style={{ fontSize: 12, fontWeight: 700, padding: '6px 16px', borderRadius: 8, cursor: 'pointer', minHeight: 0, border: '1px solid var(--c-gold-bdr)', background: 'var(--c-gold-bg)', color: 'var(--c-gold-l)', opacity: busy === c.id ? 0.5 : 1 }}
                >
                  {busy === c.id ? 'Assigning…' : 'Assign to Campaign'}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}