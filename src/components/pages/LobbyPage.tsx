import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Character, Campaign } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useCampaign } from '../../context/CampaignContext';
import { getCharacters, createCharacter, joinCampaignByCode, addCampaignMember } from '../../lib/supabase';

// ── Helpers ────────────────────────────────────────────────────────────────

function hpColor(current: number, max: number) {
  const p = max > 0 ? current / max : 0;
  return p > 0.6 ? 'var(--hp-full)' : p > 0.25 ? 'var(--hp-mid)' : p > 0 ? 'var(--hp-low)' : 'var(--c-border-m)';
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function LobbyPage() {
  const { user, isPro } = useAuth();
  const { campaigns, loadingCampaigns, refreshCampaigns } = useCampaign();
  const navigate = useNavigate();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinSuccess, setJoinSuccess] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', description: '', setting: '' });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!user) return;
    getCharacters(user.id).then(({ data }) => {
      setCharacters(data ?? []);
      setLoading(false);
    });
  }, [user]);

  const canCreate = isPro || characters.length === 0;

  async function handleDuplicate(char: Character, e: React.MouseEvent) {
    e.stopPropagation();
    if (!user) return;
    const { id: _id, created_at: _ca, updated_at: _ua, ...rest } = char as any;
    const copy = { ...rest, user_id: user.id, name: char.name + ' (Copy)', campaign_id: null };
    const { data } = await createCharacter(copy);
    if (data) navigate(`/character/${data.id}`);
  }

  async function handleJoin() {
    if (!user || !joinCode.trim()) return;
    setJoining(true); setJoinError(null); setJoinSuccess(null);
    const { data: campaign, error: lookupErr } = await joinCampaignByCode(joinCode.trim());
    if (lookupErr || !campaign) {
      setJoinError('No campaign found with that code.'); setJoining(false); return;
    }
    const { error: joinErr } = await addCampaignMember(campaign.id, user.id, 'player');
    if (joinErr) {
      setJoinError(joinErr.message.includes('unique') ? 'Already a member.' : joinErr.message);
      setJoining(false); return;
    }
    setJoinSuccess(`Joined "${campaign.name}"!`);
    setJoinCode('');
    setJoining(false);
    await refreshCampaigns();
  }

  async function handleCreateCampaign(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !createForm.name.trim()) return;
    setCreating(true);
    const { createCampaign } = await import('../../lib/supabase');
    const { error } = await createCampaign({
      owner_id: user.id,
      name: createForm.name.trim(),
      description: createForm.description.trim(),
      setting: createForm.setting.trim(),
      is_active: true,
      join_code: '',
    });
    if (!error) {
      setCreateForm({ name: '', description: '', setting: '' });
      setShowCreate(false);
      await refreshCampaigns();
    }
    setCreating(false);
  }

  if (loading) return (
    <div style={{ display: 'flex', gap: 'var(--sp-3)', padding: 'var(--sp-8)', alignItems: 'center' }}>
      <div className="spinner" /><span className="loading-text">Loading...</span>
    </div>
  );

  return (
    <div style={{ maxWidth: 960, display: 'flex', flexDirection: 'column', gap: 'var(--sp-8)' }}>

      {/* ── CHARACTERS ─────────────────────────────────────────────── */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-4)' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--t-1)' }}>Characters</div>
            <div style={{ fontSize: 12, color: 'var(--t-3)', marginTop: 2 }}>
              {characters.length > 0
                ? `${characters.length} character${characters.length !== 1 ? 's' : ''}${!isPro ? ' · Free (1 max)' : ''}`
                : 'Create your first character to get started'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {!isPro && characters.length > 0 && (
              <button className="btn-ghost btn-sm" onClick={() => navigate('/settings')} style={{ color: 'var(--c-gold-l)' }}>
                Upgrade to Pro
              </button>
            )}
            <button className="btn-gold btn-sm" onClick={() => navigate('/creator')} disabled={!canCreate}>
              + New Character
            </button>
          </div>
        </div>

        {characters.length === 0 ? (
          <div style={{ border: '1px dashed var(--c-border-m)', borderRadius: 'var(--r-xl)', padding: '48px 32px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, opacity: 0.2, marginBottom: 16 }}>⚔</div>
            <div style={{ fontWeight: 600, color: 'var(--t-1)', marginBottom: 8 }}>No characters yet</div>
            <p style={{ color: 'var(--t-2)', fontSize: 13, maxWidth: 320, margin: '0 auto 20px' }}>
              Build your hero with the 2024 PHB rules — choose your class, species, background, and abilities.
            </p>
            <button className="btn-gold" onClick={() => navigate('/creator')}>Create Your First Character</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 'var(--sp-3)' }}>
            {characters.map(c => (
              <CharacterCard key={c.id} character={c} onClick={() => navigate(`/character/${c.id}`)} onDuplicate={e => handleDuplicate(c, e)} />
            ))}
          </div>
        )}
      </section>

      {/* ── DIVIDER ────────────────────────────────────────────────── */}
      <div style={{ height: 1, background: 'var(--c-border)' }} />

      {/* ── CAMPAIGNS ──────────────────────────────────────────────── */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-4)' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--t-1)' }}>Campaigns</div>
            <div style={{ fontSize: 12, color: 'var(--t-3)', marginTop: 2 }}>
              {loadingCampaigns ? 'Loading...' : `${campaigns.length} campaign${campaigns.length !== 1 ? 's' : ''}`}
            </div>
          </div>
          {isPro && (
            <button className="btn-gold btn-sm" onClick={() => setShowCreate(v => !v)}>
              + New Campaign
            </button>
          )}
        </div>

        {/* Create campaign form */}
        {showCreate && (
          <div className="animate-fade-in" style={{ background: 'var(--c-card)', border: '1px solid var(--c-gold-bdr)', borderRadius: 'var(--r-xl)', padding: 'var(--sp-4)', marginBottom: 'var(--sp-4)' }}>
            <form onSubmit={handleCreateCampaign} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--c-gold-l)' }}>New Campaign</div>
              <input value={createForm.name} onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))} placeholder="Campaign name *" required />
              <input value={createForm.setting} onChange={e => setCreateForm(p => ({ ...p, setting: e.target.value }))} placeholder="Setting (e.g. Forgotten Realms)" />
              <input value={createForm.description} onChange={e => setCreateForm(p => ({ ...p, description: e.target.value }))} placeholder="Short description (optional)" />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn-gold btn-sm" disabled={creating}>{creating ? 'Creating...' : 'Create Campaign'}</button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setShowCreate(false)}>Cancel</button>
              </div>
            </form>
          </div>
        )}

        {/* Join code input — always visible */}
        <div style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-xl)', padding: 'var(--sp-4)', marginBottom: 'var(--sp-4)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-3)', marginBottom: 10 }}>
            Join a Campaign
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
              placeholder="Enter 6-character code — e.g. XK7F2P"
              maxLength={6}
              style={{ flex: 1, fontWeight: 700, letterSpacing: '0.15em', textAlign: 'center', fontSize: 15, textTransform: 'uppercase' }}
            />
            <button className="btn-gold btn-sm" onClick={handleJoin} disabled={joining || joinCode.trim().length < 4}>
              {joining ? 'Joining...' : 'Join'}
            </button>
          </div>
          {joinError && <div style={{ fontSize: 12, color: 'var(--c-red-l)', marginTop: 8 }}>{joinError}</div>}
          {joinSuccess && <div style={{ fontSize: 12, color: 'var(--hp-full)', marginTop: 8 }}>{joinSuccess}</div>}
        </div>

        {/* Campaign cards */}
        {loadingCampaigns ? (
          <div style={{ display: 'flex', gap: 8, padding: 16, alignItems: 'center' }}>
            <div className="spinner" style={{ width: 14, height: 14 }} /><span style={{ fontSize: 13, color: 'var(--t-2)' }}>Loading campaigns...</span>
          </div>
        ) : campaigns.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--t-3)', fontSize: 13, border: '1px dashed var(--c-border)', borderRadius: 'var(--r-xl)' }}>
            {isPro ? 'No campaigns yet. Create one or join with a code.' : 'Join a campaign with a code above, or upgrade to Pro to create your own.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 'var(--sp-3)' }}>
            {campaigns.map(c => (
              <CampaignCard key={c.id} campaign={c} userId={user?.id ?? ''} onClick={() => navigate(`/campaigns/${c.id}`)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Character Card ─────────────────────────────────────────────────────────

function CharacterCard({ character: c, onClick, onDuplicate }: { character: Character; onClick: () => void; onDuplicate?: (e: React.MouseEvent) => void }) {
  const hpPct = c.max_hp > 0 ? Math.min(1, c.current_hp / c.max_hp) : 0;
  const col = hpColor(c.current_hp, c.max_hp);

  return (
    <div className="character-card" onClick={onClick} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && onClick()}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${col}, transparent)`, borderRadius: 'var(--r-xl) var(--r-xl) 0 0' }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0, background: 'var(--c-raised)', border: '2px solid var(--c-border-m)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, color: 'var(--c-gold-l)', overflow: 'hidden' }}>
          {c.avatar_url ? <img src={c.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : c.name.charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--t-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
          <div style={{ fontSize: 12, color: 'var(--t-2)', marginTop: 1 }}>{c.class_name} {c.level} · {c.species}</div>
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t-3)' }}>HP</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: col }}>{c.current_hp} <span style={{ color: 'var(--t-3)', fontWeight: 400 }}>/ {c.max_hp}</span></span>
        </div>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${hpPct * 100}%`, background: col, borderRadius: 999, boxShadow: `0 0 6px ${col}` }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t-3)' }}>AC</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-1)' }}>{c.armor_class}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t-3)' }}>Speed</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-1)' }}>{c.speed}ft</span>
        </div>
        {c.inspiration && <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}><span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: 'var(--t-3)' }}>Status</span><span style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-gold-l)' }}>Inspired</span></div>}
        {c.campaign_id && <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}><span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: 'var(--t-3)' }}>Campaign</span><span style={{ fontSize: 11, fontWeight: 700, color: 'var(--hp-full)' }}>Active</span></div>}
      </div>
    </div>
  );
}

// ── Campaign Card ──────────────────────────────────────────────────────────

function CampaignCard({ campaign: c, userId, onClick }: { campaign: Campaign; userId: string; onClick: () => void }) {
  const isDM = c.owner_id === userId;
  return (
    <button
      onClick={onClick}
      style={{
        background: 'var(--c-card)', border: `1px solid ${isDM ? 'var(--c-gold-bdr)' : 'var(--c-border)'}`,
        borderLeft: `3px solid ${isDM ? 'var(--c-gold)' : 'var(--c-border-m)'}`,
        borderRadius: 'var(--r-xl)', padding: '14px 16px', textAlign: 'left',
        cursor: 'pointer', width: '100%', transition: 'all var(--tr-fast)',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = isDM ? 'var(--c-gold)' : 'var(--c-border-m)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = isDM ? 'var(--c-gold-bdr)' : 'var(--c-border)'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {isDM && <span style={{ fontSize: 8, fontWeight: 800, color: 'var(--c-gold-l)', background: 'var(--c-gold-bg)', border: '1px solid var(--c-gold-bdr)', padding: '1px 6px', borderRadius: 999, letterSpacing: '0.1em' }}>DM</span>}
        <span style={{ fontWeight: 700, fontSize: 14, color: isDM ? 'var(--c-gold-l)' : 'var(--t-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{c.name}</span>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: c.is_active ? '#4ade80' : 'var(--c-border-m)', boxShadow: c.is_active ? '0 0 6px rgba(74,222,128,0.6)' : 'none', flexShrink: 0 }} />
      </div>
      {c.setting && <div style={{ fontSize: 11, color: 'var(--t-3)' }}>{c.setting}</div>}
      {c.description && <div style={{ fontSize: 11, color: 'var(--t-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.description}</div>}
      <div style={{ fontSize: 10, color: 'var(--t-3)', fontWeight: 600 }}>
        {c.is_active ? 'Active' : 'Inactive'} · Click to open →
      </div>
    </button>
  );
}
