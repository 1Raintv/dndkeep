import { useState } from 'react';
import { MONSTERS } from '../../data/monsters';
import type { Character } from '../../types';

interface WildshapeTrackerProps {
  character: Character;
  onUpdate: (updates: Partial<Character>) => void;
}

const BEAST_FILTERS = [
  { label: 'CR 0', value: '0' },
  { label: 'CR 1/8', value: '1/8' },
  { label: 'CR 1/4', value: '1/4' },
  { label: 'CR 1/2', value: '1/2' },
  { label: 'CR 1', value: '1' },
  { label: 'CR 2', value: '2' },
  { label: 'CR 3', value: '3' },
];

// Wildshape CR limit by druid level
function maxWildsnapeCR(level: number): number {
  if (level < 2) return 0;
  if (level < 4) return 0.25;
  if (level < 8) return 0.5;
  return 1;
}

const beasts = MONSTERS.filter(m => m.type === 'Beast');

export default function WildshapeTracker({ character, onUpdate }: WildshapeTrackerProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState('');
  const [hpInput, setHpInput] = useState('');

  const isDruid = character.class_name === 'Druid';
  if (!isDruid) return null;

  const crLimit = maxWildsnapeCR(character.level);
  const crValue = (cr: string | number): number => {
    if (typeof cr === 'number') return cr;
    if (cr === '1/8') return 0.125;
    if (cr === '1/4') return 0.25;
    if (cr === '1/2') return 0.5;
    return parseFloat(cr) || 0;
  };

  const availableBeasts = beasts.filter(b => {
    const cr = crValue(b.cr);
    const matchesCR = cr <= crLimit;
    const matchesSearch = !search || b.name.toLowerCase().includes(search.toLowerCase());
    return matchesCR && matchesSearch;
  });

  function enterWildshape(beastId: string) {
    const beast = beasts.find(b => b.id === beastId);
    if (!beast) return;
    onUpdate({
      wildshape_active: true,
      wildshape_beast_name: beast.name,
      wildshape_current_hp: beast.hp,
      wildshape_max_hp: beast.hp,
    });
    setShowPicker(false);
    setSearch('');
  }

  function dropWildshape() {
    onUpdate({
      wildshape_active: false,
      wildshape_beast_name: '',
      wildshape_current_hp: 0,
      wildshape_max_hp: 0,
    });
  }

  function applyWildsnapeDamage(delta: number) {
    const newHp = Math.max(0, Math.min(
      character.wildshape_max_hp,
      (character.wildshape_current_hp ?? 0) + delta
    ));
    const willDrop = newHp <= 0;
    onUpdate({
      wildshape_current_hp: newHp,
      ...(willDrop ? { wildshape_active: false, wildshape_beast_name: '', wildshape_max_hp: 0 } : {}),
    });
  }

  const hpPct = character.wildshape_max_hp > 0
    ? (character.wildshape_current_hp ?? 0) / character.wildshape_max_hp
    : 0;
  const hpColor = hpPct > 0.5 ? 'var(--hp-full)' : hpPct > 0.25 ? 'var(--hp-mid)' : 'var(--hp-low)';

  return (
    <div>
      {/* Active wildshape banner */}
      {character.wildshape_active ? (
        <div className="animate-fade-in" style={{
          padding: 'var(--space-4)',
          background: 'rgba(22,163,74,0.08)',
          border: '1px solid rgba(22,163,74,0.4)',
          borderRadius: 'var(--radius-lg)',
          marginBottom: 'var(--space-4)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-3)' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--hp-full)', marginBottom: 2 }}>
                🐾 Wildshape: {character.wildshape_beast_name}
              </div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                Beast HP — separate from your own
              </div>
            </div>
            <button
              className="btn-danger btn-sm"
              onClick={dropWildshape}
              title="Drop wildshape — revert to druid form"
            >
              Drop Form
            </button>
          </div>

          {/* HP display */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 'var(--text-2xl)', color: hpColor, lineHeight: 1 }}>
              {character.wildshape_current_hp ?? 0}
            </div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
              / {character.wildshape_max_hp} HP
            </div>
          </div>

          <div className="hp-bar-container" style={{ marginBottom: 'var(--space-3)' }}>
            <div className="hp-bar-fill" style={{ width: `${Math.max(0, hpPct * 100)}%`, backgroundColor: hpColor }} />
          </div>

          {/* Quick HP controls */}
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            <input
              type="number"
              placeholder="Amount"
              value={hpInput}
              onChange={e => setHpInput(e.target.value)}
              style={{ width: 80, fontSize: 'var(--text-sm)', textAlign: 'center' }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const v = parseInt(hpInput);
                  if (!isNaN(v)) applyWildsnapeDamage(-v);
                  setHpInput('');
                }
              }}
            />
            <button
              className="btn-sm"
              style={{ background: 'rgba(220,38,38,0.15)', border: '1px solid var(--color-crimson-bright)', color: 'var(--color-crimson-bright)', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-xs)', padding: 'var(--space-1) var(--space-3)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              onClick={() => { const v = parseInt(hpInput); if (!isNaN(v)) { applyWildsnapeDamage(-v); setHpInput(''); } }}
            >
              Damage
            </button>
            <button
              className="btn-sm"
              style={{ background: 'rgba(22,163,74,0.15)', border: '1px solid var(--hp-full)', color: 'var(--hp-full)', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-xs)', padding: 'var(--space-1) var(--space-3)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              onClick={() => { const v = parseInt(hpInput); if (!isNaN(v)) { applyWildsnapeDamage(v); setHpInput(''); } }}
            >
              Heal
            </button>
          </div>
          {(character.wildshape_current_hp ?? 0) <= 0 && (
            <p style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--color-crimson-bright)', marginTop: 'var(--space-2)' }}>
              Beast HP dropped to 0 — you revert to your druid form.
            </p>
          )}
        </div>
      ) : (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <button
            className="btn-secondary"
            onClick={() => setShowPicker(true)}
            disabled={character.level < 2}
            title={character.level < 2 ? 'Wildshape requires level 2' : 'Choose a beast form'}
          >
            🐾 Enter Wildshape
          </button>
          {character.level < 2 && (
            <p style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 'var(--space-2)' }}>
              Wildshape unlocks at level 2.
            </p>
          )}
          <p style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 'var(--space-2)' }}>
            Max CR: {crLimit <= 0.125 ? '1/8' : crLimit <= 0.25 ? '1/4' : crLimit <= 0.5 ? '1/2' : crLimit} at level {character.level}
          </p>
        </div>
      )}

      {/* Beast picker modal */}
      {showPicker && (
        <div className="modal-overlay" onClick={() => setShowPicker(false)}>
          <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 'var(--space-4)' }}>Choose Beast Form</h3>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search beasts..."
              autoFocus
              style={{ marginBottom: 'var(--space-4)' }}
            />
            <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {availableBeasts.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)', textAlign: 'center', padding: 'var(--space-4)' }}>
                  No beasts available at CR {crLimit} or lower.
                </p>
              ) : availableBeasts.map(beast => (
                <button
                  key={beast.id}
                  onClick={() => enterWildshape(beast.id)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)', background: 'var(--bg-sunken)',
                    cursor: 'pointer', textAlign: 'left', transition: 'all var(--transition-fast)',
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--hp-full)'}
                  onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-subtle)'}
                >
                  <div>
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>{beast.name}</div>
                    <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>CR {beast.cr} · {beast.size} Beast · AC {beast.ac}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--hp-full)' }}>{beast.hp} HP</div>
                    <div style={{ fontFamily: 'var(--font-heading)', fontSize: 9, color: 'var(--text-muted)' }}>Speed {beast.speed} ft</div>
                  </div>
                </button>
              ))}
            </div>
            <button className="btn-secondary" onClick={() => setShowPicker(false)} style={{ marginTop: 'var(--space-4)' }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
