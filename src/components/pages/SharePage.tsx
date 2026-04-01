import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { Character } from '../../types';
import { computeStats, abilityModifier, formatModifier } from '../../lib/gameUtils';

export default function SharePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!token) { setNotFound(true); setLoading(false); return; }
    supabase
      .from('characters')
      .select('*')
      .eq('share_token', token)
      .eq('share_enabled', true)
      .single()
      .then(({ data, error }) => {
        if (error || !data) setNotFound(true);
        else setCharacter(data as Character);
        setLoading(false);
      });
  }, [token]);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', gap: 'var(--sp-3)' }}>
      <div className="spinner" /><span className="loading-text">Loading character…</span>
    </div>
  );

  if (notFound || !character) return (
    <div style={{ textAlign: 'center', padding: 'var(--sp-16)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--sp-4)' }}>
      <div style={{ fontSize: 48 }}>⚔️</div>
      <h2>Character not found</h2>
      <p style={{ color: 'var(--t-2)' }}>This share link may have expired or been disabled by its owner.</p>
      <button className="btn-secondary" onClick={() => navigate('/')}>Go to DNDKeep</button>
    </div>
  );

  const computed = computeStats(character);
  const hpPct = character.max_hp > 0 ? character.current_hp / character.max_hp : 0;
  const hpColor = hpPct > 0.5 ? 'var(--hp-full)' : hpPct > 0.25 ? 'var(--hp-mid)' : hpPct > 0 ? 'var(--hp-low)' : 'var(--hp-dead)';

  const ABILITIES = [
    { key: 'strength',     label: 'STR' },
    { key: 'dexterity',    label: 'DEX' },
    { key: 'constitution', label: 'CON' },
    { key: 'intelligence', label: 'INT' },
    { key: 'wisdom',       label: 'WIS' },
    { key: 'charisma',     label: 'CHA' },
  ] as const;

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>

      {/* Banner */}
      <div style={{
        background: 'rgba(201,146,42,0.06)', border: '1px solid var(--c-gold-bdr)',
        borderRadius: 'var(--r-md)', padding: 'var(--sp-3) var(--sp-4)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--sp-2)',
      }}>
        <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
          👁 Read-only character sheet shared via DNDKeep
        </div>
        <button className="btn-gold btn-sm" onClick={() => navigate('/')}>
          Create Your Own →
        </button>
      </div>

      {/* Character header */}
      <div className="card card-gold">
        <div style={{ display: 'flex', gap: 'var(--sp-4)', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* Avatar */}
          <div style={{ width: 72, height: 72, borderRadius: 'var(--r-lg)', border: '2px solid var(--c-gold-bdr)', overflow: 'hidden', flexShrink: 0, background: '#080d14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {character.avatar_url
              ? <img src={character.avatar_url} alt={character.name} width={72} height={72} style={{ objectFit: 'cover' }} />
              : <span style={{ fontSize: 32 }}>🧙</span>}
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ marginBottom: 'var(--sp-2)' }}>{character.name}</h1>
            <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
              <span className="badge badge-gold">Level {character.level} {character.class_name}</span>
              {character.subclass && <span className="badge badge-muted">{character.subclass}</span>}
              <span className="badge badge-muted">{character.species}</span>
              <span className="badge badge-muted">{character.background}</span>
              {character.alignment && <span className="badge badge-muted">{character.alignment}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--sp-4)', flexShrink: 0, flexWrap: 'wrap' }}>
            {character.inspiration && <div style={{ textAlign: 'center' }}><div style={{ fontSize: 20 }}>⭐</div><div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--c-amber-l)' }}>INSPIRED</div></div>}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-2xl)', color: 'var(--c-gold-l)', lineHeight: 1 }}>+{computed.proficiency_bonus}</div>
              <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-2)' }}>PROF</div>
            </div>
          </div>
        </div>
      </div>

      {/* Combat stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 'var(--sp-3)' }}>
        {[
          { label: 'HP', value: `${character.current_hp}/${character.max_hp}`, color: hpColor },
          { label: 'AC', value: String(character.armor_class), color: 'var(--t-1)' },
          { label: 'Speed', value: `${character.speed} ft`, color: 'var(--t-1)' },
          { label: 'Initiative', value: formatModifier(computed.initiative), color: 'var(--c-gold-l)' },
        ].map(s => (
          <div key={s.label} className="stat-box">
            <div className="stat-box-value" style={{ color: s.color, WebkitTextFillColor: s.color }}>{s.value}</div>
            <div className="stat-box-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* HP bar */}
      <div className="hp-bar-container">
        <div className="hp-bar-fill" style={{ width: `${Math.max(0, Math.min(100, hpPct * 100))}%`, backgroundColor: hpColor }} />
      </div>

      {/* Ability scores */}
      <div className="card">
        <div className="section-header">Ability Scores</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 'var(--sp-2)' }}>
          {ABILITIES.map(({ key, label }) => {
            const score = character[key] as number;
            const mod = abilityModifier(score);
            return (
              <div key={key} className="stat-box">
                <div className="stat-box-modifier">{formatModifier(mod)}</div>
                <div className="stat-box-value" style={{ fontSize: 'var(--fs-lg)' }}>{score}</div>
                <div className="stat-box-label">{label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Weapons */}
      {character.weapons?.length > 0 && (
        <div className="card">
          <div className="section-header">Weapons & Attacks</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            {character.weapons.map(w => (
              <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--sp-2) var(--sp-3)', background: '#080d14', borderRadius: 'var(--r-sm)', border: '1px solid var(--c-border)' }}>
                <div>
                  <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--t-1)' }}>{w.name}</div>
                  <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>{w.range} · {w.damageType}</div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, color: 'var(--c-gold-l)', fontSize: 'var(--fs-md)' }}>{w.attackBonus >= 0 ? '+' : ''}{w.attackBonus}</div>
                    <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-2)' }}>TO HIT</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, color: 'var(--c-red-l)', fontSize: 'var(--fs-md)' }}>{w.damageDice}{w.damageBonus !== 0 ? (w.damageBonus > 0 ? '+' : '') + w.damageBonus : ''}</div>
                    <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-2)' }}>DMG</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active conditions */}
      {character.active_conditions.length > 0 && (
        <div className="card">
          <div className="section-header">Active Conditions</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
            {character.active_conditions.map(c => <span key={c} className="condition-pill">{c}</span>)}
          </div>
        </div>
      )}

      {/* Features */}
      {character.features_and_traits && (
        <div className="card">
          <div className="section-header">Features & Traits</div>
          <pre style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', color: 'var(--t-2)', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
            {character.features_and_traits}
          </pre>
        </div>
      )}

      {/* Footer CTA */}
      <div style={{ textAlign: 'center', padding: 'var(--sp-8)', borderTop: '1px solid var(--c-border)' }}>
        <p style={{ color: 'var(--t-2)', marginBottom: 'var(--sp-4)', fontSize: 'var(--fs-sm)' }}>
          Built with DNDKeep — the D&D 5e session companion
        </p>
        <button className="btn-gold btn-lg" onClick={() => navigate('/')} style={{ justifyContent: 'center' }}>
          Create Your Character Free
        </button>
      </div>
    </div>
  );
}
