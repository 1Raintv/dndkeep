import { useState } from 'react';
import type { Character } from '../../types';
import { CLASS_COMBAT_ABILITIES, type ClassAbility } from '../../data/classAbilities';
import { logAction } from '../shared/ActionLog';
import { rollDice } from '../../lib/spellParser';

interface Props {
  character: Character;
  combatFilter: 'all' | 'action' | 'bonus' | 'reaction' | 'limited';
  onUpdate: (u: Partial<Character>) => void;
  userId?: string;
  campaignId?: string | null;
}

const ACTION_LABELS: Record<string, string> = {
  action:   '🔵 Action',
  bonus:    '⚡ Bonus',
  reaction: '🛡 Reaction',
  special:  '⬡ Special',
  free:     'Free',
};

const ACTION_COLORS: Record<string, string> = {
  action:   '#60a5fa',
  bonus:    '#fbbf24',
  reaction: '#34d399',
  special:  '#c084fc',
  free:     'var(--t-3)',
};

function UseTracker({ abilityName, max, rest, character, onUpdate }: {
  abilityName: string; max: number; rest: 'short' | 'long';
  character: Character; onUpdate: (u: Partial<Character>) => void;
}) {
  const uses = ((character.feature_uses as Record<string, number>) ?? {})[abilityName] ?? 0;
  const remaining = max - uses;

  function toggle(targetUsed: number) {
    const clamped = Math.min(max, Math.max(0, targetUsed));
    onUpdate({
      feature_uses: { ...((character.feature_uses as Record<string, number>) ?? {}), [abilityName]: clamped }
    });
  }

  // Pool display (> 8 uses or isPool)
  if (max > 8) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button onClick={() => toggle(uses + 1)} style={trackBtnStyle}>−1</button>
        <span style={{
          fontFamily: 'var(--ff-stat)', fontSize: 13, fontWeight: 700,
          color: remaining > 0 ? 'var(--c-gold-l)' : 'var(--t-3)',
          minWidth: 52, textAlign: 'center' as const,
        }}>
          {remaining}/{max}
        </span>
        <button onClick={() => toggle(uses - 1)} style={trackBtnStyle}>+1</button>
        <button onClick={() => toggle(0)} style={{ ...trackBtnStyle, color: 'var(--t-3)', fontSize: 9 }}>↺</button>
        <span style={{ fontSize: 9, color: rest === 'short' ? '#60a5fa' : '#a78bfa', fontFamily: 'var(--ff-body)' }}>
          {rest === 'short' ? 'Short/LR' : 'Long Rest'}
        </span>
      </div>
    );
  }

  // Checkbox display
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {Array.from({ length: max }).map((_, i) => (
        <button
          key={i}
          onClick={() => toggle(i < uses ? i : i + 1)}
          title={i < uses ? 'Restore use' : 'Use'}
          style={{
            width: 16, height: 16, borderRadius: 3, cursor: 'pointer', padding: 0,
            background: i < uses ? 'transparent' : 'var(--c-gold-l)',
            border: `2px solid ${i < uses ? 'var(--c-border-m)' : 'var(--c-gold-l)'}`,
            transition: 'all 0.15s', flexShrink: 0,
          }}
        />
      ))}
      <span style={{ fontSize: 9, color: rest === 'short' ? '#60a5fa' : '#a78bfa', fontFamily: 'var(--ff-body)', marginLeft: 2 }}>
        / {rest === 'short' ? 'Short Rest' : 'Long Rest'}
      </span>
    </div>
  );
}

const trackBtnStyle: React.CSSProperties = {
  width: 24, height: 24, borderRadius: 'var(--r-sm)',
  background: 'var(--c-raised)', border: '1px solid var(--c-border)',
  color: 'var(--t-2)', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--ff-body)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

function getMaxUses(ability: ClassAbility, character: Character): number | undefined {
  if (ability.maxUsesFn) {
    const val = ability.maxUsesFn(character);
    if (val === 999) return undefined; // unlimited
    return val;
  }
  return undefined;
}

// Resolve dynamic values in descriptions
function getPsionicDieSize(level: number): string {
  if (level >= 17) return 'd12';
  if (level >= 11) return 'd10';
  if (level >= 5) return 'd8';
  return 'd6';
}

function getPsionicDieCount(level: number): number {
  if (level >= 17) return 12;
  if (level >= 13) return 10;
  if (level >= 9) return 8;
  if (level >= 5) return 6;
  return 4;
}

function resolveDesc(desc: string | ((c: Character) => string), character: Character): string {
  const raw = typeof desc === 'function' ? desc(character) : desc;
  return raw.replace('{{sneak_dice}}', String(Math.ceil(character.level / 2)));
}

export default function ClassAbilitiesSection({ character, combatFilter, onUpdate, userId, campaignId }: Props) {
  const [justUsed, setJustUsed] = useState<string | null>(null);
  const [psionicRollHistory, setPsionicRollHistory] = useState<{ value: number; die: string }[]>([]);

  async function handleUseAbility(ability: ClassAbility, cost?: number) {
    // Mark as used if it has limited uses
    if (cost !== undefined) {
      const current = ((character.feature_uses as Record<string, number>) ?? {})[ability.name] ?? 0;
      onUpdate({
        feature_uses: { ...((character.feature_uses as Record<string, number>) ?? {}), [ability.name]: current + 1 }
      });
    }
    // Deduct from class_resources if pool-based
    if (ability.id === 'psionic-energy-dice' || (ability as any).isPool) {
      const resources = { ...(character.class_resources as Record<string, number> ?? {}) };
      if (resources['psionic-energy-dice'] !== undefined) {
        resources['psionic-energy-dice'] = Math.max(0, (resources['psionic-energy-dice'] as number) - 1);
        onUpdate({ class_resources: resources });
      }
    }
    // For psionic energy dice — roll the die and show in action log
    let diceExpr: string | undefined;
    let rollResult: { total: number; rolls: number[] } | undefined;
    if ((ability as any).psionicDie) {
      const dieSize = getPsionicDieSize(character.level);
      diceExpr = `1${dieSize}`;
      rollResult = rollDice(diceExpr);
    }
    // Resolve description (may be a function)
    const desc = resolveDesc((ability as any).description ?? '', character);
    // Log to action log
    await logAction({
      campaignId: campaignId ?? null,
      characterId: character.id,
      characterName: character.name,
      actionType: (ability as any).psionicDie ? 'roll' : ability.actionType === 'action' ? 'spell' :
        ability.actionType === 'bonus' ? 'spell' :
        ability.actionType === 'reaction' ? 'save' : 'roll',
      actionName: (ability as any).psionicDie
        ? `Spent Psionic Energy Die (1${getPsionicDieSize(character.level)})`
        : `Used ${ability.name}`,
      diceExpression: diceExpr,
      individualResults: rollResult?.rolls,
      total: rollResult?.total ?? 0,
      notes: (ability as any).psionicDie
        ? `Rolled 1${getPsionicDieSize(character.level)} = ${rollResult?.total} · ${getPsionicDieCount(character.level) - 1} dice remaining`
        : desc.slice(0, 100) + (desc.length > 100 ? '…' : ''),
    });
    // Store psionic roll for inline display
    if ((ability as any).psionicDie && rollResult) {
      const dieSize = getPsionicDieSize(character.level);
      setPsionicRollHistory(prev => [{ value: rollResult!.total, die: dieSize }, ...prev].slice(0, 5));
    }
    // Brief flash feedback
    setJustUsed(ability.name);
    setTimeout(() => setJustUsed(null), 2000);
  }
  const abilities = CLASS_COMBAT_ABILITIES[character.class_name] ?? [];

  // Filter by level and action type
  const filtered = abilities.filter(a => {
    if (a.minLevel > character.level) return false;
    if (combatFilter === 'limited') return a.maxUsesFn !== undefined || (a as any).isPool === true || (a as any).psionicDie === true;
    if (combatFilter === 'all') return true;
    if (combatFilter === 'action') return a.actionType === 'action';
    if (combatFilter === 'bonus') return a.actionType === 'bonus';
    if (combatFilter === 'reaction') return a.actionType === 'reaction';
    return true;
  });

  if (filtered.length === 0) return null;

  return (
    <div style={{ marginTop: 'var(--sp-3)' }}>
      <div style={{
        fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 700,
        letterSpacing: '0.12em', textTransform: 'uppercase' as const,
        color: '#a78bfa', marginBottom: 8,
      }}>
        ✦ {character.class_name} Abilities
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtered.map(ability => {
          const maxUses = getMaxUses(ability, character);
          const acColor = ACTION_COLORS[ability.actionType] ?? 'var(--t-3)';
          const actionLabel = ACTION_LABELS[ability.actionType] ?? '';
          const desc = resolveDesc(ability.description, character);

          return (
            <div
              key={ability.name}
              style={{
                padding: '10px 14px',
                background: 'var(--c-surface)',
                border: `1px solid ${acColor}25`,
                borderLeft: `3px solid ${acColor}`,
                borderRadius: 'var(--r-md)',
              }}
            >
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' as const }}>
                <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 14, color: 'var(--t-1)', flex: 1 }}>
                  {ability.name}
                </span>
                {ability.actionType !== 'free' && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                    color: acColor, background: acColor + '15',
                    border: `1px solid ${acColor}40`,
                    borderRadius: 999, padding: '2px 7px', flexShrink: 0,
                  }}>
                    {actionLabel}
                  </span>
                )}
                {ability.isPool && (
                  <span style={{ fontSize: 9, fontWeight: 700, color: '#60a5fa', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.3)', borderRadius: 999, padding: '2px 6px' }}>
                    RESOURCE
                  </span>
                )}
              </div>

              {/* Description */}
              <div style={{ fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)', lineHeight: 1.6, marginBottom: 8 }}>
                {desc}
              </div>

              {/* Use tracker + Use button row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' as 'wrap' }}>
                {maxUses !== undefined && ability.rest && (
                  <UseTracker
                    abilityName={ability.name}
                    max={maxUses}
                    rest={ability.rest}
                    character={character}
                    onUpdate={onUpdate}
                  />
                )}
                {/* Use / Cast button */}
                {ability.actionType !== 'free' && (
                  <button
                    onClick={() => handleUseAbility(ability, maxUses !== undefined ? 1 : undefined)}
                    style={{
                      marginLeft: maxUses !== undefined ? 0 : 'auto',
                      padding: '4px 14px', borderRadius: 'var(--r-md)', cursor: 'pointer',
                      background: justUsed === ability.name ? '#34d399' : acColor + '20',
                      border: `1px solid ${justUsed === ability.name ? '#34d399' : acColor + '60'}`,
                      color: justUsed === ability.name ? '#000' : acColor,
                      fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 11,
                      transition: 'all 0.2s', flexShrink: 0,
                    }}
                  >
                    {justUsed === ability.name ? '✓ Used!' :
                      ability.actionType === 'reaction' ? '🛡 Trigger' :
                      ability.actionType === 'bonus' ? '⚡ Use' :
                      (ability as any).psionicDie ? `🎲 Spend Die (1${getPsionicDieSize(character.level)})` : (ability as any).isPool ? '🎲 Spend Die' : '🔵 Use'}
                  </button>
                )}

                {/* Psionic roll history — inline mini log to the right */}
                {(ability as any).psionicDie && psionicRollHistory.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-3)', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Rolls:</span>
                    {psionicRollHistory.map((r, i) => (
                      <span key={i} style={{
                        fontFamily: 'var(--ff-stat)', fontWeight: 800, fontSize: i === 0 ? 13 : 10,
                        padding: '1px 6px', borderRadius: 999,
                        background: i === 0 ? 'rgba(232,121,249,0.2)' : 'rgba(232,121,249,0.07)',
                        border: `1px solid rgba(232,121,249,${i === 0 ? '0.5' : '0.2'})`,
                        color: '#e879f9',
                        transition: 'all 0.3s',
                        flexShrink: 0,
                      }}>
                        {r.value}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
