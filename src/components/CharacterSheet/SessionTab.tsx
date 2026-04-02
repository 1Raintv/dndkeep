import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Character } from '../../types';
import { supabase } from '../../lib/supabase';

interface SessionTabProps {
  character: Character;
  isPro: boolean;
  userId: string;
}

interface CampaignSummary {
  id: string;
  name: string;
  owner_id: string;
  is_active: boolean;
  join_code: string;
}

export default function SessionTab({ character, isPro, userId }: SessionTabProps) {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPro) { setLoading(false); return; }
    loadCampaigns();
  }, [isPro, userId]);

  async function loadCampaigns() {
    setLoading(true);
    // Get campaigns where user is owner (DM)
    const { data } = await supabase
      .from('campaigns')
      .select('id, name, owner_id, is_active, join_code')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false });
    setCampaigns(data ?? []);
    setLoading(false);
  }

  async function createSession() {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const { data: camp, error: campErr } = await supabase
        .from('campaigns')
        .insert({
          owner_id: userId,
          name: newName.trim(),
          description: newDesc.trim(),
          is_active: true,
        })
        .select()
        .single();
      if (campErr || !camp) throw new Error(campErr?.message ?? 'Failed to create session');

      // Auto-join as DM
      await supabase.from('campaign_members').insert({
        campaign_id: camp.id,
        user_id: userId,
        role: 'dm',
      });

      navigate(`/campaigns/${camp.id}`);
    } catch (e: any) {
      setError(e.message);
      setCreating(false);
    }
  }

  // ── Free tier gate ──────────────────────────────────────────────────────
  if (!isPro) {
    return (
      <div style={{ maxWidth: 520 }}>
        <div style={{
          padding: 'var(--sp-6)',
          borderRadius: 'var(--r-lg)',
          border: '1px solid var(--c-gold-bdr)',
          background: 'rgba(201,146,42,0.06)',
          textAlign: 'center',
        }}>
          
          <h3 style={{ marginBottom: 'var(--sp-2)', fontFamily: 'var(--ff-body)', color: 'var(--c-gold-l)' }}>
            DM Sessions — Pro Feature
          </h3>
          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', lineHeight: 1.6, marginBottom: 'var(--sp-5)' }}>
            Create live campaign sessions, share a join code with your players, track initiative in real-time, and manage HP across the whole party. Upgrade to Pro to unlock DM tools.
          </p>
          <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap', justifyContent: 'center', marginBottom: 'var(--sp-4)' }}>
            {['Real-time party sync', 'Initiative tracker', 'Condition management', 'Unlimited campaigns'].map(f => (
              <span key={f} style={{
                fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 700,
                padding: '4px 10px', borderRadius: 'var(--r-sm)',
                border: '1px solid rgba(201,146,42,0.3)', color: 'var(--c-gold-l)',
                background: 'rgba(201,146,42,0.08)',
              }}>✓ {f}</span>
            ))}
          </div>
          <button
            className="btn-gold"
            onClick={() => navigate('/settings')}
            style={{ justifyContent: 'center', width: '100%', maxWidth: 240 }}
          >
            Upgrade to Pro
          </button>
        </div>
      </div>
    );
  }

  // ── Pro: loading ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center', padding: 'var(--sp-6)' }}>
        <div className="spinner" />
        <span className="loading-text">Loading sessions...</span>
      </div>
    );
  }

  // ── Pro: main view ──────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 620, display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>

      {/* Active sessions */}
      {campaigns.length > 0 && (
        <div>
          <div className="section-header">Your DM Sessions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            {campaigns.map(camp => (
              <div key={camp.id} style={{
                display: 'flex', alignItems: 'center', gap: 'var(--sp-4)',
                padding: 'var(--sp-3) var(--sp-4)',
                borderRadius: 'var(--r-md)',
                border: `1px solid ${camp.is_active ? 'var(--c-gold-bdr)' : 'var(--c-border)'}`,
                background: camp.is_active ? 'rgba(201,146,42,0.06)' : 'var(--c-surface)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                    <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--t-1)' }}>
                      {camp.name}
                    </span>
                    {camp.is_active && (
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--hp-full)', flexShrink: 0 }} />
                    )}
                  </div>
                  <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', marginTop: 2 }}>
                    Join code: <span style={{ color: 'var(--c-gold-l)', letterSpacing: '0.1em' }}>{camp.join_code}</span>
                  </div>
                </div>
                <button
                  className="btn-gold btn-sm"
                  onClick={() => navigate(`/campaigns/${camp.id}`)}
                >
                  Enter Session
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create new session */}
      {!showCreate ? (
        <div>
          {campaigns.length === 0 && (
            <div style={{ textAlign: 'center', padding: 'var(--sp-6)', marginBottom: 'var(--sp-4)' }}>
              
              <p style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', color: 'var(--t-2)' }}>
                No sessions yet. Create one and share the join code with your players.
              </p>
            </div>
          )}
          <button
            className="btn-primary"
            onClick={() => setShowCreate(true)}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            + Create DM Session
          </button>
        </div>
      ) : (
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
          <div className="section-header" style={{ marginBottom: 0 }}>New Session</div>

          <div>
            <label style={{ fontSize: 'var(--fs-xs)' }}>Session Name *</label>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="The Lost Mines of Phandelver..."
              onKeyDown={e => e.key === 'Enter' && createSession()}
              autoFocus
            />
          </div>

          <div>
            <label style={{ fontSize: 'var(--fs-xs)' }}>Description (optional)</label>
            <input
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder="Campaign notes, setting..."
            />
          </div>

          {error && (
            <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-red-l)', fontFamily: 'var(--ff-body)' }}>
              {error}
            </p>
          )}

          <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
            <button className="btn-secondary" onClick={() => { setShowCreate(false); setError(null); }}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={createSession}
              disabled={creating || !newName.trim()}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              {creating ? 'Creating...' : 'Create & Enter Session'}
            </button>
          </div>
        </div>
      )}

      {/* Join a session (as player) */}
      <div style={{
        padding: 'var(--sp-3) var(--sp-4)',
        borderRadius: 'var(--r-md)',
        border: '1px solid var(--c-border)',
        background: '#080d14',
        fontFamily: 'var(--ff-body)',
        fontSize: 'var(--fs-xs)',
        color: 'var(--t-2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--sp-3)',
      }}>
        <span>Looking for a session to join as a player?</span>
        <button className="btn-ghost btn-sm" onClick={() => navigate('/campaigns')} style={{ fontSize: 'var(--fs-xs)' }}>
          View All Campaigns →
        </button>
      </div>
    </div>
  );
}
