import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Campaign } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { CampaignProvider } from '../../context/CampaignContext';
import { joinCampaignByCode, addCampaignMember } from '../../lib/supabase';
import CampaignList from '../Campaign/CampaignList';
import CampaignDashboard from '../Campaign/CampaignDashboard';

// ── Join via code (available to all users) ──────────────────────────────────
function JoinCampaignByCode() {
  const { user } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleJoin() {
    if (!user || !code.trim()) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    const { data: campaign, error: lookupErr } = await joinCampaignByCode(code.trim());
    if (lookupErr || !campaign) {
      setError('No active campaign found with that code. Check the code and try again.');
      setLoading(false);
      return;
    }

    const { error: joinErr } = await addCampaignMember(campaign.id, user.id, 'player');
    if (joinErr) {
      if (joinErr.message.includes('unique') || joinErr.message.includes('duplicate')) {
        setError('You are already a member of this campaign.');
      } else {
        setError(joinErr.message);
      }
      setLoading(false);
      return;
    }

    setSuccess(`Joined "${campaign.name}" successfully. Reload the page to see it in your campaign list.`);
    setCode('');
    setLoading(false);
  }

  return (
    <div className="card" style={{ maxWidth: 480, margin: '0 auto' }}>
      <div className="section-header">Join a Campaign</div>
      <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', marginBottom: 'var(--sp-4)', lineHeight: 1.6 }}>
        Ask your DM for their 6-character invite code. Enter it below to join their campaign.
      </p>
      <div style={{ display: 'flex', gap: 'var(--sp-3)', marginBottom: 'var(--sp-3)' }}>
        <input
          type="text"
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && handleJoin()}
          placeholder="Enter code — e.g. XK7F2P"
          maxLength={6}
          style={{ flex: 1, fontFamily: 'var(--ff-body)', fontWeight: 700, letterSpacing: '0.15em', textAlign: 'center', fontSize: 'var(--fs-lg)', textTransform: 'uppercase' }}
        />
        <button
          className="btn-gold"
          onClick={handleJoin}
          disabled={loading || code.trim().length < 4}
        >
          {loading ? 'Joining...' : 'Join'}
        </button>
      </div>

      {error && (
        <div style={{ padding: 'var(--sp-3)', background: 'rgba(155,28,28,0.15)', border: '1px solid rgba(107,20,20,1)', borderRadius: 'var(--r-md)', fontSize: 'var(--fs-sm)', color: '#fca5a5', fontFamily: 'var(--ff-body)' }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ padding: 'var(--sp-3)', background: 'rgba(22,163,74,0.1)', border: '1px solid var(--hp-full)', borderRadius: 'var(--r-md)', fontSize: 'var(--fs-sm)', color: '#86efac', fontFamily: 'var(--ff-body)' }}>
          {success}
        </div>
      )}
    </div>
  );
}

// ── Pro DM view (campaign management) ───────────────────────────────────────
function CampaignsContent() {
  const [selected, setSelected] = useState<Campaign | null>(null);

  if (selected) {
    return <CampaignDashboard campaign={selected} onBack={() => setSelected(null)} />;
  }

  return <CampaignList onSelect={setSelected} />;
}

// ── Page root ────────────────────────────────────────────────────────────────
export default function CampaignsPage() {
  const { isPro, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center', padding: 'var(--sp-8)' }}>
        <div className="spinner" /><span className="loading-text">Loading...</span>
      </div>
    );
  }

  // Free users: can join via code, but cannot create/manage campaigns
  if (!isPro) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-8)', alignItems: 'center', padding: 'var(--sp-8) var(--sp-4)' }}>
        <JoinCampaignByCode />

        <div className="card card-gold" style={{ maxWidth: 480, width: '100%' }}>
          <h3 style={{ marginBottom: 'var(--sp-3)' }}>Run Your Own Campaigns</h3>
          <p style={{ color: 'var(--t-2)', marginBottom: 'var(--sp-6)', lineHeight: 1.6 }}>
            Upgrade to Pro to create campaigns, generate invite codes for your players, and sync combat in real-time.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginBottom: 'var(--sp-6)' }}>
            {[
              'Create unlimited campaigns as DM',
              'Generate shareable invite codes',
              'Manage players and roles',
              'Real-time combat initiative tracker',
              'Shared session state for remote play',
            ].map(f => (
              <div key={f} style={{ display: 'flex', gap: 'var(--sp-2)', fontSize: 'var(--fs-sm)' }}>
                <span style={{ color: 'var(--c-gold)', fontFamily: 'var(--ff-body)' }}>+</span>
                <span style={{ color: 'var(--t-2)' }}>{f}</span>
              </div>
            ))}
          </div>
          <button className="btn-gold btn-lg" style={{ width: '100%', justifyContent: 'center' }} onClick={() => navigate('/settings')}>
            Upgrade to Pro
          </button>
        </div>
      </div>
    );
  }

  return (
    <CampaignProvider>
      <CampaignsContent />
    </CampaignProvider>
  );
}
