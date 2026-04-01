import type { Character, SpellSlots } from '../../types';

interface SpellSlotsProps {
  character: Character;
  onUpdateSlots: (slots: SpellSlots) => void;
}

const LEVEL_LABELS: Record<string, string> = {
  '1': '1st', '2': '2nd', '3': '3rd', '4': '4th', '5': '5th',
  '6': '6th', '7': '7th', '8': '8th', '9': '9th',
};

export default function SpellSlotsPanel({ character, onUpdateSlots }: SpellSlotsProps) {
  const slots = character.spell_slots;
  const slotLevels = Object.keys(slots)
    .map(Number)
    .filter(lvl => slots[String(lvl)].total > 0)
    .sort((a, b) => a - b);

  if (slotLevels.length === 0) return null;

  function toggleSlot(level: string, pipIndex: number) {
    const current = slots[level];
    if (!current) return;

    // Clicking a used pip (empty) marks it available; clicking an available pip uses it
    const newUsed = pipIndex < current.used
      ? pipIndex       // recover up to this pip
      : pipIndex + 1;  // use up to and including this pip

    onUpdateSlots({
      ...slots,
      [level]: { ...current, used: Math.max(0, Math.min(current.total, newUsed)) },
    });
  }

  function resetLevel(level: string) {
    const current = slots[level];
    if (!current) return;
    onUpdateSlots({ ...slots, [level]: { ...current, used: 0 } });
  }

  return (
    <section>
      <div className="section-header">Spell Slots</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
        {slotLevels.map(lvl => {
          const key = String(lvl);
          const slot = slots[key];
          const remaining = slot.total - slot.used;

          return (
            <div
              key={key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--sp-3)',
                padding: 'var(--sp-2) var(--sp-3)',
                background: '#080d14',
                borderRadius: 'var(--r-md)',
                border: '1px solid var(--c-border)',
              }}
            >
              <span style={{
                fontFamily: 'var(--ff-body)',
                fontSize: 'var(--fs-xs)',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: remaining > 0 ? 'var(--c-gold-l)' : 'var(--t-2)',
                minWidth: '2.5rem',
              }}>
                {LEVEL_LABELS[key]}
              </span>

              {/* Pips */}
              <div style={{ display: 'flex', gap: '6px', flex: 1 }}>
                {Array.from({ length: slot.total }, (_, i) => (
                  <button
                    key={i}
                    className={`slot-pip ${i < slot.used ? 'used' : 'available'}`}
                    onClick={() => toggleSlot(key, i)}
                    title={i < slot.used ? 'Click to recover slot' : 'Click to use slot'}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                    }}
                  >
                    <span className={`slot-pip ${i < slot.used ? 'used' : 'available'}`} />
                  </button>
                ))}
              </div>

              <span style={{
                fontFamily: 'var(--ff-body)',
                fontSize: 'var(--fs-xs)',
                color: remaining > 0 ? 'var(--t-2)' : 'var(--t-2)',
                minWidth: '3rem',
                textAlign: 'right',
              }}>
                {remaining}/{slot.total}
              </span>

              {slot.used > 0 && (
                <button
                  className="btn-ghost btn-sm"
                  onClick={() => resetLevel(key)}
                  title="Recover all slots (long rest)"
                  style={{ padding: '2px var(--sp-2)', fontSize: 'var(--fs-xs)' }}
                >
                  Rest
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
