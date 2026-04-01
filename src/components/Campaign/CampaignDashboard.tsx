import { useState, useEffect, useRef, type FormEvent } from 'react';
import type { Campaign, Character, CampaignMember } from '../../types';
import { useCampaign } from '../../context/CampaignContext';
import { useAuth } from '../../context/AuthContext';
import {
  getCharactersByCampaign, getCampaignMembers, lookupProfileByEmail,
  addCampaignMember, removeCampaignMember, refreshCampaignJoinCode, type MemberWithProfile,
  supabase,
} from '../../lib/supabase';
import InitiativeTracker from './InitiativeTracker';
import DMlobby from './DMlobby';
import PartyView from './PartyView';
import ActionLog from '../shared/ActionLog';
import PartyChat from './PartyChat';
import DMScreen from './DMScreen';
import SessionScheduler from './SessionScheduler';
import NPCManager from './NPCManager';
import AISummary from './AISummary';
import DiscordSettings from './DiscordSettings';
import PartyDashboard from './PartyDashboard';

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
  const [activeTab, setActiveTab] = useState<'members' | 'characters' | 'session' | 'party' | 'log' | 'chat' | 'notes' | 'schedule' | 'npcs' | 'recap' | 'dm' | 'discord'>('members');
  const [joinCode, setJoinCode] = useState<string>(campaign.join_code ?? '');
  const [refreshingCode, setRefreshingCode] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [notes, setNotes] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const notesSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isOwner = campaign.owner_id === user?.id;

  useEffect(() => {
    loadMembers();
    loadCharacters();
    loadNotes();

    // Realtime subscription for notes
    const channel = supabase
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

    return () => { supabase.removeChannel(channel); };
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
    <div>
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
              {codeCopied ? '✓ Copied!' : '🔗 Invite Code:'}
            </span>
            <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 800, fontSize: 'var(--fs-md)', letterSpacing: '0.12em', color: codeCopied ? 'var(--c-green-l)' : 'var(--c-gold-xl)' }}>
              {joinCode}
            </span>
          </button>
        )}
        <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
          {sessionState?.combat_active && (
            <span className="badge badge-crimson" style={{ animation: 'pulse-gold 2s infinite' }}>
              Combat Active — Round {sessionState.round}
            </span>
          )}
          {isOwner && (
            <button
              className={sessionState?.combat_active ? 'btn-danger btn-sm' : 'btn-primary btn-sm'}
              onClick={toggleCombat}
            >
              {sessionState?.combat_active ? 'End Combat' : 'Start Combat'}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {(['members', 'characters', 'session', 'party', 'log', 'chat', 'schedule', 'npcs', 'recap', 'notes', ...(isOwner ? ['dm', 'discord'] : [])] as const).map(tab => {
          const labels: Record<string, string> = {
            members: 'Members', characters: 'Characters', session: '⚔️ Combat',
            party: '👥 Party', log: '📜 Log', chat: '💬 Chat', notes: 'Notes',
            schedule: '📅 Schedule', npcs: '🧙 NPCs', recap: '✨ Recap',
            dm: '🎲 DM Screen', discord: '🎮 Discord',
          };
          return (
            <button key={tab} className={`tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab as typeof activeTab)}>
              {labels[tab] ?? tab}
            </button>
          );
        })}
      </div>

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
          <div>
            {characters.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: 'var(--sp-8)' }}>
                <p style={{ color: 'var(--t-2)', fontFamily: 'var(--ff-body)' }}>
                  No characters assigned to this campaign yet. Players can assign their characters from the character sheet.
                </p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 'var(--sp-4)' }}>
                {characters.map(c => (
                  <div key={c.id} className="card">
                    <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-md)', marginBottom: 'var(--sp-1)' }}>{c.name}</div>
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)', fontFamily: 'var(--ff-body)', marginBottom: 'var(--sp-3)' }}>
                      Level {c.level} {c.class_name} — {c.species}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-sm)' }}>
                      <span style={{ color: c.current_hp > c.max_hp * 0.5 ? 'var(--hp-full)' : 'var(--hp-low)' }}>
                        {c.current_hp}/{c.max_hp} HP
                      </span>
                      <span style={{ color: 'var(--t-2)' }}>AC {c.armor_class}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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
          <PartyDashboard campaignId={campaign.id} />
        )}

        {/* Log tab */}
        {activeTab === 'log' && (
          <div style={{ maxWidth: 720 }}>
            <p style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', marginBottom: 'var(--sp-3)' }}>
              Live feed of every attack, spell, and roll by all party members — updates in real-time.
            </p>
            <ActionLog campaignId={campaign.id} mode="campaign" maxHeight={560} />
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

        {/* Discord Integration */}
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
    </div>
  );
}
