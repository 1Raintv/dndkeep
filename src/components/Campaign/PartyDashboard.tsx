import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import type { Character } from '../../types';
import { CONDITION_MAP } from '../../data/conditions';

interface PartyDashboardProps {
  campaignId: string;
}

function hpColor(current: number, max: number) {
  const pct = max > 0 ? current / max : 0;
  if (pct > 0.6) return 'var(--hp-full)';
  if (pct > 0.25) return 'var(--hp-mid)';
  if (pct > 0) return 'var(--hp-low)';
  return 'var(--hp-dead)';
}

function hpLabel(current: number, max: number) {
  const pct = max > 0 ? current / max : 0;
  if (pct >= 1) return { label: 'Full', color: 'var(--hp-full)' };
  if (pct > 0.75) return { label: 'Healthy', color: 'var(--hp-full)' };
  if (pct > 0.5) return { label: 'Injured', color: 'var(--hp-mid)' };
  if (pct > 0.25) return { label: 'Bloodied', color: '#f97316' };
  if (pct > 0) return { label: 'Critical', color: 'var(--hp-low)' };
  return { label: '☠ Downed', color: '#dc2626' };
}

export default function PartyDashboard({ campaignId }: PartyDashboardProps) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCharacters();
    // Real-time subscription
    const channel = supabase
      .channel(`party-dashboard-${campaignId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'characters',
      }, () => loadCharacters())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [campaignId]);

  async function loadCharacters() {
    // Load all characters in this campaign via campaign_members
    const { data: members } = await supabase
      .from('campaign_members')
      .select('user_id')
      .eq('campaign_id', campaignId);

    if (!members?.length) { setLoading(false); return; }

    const userIds = members.map(m => m.user_id);
    const { data: chars } = await supabase
      .from('characters')
      .select('*')
      .in('user_id', userIds)
      .eq('campaign_id', campaignId);

    setCharacters(chars ?? []);
    setLoading(false);
  }

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 'var(--sp-8)', color: 'var(--t-2)' }}>
      Loading party…
    </div>
  );

  if (characters.length === 0) return (
    <div style={{ textAlign: 'center', padding: 'var(--sp-8)', color: 'var(--t-2)' }}>
      <div style={{ fontSize: 40, marginBottom: 'var(--sp-3)' }}>👥</div>
      <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)' }}>
        No characters in this campaign yet. Players need to assign their characters to this campaign.
      </div>
    </div>
  );

  const totalHp = characters.reduce((s, c) => s + c.current_hp, 0);
  const totalMaxHp = characters.reduce((s, c) => s + c.max_hp, 0);
  const downedCount = characters.filter(c => c.current_hp <= 0).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
      {/* Party Summary Bar */}
      <div style={{
        display: 'flex', gap: 'var(--sp-4)', flexWrap: 'wrap',
        padding: 'var(--sp-3) var(--sp-4)',
        background: '#080d14',
        border: '1px solid var(--c-border)',
        borderRadius: 'var(--r-xl)',
      }}>
        <SummaryChip label="Party Members" value={characters.length} color="var(--t-1)" />
        <SummaryChip label="Total HP" value={`${totalHp}/${totalMaxHp}`} color={hpColor(totalHp, totalMaxHp)} />
        {downedCount > 0 && <SummaryChip label="Downed" value={downedCount} color="#dc2626" />}
        <SummaryChip
          label="Conditions"
          value={characters.reduce((s, c) => s + (c.active_conditions?.length ?? 0), 0)}
          color={characters.some(c => (c.active_conditions?.length ?? 0) > 0) ? '#f59e0b' : 'var(--t-2)'}
        />
        <SummaryChip
          label="Concentrating"
          value={characters.filter(c => c.concentration_spell).length}
          color={characters.some(c => c.concentration_spell) ? '#a78bfa' : 'var(--t-2)'}
        />
      </div>

      {/* Character Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--sp-3)' }}>
        {characters.map(char => (
          <CharacterCard key={char.id} character={char} />
        ))}
      </div>
    </div>
  );
}

function SummaryChip({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-2)' }}>{label}</div>
      <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 900, fontSize: 'var(--fs-lg)', color, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

function CharacterCard({ character: c }: { character: Character }) {
  const hpPct = c.max_hp > 0 ? c.current_hp / c.max_hp : 0;
  const col = hpColor(c.current_hp, c.max_hp);
  const status = hpLabel(c.current_hp, c.max_hp);
  const isDowned = c.current_hp <= 0;

  // Parse spell slots — SpellSlotLevel = { total, used }
  const slots = c.spell_slots ?? {};
  const hasSpells = Object.keys(slots).some(lvl => (slots[lvl]?.total ?? 0) > 0);

  return (
    <div style={{
      border: `1px solid ${isDowned ? 'rgba(220,38,38,0.4)' : col + '30'}`,
      borderRadius: 'var(--r-xl)',
      background: isDowned ? 'rgba(220,38,38,0.04)' : 'var(--c-card)',
      overflow: 'hidden',
      transition: 'border-color var(--tr-fast)',
    }}>
      {/* HP accent bar */}
      <div style={{ height: 3, background: `linear-gradient(90deg, ${col}, ${col}40)`, width: `${hpPct * 100}%`, transition: 'width var(--tr-slow)' }} />

      <div style={{ padding: 'var(--sp-3) var(--sp-4)' }}>
        {/* Name row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-2)' }}>
          <div>
            <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-md)', color: isDowned ? '#dc2626' : 'var(--t-1)' }}>
              {c.name}
            </div>
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
              {c.class_name} {c.level} · {c.species}
            </div>
          </div>
          <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 700, color: status.color, textAlign: 'right' }}>
            {status.label}
          </div>
        </div>

        {/* HP bar */}
        <div style={{ height: 8, background: '#080d14', borderRadius: 999, overflow: 'hidden', marginBottom: 'var(--sp-2)' }}>
          <div style={{ height: '100%', width: `${hpPct * 100}%`, background: col, borderRadius: 999, transition: 'width var(--tr-slow), background var(--tr-normal)', boxShadow: `0 0 6px ${col}` }} />
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 'var(--sp-3)', marginBottom: 'var(--sp-2)' }}>
          <StatMini label="HP" value={`${c.current_hp}/${c.max_hp}`} color={col} />
          {c.temp_hp > 0 && <StatMini label="THP" value={`+${c.temp_hp}`} color="#60a5fa" />}
          <StatMini label="AC" value={c.armor_class} color="var(--c-gold-l)" />
          <StatMini label="Speed" value={`${c.speed}ft`} color="var(--t-2)" />
        </div>

        {/* Death saves (if downed) */}
        {isDowned && (
          <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', padding: 'var(--sp-2) var(--sp-3)', background: 'rgba(220,38,38,0.08)', borderRadius: 'var(--r-md)', marginBottom: 'var(--sp-2)' }}>
            <span style={{ fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700, color: '#ff8a80' }}>DEATH SAVES</span>
            <div style={{ display: 'flex', gap: 3 }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', border: `1.5px solid #34d399`, background: i < (c.death_saves_successes ?? 0) ? '#34d399' : 'transparent' }} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 3 }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', border: `1.5px solid #e53935`, background: i < (c.death_saves_failures ?? 0) ? '#e53935' : 'transparent' }} />
              ))}
            </div>
          </div>
        )}

        {/* Concentration */}
        {c.concentration_spell && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px', background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.3)', borderRadius: 999, marginBottom: 'var(--sp-2)', width: 'fit-content' }}>
            <span style={{ fontSize: 12 }}>🔮</span>
            <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: '#a78bfa', fontWeight: 600 }}>
              Concentrating: {c.concentration_spell}
            </span>
          </div>
        )}

        {/* Active conditions */}
        {(c.active_conditions?.length ?? 0) > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {(c.active_conditions ?? []).map(cond => {
              const mechanic = CONDITION_MAP[cond];
              return (
                <div key={cond} style={{
                  display: 'flex', alignItems: 'center', gap: 3,
                  padding: '2px 6px', borderRadius: 999,
                  background: `${mechanic?.color ?? '#64748b'}15`,
                  border: `1px solid ${mechanic?.color ?? '#64748b'}40`,
                  fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 700,
                  color: mechanic?.color ?? 'var(--t-2)',
                }}>
                  {mechanic?.icon} {cond}
                </div>
              );
            })}
          </div>
        )}

        {/* Spell slots */}
        {hasSpells && (
          <div style={{ marginTop: 'var(--sp-2)', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {[1,2,3,4,5,6,7,8,9].map(lvl => {
              const slotData = slots[String(lvl)];
              const total = slotData?.total ?? 0;
              if (!total) return null;
              const used = slotData?.used ?? 0;
              const remaining = total - used;
              return (
                <div key={lvl} style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-2)', marginRight: 1 }}>{lvl}</span>
                  {Array.from({ length: total }, (_, i) => (
                    <div key={i} style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: i < remaining ? '#a78bfa' : 'var(--c-raised)',
                      border: `1px solid ${i < remaining ? '#a78bfa' : 'var(--c-border-m)'}`,
                    }} />
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* Inspiration */}
        {c.inspiration && (
          <div style={{ marginTop: 'var(--sp-2)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 12 }}>⭐</span>
            <span style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--c-gold-l)', fontWeight: 700 }}>INSPIRED</span>
          </div>
        )}
      </div>
    </div>
  );
}

function StatMini({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <div style={{ fontFamily: 'var(--ff-body)', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-2)' }}>{label}</div>
      <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color, lineHeight: 1 }}>{value}</div>
    </div>
  );
}
