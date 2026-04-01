import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Character } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { getCharacters } from '../../lib/supabase';

const CLASS_ICONS: Record<string, string> = {
  Barbarian:'⚔️', Bard:'🎵', Cleric:'✝️', Druid:'🌿', Fighter:'🛡️',
  Monk:'👊', Paladin:'⚡', Ranger:'🏹', Rogue:'🗡️', Sorcerer:'🔥',
  Warlock:'👁️', Wizard:'📖', Artificer:'⚙️', Psion:'🔮',
};

function hpColor(current: number, max: number) {
  const p = max > 0 ? current / max : 0;
  return p > 0.6 ? 'var(--hp-full)' : p > 0.25 ? 'var(--hp-mid)' : p > 0 ? 'var(--hp-low)' : 'var(--c-border-m)';
}

export default function LobbyPage() {
  const { user, isPro } = useAuth();
  const navigate = useNavigate();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    getCharacters(user.id).then(({ data }) => {
      setCharacters(data ?? []);
      setLoading(false);
    });
  }, [user]);

  const canCreate = isPro || characters.length === 0;

  if (loading) return (
    <div style={{ display: 'flex', gap: 'var(--sp-3)', padding: 'var(--sp-8)', alignItems: 'center' }}>
      <div className="spinner" /><span className="loading-text">Loading characters...</span>
    </div>
  );

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">Characters</div>
          <div className="page-subtitle">
            {characters.length > 0
              ? `${characters.length} character${characters.length !== 1 ? 's' : ''}${!isPro ? ' · Free (1 max)' : ''}`
              : 'Create your first character to get started'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
          {!isPro && characters.length > 0 && (
            <button className="btn-ghost btn-sm" onClick={() => navigate('/settings')} style={{ color: 'var(--c-gold-l)', borderColor: 'var(--c-gold-bdr)' }}>
              Upgrade to Pro
            </button>
          )}
          <button
            className="btn-primary"
            onClick={() => navigate('/creator')}
            disabled={!canCreate}
            title={!canCreate ? 'Upgrade to Pro for unlimited characters' : 'Create a new character'}
          >
            + New Character
          </button>
        </div>
      </div>

      {/* Empty state */}
      {characters.length === 0 ? (
        <div style={{
          border: '1px dashed var(--c-border-m)',
          borderRadius: 'var(--r-xl)',
          padding: 'var(--sp-16) var(--sp-8)',
          textAlign: 'center',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--sp-4)',
        }}>
          <div style={{ fontSize: 52, opacity: 0.3 }}>⚔️</div>
          <div>
            <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 600, color: 'var(--t-1)', marginBottom: 'var(--sp-2)' }}>
              No characters yet
            </div>
            <p style={{ maxWidth: 360, margin: '0 auto 24px', color: 'var(--t-2)', fontSize: 'var(--fs-sm)' }}>
              Build your hero with the 2024 PHB rules — choose your class, species, background, and abilities.
            </p>
            <button className="btn-primary btn-lg" onClick={() => navigate('/creator')}>
              Create Your First Character
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--sp-4)' }}>
          {characters.map(c => <CharacterCard key={c.id} character={c} onClick={() => navigate(`/character/${c.id}`)} />)}
        </div>
      )}
    </div>
  );
}

function CharacterCard({ character: c, onClick }: { character: Character; onClick: () => void }) {
  const hpPct = c.max_hp > 0 ? Math.min(1, c.current_hp / c.max_hp) : 0;
  const col = hpColor(c.current_hp, c.max_hp);
  const icon = CLASS_ICONS[c.class_name] ?? '🧙';

  return (
    <div className="character-card" onClick={onClick} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && onClick()}>
      {/* Top accent bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${col}, transparent)`, borderRadius: 'var(--r-xl) var(--r-xl) 0 0' }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-3)' }}>
        {/* Avatar / icon */}
        <div style={{
          width: 48, height: 48, borderRadius: 'var(--r-lg)', flexShrink: 0,
          background: 'var(--c-raised)', border: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, overflow: 'hidden',
        }}>
          {c.avatar_url ? (
            <img src={c.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : icon}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="character-card-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {c.name}
          </div>
          <div className="character-card-meta">
            {c.class_name} {c.level} · {c.species}
          </div>
        </div>
      </div>

      {/* HP bar */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>HP</span>
          <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: col }}>
            {c.current_hp} <span style={{ color: 'var(--t-3)', fontWeight: 400 }}>/ {c.max_hp}</span>
          </span>
        </div>
        <div style={{ height: 4, background: '#080d14', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${hpPct * 100}%`, background: col, borderRadius: 999, transition: 'width 0.3s' }} />
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 'var(--sp-4)' }}>
        <MiniStat label="AC" value={c.armor_class} />
        <MiniStat label="Speed" value={`${c.speed}ft`} />
        {c.campaign_id && <MiniStat label="Campaign" value="Active" color="var(--c-green-l)" />}
        {c.inspiration && <MiniStat label="⭐" value="Inspired" color="var(--c-gold-l)" />}
      </div>

      {/* Conditions */}
      {(c.active_conditions?.length ?? 0) > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {(c.active_conditions ?? []).slice(0, 3).map(cond => (
            <span key={cond} className="badge badge-red" style={{ fontSize: 9 }}>{cond}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-3)' }}>{label}</span>
      <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: color ?? 'var(--t-1)' }}>{value}</span>
    </div>
  );
}
