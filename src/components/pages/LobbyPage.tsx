import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Character } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { getCharacters } from '../../lib/supabase';
import Onboarding from '../shared/Onboarding';

export default function LobbyPage() {
  const { user, isPro } = useAuth();
  const navigate = useNavigate();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (!user) return;
    getCharacters(user.id).then(({ data }) => {
      setCharacters(data);
      setLoading(false);
      // Show onboarding only for brand new users (no characters + never dismissed)
      if (data.length === 0 && !localStorage.getItem('dndkeep_onboarded')) {
        setShowOnboarding(true);
      }
    });
  }, [user]);

  function dismissOnboarding() {
    localStorage.setItem('dndkeep_onboarded', '1');
    setShowOnboarding(false);
  }

  const canCreate = isPro || characters.length === 0;

  if (loading) return (
    <div style={{ display: 'flex', gap: 'var(--space-3)', padding: 'var(--space-8)', alignItems: 'center' }}>
      <div className="spinner" /><span className="loading-text">Loading characters...</span>
    </div>
  );

  return (
    <div>
      {showOnboarding && <Onboarding onDismiss={dismissOnboarding} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-8)' }}>
        <div>
          <h1 style={{ marginBottom: 'var(--space-2)' }}>Your Characters</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            {characters.length} character{characters.length !== 1 ? 's' : ''}
            {!isPro && ' — Free tier: 1 character'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
          {!isPro && (
            <button className="btn-gold btn-sm" onClick={() => navigate('/settings')}>Upgrade to Pro</button>
          )}
          <button
            className="btn-primary"
            onClick={() => navigate('/creator')}
            disabled={!canCreate}
            title={!canCreate ? 'Upgrade to Pro for unlimited characters' : ''}
          >
            New Character
          </button>
        </div>
      </div>

      {characters.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-16)' }}>
          <h3 style={{ marginBottom: 'var(--space-4)', color: 'var(--text-muted)' }}>No Characters Yet</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-6)' }}>
            Begin your adventure by creating your first character.
          </p>
          <button className="btn-primary btn-lg" onClick={() => navigate('/creator')}>
            Create Your First Character
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--space-4)' }}>
            {characters.map(c => (
              <CharacterCard
                key={c.id}
                character={c}
                onOpen={() => navigate(`/character/${c.id}`)}
              />
            ))}
            {canCreate && (
              <button
                onClick={() => navigate('/creator')}
                style={{
                  border: '2px dashed var(--border-gold)',
                  borderRadius: 'var(--radius-lg)',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 'var(--space-8)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  transition: 'all var(--transition-fast)',
                  minHeight: 160,
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-gold)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-gold)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-gold)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
                }}
              >
                <span style={{ fontSize: 'var(--text-2xl)', lineHeight: 1 }}>+</span>
                <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)', fontWeight: 700, letterSpacing: '0.06em' }}>
                  New Character
                </span>
              </button>
            )}
          </div>
          <p style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textAlign: 'right' }}>
            To remove a character, go to Settings.
          </p>
        </div>
      )}
    </div>
  );
}

function CharacterCard({ character: c, onOpen }: { character: Character; onOpen: () => void }) {
  const hpPct = c.max_hp > 0 ? c.current_hp / c.max_hp : 0;
  const hpColor = hpPct > 0.5 ? 'var(--hp-full)' : hpPct > 0.25 ? 'var(--hp-mid)' : 'var(--hp-low)';
  return (
    <div
      className="card"
      style={{ cursor: 'pointer', transition: 'border-color var(--transition-fast)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
      onClick={onOpen}
      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-gold)'}
      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-subtle)'}
    >
      <div>
        <h3 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-1)' }}>{c.name}</h3>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-heading)' }}>
          Level {c.level} {c.class_name} — {c.species}
        </p>
      </div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>HP</span>
          <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: hpColor }}>
            {c.current_hp} / {c.max_hp}
          </span>
        </div>
        <div className="hp-bar-container">
          <div className="hp-bar-fill" style={{ width: `${hpPct * 100}%`, background: hpColor }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        {c.background && <span className="badge badge-muted">{c.background}</span>}
        {c.subclass && <span className="badge badge-muted">{c.subclass}</span>}
        {c.active_conditions.length > 0 && (
          <span className="badge badge-crimson">
            {c.active_conditions.length} condition{c.active_conditions.length > 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  );
}
