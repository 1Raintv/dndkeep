import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { Campaign } from '../../types';

interface CampaignBarProps {
  userId: string;
}

interface CampaignWithRole extends Campaign {
  myRole: 'dm' | 'player';
  memberCount: number;
}

export default function CampaignBar({ userId }: CampaignBarProps) {
  const [campaigns, setCampaigns] = useState<CampaignWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    load();
  }, [userId]);

  async function load() {
    // Get all campaigns the user is a member of, with their role
    const { data: memberships } = await supabase
      .from('campaign_members')
      .select('campaign_id, role')
      .eq('user_id', userId);

    if (!memberships || memberships.length === 0) {
      setLoading(false);
      return;
    }

    const ids = memberships.map((m: any) => m.campaign_id);
    const roleMap: Record<string, string> = {};
    memberships.forEach((m: any) => { roleMap[m.campaign_id] = m.role; });

    const { data: camps } = await supabase
      .from('campaigns')
      .select('*')
      .in('id', ids)
      .order('updated_at', { ascending: false });

    if (!camps) { setLoading(false); return; }

    // Get member counts
    const { data: counts } = await supabase
      .from('campaign_members')
      .select('campaign_id')
      .in('campaign_id', ids);

    const countMap: Record<string, number> = {};
    (counts ?? []).forEach((c: any) => {
      countMap[c.campaign_id] = (countMap[c.campaign_id] ?? 0) + 1;
    });

    setCampaigns(
      (camps as Campaign[]).map(c => ({
        ...c,
        myRole: roleMap[c.id] as 'dm' | 'player',
        memberCount: countMap[c.id] ?? 1,
      }))
    );
    setLoading(false);
  }

  if (loading || campaigns.length === 0) return null;

  const dmCampaigns = campaigns.filter(c => c.myRole === 'dm');
  const playerCampaigns = campaigns.filter(c => c.myRole === 'player');

  return (
    <div style={{
      borderTop: '1px solid var(--c-border)',
      background: 'var(--c-surface)',
    }}>
      {/* Collapsed toggle bar */}
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          padding: '10px 20px',
          display: 'flex', alignItems: 'center', gap: 12,
          transition: 'background var(--tr-fast)',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--c-raised)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
      >
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t-3)' }}>
          Sessions
        </span>

        {/* Campaign pills preview when collapsed */}
        {!expanded && (
          <div style={{ display: 'flex', gap: 6, flex: 1, overflow: 'hidden' }}>
            {campaigns.slice(0, 4).map(c => (
              <span key={c.id} style={{
                fontSize: 11, fontWeight: 600,
                color: c.myRole === 'dm' ? 'var(--c-gold-l)' : 'var(--t-2)',
                background: c.myRole === 'dm' ? 'var(--c-gold-bg)' : 'var(--c-raised)',
                border: `1px solid ${c.myRole === 'dm' ? 'var(--c-gold-bdr)' : 'var(--c-border)'}`,
                padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap',
              }}>
                {c.myRole === 'dm' ? 'DM' : ''} {c.name}
              </span>
            ))}
            {campaigns.length > 4 && (
              <span style={{ fontSize: 11, color: 'var(--t-3)', alignSelf: 'center' }}>+{campaigns.length - 4} more</span>
            )}
          </div>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--t-3)' }}>
            {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}
          </span>
          <span style={{ fontSize: 10, color: 'var(--t-3)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform var(--tr-fast)', display: 'inline-block' }}>
            ▲
          </span>
        </div>
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div className="animate-fade-in" style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* DM sessions */}
          {dmCampaigns.length > 0 && (
            <div>
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--c-gold-l)', marginBottom: 8 }}>
                Dungeon Master
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                {dmCampaigns.map(c => (
                  <CampaignCard key={c.id} campaign={c} onOpen={() => navigate(`/campaigns/${c.id}`)} />
                ))}
              </div>
            </div>
          )}

          {/* Player sessions */}
          {playerCampaigns.length > 0 && (
            <div>
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--t-3)', marginBottom: 8 }}>
                Playing In
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                {playerCampaigns.map(c => (
                  <CampaignCard key={c.id} campaign={c} onOpen={() => navigate(`/campaigns/${c.id}`)} />
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => navigate('/campaigns')}
            style={{ alignSelf: 'flex-start', fontSize: 11, color: 'var(--c-gold-l)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            View all campaigns →
          </button>
        </div>
      )}
    </div>
  );
}

function CampaignCard({ campaign, onOpen }: { campaign: CampaignWithRole; onOpen: () => void }) {
  const isDM = campaign.myRole === 'dm';

  return (
    <button
      onClick={onOpen}
      style={{
        background: 'var(--c-card)',
        border: `1px solid ${isDM ? 'var(--c-gold-bdr)' : 'var(--c-border)'}`,
        borderLeft: `3px solid ${isDM ? 'var(--c-gold)' : 'var(--c-border-m)'}`,
        borderRadius: 'var(--r-md)',
        padding: '10px 14px',
        textAlign: 'left', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: 4,
        transition: 'all var(--tr-fast)',
        width: '100%',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = isDM ? 'var(--c-gold)' : 'var(--c-border-m)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = isDM ? 'var(--c-gold-bdr)' : 'var(--c-border)'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {isDM && (
          <span style={{ fontSize: 8, fontWeight: 800, color: 'var(--c-gold-l)', background: 'var(--c-gold-bg)', border: '1px solid var(--c-gold-bdr)', padding: '1px 5px', borderRadius: 999, letterSpacing: '0.1em', flexShrink: 0 }}>
            DM
          </span>
        )}
        <span style={{ fontWeight: 700, fontSize: 13, color: isDM ? 'var(--c-gold-l)' : 'var(--t-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {campaign.name}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Active indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: campaign.is_active ? '#4ade80' : 'var(--c-border-m)',
            boxShadow: campaign.is_active ? '0 0 6px rgba(74,222,128,0.6)' : 'none',
          }} />
          <span style={{ fontSize: 10, color: campaign.is_active ? '#4ade80' : 'var(--t-3)' }}>
            {campaign.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>

        <span style={{ fontSize: 10, color: 'var(--t-3)' }}>
          {campaign.memberCount} member{campaign.memberCount !== 1 ? 's' : ''}
        </span>

        {campaign.setting && (
          <span style={{ fontSize: 10, color: 'var(--t-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {campaign.setting}
          </span>
        )}
      </div>
    </button>
  );
}
