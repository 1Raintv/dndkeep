import { useState } from 'react';
import { useMonsters } from '../../lib/hooks/useMonsters';
import { formatCR } from '../../lib/monsterUtils';
import type { MonsterData } from '../../types';
import { rollDie } from '../../lib/gameUtils';
import { v4 as uuidv4 } from 'uuid';
import type { Combatant } from '../../types';

interface EncounterEntry {
  monster: MonsterData;
  count: number;
}

interface EncounterBuilderProps {
  partySize: number;
  partyLevel: number;
  onAddToCombat: (combatants: Combatant[]) => void;
  onClose: () => void;
}

// XP thresholds per character per level (Easy/Medium/Hard/Deadly)
const XP_THRESHOLDS: Record<number, [number, number, number, number]> = {
  1:  [25, 50, 75, 100],
  2:  [50, 100, 150, 200],
  3:  [75, 150, 225, 400],
  4:  [125, 250, 375, 500],
  5:  [250, 500, 750, 1100],
  6:  [300, 600, 900, 1400],
  7:  [350, 750, 1100, 1700],
  8:  [450, 900, 1400, 2100],
  9:  [550, 1100, 1600, 2400],
  10: [600, 1200, 1900, 2800],
  11: [800, 1600, 2400, 3600],
  12: [1000, 2000, 3000, 4500],
  13: [1100, 2200, 3400, 5100],
  14: [1250, 2500, 3800, 5700],
  15: [1400, 2800, 4300, 6400],
  16: [1600, 3200, 4800, 7200],
  17: [2000, 3900, 5900, 8800],
  18: [2100, 4200, 6300, 9500],
  19: [2400, 4900, 7300, 10900],
  20: [2800, 5700, 8500, 12700],
};

// XP multiplier by monster count
function xpMultiplier(count: number): number {
  if (count === 1) return 1;
  if (count === 2) return 1.5;
  if (count <= 6) return 2;
  if (count <= 10) return 2.5;
  if (count <= 14) return 3;
  return 4;
}

function difficultyLabel(xp: number, thresholds: number[]): { label: string; color: string } {
  if (xp < thresholds[0]) return { label: 'Trivial', color: 'var(--t-2)' };
  if (xp < thresholds[1]) return { label: 'Easy', color: 'var(--hp-full)' };
  if (xp < thresholds[2]) return { label: 'Medium', color: 'var(--c-amber-l)' };
  if (xp < thresholds[3]) return { label: 'Hard', color: '#fb923c' };
  return { label: 'Deadly ', color: 'var(--c-red-l)' };
}

export default function EncounterBuilder({ partySize, partyLevel, onAddToCombat, onClose }: EncounterBuilderProps) {
  const { monsters } = useMonsters();
  const [encounter, setEncounter] = useState<EncounterEntry[]>([]);
  const [search, setSearch] = useState('');
  const [crFilter, setCRFilter] = useState('');

  const level = Math.max(1, Math.min(20, partyLevel));
  const thresholds = XP_THRESHOLDS[level] ?? XP_THRESHOLDS[5];
  const partyThresholds = thresholds.map(t => t * partySize) as [number, number, number, number];

  const totalMonsters = encounter.reduce((s, e) => s + e.count, 0);
  const rawXP = encounter.reduce((s, e) => s + e.monster.xp * e.count, 0);
  const adjustedXP = Math.round(rawXP * xpMultiplier(totalMonsters));
  const difficulty = difficultyLabel(adjustedXP, partyThresholds);

  const filteredMonsters = monsters.filter(m => {
    const matchSearch = !search || m.name.toLowerCase().includes(search.toLowerCase());
    const matchCR = !crFilter || String(m.cr) === crFilter;
    return matchSearch && matchCR;
  }).slice(0, 30);

  function addMonster(m: MonsterData) {
    setEncounter(prev => {
      const existing = prev.find(e => e.monster.id === m.id);
      if (existing) return prev.map(e => e.monster.id === m.id ? { ...e, count: e.count + 1 } : e);
      return [...prev, { monster: m, count: 1 }];
    });
  }

  function removeMonster(id: string) {
    setEncounter(prev => {
      const existing = prev.find(e => e.monster.id === id);
      if (!existing) return prev;
      if (existing.count <= 1) return prev.filter(e => e.monster.id !== id);
      return prev.map(e => e.monster.id === id ? { ...e, count: e.count - 1 } : e);
    });
  }

  function buildAndAdd() {
    const combatants: Combatant[] = [];
    for (const { monster, count } of encounter) {
      for (let i = 1; i <= count; i++) {
        const initiative = rollDie(20) + Math.floor((monster.dex - 10) / 2);
        combatants.push({
          id: uuidv4(),
          name: count > 1 ? `${monster.name} ${i}` : monster.name,
          initiative,
          current_hp: monster.hp,
          max_hp: monster.hp,
          ac: monster.ac,
          is_monster: true,
          monster_id: monster.id,
          conditions: [],
          notes: `CR ${formatCR(monster.cr)} · AC ${monster.ac}${monster.ac_note ? ` (${monster.ac_note})` : ''}`,
        });
      }
    }
    // Sort by initiative
    combatants.sort((a, b) => b.initiative - a.initiative);
    onAddToCombat(combatants);
    onClose();
  }

  const CRS = ['0', '1/8', '1/4', '1/2', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21'];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 700, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-4)' }}>
          <h3>Encounter Builder</h3>
          <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
            Party: {partySize}× Level {level}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)', flex: 1, overflow: 'hidden' }}>
          {/* Monster picker */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search monsters…" style={{ flex: 1, fontSize: 'var(--fs-sm)' }} />
              <select value={crFilter} onChange={e => setCRFilter(e.target.value)} style={{ width: 80, fontSize: 'var(--fs-sm)' }}>
                <option value="">CR</option>
                {CRS.map(cr => <option key={cr} value={cr}>CR {cr}</option>)}
              </select>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {filteredMonsters.map(m => (
                <button
                  key={m.id}
                  onClick={() => addMonster(m)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: 'var(--sp-2) var(--sp-3)', borderRadius: 'var(--r-sm)',
                    border: '1px solid var(--c-border)', background: '#080d14',
                    cursor: 'pointer', textAlign: 'left', transition: 'all var(--tr-fast)',
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--c-gold)'}
                  onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--c-border)'}
                >
                  <div>
                    <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-xs)', color: 'var(--t-1)' }}>{m.name}</div>
                    <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-2)' }}>CR {formatCR(m.cr)} · {m.type} · {m.hp} HP</div>
                  </div>
                  <span style={{ color: 'var(--c-gold-l)', fontSize: 18, lineHeight: 1 }}>+</span>
                </button>
              ))}
            </div>
          </div>

          {/* Encounter composition */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', overflow: 'hidden' }}>
            <div className="section-header">Encounter</div>

            {/* XP Budget */}
            <div style={{ padding: 'var(--sp-3)', background: '#080d14', borderRadius: 'var(--r-md)', border: `1px solid ${difficulty.color}50` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-md)', color: difficulty.color }}>{difficulty.label}</span>
                <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>{adjustedXP.toLocaleString()} XP (adj.)</span>
              </div>
              <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
                {(['Easy', 'Medium', 'Hard', 'Deadly'] as const).map((d, i) => (
                  <div key={d} style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-2)' }}>
                    {d}: {partyThresholds[i].toLocaleString()}
                  </div>
                ))}
              </div>
            </div>

            {/* Monster list */}
            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {encounter.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 'var(--sp-6)', color: 'var(--t-2)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)' }}>
                  Click monsters on the left to add them
                </div>
              ) : encounter.map(({ monster, count }) => (
                <div key={monster.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', padding: 'var(--sp-2) var(--sp-3)', background: '#080d14', borderRadius: 'var(--r-sm)', border: '1px solid var(--c-border)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-xs)', color: 'var(--t-1)' }}>{monster.name}</div>
                    <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-2)' }}>{monster.xp * count} XP · {monster.hp} HP each</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-1)' }}>
                    <button onClick={() => removeMonster(monster.id)} style={{ width: 20, height: 20, borderRadius: '50%', border: '1px solid var(--c-border)', background: 'var(--c-raised)', cursor: 'pointer', fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 12, color: 'var(--t-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                    <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--t-1)', minWidth: 20, textAlign: 'center' }}>×{count}</span>
                    <button onClick={() => addMonster(monster)} style={{ width: 20, height: 20, borderRadius: '50%', border: '1px solid var(--c-gold-bdr)', background: 'rgba(201,146,42,0.1)', cursor: 'pointer', fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 12, color: 'var(--c-gold-l)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
              <button className="btn-secondary" onClick={onClose} style={{ flex: 1, justifyContent: 'center' }}>Cancel</button>
              <button className="btn-gold" onClick={buildAndAdd} disabled={encounter.length === 0} style={{ flex: 2, justifyContent: 'center' }}>
                Add to Combat ({totalMonsters} monsters)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
