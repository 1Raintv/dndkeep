import { useState } from 'react';
import type { Campaign } from '../../types';
import { useCampaign } from '../../context/CampaignContext';
import { useAuth } from '../../context/AuthContext';
import { createCampaign, deleteCampaign } from '../../lib/supabase';

interface CampaignListProps {
  onSelect: (campaign: Campaign) => void;
}

export default function CampaignList({ onSelect }: CampaignListProps) {
  const { user } = useAuth();
  const { campaigns, loadingCampaigns, refreshCampaigns } = useCampaign();
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', setting: '' });
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !form.name.trim()) return;
    setCreating(true);
    setError(null);

    const { error: err } = await createCampaign({
      owner_id: user.id,
      name: form.name.trim(),
      description: form.description.trim(),
      setting: form.setting.trim(),
      is_active: true,
    });

    if (err) {
      setError(err.message.includes('PRO_REQUIRED')
        ? 'Campaign management requires a Pro subscription.'
        : err.message);
    } else {
      setForm({ name: '', description: '', setting: '' });
      setShowCreate(false);
      await refreshCampaigns();
    }
    setCreating(false);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete campaign "${name}"? This cannot be undone.`)) return;
    await deleteCampaign(id);
    await refreshCampaigns();
  }

  if (loadingCampaigns) {
    return (
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', padding: 'var(--space-6)' }}>
        <div className="spinner" /><span className="loading-text">Loading campaigns...</span>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
        <h2>Campaigns</h2>
        <button className="btn-gold" onClick={() => setShowCreate(v => !v)}>
          {showCreate ? 'Cancel' : 'New Campaign'}
        </button>
      </div>

      {showCreate && (
        <div className="card card-gold animate-fade-in" style={{ marginBottom: 'var(--space-6)' }}>
          <h3 style={{ marginBottom: 'var(--space-4)' }}>Create Campaign</h3>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div>
              <label>Campaign Name</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="The Curse of Strahd..." required autoFocus />
            </div>
            <div>
              <label>Setting</label>
              <input value={form.setting} onChange={e => setForm(f => ({ ...f, setting: e.target.value }))} placeholder="Barovia, the Forgotten Realms..." />
            </div>
            <div>
              <label>Description</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="A brief description of the campaign..." />
            </div>
            {error && (
              <div style={{ background: 'rgba(155,28,28,0.15)', border: '1px solid var(--color-blood)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', fontSize: 'var(--text-sm)', color: '#fca5a5', fontFamily: 'var(--font-heading)' }}>{error}</div>
            )}
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <button type="submit" className="btn-primary" disabled={creating}>
                {creating ? 'Creating...' : 'Create Campaign'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {campaigns.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
          <h3 style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }}>No Campaigns Yet</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-6)' }}>
            Create a campaign to manage multiple characters and sync combat with your table.
          </p>
          <button className="btn-gold" onClick={() => setShowCreate(true)}>Create Your First Campaign</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {campaigns.map(campaign => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              isOwner={campaign.owner_id === user?.id}
              onOpen={() => onSelect(campaign)}
              onDelete={() => handleDelete(campaign.id, campaign.name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CampaignCard({ campaign, isOwner, onOpen, onDelete }: {
  campaign: Campaign;
  isOwner: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="card"
      style={{ cursor: 'pointer', transition: 'border-color var(--transition-fast)' }}
      onClick={onOpen}
      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-gold)'}
      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-subtle)'}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
            <h3 style={{ fontSize: 'var(--text-lg)' }}>{campaign.name}</h3>
            <span className={isOwner ? 'badge badge-gold' : 'badge badge-muted'}>
              {isOwner ? 'DM' : 'Player'}
            </span>
            {!campaign.is_active && <span className="badge badge-muted">Inactive</span>}
          </div>
          {campaign.setting && (
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-heading)', marginBottom: 'var(--space-1)' }}>
              {campaign.setting}
            </p>
          )}
          {campaign.description && (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{campaign.description}</p>
          )}
        </div>
        {isOwner && (
          <button
            className="btn-ghost btn-sm"
            onClick={e => { e.stopPropagation(); onDelete(); }}
            style={{ color: 'var(--color-ash)', flexShrink: 0 }}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
