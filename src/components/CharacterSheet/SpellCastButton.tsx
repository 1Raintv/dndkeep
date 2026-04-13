import { useState } from 'react';
import type { Character, SpellSlots } from '../../types';
import type { SpellData } from '../../types';
import { logAction } from '../shared/ActionLog';
import { parseSpellMechanics, rollDice } from '../../lib/spellParser';

interface SpellCastButtonProps {
  spell: SpellData;
  character: Character;
  userId: string;
  campaignId?: string | null;
  onUpdateSlots: (slots: SpellSlots) => void;
  compact?: boolean;
}

const SAVE_COLORS: Record<string, string> = {
  STR: '#f97316', DEX: '#84cc16', CON: '#ef4444',
  INT: '#3b82f6', WIS: '#22c55e', CHA: '#a855f7',
};

const DAMAGE_COLORS: Record<string, string> = {
  Fire: '#f97316', Thunder: '#a78bfa', Lightning: '#fbbf24',
  Cold: '#60a5fa', Acid: '#4ade80', Poison: '#86efac',
  Necrotic: '#94a3b8', Radiant: '#fde68a', Psychic: '#e879f9',
  Force: '#c084fc',
};

export default function SpellCastButton({ spell, character, userId, campaignId, onUpdateSlots, compact = false }: SpellCastButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [target, setTarget] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<number>(spell.level);
  const [casting, setCasting] = useState(false);
  const [lastRoll, setLastRoll] = useState<{ total: number; rolls: number[]; type: string } | null>(null);

  const isCantrip = spell.level === 0;
  const mechanics = parseSpellMechanics(spell.description);

  const availableSlots: { level: number; remaining: number }[] = [];
  if (!isCantrip) {
    for (let lvl = spell.level; lvl <= 9; lvl++) {
      const slot = character.spell_slots[String(lvl)];
      if (slot && slot.total > 0) {
        const remaining = slot.total - (slot.used ?? 0);
        if (remaining > 0) availableSlots.push({ level: lvl, remaining });
      }
    }
  }
  const canCast = isCantrip || availableSlots.length > 0;

  const spellAbilityMap: Record<string, keyof Character> = {
    Wizard: 'intelligence', Artificer: 'intelligence', Psion: 'intelligence',
    Cleric: 'wisdom', Druid: 'wisdom', Ranger: 'wisdom', Paladin: 'charisma',
    Bard: 'charisma', Sorcerer: 'charisma', Warlock: 'charisma',
  };
  const spellAbilityKey = spellAbilityMap[character.class_name] ?? 'intelligence';
  const spellAbilityScore = (character[spellAbilityKey] as number) ?? 10;
  const spellMod = Math.floor((spellAbilityScore - 10) / 2);
  const profBonus = Math.ceil(character.level / 4) + 1;
  const spellAttack = spellMod + profBonus;
  const saveDC = 8 + spellAttack;

  async function performCast(slotLevel: number, targetName?: string) {
    if (!canCast) return;
    setCasting(true);

    if (!isCantrip) {
      const slotKey = String(slotLevel);
      const currentSlot = character.spell_slots[slotKey];
      if (currentSlot) {
        onUpdateSlots({
          ...character.spell_slots,
          [slotKey]: { ...currentSlot, used: (currentSlot.used ?? 0) + 1 },
        });
      }
    }

    let rollResult = null;
    if (mechanics.damageDice) {
      rollResult = rollDice(mechanics.damageDice);
      setLastRoll({ ...rollResult, type: mechanics.damageType ?? 'damage' });
    } else if (mechanics.healDice) {
      rollResult = rollDice(mechanics.healDice);
      setLastRoll({ ...rollResult, type: 'healing' });
    }

    const slotNote = isCantrip ? 'cantrip' : slotLevel === spell.level
      ? `Level ${slotLevel} slot` : `Upcast — Level ${slotLevel} slot`;

    await logAction({
      campaignId,
      characterId: character.id,
      characterName: character.name,
      actionType: 'spell',
      actionName: spell.name,
      targetName: targetName || undefined,
      diceExpression: mechanics.damageDice ?? mechanics.healDice ?? undefined,
      individualResults: rollResult?.rolls,
      total: rollResult?.total ?? 0,
      notes: `${slotNote}${mechanics.saveType ? ` · ${mechanics.saveType} Save DC ${saveDC}` : ''}${mechanics.damageDice ? ` · ${mechanics.damageType ?? ''} dmg` : ''}`,
    });

    setCasting(false);
  }

  if (!canCast && !isCantrip) {
    return (
      <button disabled style={{
        fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 9,
        padding: '2px 8px', borderRadius: 4, border: '1px solid var(--c-border)',
        background: 'transparent', color: 'var(--t-2)', cursor: 'not-allowed', opacity: 0.4,
      }}>No Slots</button>
    );
  }

  if (compact) {
    const dmgColor = DAMAGE_COLORS[mechanics.damageType ?? ''] ?? '#94a3b8';
    const saveColor = SAVE_COLORS[mechanics.saveType ?? ''] ?? '#94a3b8';

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 999, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--c-border)', color: 'var(--t-3)' }}>
          📍 {spell.range}
        </span>
        {mechanics.saveType && (
          <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 999, background: saveColor + '18', border: `1px solid ${saveColor}50`, color: saveColor }}>
            {mechanics.saveType} DC {saveDC}
          </span>
        )}
        {mechanics.isAttack && (
          <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 999, background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.35)', color: '#fbbf24' }}>
            🎲 +{spellAttack}
          </span>
        )}
        {mechanics.damageDice && (
          <button onClick={async e => {
            e.stopPropagation();
            // Clicking damage dice = cast the spell (deduct slot + roll + log)
            if (!isCantrip && availableSlots.length > 1) {
              // Multiple slot levels available — open picker
              setShowModal(true);
            } else {
              // Auto-cast: use lowest available slot
              const slotLevel = isCantrip ? 0 : (availableSlots[0]?.level ?? spell.level);
              const r = rollDice(mechanics.damageDice!);
              setLastRoll({ ...r, type: mechanics.damageType ?? 'damage' });
              if (!isCantrip && availableSlots.length > 0) {
                const slotKey = String(slotLevel);
                const currentSlot = character.spell_slots[slotKey];
                if (currentSlot) {
                  onUpdateSlots({ ...character.spell_slots, [slotKey]: { ...currentSlot, used: (currentSlot.used ?? 0) + 1 } });
                }
              }
              await logAction({ campaignId, characterId: character.id, characterName: character.name, actionType: 'damage', actionName: `${spell.name} — ${mechanics.damageType ?? 'damage'}`, diceExpression: mechanics.damageDice!, individualResults: r.rolls, total: r.total, notes: isCantrip ? 'cantrip' : `Level ${slotLevel} slot` });
            }
          }} style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 999, cursor: 'pointer', background: dmgColor + '18', border: `1px solid ${dmgColor}50`, color: dmgColor }}>
            🎲 {mechanics.damageDice} {mechanics.damageType}
          </button>
        )}
        {mechanics.healDice && (
          <button onClick={async e => {
            e.stopPropagation();
            const slotLevel = isCantrip ? 0 : (availableSlots[0]?.level ?? spell.level);
            const r = rollDice(mechanics.healDice!);
            setLastRoll({ ...r, type: 'healing' });
            if (!isCantrip && availableSlots.length > 0) {
              const currentSlot = character.spell_slots[String(slotLevel)];
              if (currentSlot) {
                onUpdateSlots({ ...character.spell_slots, [String(slotLevel)]: { ...currentSlot, used: (currentSlot.used ?? 0) + 1 } });
              }
            }
            await logAction({ campaignId, characterId: character.id, characterName: character.name, actionType: 'heal', actionName: spell.name, diceExpression: mechanics.healDice!, individualResults: r.rolls, total: r.total });
          }} style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 999, cursor: 'pointer', background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.4)', color: '#34d399' }}>
            💚 {mechanics.healDice}
          </button>
        )}

        {/* Only show Cast/Slot button for utility spells (no damage/heal dice) or multi-slot picker */}
        {(mechanics.isUtility || (!mechanics.damageDice && !mechanics.healDice)) && (
          <button onClick={() => isCantrip ? performCast(0) : setShowModal(true)}
            style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 4, cursor: 'pointer', border: '1px solid #a78bfa60', background: 'rgba(167,139,250,0.12)', color: '#a78bfa', letterSpacing: '0.04em', textTransform: 'uppercase' as const }}>
            ✨ Cast
          </button>
        )}

        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
              <h3 style={{ marginBottom: 4 }}>{spell.name}</h3>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                <span style={{ fontSize: 10, color: 'var(--t-3)', background: 'var(--c-raised)', border: '1px solid var(--c-border)', borderRadius: 999, padding: '2px 7px' }}>📍 {spell.range}</span>
                {mechanics.saveType && <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '2px 8px', background: saveColor + '15', border: `1px solid ${saveColor}40`, color: saveColor }}>{mechanics.saveType} Save — DC {saveDC}</span>}
                {mechanics.damageDice && <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '2px 8px', background: dmgColor + '15', border: `1px solid ${dmgColor}40`, color: dmgColor }}>{mechanics.damageDice} {mechanics.damageType}</span>}
              </div>
              {availableSlots.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--t-2)', marginBottom: 5 }}>Spell Slot</div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {availableSlots.map(({ level, remaining }) => (
                      <button key={level} onClick={() => setSelectedSlot(level)} style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 11, padding: '5px 10px', borderRadius: 'var(--r-md)', border: selectedSlot === level ? '2px solid #a78bfa' : '1px solid var(--c-border)', background: selectedSlot === level ? 'rgba(167,139,250,0.15)' : '#080d14', color: selectedSlot === level ? '#a78bfa' : 'var(--t-2)', cursor: 'pointer' }}>
                        Level {level} <span style={{ display: 'block', fontSize: 9, fontWeight: 400 }}>{remaining} left</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--t-2)', marginBottom: 4 }}>Target (optional)</div>
                <input value={target} onChange={e => setTarget(e.target.value)} onKeyDown={e => e.key === 'Enter' && (performCast(selectedSlot, target), setShowModal(false), setTarget(''))} placeholder='e.g. "Goblin King"' autoFocus style={{ fontSize: 'var(--fs-sm)', width: '100%' }} />
              </div>
              <div style={{ padding: 8, background: '#080d14', borderRadius: 'var(--r-md)', marginBottom: 12, fontSize: 10, color: 'var(--t-2)', lineHeight: 1.4, maxHeight: 60, overflowY: 'auto' }}>{spell.description}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-secondary" onClick={() => setShowModal(false)} style={{ flex: 1, justifyContent: 'center' }}>Cancel</button>
                <button onClick={async () => { await performCast(selectedSlot, target); setShowModal(false); setTarget(''); }} disabled={casting} style={{ flex: 2, justifyContent: 'center', fontFamily: 'var(--ff-body)', fontWeight: 700, padding: '7px 14px', borderRadius: 'var(--r-md)', cursor: 'pointer', border: '1px solid #a78bfa60', background: 'rgba(167,139,250,0.2)', color: '#a78bfa', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                  {casting ? 'Casting…' : `✨ Cast${selectedSlot > spell.level ? ` (Lvl ${selectedSlot})` : ''}`}
                  {mechanics.damageDice && !casting && <span style={{ fontSize: 10, opacity: 0.7 }}>→ {mechanics.damageDice} {mechanics.damageType}</span>}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Full button (Spells tab)
  return (
    <>
      <button onClick={() => isCantrip ? performCast(0) : setShowModal(true)}
        style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 9, letterSpacing: '0.04em', textTransform: 'uppercase' as const, padding: '2px 8px', borderRadius: 4, cursor: 'pointer', border: '1px solid #a78bfa60', background: 'rgba(167,139,250,0.12)', color: '#a78bfa', transition: 'all var(--tr-fast)' }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(167,139,250,0.25)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(167,139,250,0.12)'; }}>
        ✨ {mechanics.damageDice ? `Cast (${mechanics.damageDice} ${mechanics.damageType ?? ''})` : 'Cast'}
      </button>
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 4 }}>{spell.name}</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <span style={{ fontSize: 10, color: 'var(--t-3)', background: 'var(--c-raised)', border: '1px solid var(--c-border)', borderRadius: 999, padding: '2px 7px' }}>📍 {spell.range}</span>
              <span style={{ fontSize: 10, color: 'var(--t-3)', background: 'var(--c-raised)', border: '1px solid var(--c-border)', borderRadius: 999, padding: '2px 7px' }}>⏱ {spell.casting_time}</span>
              {mechanics.saveType && <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '2px 8px', background: (SAVE_COLORS[mechanics.saveType] ?? '#94a3b8') + '15', border: `1px solid ${SAVE_COLORS[mechanics.saveType] ?? '#94a3b8'}40`, color: SAVE_COLORS[mechanics.saveType] ?? '#94a3b8' }}>{mechanics.saveType} Save — DC {saveDC}</span>}
              {mechanics.damageDice && <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '2px 8px', background: (DAMAGE_COLORS[mechanics.damageType ?? ''] ?? '#94a3b8') + '15', border: `1px solid ${DAMAGE_COLORS[mechanics.damageType ?? ''] ?? '#94a3b8'}40`, color: DAMAGE_COLORS[mechanics.damageType ?? ''] ?? '#94a3b8' }}>{mechanics.damageDice} {mechanics.damageType}</span>}
              {mechanics.isAttack && <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '2px 8px', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24' }}>Spell Attack +{spellAttack}</span>}
              {spell.concentration && <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '2px 8px', background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.3)', color: 'var(--c-amber-l)' }}>Concentration</span>}
            </div>
            {availableSlots.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--t-2)', marginBottom: 6 }}>Spell Slot</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {availableSlots.map(({ level, remaining }) => (
                    <button key={level} onClick={() => setSelectedSlot(level)} style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 12, padding: '6px 12px', borderRadius: 'var(--r-md)', border: selectedSlot === level ? '2px solid #a78bfa' : '1px solid var(--c-border)', background: selectedSlot === level ? 'rgba(167,139,250,0.15)' : '#080d14', color: selectedSlot === level ? '#a78bfa' : 'var(--t-2)', cursor: 'pointer' }}>
                      Level {level}<span style={{ display: 'block', fontSize: 9, fontWeight: 400, color: 'var(--t-2)' }}>{remaining} left</span>
                    </button>
                  ))}
                </div>
                {selectedSlot > spell.level && spell.higher_levels && <p style={{ fontSize: 11, color: '#a78bfa', marginTop: 5, fontStyle: 'italic' }}>⬆ Upcast: {spell.higher_levels}</p>}
              </div>
            )}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--t-2)', marginBottom: 4 }}>Target (optional)</div>
              <input value={target} onChange={e => setTarget(e.target.value)} onKeyDown={e => e.key === 'Enter' && (performCast(selectedSlot, target), setShowModal(false), setTarget(''))} placeholder='e.g. "Goblin King"' autoFocus style={{ fontSize: 'var(--fs-sm)', width: '100%' }} />
            </div>
            <div style={{ padding: 10, background: '#080d14', borderRadius: 'var(--r-md)', marginBottom: 14, fontSize: 11, color: 'var(--t-2)', lineHeight: 1.5, maxHeight: 72, overflowY: 'auto' }}>{spell.description}</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-secondary" onClick={() => setShowModal(false)} style={{ flex: 1, justifyContent: 'center' }}>Cancel</button>
              <button onClick={async () => { await performCast(selectedSlot, target); setShowModal(false); setTarget(''); }} disabled={casting} style={{ flex: 2, justifyContent: 'center', fontFamily: 'var(--ff-body)', fontWeight: 700, padding: '8px 16px', borderRadius: 'var(--r-md)', cursor: 'pointer', border: '1px solid #a78bfa60', background: 'rgba(167,139,250,0.2)', color: '#a78bfa', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                {casting ? 'Casting…' : `✨ Cast${selectedSlot > spell.level ? ` (Level ${selectedSlot})` : ''}`}
                {mechanics.damageDice && !casting && <span style={{ fontSize: 11, opacity: 0.75 }}>→ {mechanics.damageDice} {mechanics.damageType}</span>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
