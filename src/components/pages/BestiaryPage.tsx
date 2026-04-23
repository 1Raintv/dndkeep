// v2.94.0 — Phase B of the Combat Backbone
//
// Bestiary: the canonical entry point for browsing SRD + homebrew monsters
// and creating/editing personal homebrew. Read-only for SRD, full CRUD for
// the current user's own homebrew.

import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useMonsters, invalidateMonstersCache } from '../../lib/hooks/useMonsters';
import { supabase } from '../../lib/supabase';
import MonsterBrowser from '../shared/MonsterBrowser';
import MonsterCreator from '../shared/MonsterCreator';
import { formatCR } from '../../lib/monsterUtils';
import type { MonsterData } from '../../types';

type Tab = 'browse' | 'homebrew' | 'create';

export default function BestiaryPage() {
  const { user } = useAuth();
  const { monsters, loading } = useMonsters();
  const [tab, setTab] = useState<Tab>('browse');
  const [editing, setEditing] = useState<MonsterData | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<MonsterData | null>(null);
  // v2.177.0 — Phase Q.0 pt 18: DMs viewing the bestiary while running
  // a campaign get interactive damage + DC pills in monster action
  // rows. We auto-pick the DM's first owned active campaign on mount
  // so the feature lights up without any extra config. If the user
  // owns zero campaigns, the feature cleanly degrades to plain pills.
  // A picker for multi-campaign DMs is TODO.
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [activeCampaignName, setActiveCampaignName] = useState<string | null>(null);
  const [ownedCampaigns, setOwnedCampaigns] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from('campaigns')
      .select('id, name')
      .eq('owner_id', user.id)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        if (cancelled || !data || data.length === 0) return;
        setOwnedCampaigns(data);
        setActiveCampaignId(data[0].id);
        setActiveCampaignName(data[0].name);
      });
    return () => { cancelled = true; };
  }, [user]);

  const myHomebrew = monsters.filter(m =>
    (m.source === 'homebrew' || m.license_key === 'homebrew') &&
    m.owner_id === user?.id
  );

  async function deleteMonster(m: MonsterData) {
    await supabase.from('monsters').delete().eq('id', m.id);
    invalidateMonstersCache();
    setConfirmDelete(null);
    // Hack to trigger re-fetch: the browser will grab the cache, so force a reload of the list
    setTab('homebrew');
    setTimeout(() => window.location.reload(), 200);
  }

  return (
    <div style={{ maxWidth: 1100, display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>Bestiary</h2>
          <p style={{ fontSize: 13, color: 'var(--t-3)', margin: 0 }}>
            Browse {monsters.length} monsters · {myHomebrew.length} homebrew · official SRD content freely usable under OGL 1.0a
          </p>
        </div>
        <button className="btn-gold btn-sm" onClick={() => { setEditing(null); setTab('create'); }}>
          + New Homebrew Monster
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--c-border)' }}>
        {([
          ['browse', `Browse (${monsters.length})`],
          ['homebrew', `My Homebrew (${myHomebrew.length})`],
          ['create', editing ? 'Editor' : 'Create'],
        ] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id as Tab)} style={{
            fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 12,
            padding: '7px 16px', background: 'transparent', border: 'none',
            borderBottom: tab === id ? '2px solid var(--c-gold)' : '2px solid transparent',
            color: tab === id ? 'var(--c-gold-l)' : 'var(--t-2)',
            cursor: 'pointer', marginBottom: -1, minHeight: 0,
          }}>{label}</button>
        ))}
      </div>

      {/* v2.177.0 — Phase Q.0 pt 18: campaign context banner. Visible
          only when the user owns 2+ active campaigns; single-campaign
          DMs don't need a picker, the one they own is auto-selected. */}
      {ownedCampaigns.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const,
          padding: '8px 12px', borderRadius: 8,
          background: 'rgba(212,160,23,0.06)', border: '1px solid rgba(212,160,23,0.3)',
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-gold-l)', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
            DM Mode
          </span>
          <span style={{ fontSize: 11, color: 'var(--t-3)', lineHeight: 1.4 }}>
            Damage &amp; save DC pills are interactive —
            click to apply to party of&nbsp;
          </span>
          {ownedCampaigns.length === 1 ? (
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-1)' }}>{activeCampaignName}</span>
          ) : (
            <select
              value={activeCampaignId ?? ''}
              onChange={e => {
                const next = ownedCampaigns.find(c => c.id === e.target.value);
                setActiveCampaignId(next?.id ?? null);
                setActiveCampaignName(next?.name ?? null);
              }}
              style={{ fontSize: 12, fontWeight: 700, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--c-border)', background: 'var(--c-raised)', color: 'var(--t-1)' }}
            >
              {ownedCampaigns.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div style={{ padding: 'var(--sp-6)', color: 'var(--t-2)', fontFamily: 'var(--ff-body)', fontSize: 13 }}>
          Loading monsters…
        </div>
      ) : (
        <>
          {tab === 'browse' && <MonsterBrowser campaignId={activeCampaignId} />}

          {tab === 'homebrew' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {myHomebrew.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: '32px 20px',
                  border: '1px dashed var(--c-border)', borderRadius: 12,
                  color: 'var(--t-3)', fontSize: 13,
                }}>
                  No homebrew monsters yet. Click "+ New Homebrew Monster" above to create one.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                  {myHomebrew.map(m => (
                    <div key={m.id} style={{
                      padding: 14, borderRadius: 10,
                      background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                      display: 'flex', flexDirection: 'column', gap: 6,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 800, fontSize: 14, color: 'var(--t-1)' }}>{m.name}</div>
                        <span style={{
                          fontFamily: 'var(--ff-body)', fontSize: 8, fontWeight: 700,
                          letterSpacing: '0.08em', textTransform: 'uppercase',
                          padding: '1px 5px', borderRadius: 3,
                          color: '#a78bfa', background: 'rgba(167,139,250,0.15)',
                          border: '1px solid rgba(167,139,250,0.3)',
                        }}>Homebrew</span>
                      </div>
                      <div style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-2)' }}>
                        {m.size} {m.type} · CR {formatCR(m.cr)} · AC {m.ac} · {m.hp} HP
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                        <button
                          onClick={() => { setEditing(m); setTab('create'); }}
                          style={{ fontFamily: 'var(--ff-body)', fontSize: 11, padding: '3px 10px', minHeight: 0, flex: 1 }}
                        >Edit</button>
                        <button
                          onClick={() => setConfirmDelete(m)}
                          style={{ fontFamily: 'var(--ff-body)', fontSize: 11, padding: '3px 10px', minHeight: 0, color: '#f87171' }}
                        >Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'create' && (
            <MonsterCreator
              initial={editing}
              onSaved={() => { setEditing(null); setTab('homebrew'); setTimeout(() => window.location.reload(), 200); }}
              onCancel={() => { setEditing(null); setTab(editing ? 'homebrew' : 'browse'); }}
            />
          )}
        </>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
        }}
        onClick={() => setConfirmDelete(null)}
        >
          <div style={{
            padding: 20, borderRadius: 12, maxWidth: 400,
            background: 'var(--c-card)', border: '1px solid var(--c-gold-bdr)',
          }}
          onClick={e => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>Delete {confirmDelete.name}?</h3>
            <p style={{ fontSize: 13, color: 'var(--t-2)' }}>This can't be undone.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDelete(null)} style={{ fontFamily: 'var(--ff-body)', fontSize: 13, padding: '6px 14px' }}>Cancel</button>
              <button onClick={() => deleteMonster(confirmDelete)} style={{ fontFamily: 'var(--ff-body)', fontSize: 13, padding: '6px 14px', color: '#f87171' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
