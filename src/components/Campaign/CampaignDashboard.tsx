import { useState, useEffect, useRef, type FormEvent } from 'react';
import type { Campaign, Character, CampaignMember } from '../../types';
import { useCampaign } from '../../context/CampaignContext';
import { useAuth } from '../../context/AuthContext';
import {
  getCharactersByCampaign, getCampaignMembers, lookupProfileByEmail, getCharacters, supabase,
  addCampaignMember, removeCampaignMember, refreshCampaignJoinCode, type MemberWithProfile,
} from '../../lib/supabase';
import InitiativeTracker from './InitiativeTracker';
import DMlobby from './DMlobby';
import PartyView from './PartyView';
import ActionLog from '../shared/ActionLog';
import CombatEventLog from '../shared/CombatEventLog';
import PartyChat from './PartyChat';
import DMScreen from './DMScreen';
import SessionScheduler from './SessionScheduler';
import NPCManager from './NPCManager';
import AISummary from './AISummary';
import DiscordSettings from './DiscordSettings';
import PartyDashboard from './PartyDashboard';
import BattleMap from './BattleMap';
import { CombatProvider } from '../../context/CombatContext';
import InitiativeStrip from '../Combat/InitiativeStrip';
import StartCombatButton from '../Combat/StartCombatButton';
import ErrorBoundary from '../ErrorBoundary';
import CampaignSettings from './CampaignSettings';

interface CampaignDashboardProps {
  campaign: Campaign;
  onBack: () => void;
}

export default function CampaignDashboard({ campaign, onBack }: CampaignDashboardProps) {
  const { user } = useAuth();
  const { sessionState, updateSessionState } = useCampaign();
  const [members, setMembers] = useState<(CampaignMember & { display_name: string | null; email: string })[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'members' | 'characters' | 'session' | 'party' | 'log' | 'chat' | 'notes' | 'schedule' | 'npcs' | 'recap' | 'dm' | 'discord' | 'map'>('characters');
  // Handle deep-link ?tab=map from character sheet Map button
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab === 'map') setActiveTab('map');
  }, []);
  const [joinCode, setJoinCode] = useState<string>(campaign.join_code ?? '');
  const [refreshingCode, setRefreshingCode] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [notes, setNotes] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const notesSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Derived from props/context — after all hooks
  const isOwner = campaign.owner_id === user?.id;

  useEffect(() => {
    loadMembers();
    loadCharacters();
    loadNotes();

    // Realtime: campaign notes
    const notesChannel = supabase
      .channel(`campaign-notes-${campaign.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'campaigns',
        filter: `id=eq.${campaign.id}`,
      }, (payload: { new: Record<string, unknown> }) => {
        if (payload.new && typeof payload.new.notes === 'string') {
          setNotes(payload.new.notes as string);
        }
      })
      .subscribe();

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

    return () => {
      supabase.removeChannel(notesChannel);
      supabase.removeChannel(charsChannel);
    };
  }, [campaign.id]);

  async function loadNotes() {
    const { data } = await supabase
      .from('campaigns')
      .select('notes')
      .eq('id', campaign.id)
      .single();
    if (data?.notes) setNotes(data.notes);
  }

  function handleNotesChange(value: string) {
    setNotes(value);
    if (notesSaveTimer.current) clearTimeout(notesSaveTimer.current);
    setNotesSaving(true);
    notesSaveTimer.current = setTimeout(async () => {
      await supabase.from('campaigns').update({ notes: value }).eq('id', campaign.id);
      setNotesSaving(false);
    }, 800);
  }

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
    await removeCampaignMember(campaign.id, userId);
    await loadMembers();
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

  async function toggleCombat() {
    await updateSessionState({ combat_active: !sessionState?.combat_active });
  }

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
            <CampaignSettingsButton campaign={campaign} onBack={onBack} />
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {(['characters', 'party', ...(isOwner ? ['dm'] : []), 'map', 'session', 'log', 'chat', 'npcs', 'members', 'notes', 'schedule', 'recap', ...(isOwner ? ['discord'] : [])] as const).map(tab => {
          const labels: Record<string, string> = {
            members: 'Members', characters: 'Characters', session: 'Combat',
            party: 'Party', log: 'Log', chat: 'Chat', notes: 'Notes',
            schedule: 'Schedule', npcs: 'NPCs', recap: 'Recap',
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
                      <button className="btn-ghost btn-sm" onClick={() => removeMember(m.user_id)} style={{ color: 'var(--t-2)' }}>
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Characters tab */}
        {activeTab === 'characters' && (
          <CharactersTab
            campaignId={campaign.id}
            userId={user?.id ?? ''}
            characters={characters}
            onRefresh={loadCharacters}
          />
        )}

        {/* Session tab — DM Lobby for owners, read-only tracker for players */}
        {activeTab === 'session' && (
          isOwner ? (
            <DMlobby
              campaign={campaign}
              sessionState={sessionState}
              playerCharacters={characters.map(c => ({
                id: c.id, name: c.name, current_hp: c.current_hp, max_hp: c.max_hp,
                armor_class: c.armor_class, class_name: c.class_name,
                level: c.level, conditions: [],
              }))}
              members={members}
              isOwner={isOwner}
              onUpdateSession={updateSessionState}
              onToggleCombat={toggleCombat}
            />
          ) : (
            <InitiativeTracker
              sessionState={sessionState}
              isOwner={false}
              playerCharacters={characters.map(c => ({
                id: c.id, name: c.name, current_hp: c.current_hp,
                max_hp: c.max_hp, armor_class: c.armor_class, initiative_bonus: 0,
              }))}
              onUpdateSession={updateSessionState}
              onToggleCombat={toggleCombat}
            />
          )
        )}

        {/* Notes tab — shared, real-time synced */}
        {activeTab === 'notes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', maxWidth: 720 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="section-header" style={{ marginBottom: 0 }}>Session Notes</div>
              <span style={{
                fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)',
                color: notesSaving ? 'var(--c-gold)' : 'var(--t-2)',
                transition: 'color 200ms',
              }}>
                {notesSaving ? '● Saving…' : '✓ Saved'}
              </span>
            </div>
            <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', fontFamily: 'var(--ff-body)' }}>
              Shared with all campaign members. Changes sync in real-time.
            </p>
            <textarea
              value={notes}
              onChange={e => handleNotesChange(e.target.value)}
              placeholder="Session recap, quest notes, NPC names, loot found…"
              rows={20}
              style={{
                resize: 'vertical', fontSize: 'var(--fs-sm)',
                lineHeight: 1.7, fontFamily: 'var(--ff-body)',
                minHeight: 320,
              }}
            />
          </div>
        )}

        {/* Party tab — real-time HP/conditions for all members */}
        {activeTab === 'party' && (
          <PartyDashboard campaignId={campaign.id} isOwner={isOwner} />
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
            sessionState={sessionState ?? null}
            onUpdateSession={updateSessionState}
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

        {/* AI Session Recap */}
        {activeTab === 'recap' && (
          <div>
            <h3 style={{ marginBottom: 'var(--sp-2)' }}>Session Recaps</h3>
            <AISummary campaignId={campaign.id} campaignName={campaign.name} isOwner={isOwner} />
          </div>
        )}

        {/* v2.95.0 — Phase C: one unified Battle Map for everyone.
            DM gets full controls; players get view-all + drag-own-token-only via myCharacterId. */}
        {activeTab === 'map' && (
          <BattleMap
            campaignId={campaign.id}
            isDM={isOwner}
            userId={user?.id ?? ''}
            myCharacterId={characters.find(c => c.user_id === user?.id)?.id ?? null}
            playerCharacters={characters.map(c => ({
              id: c.id, name: c.name, class_name: c.class_name, level: c.level,
              current_hp: c.current_hp, max_hp: c.max_hp, armor_class: c.armor_class,
              active_conditions: c.active_conditions ?? [],
              strength: c.strength, dexterity: c.dexterity, constitution: c.constitution,
              intelligence: c.intelligence, wisdom: c.wisdom, charisma: c.charisma,
              speed: c.speed,
            }))}
          />
        )}

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
    </CombatProvider>
  );
}

// ── Campaign Settings Button — self-contained to avoid minifier scope issues ──
function CampaignSettingsButton({ campaign, onBack }: { campaign: Campaign; onBack: () => void }) {
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
          onUpdated={updates => setCurrent(c => ({ ...c, ...updates }))}
        />
      )}
    </>
  );
}

// ── Characters Tab ────────────────────────────────────────────────────────────
function CharactersTab({ campaignId, userId, characters, onRefresh }: {
  campaignId: string;
  userId: string;
  characters: Character[];
  onRefresh: () => void;
}) {
  const [myChars, setMyChars] = useState<Character[]>([]);
  const [assigning, setAssigning] = useState<string | null>(null);

  useEffect(() => {
    if (userId) {
      getCharacters(userId).then(({ data }) => setMyChars(data ?? []));
    }
  }, [userId]);

  async function assign(charId: string) {
    setAssigning(charId);
    await supabase.from('characters').update({ campaign_id: campaignId }).eq('id', charId);
    await onRefresh();
    // Refresh my chars list
    const { data } = await getCharacters(userId);
    setMyChars(data ?? []);
    setAssigning(null);
  }

  async function unassign(charId: string) {
    setAssigning(charId);
    await supabase.from('characters').update({ campaign_id: null }).eq('id', charId);
    await onRefresh();
    const { data } = await getCharacters(userId);
    setMyChars(data ?? []);
    setAssigning(null);
  }

  const assignedIds = new Set(characters.map(c => c.id));
  const unassignedMyChars = myChars.filter(c => !assignedIds.has(c.id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* My unassigned characters — assign prompt */}
      {unassignedMyChars.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--c-gold-l)', marginBottom: 10 }}>
            Assign Your Character to This Campaign
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {unassignedMyChars.map(c => (
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
                  disabled={assigning === c.id}
                  style={{ fontSize: 12, fontWeight: 700, padding: '6px 16px', borderRadius: 8, cursor: 'pointer', minHeight: 0, border: '1px solid var(--c-gold-bdr)', background: 'var(--c-gold-bg)', color: 'var(--c-gold-l)', opacity: assigning === c.id ? 0.5 : 1 }}
                >
                  {assigning === c.id ? 'Assigning…' : 'Assign to Campaign'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Assigned characters */}
      <div>
        {characters.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--t-3)', fontSize: 13, border: '1px dashed var(--c-border)', borderRadius: 12 }}>
            {unassignedMyChars.length > 0
              ? 'Use "Assign to Campaign" above to add your character to this campaign.'
              : 'No characters assigned yet. Each player assigns their character from this tab.'}
          </div>
        ) : (
          <>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--t-2)', marginBottom: 10 }}>
              Party — {characters.length} character{characters.length !== 1 ? 's' : ''}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
              {characters.map(c => {
                const isOwn = c.user_id === userId;
                const hpPct = c.max_hp > 0 ? c.current_hp / c.max_hp : 0;
                const col = hpPct > 0.6 ? 'var(--hp-full)' : hpPct > 0.25 ? 'var(--hp-mid)' : 'var(--hp-low)';
                return (
                  <div key={c.id} style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ height: 3, background: col, width: `${Math.max(2, hpPct * 100)}%` }} />
                    <div style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--t-1)' }}>{c.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--t-3)' }}>Lv {c.level} {c.class_name} · {c.species}</div>
                        </div>
                        {isOwn && (
                          <button onClick={() => unassign(c.id)} disabled={assigning === c.id}
                            style={{ fontSize: 9, color: 'var(--t-3)', background: 'none', border: '1px solid var(--c-border)', padding: '2px 7px', borderRadius: 4, cursor: 'pointer' }}>
                            Remove
                          </button>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: col, fontFamily: 'var(--ff-stat)' }}>{c.current_hp}/{c.max_hp} HP</span>
                        <span style={{ fontSize: 11, color: 'var(--t-3)' }}>AC {c.armor_class}</span>
                        {c.inspiration && <span style={{ fontSize: 11, color: 'var(--c-gold-l)' }}></span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Campaign Settings rendered inside CampaignSettingsButton */}
    </div>
  );
}