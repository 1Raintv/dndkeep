import { useState } from 'react';
import type { Character, ComputedStats } from '../../types';
import { abilityModifier } from '../../lib/gameUtils';

interface CharacterHeaderProps {
  character: Character;
  computed: ComputedStats;
  onOpenSettings: () => void;
  onUpdateXP?: (xp: number) => void;
  onOpenAvatarPicker?: () => void;
  onToggleInspiration?: () => void;
  onOpenRest?: () => void;
  onUpdateHP?: (delta: number) => void;
}

const SPELLCASTERS = ['Bard','Cleric','Druid','Paladin','Ranger','Sorcerer','Warlock','Wizard','Artificer'];

function hpColor(current: number, max: number): string {
  const pct = max > 0 ? current / max : 0;
  if (pct > 0.6) return 'var(--hp-full)';
  if (pct > 0.25) return 'var(--hp-mid)';
  return 'var(--hp-low)';
}

export default function CharacterHeader({
  character, computed, onOpenSettings, onUpdateXP, onOpenAvatarPicker,
  onToggleInspiration, onOpenRest, onUpdateHP,
}: CharacterHeaderProps) {
  const [hpDelta, setHpDelta] = useState('');
  const [hpMode, setHpMode] = useState<'damage' | 'heal'>('damage');

  const isSpellcaster = SPELLCASTERS.includes(character.class_name);
  const spellAbility = {
    Bard: 'charisma', Cleric: 'wisdom', Druid: 'wisdom', Paladin: 'charisma',
    Ranger: 'wisdom', Sorcerer: 'charisma', Warlock: 'charisma', Wizard: 'intelligence', Artificer: 'intelligence',
  }[character.class_name] ?? 'intelligence';
  const spellMod = abilityModifier(character[spellAbility as keyof Character] as number ?? 10);
  const spellAttack = spellMod + computed.proficiency_bonus;
  const spellDC = 8 + spellAttack;

  const initMod = computed.modifiers.dexterity + (character.initiative_bonus ?? 0);
  const hpPct = character.max_hp > 0 ? Math.min(1, character.current_hp / character.max_hp) : 0;
  const hpCol = hpColor(character.current_hp, character.max_hp);

  function applyHPChange() {
    const val = parseInt(hpDelta);
    if (isNaN(val) || val <= 0) return;
    onUpdateHP?.(hpMode === 'damage' ? -val : val);
    setHpDelta('');
  }

  const classDisplay = character.secondary_class && (character.secondary_level ?? 0) > 0
    ? `${character.class_name} ${character.level} / ${character.secondary_class} ${character.secondary_level}`
    : `${character.class_name} ${character.level}`;

  const totalLevel = character.level + (character.secondary_level ?? 0);

  return (
    <div style={{
      background: 'linear-gradient(135deg, var(--color-charcoal) 0%, var(--color-shadow) 100%)',
      border: '1px solid var(--border-dim)',
      borderRadius: 'var(--radius-xl)',
      overflow: 'hidden',
      boxShadow: 'var(--shadow-md)',
    }}>
      {/* Top accent bar */}
      <div style={{ height: 2, background: `linear-gradient(90deg, transparent, ${hpCol}, transparent)` }} />

      <div style={{ padding: 'var(--space-4) var(--space-5)', display: 'flex', gap: 'var(--space-4)', alignItems: 'center', flexWrap: 'wrap' }}>

        {/* Avatar + Name column */}
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', minWidth: 180 }}>
          {/* Avatar */}
          <button
            onClick={onOpenAvatarPicker}
            style={{
              width: 52, height: 52, borderRadius: 'var(--radius-lg)', flexShrink: 0,
              background: 'var(--bg-sunken)', border: `2px solid ${hpCol}40`,
              overflow: 'hidden', cursor: 'pointer', padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all var(--transition-fast)',
            }}
            title="Change portrait"
          >
            {character.avatar_url ? (
              <img src={character.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: 24 }}>🧙</span>
            )}
          </button>

          {/* Name + identity */}
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-md)',
              color: 'var(--text-primary)', letterSpacing: '0.03em',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {character.name}
              {character.inspiration && (
                <span title="Inspiration!" style={{ marginLeft: 6, fontSize: 12 }}>⭐</span>
              )}
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 1 }}>
              {classDisplay}
              {character.subclass ? ` · ${character.subclass}` : ''}
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              {character.species}{character.background ? ` · ${character.background}` : ''}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 52, background: 'var(--border-subtle)', flexShrink: 0, display: 'none' }} className="desktop-only" />

        {/* ── STAT CHIPS ────────────────────────── */}
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', flex: 1 }}>

          {/* HP — largest chip */}
          <div style={{
            padding: 'var(--space-2) var(--space-3)',
            background: 'var(--bg-sunken)',
            border: `1px solid ${hpCol}40`,
            borderRadius: 'var(--radius-lg)',
            minWidth: 130,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>HP</span>
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 'var(--text-xl)', color: hpCol, lineHeight: 1 }}>
                {character.current_hp}
              </span>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>/ {character.max_hp}</span>
              {character.temp_hp > 0 && (
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: '#60a5fa', marginLeft: 2 }}>+{character.temp_hp}</span>
              )}
            </div>
            {/* HP bar */}
            <div style={{ height: 3, background: 'var(--bg-raised)', borderRadius: 999, overflow: 'hidden', marginBottom: 4 }}>
              <div style={{ height: '100%', width: `${hpPct * 100}%`, background: hpCol, borderRadius: 999, transition: 'width var(--transition-slow), background var(--transition-normal)', boxShadow: `0 0 6px ${hpCol}` }} />
            </div>
            {/* Inline HP controls */}
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <button
                onClick={() => setHpMode(m => m === 'damage' ? 'heal' : 'damage')}
                style={{
                  fontFamily: 'var(--font-body)', fontSize: 9, fontWeight: 700, padding: '1px 5px',
                  borderRadius: 999, cursor: 'pointer',
                  background: hpMode === 'damage' ? 'rgba(229,57,53,0.15)' : 'rgba(52,211,153,0.15)',
                  border: `1px solid ${hpMode === 'damage' ? 'rgba(229,57,53,0.4)' : 'rgba(52,211,153,0.4)'}`,
                  color: hpMode === 'damage' ? '#ff8a80' : 'var(--hp-full)',
                  minHeight: 0,
                }}
              >
                {hpMode === 'damage' ? '− DMG' : '+ HEAL'}
              </button>
              <input
                type="number"
                value={hpDelta}
                onChange={e => setHpDelta(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyHPChange()}
                placeholder="0"
                min={0}
                style={{ width: 36, padding: '1px 4px', fontSize: 11, textAlign: 'center', borderRadius: 4 }}
              />
              <button
                onClick={applyHPChange}
                disabled={!hpDelta || isNaN(parseInt(hpDelta))}
                style={{
                  fontFamily: 'var(--font-body)', fontSize: 9, fontWeight: 700, padding: '1px 6px',
                  borderRadius: 4, cursor: 'pointer', minHeight: 0,
                  background: 'var(--bg-raised)', border: '1px solid var(--border-dim)', color: 'var(--text-muted)',
                }}
              >
                Apply
              </button>
            </div>
          </div>

          {/* AC */}
          <StatChip icon="🛡️" label="AC" value={character.armor_class} color="var(--color-gold-bright)" />

          {/* Initiative */}
          <StatChip
            icon="⚡"
            label="INIT"
            value={initMod >= 0 ? `+${initMod}` : String(initMod)}
            color="#60a5fa"
          />

          {/* Passive Perception */}
          <StatChip icon="👁️" label="PASS PERC" value={10 + (computed.skills['Perception']?.total ?? 0)} color="var(--text-muted)" small />

          {/* Proficiency Bonus */}
          <StatChip icon="✦" label="PROF" value={`+${computed.proficiency_bonus}`} color="#a78bfa" small />

          {/* Spell attack + DC — spellcasters only */}
          {isSpellcaster && (
            <>
              <StatChip
                icon="✨"
                label="SPELL ATK"
                value={spellAttack >= 0 ? `+${spellAttack}` : String(spellAttack)}
                color="#c084fc"
              />
              <StatChip icon="🔮" label="SPELL DC" value={spellDC} color="#c084fc" />
            </>
          )}

          {/* Speed */}
          <StatChip icon="💨" label="SPEED" value={`${character.speed}ft`} color="var(--text-muted)" small />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', flexShrink: 0 }}>
          <button
            className="btn-secondary btn-sm"
            onClick={onOpenRest}
            title="Short or long rest (T)"
          >
            🌙 Rest
          </button>
          <button
            className="btn-ghost btn-sm"
            onClick={onToggleInspiration}
            title="Toggle inspiration (I)"
            style={{ color: character.inspiration ? 'var(--color-amber)' : 'var(--text-muted)' }}
          >
            {character.inspiration ? '⭐ Inspired' : '☆ Inspiration'}
          </button>
          <button
            className="btn-ghost btn-sm"
            onClick={onOpenSettings}
            style={{ color: 'var(--text-muted)' }}
          >
            ⚙ Settings
          </button>
        </div>
      </div>

      {/* Death saves strip — only when at 0 HP */}
      {character.current_hp <= 0 && (
        <div style={{ padding: 'var(--space-2) var(--space-5)', borderTop: '1px solid rgba(229,57,53,0.3)', background: 'rgba(229,57,53,0.06)', display: 'flex', gap: 'var(--space-4)', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 700, color: '#ff8a80' }}>DEATH SAVES</span>
          <div style={{ display: 'flex', gap: 3 }}>
            {[0,1,2].map(i => (
              <div key={i} style={{ width: 12, height: 12, borderRadius: '50%', border: '1.5px solid #34d399', background: i < (character.death_saves_successes ?? 0) ? '#34d399' : 'transparent' }} />
            ))}
          </div>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Successes</span>
          <div style={{ display: 'flex', gap: 3 }}>
            {[0,1,2].map(i => (
              <div key={i} style={{ width: 12, height: 12, borderRadius: '50%', border: '1.5px solid #e53935', background: i < (character.death_saves_failures ?? 0) ? '#e53935' : 'transparent' }} />
            ))}
          </div>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Failures</span>
        </div>
      )}
    </div>
  );
}

// ── Small reusable stat chip ───────────────────────────────────────
function StatChip({ icon, label, value, color, small }: {
  icon: string; label: string; value: string | number; color: string; small?: boolean;
}) {
  return (
    <div style={{
      padding: small ? '4px var(--space-2)' : 'var(--space-2) var(--space-3)',
      background: 'var(--bg-sunken)',
      border: `1px solid ${color}25`,
      borderRadius: 'var(--radius-md)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
      minWidth: small ? 52 : 64,
    }}>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 2 }}>
        <span>{icon}</span><span>{label}</span>
      </div>
      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: small ? 'var(--text-md)' : 'var(--text-lg)', color, lineHeight: 1 }}>
        {value}
      </div>
    </div>
  );
}
