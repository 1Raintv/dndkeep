import { useState } from 'react';
import type { Character, ComputedStats } from '../../types';
import { xpForNextLevel } from '../../lib/gameUtils';

interface CharacterHeaderProps {
  character: Character;
  computed: ComputedStats;
  onOpenSettings: () => void;
  onUpdateXP?: (xp: number) => void;
}

export default function CharacterHeader({ character, computed, onOpenSettings, onUpdateXP }: CharacterHeaderProps) {
  const nextLevelXP = xpForNextLevel(character.level);
  const xpPct = nextLevelXP > 0
    ? Math.min(1, character.experience_points / nextLevelXP)
    : 1;

  const [editingXP, setEditingXP] = useState(false);
  const [xpInput, setXpInput] = useState(String(character.experience_points));

  function commitXP() {
    const parsed = parseInt(xpInput, 10);
    if (!isNaN(parsed) && parsed >= 0) onUpdateXP?.(parsed);
    setEditingXP(false);
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, var(--color-charcoal) 0%, var(--color-shadow) 100%)',
      border: '1px solid var(--border-gold)',
      borderRadius: 'var(--radius-xl)',
      padding: 'var(--space-6) var(--space-8)',
      boxShadow: 'var(--shadow-gold)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Decorative corner accent */}
      <div style={{
        position: 'absolute', top: 0, right: 0, width: 80, height: 80,
        background: 'radial-gradient(circle at top right, rgba(201,146,42,0.12), transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        {/* Left: identity */}
        <div>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-3xl)',
            fontWeight: 700,
            color: 'var(--text-gold)',
            letterSpacing: '0.04em',
            marginBottom: 'var(--space-2)',
            textShadow: '0 0 24px rgba(201,146,42,0.3)',
          }}>
            {character.name}
          </h1>

          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="badge badge-gold">
              Level {character.level} {character.class_name}
            </span>
            {character.subclass && (
              <span className="badge badge-muted">{character.subclass}</span>
            )}
            <span className="badge badge-muted">{character.species}</span>
            <span className="badge badge-muted">{character.background}</span>
            {character.alignment && (
              <span className="badge badge-muted">{character.alignment}</span>
            )}
          </div>
        </div>

        {/* Right: prof bonus + level up */}
        <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 'var(--text-2xl)',
              fontWeight: 700,
              color: computed.proficiency_bonus >= 4 ? 'var(--color-amber)' : 'var(--text-gold)',
              lineHeight: 1,
            }}>
              +{computed.proficiency_bonus}
            </div>
            <div style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 'var(--text-xs)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              marginTop: '2px',
            }}>
              Prof. Bonus
            </div>
          </div>

          {character.level < 20 && (
            <button
              className="btn-secondary btn-sm"
              onClick={onOpenSettings}
              title="Character settings, level up, and more"
              style={{ whiteSpace: 'nowrap' }}
            >
              Settings
            </button>
          )}
          {character.level >= 20 && (
            <button
              className="btn-secondary btn-sm"
              onClick={onOpenSettings}
              title="Character settings"
              style={{ whiteSpace: 'nowrap' }}
            >
              Settings
            </button>
          )}
        </div>
      </div>

      {/* XP Bar */}
      <div style={{ marginTop: 'var(--space-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-1)', alignItems: 'center' }}>
          <span style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 'var(--text-xs)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}>
            Experience
          </span>
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            {editingXP ? (
              <>
                <input
                  type="number"
                  value={xpInput}
                  onChange={e => setXpInput(e.target.value)}
                  onBlur={commitXP}
                  onKeyDown={e => { if (e.key === 'Enter') commitXP(); if (e.key === 'Escape') setEditingXP(false); }}
                  autoFocus
                  style={{ width: 90, textAlign: 'right', fontSize: 'var(--text-xs)', padding: '1px 6px' }}
                />
                <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  {character.level < 20 ? `/ ${nextLevelXP.toLocaleString()} XP` : ''}
                </span>
              </>
            ) : (
              <button
                className="btn-ghost"
                onClick={() => { setXpInput(String(character.experience_points)); setEditingXP(true); }}
                style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', padding: '1px 4px' }}
                title="Click to edit XP"
              >
                {character.experience_points.toLocaleString()}
                {character.level < 20 && ` / ${nextLevelXP.toLocaleString()} XP`}
              </button>
            )}
          </div>
        </div>

        <div style={{ width: '100%', height: '4px', background: 'var(--bg-sunken)', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${xpPct * 100}%`,
            background: 'linear-gradient(90deg, var(--color-gold-dim), var(--color-gold-bright))',
            borderRadius: '2px',
            transition: 'width var(--transition-slow)',
            boxShadow: '0 0 6px rgba(201,146,42,0.4)',
          }} />
        </div>

        {character.level < 20 && (
          <div style={{
            textAlign: 'right',
            fontFamily: 'var(--font-heading)',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
            marginTop: '2px',
          }}>
            {Math.max(0, nextLevelXP - character.experience_points).toLocaleString()} XP to level {character.level + 1}
          </div>
        )}
      </div>
    </div>
  );
}

