import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface PartyMember {
  id: string;
  name: string;
  class_name: string;
  level: number;
  current_hp: number;
  max_hp: number;
  temp_hp: number;
  armor_class: number;
  active_conditions: string[];
  avatar_url: string | null;
  inspiration: boolean;
}

interface PartyViewProps {
  campaignId: string;
  currentUserId?: string;
}

export default function PartyView({ campaignId }: PartyViewProps) {
  const [members, setMembers] = useState<PartyMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadParty();

    // Realtime: watch all characters in this campaign
    const channel = supabase
      .channel(`party-view-${campaignId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'characters',
        filter: `campaign_id=eq.${campaignId}`,
      }, () => {
        loadParty();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [campaignId]);

  async function loadParty() {
    const { data } = await supabase
      .from('characters')
      .select('id,name,class_name,level,current_hp,max_hp,temp_hp,armor_class,active_conditions,avatar_url,inspiration')
      .eq('campaign_id', campaignId)
      .order('name');

    if (data) setMembers(data as PartyMember[]);
    setLoading(false);
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center', padding: 'var(--sp-6)' }}>
        <div className="spinner" />
        <span className="loading-text">Loading party…</span>
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--sp-8)', color: 'var(--t-2)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)' }}>
        No characters have joined this campaign yet.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
      <div className="section-header">Party Status</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--sp-3)' }}>
        {members.map(m => {
          const hpPct = m.max_hp > 0 ? m.current_hp / m.max_hp : 0;
          const hpColor = hpPct > 0.5 ? 'var(--hp-full)' : hpPct > 0.25 ? 'var(--hp-mid)' : hpPct > 0 ? 'var(--hp-low)' : 'var(--hp-dead)';
          const isDowned = m.current_hp <= 0;

          return (
            <div
              key={m.id}
              className="card"
              style={{
                opacity: isDowned ? 0.7 : 1,
                borderColor: isDowned ? 'rgba(107,20,20,1)' : undefined,
              }}
            >
              <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'flex-start' }}>
                {/* Avatar */}
                <div style={{
                  width: 44, height: 44, borderRadius: 'var(--r-md)', flexShrink: 0,
                  background: '#080d14', border: '1px solid var(--c-border)',
                  overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {m.avatar_url ? (
                    <img src={m.avatar_url} alt={m.name} width={44} height={44} style={{ objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: 20 }}>🧙</span>
                  )}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', marginBottom: 2 }}>
                    <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--t-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.name}
                    </span>
                    {m.inspiration && (
                      <span title="Has Inspiration" style={{ color: 'var(--c-amber-l)', fontSize: 12 }}>⭐</span>
                    )}
                    {isDowned && (
                      <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--c-red-l)', background: 'rgba(155,28,28,0.2)', padding: '1px 5px', borderRadius: 3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        Down
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
                    Lvl {m.level} {m.class_name}
                  </div>

                  {/* HP bar */}
                  <div style={{ marginTop: 'var(--sp-2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-2)' }}>HP</span>
                      <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: hpColor }}>
                        {m.current_hp}{m.temp_hp > 0 ? `+${m.temp_hp}` : ''} / {m.max_hp}
                      </span>
                    </div>
                    <div className="hp-bar-container">
                      <div
                        className="hp-bar-fill"
                        style={{
                          width: `${Math.max(0, Math.min(100, hpPct * 100))}%`,
                          backgroundColor: hpColor,
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* AC */}
                <div style={{ textAlign: 'center', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-md)', color: 'var(--t-1)' }}>
                    {m.armor_class}
                  </div>
                  <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-2)', letterSpacing: '0.06em' }}>AC</div>
                </div>
              </div>

              {/* Conditions */}
              {m.active_conditions.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 'var(--sp-2)' }}>
                  {m.active_conditions.map(c => (
                    <span key={c} className="condition-pill" style={{ fontSize: 9 }}>{c}</span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
