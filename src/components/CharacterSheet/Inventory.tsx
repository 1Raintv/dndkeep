import { useState, useRef, useEffect } from 'react';
import { useDiceRoll } from '../../context/DiceRollContext';
import { rollDie } from '../../lib/gameUtils';
import { calcArmorAC, acBreakdown } from '../../data/equipment';
import type { Character, InventoryItem } from '../../types';
import { v4 as uuidv4 } from 'uuid';

interface InventoryProps {
  character: Character;
  onUpdateInventory: (items: InventoryItem[]) => void;
  onUpdateCurrency: (currency: Character['currency']) => void;
  onUpdateAC?: (ac: number) => void;
}

import { CATALOGUE, ALL_CATEGORIES, type CatalogueItem, type ItemCategory } from '../../data/equipment';

// ── Item Picker Modal ──────────────────────────────────────────────
function ItemPickerModal({ onAdd, onClose }: {
  onAdd: (item: CatalogueItem, qty: number) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<ItemCategory | 'All'>('All');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { searchRef.current?.focus(); }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const filtered = CATALOGUE.filter(item => {
    const matchesSearch = search.trim() === '' ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      (item.notes ?? '').toLowerCase().includes(search.toLowerCase());
    const matchesCat = category === 'All' || item.category === category;
    return matchesSearch && matchesCat;
  });

  function addItem(item: CatalogueItem) {
    onAdd(item, 1);
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--c-card)', border: '1px solid var(--c-gold-bdr)',
          borderRadius: 14, width: '100%', maxWidth: 640, maxHeight: '80vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: 'var(--shadow-lg)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--c-gold-l)', marginBottom: 8 }}>
              Add Item
            </div>
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search equipment..."
              style={{ width: '100%', fontSize: 14, padding: '7px 10px', borderRadius: 7 }}
            />
          </div>
          <button onClick={onClose} style={{ fontSize: 18, background: 'none', border: 'none', color: 'var(--t-2)', cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}>✕</button>
        </div>

        {/* Category filters */}
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--c-border)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['All', ...ALL_CATEGORIES] as const).map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              style={{
                fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 99, cursor: 'pointer',
                border: category === cat ? '1px solid var(--c-gold-bdr)' : '1px solid var(--c-border)',
                background: category === cat ? 'var(--c-gold-bg)' : 'var(--c-raised)',
                color: category === cat ? 'var(--c-gold-l)' : 'var(--t-2)',
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Results count */}
        <div style={{ padding: '6px 16px', fontSize: 11, color: 'var(--t-3)' }}>
          {filtered.length} item{filtered.length !== 1 ? 's' : ''}
        </div>

        {/* Item list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--t-3)', fontSize: 13 }}>
              No items match "{search}"
            </div>
          ) : (
            filtered.map(item => (
              <div
                key={item.name}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 8, marginBottom: 2,
                  background: 'var(--c-raised)',
                  transition: 'background 0.1s',
                }}
              >
                {/* Category badge */}
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 99, flexShrink: 0,
                  background: item.category === 'Weapon' ? 'rgba(239,68,68,0.15)' :
                               item.category === 'Armor' ? 'rgba(59,130,246,0.15)' :
                               item.category === 'Magic Item' ? 'rgba(167,139,250,0.15)' :
                               'rgba(107,114,128,0.15)',
                  color: item.category === 'Weapon' ? '#f87171' :
                         item.category === 'Armor' ? '#60a5fa' :
                         item.category === 'Magic Item' ? '#a78bfa' :
                         'var(--t-3)',
                }}>
                  {item.category === 'Adventuring Gear' ? 'Gear' :
                   item.category === 'Mount & Vehicle' ? 'Mount' :
                   item.category === 'Trade Good' ? 'Trade' :
                   item.category}
                </span>

                {/* Name + notes */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-1)' }}>{item.name}</div>
                  {item.notes && (
                    <div style={{ fontSize: 11, color: 'var(--t-3)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.notes}
                    </div>
                  )}
                </div>

                {/* Cost + weight */}
                <div style={{ textAlign: 'right', flexShrink: 0, fontSize: 11, color: 'var(--t-3)' }}>
                  {item.cost && <div>{item.cost}</div>}
                  {item.weight > 0 && <div>{item.weight} lb</div>}
                </div>

                {/* Add button */}
                <button
                  onClick={() => addItem(item)}
                  style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 7, cursor: 'pointer',
                    border: '1px solid var(--c-gold-bdr)', background: 'var(--c-gold-bg)', color: 'var(--c-gold-l)', flexShrink: 0 }}
                >
                  Add
                </button>
              </div>
            ))
          )}
        </div>

        {/* Custom item row at bottom */}
        <CustomItemRow onAdd={(name, w, q) => {
          onAdd({ name, category: 'Adventuring Gear', weight: w }, q);
          onClose();
        }} />
      </div>
    </div>
  );
}

function CustomItemRow({ onAdd }: { onAdd: (name: string, weight: number, qty: number) => void }) {
  const [name, setName] = useState('');
  const [weight, setWeight] = useState('0');
  const [qty, setQty] = useState('1');

  function submit() {
    if (!name.trim()) return;
    onAdd(name.trim(), parseFloat(weight) || 0, Math.max(1, parseInt(qty) || 1));
    setName(''); setWeight('0'); setQty('1');
  }

  return (
    <div style={{ padding: '10px 16px', borderTop: '1px solid var(--c-border)', display: 'flex', gap: 8, alignItems: 'center' }}>
      <span style={{ fontSize: 11, color: 'var(--t-3)', flexShrink: 0 }}>Custom:</span>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Item name" style={{ flex: 1, fontSize: 12 }}
        onKeyDown={e => e.key === 'Enter' && submit()} />
      <input value={qty} onChange={e => setQty(e.target.value)} type="number" min={1} style={{ width: 44, fontSize: 12 }} placeholder="Qty" />
      <input value={weight} onChange={e => setWeight(e.target.value)} type="number" min={0} step={0.1} style={{ width: 52, fontSize: 12 }} placeholder="lb" />
      <button onClick={submit} className="btn-gold btn-sm" disabled={!name.trim()}>Add</button>
    </div>
  );
}

// ── Currency Display ───────────────────────────────────────────────
function CurrencyDisplay({ currency, onUpdate }: {
  currency: Character['currency'];
  onUpdate: (currency: Character['currency']) => void;
}) {
  const [editing, setEditing] = useState<keyof Character['currency'] | null>(null);
  const [draft, setDraft] = useState('');

  const coins: { key: keyof Character['currency']; label: string; color: string }[] = [
    { key: 'pp', label: 'PP', color: '#e0e0e0' },
    { key: 'gp', label: 'GP', color: 'var(--c-gold-l)' },
    { key: 'ep', label: 'EP', color: '#60a5fa' },
    { key: 'sp', label: 'SP', color: '#9ca3af' },
    { key: 'cp', label: 'CP', color: '#b45309' },
  ];

  function open(key: keyof Character['currency']) {
    setDraft(String(currency[key]));
    setEditing(key);
  }

  function commit() {
    if (!editing) return;
    const v = Math.max(0, parseInt(draft, 10) || 0);
    onUpdate({ ...currency, [editing]: v });
    setEditing(null);
  }

  return (
    <div style={{
      display: 'flex', gap: 'var(--sp-3)', padding: 'var(--sp-3)',
      background: '#080d14', borderRadius: 'var(--r-md)',
      marginBottom: 'var(--sp-4)',
    }}>
      {coins.map(({ key, label, color }) => (
        <div key={key} style={{ textAlign: 'center', flex: 1, cursor: 'pointer' }}
          onClick={() => editing !== key && open(key)} title={`Click to edit ${label}`}>
          {editing === key ? (
            <input type="number" value={draft} min={0} autoFocus
              onChange={e => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(null); }}
              onClick={e => e.stopPropagation()}
              style={{ width: '100%', textAlign: 'center', fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-md)', color, background: 'var(--c-raised)', border: '1px solid var(--c-gold-bdr)', borderRadius: 'var(--r-sm)', padding: '1px 2px' }} />
          ) : (
            <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-md)', color }}>{currency[key]}</div>
          )}
          <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', letterSpacing: '0.08em' }}>{label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Main Inventory Component ───────────────────────────────────────
export default function Inventory({ character, onUpdateInventory, onUpdateCurrency, onUpdateAC }: InventoryProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState('');

  const { triggerRoll } = useDiceRoll();
  const inventory = character.inventory;
  const totalWeight = inventory.reduce((sum, item) => sum + item.weight * item.quantity, 0);

  function toggleEquipped(id: string) {
    // toggleEquipped moved to toggleEquippedWithAC for armor AC sync
    toggleEquippedWithAC(id);
  }

  function removeItem(id: string) {
    onUpdateInventory(inventory.filter(item => item.id !== id));
  }

  function updateItem(id: string, updates: Partial<InventoryItem>) {
    onUpdateInventory(inventory.map(item => item.id === id ? { ...item, ...updates } : item));
  }

  function addFromCatalogue(catalogueItem: CatalogueItem, qty: number) {
    const item: InventoryItem = {
      id: uuidv4(),
      name: catalogueItem.name,
      quantity: qty,
      weight: catalogueItem.weight,
      description: catalogueItem.notes ?? '',
      equipped: false,
      magical: catalogueItem.category === 'Magic Item' || catalogueItem.category === 'Wondrous Item' || catalogueItem.category === 'Scroll' || catalogueItem.category === 'Potion',
      category: catalogueItem.category,
      armorType: catalogueItem.armorType,
      baseAC: catalogueItem.baseAC,
      addDexMod: catalogueItem.addDexMod,
      maxDexBonus: catalogueItem.maxDexBonus,
      rollExpression: catalogueItem.rollExpression,
      rollLabel: catalogueItem.rollLabel,
      cost: catalogueItem.cost,
    };
    onUpdateInventory([...inventory, item]);
  }

  function toggleEquippedWithAC(id: string) {
    const item = inventory.find(i => i.id === id);
    if (!item) return;
    const newEquipped = !item.equipped;
    const updated = inventory.map(i => i.id === id ? { ...i, equipped: newEquipped } : i);
    onUpdateInventory(updated);

    // If this is armor that affects AC, recalculate
    if (item.armorType && item.baseAC !== undefined && onUpdateAC) {
      const dexMod = Math.floor((character.dexterity - 10) / 2);
      if (newEquipped) {
        // Unequip other armor of same type first (can't wear two chest pieces)
        const newAC = calcArmorAC(item as any, dexMod);
        onUpdateAC(newAC);
      } else {
        // Revert to unarmored or next equipped armor
        const remaining = updated.filter(i => i.equipped && i.armorType && i.baseAC !== undefined && i.id !== id);
        if (remaining.length > 0) {
          const best = remaining.reduce((a, b) => {
            const aAC = calcArmorAC(a as any, dexMod);
            const bAC = calcArmorAC(b as any, dexMod);
            return bAC > aAC ? b : a;
          });
          onUpdateAC(calcArmorAC(best as any, dexMod));
        } else {
          onUpdateAC(10 + dexMod); // unarmored
        }
      }
    }
  }

  function rollItemExpression(item: InventoryItem) {
    if (!item.rollExpression) return;
    const expr = item.rollExpression;
    // Parse expressions like "2d4+2", "8d6", "1d8+3", "2d8+4d6"
    let total = 0;
    const dice: {die: number; value: number}[] = [];
    const parts = expr.replace(/\s/g,'').split(/(?=[+-])/);
    for (const part of parts) {
      const diceMatch = part.match(/([+-]?\d*)d(\d+)/);
      const flatMatch = part.match(/^([+-]?\d+)$/);
      if (diceMatch) {
        const count = parseInt(diceMatch[1] || '1');
        const sides = parseInt(diceMatch[2]);
        for (let i = 0; i < Math.abs(count); i++) {
          const v = rollDie(sides);
          dice.push({ die: sides, value: v });
          total += count < 0 ? -v : v;
        }
      } else if (flatMatch) {
        total += parseInt(flatMatch[1]);
      }
    }
    triggerRoll({
      result: dice[0]?.value ?? total,
      dieType: dice[0]?.die ?? 20,
      total: total,
      label: `${item.name}${item.rollLabel ? ' — ' + item.rollLabel : ''}`,
    });
  }

  // Get the equipped armor item for AC tooltip
  const equippedArmor = inventory.find(i => i.equipped && i.armorType && i.baseAC !== undefined);
  const dexMod = Math.floor((character.dexterity - 10) / 2);
  const acTooltip = acBreakdown(equippedArmor as any ?? null, dexMod);

  const filtered = search.trim()
    ? inventory.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    : inventory;

  const equipped = filtered.filter(i => i.equipped);
  const carried = filtered.filter(i => !i.equipped);

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="section-header" style={{ marginBottom: 0, borderBottom: 'none', flex: 1 }}>
          Inventory
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-2)', marginBottom: 'var(--sp-2)', alignItems: 'center' }}>
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)', fontFamily: 'var(--ff-body)' }}>
            {totalWeight.toFixed(totalWeight % 1 === 0 ? 0 : 1)} lb
          </span>
          <button className="btn-gold btn-sm" onClick={() => setShowPicker(true)}>
            + Add Item
          </button>
        </div>
      </div>
      <div style={{ borderBottom: '1px solid var(--c-gold-bdr)', marginBottom: 'var(--sp-4)' }} />

      <CurrencyDisplay currency={character.currency} onUpdate={onUpdateCurrency} />

      {/* Search bar — only show when there are items */}
      {inventory.length > 4 && (
        <div style={{ marginBottom: 12 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter inventory..."
            style={{ width: '100%', fontSize: 13 }}
          />
        </div>
      )}

      {inventory.length === 0 ? (
        <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', fontStyle: 'italic', fontFamily: 'var(--ff-body)' }}>
          No items carried
        </p>
      ) : filtered.length === 0 ? (
        <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', fontStyle: 'italic', fontFamily: 'var(--ff-body)' }}>
          No items match "{search}"
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
          {equipped.length > 0 && (
            <div style={{ marginBottom: 'var(--sp-2)' }}>
              <div style={{ fontSize: 'var(--fs-xs)', fontFamily: 'var(--ff-body)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--c-gold-l)', marginBottom: 'var(--sp-1)' }}>
                Equipped
              </div>
              {equipped.map(item => (
                <InventoryRow key={item.id} item={item} onToggle={toggleEquippedWithAC} onRemove={removeItem} onUpdate={updateItem} onRoll={rollItemExpression} />
              ))}
            </div>
          )}
          {carried.length > 0 && (
            <div>
              {equipped.length > 0 && (
                <div style={{ fontSize: 'var(--fs-xs)', fontFamily: 'var(--ff-body)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t-2)', marginBottom: 'var(--sp-1)' }}>
                  Carried
                </div>
              )}
              {carried.map(item => (
                <InventoryRow key={item.id} item={item} onToggle={toggleEquippedWithAC} onRemove={removeItem} onUpdate={updateItem} onRoll={rollItemExpression} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Item picker modal */}
      {showPicker && (
        <ItemPickerModal
          onAdd={(item, qty) => { addFromCatalogue(item, qty); }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </section>
  );
}

// ── Item Detail Modal ─────────────────────────────────────────────
function ItemDetailModal({ item, onClose, onToggle, onRemove, onUpdate, onRoll }: {
  item: InventoryItem;
  onClose: () => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<InventoryItem>) => void;
  onRoll: (item: InventoryItem) => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(item.name);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(item.description || '');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div style={{ background: 'var(--c-card)', border: '1px solid var(--c-gold-bdr)', borderRadius: 14,
        width: '100%', maxWidth: 440, boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--c-border)',
          background: item.equipped ? 'rgba(201,146,42,0.08)' : 'var(--c-surface)',
          display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            {editingName ? (
              <input value={nameDraft} onChange={e => setNameDraft(e.target.value)} autoFocus
                onBlur={() => { onUpdate(item.id, { name: nameDraft.trim() || item.name }); setEditingName(false); }}
                onKeyDown={e => { if (e.key === 'Enter') { onUpdate(item.id, { name: nameDraft.trim() || item.name }); setEditingName(false); } if (e.key === 'Escape') setEditingName(false); }}
                style={{ fontSize: 16, fontWeight: 700, width: '100%' }} />
            ) : (
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t-1)', cursor: 'text' }}
                onClick={() => setEditingName(true)} title="Click to rename">{item.name}</div>
            )}
            {item.magical && <span style={{ fontSize: 10, color: '#a78bfa', fontWeight: 700, marginTop: 2, display: 'block' }}>✦ MAGIC ITEM</span>}
          </div>
          <button onClick={onClose} style={{ fontSize: 18, background: 'none', border: 'none', color: 'var(--t-2)', cursor: 'pointer', padding: '0 4px', lineHeight: 1, flexShrink: 0 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Stats row */}
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--t-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Qty</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button onClick={() => onUpdate(item.id, { quantity: Math.max(1, item.quantity - 1) })}
                  style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--c-border)', background: 'var(--c-raised)', color: 'var(--t-1)', cursor: 'pointer', fontSize: 14 }}>−</button>
                <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--c-gold-l)', minWidth: 28, textAlign: 'center' }}>{item.quantity}</span>
                <button onClick={() => onUpdate(item.id, { quantity: item.quantity + 1 })}
                  style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--c-border)', background: 'var(--c-raised)', color: 'var(--t-1)', cursor: 'pointer', fontSize: 14 }}>+</button>
              </div>
            </div>
            {item.weight > 0 && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--t-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Weight</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--t-2)' }}>{(item.weight * item.quantity).toFixed(1)} lb</div>
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--t-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Notes</div>
            {editingDesc ? (
              <textarea value={descDraft} onChange={e => setDescDraft(e.target.value)} autoFocus rows={3}
                onBlur={() => { onUpdate(item.id, { description: descDraft }); setEditingDesc(false); }}
                style={{ width: '100%', fontSize: 13, resize: 'vertical', fontFamily: 'var(--ff-body)' }} />
            ) : (
              <div onClick={() => setEditingDesc(true)} title="Click to edit notes"
                style={{ fontSize: 13, color: item.description ? 'var(--t-2)' : 'var(--t-3)', cursor: 'text',
                  fontStyle: item.description ? 'normal' : 'italic', lineHeight: 1.5,
                  padding: '6px 8px', borderRadius: 6, border: '1px solid var(--c-border)', background: 'var(--c-raised)', minHeight: 36 }}>
                {item.description || 'Click to add notes...'}
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, paddingTop: 4, flexWrap: 'wrap' }}>
            {item.rollExpression && (
              <button onClick={() => { onRoll(item); }}
                style={{ flex: 2, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                  border: '1px solid rgba(96,165,250,0.4)', background: 'rgba(96,165,250,0.1)', color: '#60a5fa' }}>
                🎲 Roll {item.rollExpression}{item.rollLabel ? ` (${item.rollLabel})` : ''}
              </button>
            )}
            <button onClick={() => { onToggle(item.id); onClose(); }}
              style={{ flex: 1, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                border: item.equipped ? '1px solid var(--c-border-m)' : '1px solid var(--c-gold-bdr)',
                background: item.equipped ? 'var(--c-raised)' : 'var(--c-gold-bg)',
                color: item.equipped ? 'var(--t-2)' : 'var(--c-gold-l)' }}>
              {item.armorType ? (item.equipped ? '🛡 Unequip' : '🛡 Equip Armor') : (item.equipped ? 'Unequip' : '⚔ Equip')}
            </button>
            <button onClick={() => { onRemove(item.id); onClose(); }}
              style={{ padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                border: '1px solid rgba(220,38,38,0.3)', background: 'rgba(220,38,38,0.08)', color: 'var(--c-red-l)' }}>
              Remove
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Inventory Row ──────────────────────────────────────────────────
function InventoryRow({ item, onToggle, onRemove, onUpdate, onRoll }: {
  item: InventoryItem;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<InventoryItem>) => void;
  onRoll: (item: InventoryItem) => void;
}) {
  const [showDetail, setShowDetail] = useState(false);

  return (
    <>
      <div
        onClick={() => setShowDetail(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 'var(--sp-2)',
          padding: '8px 12px', borderRadius: 'var(--r-sm)', cursor: 'pointer',
          background: item.equipped ? 'rgba(201,146,42,0.06)' : 'var(--c-raised)',
          border: item.equipped ? '1px solid rgba(201,146,42,0.25)' : '1px solid var(--c-border)',
          marginBottom: 4, transition: 'background 0.1s',
        }}
      >
        {/* Equipped dot */}
        <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: item.equipped ? 'var(--c-gold-l)' : 'var(--c-border-m)' }} />

        {/* Name */}
        <span style={{ flex: 1, fontFamily: 'var(--ff-body)', fontSize: 13,
          fontWeight: item.equipped ? 600 : 400,
          color: item.equipped ? 'var(--t-1)' : 'var(--t-2)' }}>
          {item.name}
          {item.magical && <span style={{ fontSize: 9, color: '#a78bfa', marginLeft: 5 }}>✦</span>}
        </span>

        {/* Qty */}
        {item.quantity > 1 && (
          <span style={{ fontSize: 11, color: 'var(--c-gold-l)', fontWeight: 700, flexShrink: 0 }}>×{item.quantity}</span>
        )}

        {/* Weight */}
        {item.weight > 0 && (
          <span style={{ fontSize: 11, color: 'var(--t-3)', flexShrink: 0 }}>
            {(item.weight * item.quantity).toFixed(item.weight % 1 === 0 ? 0 : 1)} lb
          </span>
        )}

        {item.rollExpression && (
          <span
            onClick={e => { e.stopPropagation(); onRoll(item); }}
            title={`Roll ${item.rollExpression}`}
            style={{ fontSize: 10, fontWeight: 700, color: '#60a5fa', background: 'rgba(96,165,250,0.1)',
              border: '1px solid rgba(96,165,250,0.3)', borderRadius: 99, padding: '1px 7px',
              cursor: 'pointer', flexShrink: 0 }}>
            🎲
          </span>
        )}
        {item.armorType && item.equipped && (
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--c-gold-l)', background: 'var(--c-gold-bg)',
            border: '1px solid var(--c-gold-bdr)', borderRadius: 99, padding: '1px 6px', flexShrink: 0 }}>
            AC +{item.baseAC}
          </span>
        )}
        <span style={{ fontSize: 11, color: 'var(--t-3)', flexShrink: 0 }}>›</span>
      </div>

      {showDetail && (
        <ItemDetailModal
          item={item}
          onClose={() => setShowDetail(false)}
          onToggle={onToggle}
          onRemove={onRemove}
          onUpdate={onUpdate}
          onRoll={onRoll}
        />
      )}
    </>
  );
}
