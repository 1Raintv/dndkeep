import { useDiceRoll } from '../../context/DiceRollContext';
import { rollDie } from '../../lib/gameUtils';
import type { Character, ComputedStats } from '../../types';

interface CharacterHeaderProps {
  character: Character;
  computed: ComputedStats;
  onOpenSettings: () => void;
  onOpenMap?: () => void;
  onUpdateXP?: (xp: number) => void;
  onOpenAvatarPicker?: () => void;
  onToggleInspiration?: () => void;
  onOpenRest?: () => void;
  onUpdateHP?: (delta: number, tempHP?: number) => void;
  onUpdateAC?: (ac: number) => void;
  onUpdateSpeed?: (speed: number) => void;
  onShare?: () => void;
}

export default function CharacterHeader({
  character, computed, onOpenSettings, onOpenAvatarPicker,
  onToggleInspiration, onOpenRest, onShare, onOpenMap,
}: CharacterHeaderProps) {

  const classDisplay = character.secondary_class && (character.secondary_level ?? 0) > 0
    ? `${character.class_name} ${character.level} / ${character.secondary_class} ${character.secondary_level}`
    : `${character.class_name} ${character.level}`;

  return (
    <div style={{
      background: 'var(--c-surface)',
      borderBottom: '1px solid var(--c-border)',
      padding: '14px 24px',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
    }}>
      {/* Avatar */}
      <button
        onClick={onOpenAvatarPicker}
        style={{
          width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
          background: 'var(--c-raised)', border: '2px solid var(--c-border-m)',
          overflow: 'hidden', cursor: 'pointer', padding: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        title="Change portrait"
      >
        {character.avatar_url ? (
          <img src={character.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--c-gold-l)' }}>
            {character.name?.charAt(0).toUpperCase() ?? '?'}
          </span>
        )}
      </button>

      {/* Identity */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--t-1)', letterSpacing: '0.01em' }}>
            {character.name}
          </span>
          <button
            onClick={onToggleInspiration}
            title={character.inspiration ? 'Click to use Inspiration' : 'Click to gain Inspiration'}
            style={{
              fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 800, padding: '2px 8px',
              borderRadius: 999, cursor: 'pointer', letterSpacing: '0.08em',
              border: `1px solid ${character.inspiration ? 'var(--c-gold-bdr)' : 'var(--c-border)'}`,
              background: character.inspiration ? 'var(--c-gold-bg)' : 'transparent',
              color: character.inspiration ? 'var(--c-gold-l)' : 'var(--t-3)',
              transition: 'all 0.2s',
            }}
          >
            ✦ {character.inspiration ? 'INSPIRED' : 'Inspiration'}
          </button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--t-2)', marginTop: 1 }}>
          {classDisplay}{character.subclass ? ` — ${character.subclass}` : ''} · {character.species}{character.background ? ` · ${character.background}` : ''}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        {onShare && (
          <button className="btn-ghost btn-sm" onClick={onShare} style={{ color: 'var(--t-2)', fontSize: 12 }}>
            Share
          </button>
        )}

        <button className="btn-secondary btn-sm" onClick={onOpenRest} style={{ fontSize: 12 }}>
          Rest
        </button>
        {onOpenMap && (
          <button className="btn-ghost btn-sm" onClick={onOpenMap}
            title="Battle Map"
            style={{ fontSize: 12, color: 'var(--t-2)' }}>
            🗺 Map
          </button>
        )}
        <button
          className="btn-ghost btn-sm"
          onClick={onOpenSettings}
          style={{ color: character.level < 20 ? 'var(--c-gold-l)' : 'var(--t-2)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
          title={character.level < 20 ? 'Level up available — open Settings' : 'Settings'}
        >
          Settings
          {character.level < 20 && (
            <span style={{ fontSize: 8, fontWeight: 800, color: 'var(--c-gold-l)', background: 'var(--c-gold-bg)', border: '1px solid var(--c-gold-bdr)', padding: '1px 5px', borderRadius: 999 }}>
              LVL UP
            </span>
          )}
        </button>
      </div>

      {/* Death saves strip */}
      {character.current_hp <= 0 && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '6px 24px', borderTop: '1px solid rgba(229,57,53,0.3)', background: 'rgba(229,57,53,0.06)', display: 'flex', gap: 16, alignItems: 'center' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#ff8a80', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Death Saves</span>
          <div style={{ display: 'flex', gap: 3 }}>
            {[0,1,2].map(i => <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', border: '1.5px solid #34d399', background: i < (character.death_saves_successes ?? 0) ? '#34d399' : 'transparent' }} />)}
          </div>
          <span style={{ fontSize: 10, color: 'var(--t-2)' }}>Successes</span>
          <div style={{ display: 'flex', gap: 3 }}>
            {[0,1,2].map(i => <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', border: '1.5px solid #e53935', background: i < (character.death_saves_failures ?? 0) ? '#e53935' : 'transparent' }} />)}
          </div>
          <span style={{ fontSize: 10, color: 'var(--t-2)' }}>Failures</span>
        </div>
      )}
    </div>
  );
}
