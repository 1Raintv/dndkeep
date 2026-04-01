import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { WeaponItem } from '../../types';
import { rollDie } from '../../lib/gameUtils';
import { CONDITION_MAP } from '../../data/conditions';
import { useDiceRoll } from '../../context/DiceRollContext';
import { logAction } from '../shared/ActionLog';

interface WeaponsTrackerProps {
  weapons: WeaponItem[];
  onUpdate: (weapons: WeaponItem[]) => void;
  characterId?: string;
  characterName?: string;
  campaignId?: string | null;
  activeConditions?: string[];
}

const DAMAGE_TYPES = ['slashing', 'piercing', 'bludgeoning', 'fire', 'cold', 'lightning', 'poison', 'acid', 'necrotic', 'radiant', 'psychic', 'thunder', 'force'];
const DICE_OPTIONS = ['1d4', '1d6', '1d8', '1d10', '1d12', '2d6', '2d8', '1d4+1d6', 'flat'];

function rollAttack(weapon: WeaponItem): { hit: number; nat: number; damage: number } {
  const nat = rollDie(20);
  const hit = nat + weapon.attackBonus;

  // Parse dice expression e.g. "1d8", "2d6"
  let dmg = weapon.damageBonus;
  const diceMatch = weapon.damageDice.match(/(\d+)d(\d+)/g);
  if (diceMatch) {
    for (const expr of diceMatch) {
      const [count, sides] = expr.split('d').map(Number);
      for (let i = 0; i < count; i++) dmg += rollDie(sides);
    }
  } else if (weapon.damageDice === 'flat') {
    dmg = weapon.damageBonus;
  }

  return { hit, nat, damage: Math.max(1, dmg) };
}

interface RollResult {
  weaponName: string;
  hit: number;
  nat: number;
  damage: number;
  damageType: string;
  crit: boolean;
  miss: boolean;
}

export default function WeaponsTracker({ weapons, onUpdate, characterId, characterName, campaignId, activeConditions = [] }: WeaponsTrackerProps) {
  const [target, setTarget] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const { triggerRoll } = useDiceRoll();
  const [editId, setEditId] = useState<string | null>(null);
  const [lastRoll, setLastRoll] = useState<RollResult | null>(null);
  const [form, setForm] = useState<Partial<WeaponItem>>({
    name: '', attackBonus: 0, damageDice: '1d8', damageBonus: 0,
    damageType: 'slashing', range: 'Melee', properties: '', notes: '',
  });

  function openAdd() {
    setForm({ name: '', attackBonus: 0, damageDice: '1d8', damageBonus: 0, damageType: 'slashing', range: 'Melee', properties: '', notes: '' });
    setEditId(null);
    setShowAdd(true);
  }

  function openEdit(w: WeaponItem) {
    setForm({ ...w });
    setEditId(w.id);
    setShowAdd(true);
  }

  function saveWeapon() {
    if (!form.name?.trim()) return;
    const weapon: WeaponItem = {
      id: editId ?? uuidv4(),
      name: form.name!.trim(),
      attackBonus: form.attackBonus ?? 0,
      damageDice: form.damageDice ?? '1d8',
      damageBonus: form.damageBonus ?? 0,
      damageType: form.damageType ?? 'slashing',
      range: form.range ?? 'Melee',
      properties: form.properties ?? '',
      notes: form.notes ?? '',
    };
    if (editId) {
      onUpdate(weapons.map(w => w.id === editId ? weapon : w));
    } else {
      onUpdate([...weapons, weapon]);
    }
    setShowAdd(false);
    setEditId(null);
  }

  function removeWeapon(id: string) {
    onUpdate(weapons.filter(w => w.id !== id));
  }

  async function handleRoll(weapon: WeaponItem) {
    const hasDisadvantage = activeConditions.some(c => {
      const mech = CONDITION_MAP[c];
      return mech?.attackDisadvantage;
    });
    let result = rollAttack(weapon);
    if (hasDisadvantage) {
      const alt = rollAttack(weapon);
      if (alt.nat < result.nat) result = alt;
    }
    const { hit, nat, damage } = result;
    const hitResult = nat === 20 ? 'crit' : nat === 1 ? 'fumble' : hit >= 10 ? 'hit' : 'miss';
    setLastRoll({
      weaponName: weapon.name,
      hit, nat, damage,
      damageType: weapon.damageType,
      crit: nat === 20,
      miss: nat === 1,
    });
    triggerRoll({ result: nat, dieType: 20, modifier: weapon.attackBonus, total: hit, label: weapon.name + ' Attack' });
    // Auto-log the attack
    if (characterId) {
      await logAction({
        campaignId, characterId, characterName: characterName ?? '',
        actionType: 'attack',
        actionName: weapon.name,
        targetName: target || undefined,
        diceExpression: `1d20+${weapon.attackBonus} / ${weapon.damageDice}${weapon.damageBonus !== 0 ? (weapon.damageBonus > 0 ? '+' : '') + weapon.damageBonus : ''}`,
        individualResults: [nat],
        total: damage,
        hitResult,
        notes: `To hit: ${hit}`,
      });
    }
  }

  function modStr(n: number) { return (n >= 0 ? '+' : '') + n; }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>

      {/* Target input */}
      <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
        <label style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t-2)', flexShrink: 0, background: 'none', WebkitTextFillColor: 'var(--t-2)' }}>
          Target
        </label>
        <input
          value={target}
          onChange={e => setTarget(e.target.value)}
          placeholder='Who are you attacking? (e.g. "Goblin 2")'
          style={{ fontSize: 'var(--fs-sm)', flex: 1 }}
        />
      </div>

      {/* Last roll result */}
      {lastRoll && (
        <div className="animate-fade-in" style={{
          padding: 'var(--sp-3) var(--sp-4)',
          borderRadius: 'var(--r-md)',
          border: `1px solid ${lastRoll.crit ? 'var(--c-gold)' : lastRoll.miss ? 'rgba(107,20,20,1)' : 'var(--c-border)'}`,
          background: lastRoll.crit ? 'rgba(201,146,42,0.08)' : lastRoll.miss ? 'rgba(127,29,29,0.12)' : '#080d14',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--sp-3)',
        }}>
          <div>
            <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--t-1)', marginBottom: 2 }}>
              {lastRoll.crit ? '⭐ Critical Hit! ' : lastRoll.miss ? '💀 Fumble! ' : ''}{lastRoll.weaponName}
            </div>
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
              d20={lastRoll.nat} — To hit: {modStr(lastRoll.hit - lastRoll.nat)} = <strong style={{ color: lastRoll.crit ? 'var(--c-gold-l)' : 'var(--t-1)' }}>{lastRoll.hit}</strong>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'var(--ff-brand)', fontWeight: 900, fontSize: 'var(--fs-2xl)', lineHeight: 1, color: lastRoll.crit ? 'var(--c-gold-l)' : 'var(--t-1)' }}>
              {lastRoll.damage}
            </div>
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
              {lastRoll.damageType} damage
            </div>
          </div>
        </div>
      )}

      {/* Weapon list */}
      {weapons.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 'var(--sp-8)', color: 'var(--t-2)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)' }}>
          No weapons added yet. Add your weapons to roll attacks directly from your sheet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
          {weapons.map(w => (
            <div key={w.id} style={{
              display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
              padding: 'var(--sp-3) var(--sp-4)',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--c-border)',
              background: '#080d14',
            }}>
              {/* Roll button */}
              <button
                className="btn-gold btn-sm"
                onClick={() => handleRoll(w)}
                title={`Roll attack with ${w.name}`}
                style={{ flexShrink: 0, minWidth: 52, justifyContent: 'center' }}
              >
                Roll
              </button>

              {/* Weapon info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--t-1)', marginBottom: 2 }}>
                  {w.name}
                </div>
                <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
                  {w.range} · {w.damageType}
                  {w.properties && ` · ${w.properties}`}
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: 'flex', gap: 'var(--sp-3)', flexShrink: 0, alignItems: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-md)', color: 'var(--c-gold-l)' }}>
                    {modStr(w.attackBonus)}
                  </div>
                  <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-2)', letterSpacing: '0.06em' }}>TO HIT</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-md)', color: 'var(--c-red-l)' }}>
                    {w.damageDice === 'flat' ? modStr(w.damageBonus) : `${w.damageDice}${w.damageBonus !== 0 ? modStr(w.damageBonus) : ''}`}
                  </div>
                  <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-2)', letterSpacing: '0.06em' }}>DMG</div>
                </div>
              </div>

              {/* Edit/delete */}
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button className="btn-ghost btn-sm" onClick={() => openEdit(w)} style={{ padding: '4px 8px', fontSize: 12 }}>✏️</button>
                <button className="btn-ghost btn-sm" onClick={() => removeWeapon(w.id)} style={{ padding: '4px 8px', fontSize: 12 }}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button className="btn-secondary" onClick={openAdd} style={{ alignSelf: 'flex-start' }}>
        + Add Weapon / Attack
      </button>

      {/* Add/Edit form */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 'var(--sp-4)' }}>{editId ? 'Edit Weapon' : 'Add Weapon'}</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
              <div>
                <label>Name *</label>
                <input value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Longsword, Shortbow, Dagger..." autoFocus />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' }}>
                <div>
                  <label>Attack Bonus</label>
                  <input type="number" value={form.attackBonus ?? 0} onChange={e => setForm(f => ({ ...f, attackBonus: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label>Damage Dice</label>
                  <select value={form.damageDice ?? '1d8'} onChange={e => setForm(f => ({ ...f, damageDice: e.target.value }))}>
                    {DICE_OPTIONS.map(d => <option key={d} value={d}>{d === 'flat' ? 'Flat (no dice)' : d}</option>)}
                  </select>
                </div>
                <div>
                  <label>Damage Bonus</label>
                  <input type="number" value={form.damageBonus ?? 0} onChange={e => setForm(f => ({ ...f, damageBonus: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label>Damage Type</label>
                  <select value={form.damageType ?? 'slashing'} onChange={e => setForm(f => ({ ...f, damageType: e.target.value }))}>
                    {DAMAGE_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label>Range</label>
                <input value={form.range ?? 'Melee'} onChange={e => setForm(f => ({ ...f, range: e.target.value }))} placeholder="Melee or Ranged (80/320 ft.)" />
              </div>

              <div>
                <label>Properties (optional)</label>
                <input value={form.properties ?? ''} onChange={e => setForm(f => ({ ...f, properties: e.target.value }))} placeholder="Versatile, Finesse, Light..." />
              </div>

              <div>
                <label>Notes (optional)</label>
                <input value={form.notes ?? ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="+1 magic weapon, silvered..." />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 'var(--sp-3)', marginTop: 'var(--sp-5)', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn-gold" onClick={saveWeapon} disabled={!form.name?.trim()}>
                {editId ? 'Save Changes' : 'Add Weapon'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
