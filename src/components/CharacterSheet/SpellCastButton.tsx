import { useState } from 'react';
import type { Character, SpellSlots } from '../../types';
import type { SpellData } from '../../types';
import { logAction } from '../shared/ActionLog';

interface SpellCastButtonProps {
  spell: SpellData;
  character: Character;
  userId: string;
  campaignId?: string | null;
  onUpdateSlots: (slots: SpellSlots) => void;
}

export default function SpellCastButton({ spell, character, userId, campaignId, onUpdateSlots }: SpellCastButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [target, setTarget] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<number>(spell.level);
  const [casting, setCasting] = useState(false);

  // Cantrips don't use slots
  const isCantrip = spell.level === 0;

  // Which slots are available at spell.level or higher?
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

  async function confirmCast() {
    if (!canCast) return;
    setCasting(true);

    // Deduct slot if not cantrip
    if (!isCantrip) {
      const slotKey = String(selectedSlot);
      const currentSlot = character.spell_slots[slotKey];
      if (currentSlot) {
        const newSlots = {
          ...character.spell_slots,
          [slotKey]: { ...currentSlot, used: (currentSlot.used ?? 0) + 1 },
        };
        onUpdateSlots(newSlots);
      }
    }

    // Log the cast
    const slotNote = isCantrip ? 'cantrip' : selectedSlot === spell.level ? `${selectedSlot}th-level slot` : `Upcast: ${selectedSlot}th-level slot`;
    await logAction({
      campaignId,
      characterId: userId,
      characterName: character.name,
      actionType: 'spell',
      actionName: spell.name,
      targetName: target || undefined,
      notes: `${slotNote} · ${spell.school}${spell.concentration ? ' · Concentration' : ''}`,
      total: 0,
    });

    setCasting(false);
    setShowModal(false);
    setTarget('');
  }

  if (!canCast && !isCantrip) {
    return (
      <button
        disabled
        style={{
          fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 9,
          padding: '2px 8px', borderRadius: 4,
          border: '1px solid var(--c-border)',
          background: 'transparent', color: 'var(--t-2)',
          cursor: 'not-allowed', opacity: 0.4,
        }}
      >
        No Slots
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => isCantrip ? confirmCast() : setShowModal(true)}
        style={{
          fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 9,
          letterSpacing: '0.04em', textTransform: 'uppercase',
          padding: '2px 8px', borderRadius: 4, cursor: 'pointer',
          border: '1px solid #a78bfa60',
          background: 'rgba(167,139,250,0.12)',
          color: '#a78bfa',
          transition: 'all var(--tr-fast)',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(167,139,250,0.25)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(167,139,250,0.12)'; }}
      >
        ✨ Cast
      </button>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 'var(--sp-1)' }}>{spell.name}</h3>
            <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)', marginBottom: 'var(--sp-4)' }}>
              {spell.school} · {spell.casting_time} · {spell.range}
              {spell.concentration && ' · Concentration'}
            </p>

            {/* Slot selector — only for leveled spells */}
            {availableSlots.length > 0 && (
              <div style={{ marginBottom: 'var(--sp-4)' }}>
                <label style={{
                  display: 'block', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)',
                  fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: 'var(--t-2)', marginBottom: 'var(--sp-2)',
                  background: 'none', WebkitTextFillColor: 'var(--t-2)',
                }}>
                  Spell Slot
                </label>
                <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                  {availableSlots.map(({ level, remaining }) => (
                    <button
                      key={level}
                      onClick={() => setSelectedSlot(level)}
                      style={{
                        fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-xs)',
                        padding: 'var(--sp-2) var(--sp-3)', borderRadius: 'var(--r-md)',
                        border: selectedSlot === level ? '2px solid #a78bfa' : '1px solid var(--c-border)',
                        background: selectedSlot === level ? 'rgba(167,139,250,0.15)' : '#080d14',
                        color: selectedSlot === level ? '#a78bfa' : 'var(--t-2)',
                        cursor: 'pointer',
                      }}
                    >
                      Level {level}
                      <span style={{ display: 'block', fontSize: 9, fontWeight: 400, color: 'var(--t-2)' }}>
                        {remaining} left
                      </span>
                    </button>
                  ))}
                </div>
                {selectedSlot > spell.level && spell.higher_levels && (
                  <p style={{ fontSize: 'var(--fs-xs)', color: '#a78bfa', marginTop: 'var(--sp-2)', fontStyle: 'italic' }}>
                    Upcast: {spell.higher_levels}
                  </p>
                )}
              </div>
            )}

            {/* Target */}
            <div style={{ marginBottom: 'var(--sp-4)' }}>
              <label style={{
                display: 'block', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)',
                fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'var(--t-2)', marginBottom: 'var(--sp-1)',
                background: 'none', WebkitTextFillColor: 'var(--t-2)',
              }}>
                Target (optional)
              </label>
              <input
                value={target}
                onChange={e => setTarget(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && confirmCast()}
                placeholder='e.g. "Goblin King" or "Party"'
                autoFocus
                style={{ fontSize: 'var(--fs-sm)' }}
              />
            </div>

            {/* Spell description preview */}
            <div style={{
              padding: 'var(--sp-3)', background: '#080d14',
              borderRadius: 'var(--r-md)', marginBottom: 'var(--sp-4)',
              fontSize: 'var(--fs-xs)', color: 'var(--t-2)', lineHeight: 1.5,
              maxHeight: 80, overflowY: 'auto',
            }}>
              {spell.description}
            </div>

            <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
              <button className="btn-secondary" onClick={() => setShowModal(false)} style={{ flex: 1, justifyContent: 'center' }}>
                Cancel
              </button>
              <button
                onClick={confirmCast}
                disabled={casting}
                style={{
                  flex: 2, justifyContent: 'center',
                  fontFamily: 'var(--ff-body)', fontWeight: 700,
                  padding: 'var(--sp-2) var(--sp-4)',
                  borderRadius: 'var(--r-md)', cursor: 'pointer',
                  border: '1px solid #a78bfa60',
                  background: 'rgba(167,139,250,0.2)',
                  color: '#a78bfa', fontSize: 'var(--fs-sm)',
                  display: 'flex', alignItems: 'center',
                }}
              >
                {casting ? 'Casting…' : `✨ Cast ${selectedSlot > spell.level ? `(Level ${selectedSlot})` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
