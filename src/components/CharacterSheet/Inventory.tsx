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
            filtered.map(item => {
              const chips = item.notes ? item.notes.split(/[·,]/).map((s: string) => s.trim()).filter(Boolean) : [];
              const catColor = item.category === 'Weapon' ? '#f87171' : item.category === 'Armor' ? '#60a5fa' : item.category === 'Magic Item' || item.category === 'Wondrous Item' ? '#a78bfa' : item.category === 'Potion' ? '#4ade80' : item.category === 'Scroll' ? '#c084fc' : 'var(--t-3)';
              const catBg = item.category === 'Weapon' ? 'rgba(239,68,68,0.1)' : item.category === 'Armor' ? 'rgba(59,130,246,0.1)' : item.category === 'Magic Item' || item.category === 'Wondrous Item' ? 'rgba(167,139,250,0.1)' : item.category === 'Potion' ? 'rgba(74,222,128,0.08)' : item.category === 'Scroll' ? 'rgba(192,132,252,0.08)' : 'rgba(107,114,128,0.1)';
              const catLabel = item.category === 'Adventuring Gear' ? 'Gear' : item.category === 'Mount & Vehicle' ? 'Mount' : item.category === 'Trade Good' ? 'Trade' : item.category === 'Wondrous Item' ? 'Wondrous' : item.category;
              return (
                <div
                  key={item.name}
                  style={{ padding: '8px 10px', borderRadius: 8, marginBottom: 3, background: 'var(--c-raised)', border: '1px solid var(--c-border)', transition: 'border-color 0.1s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--c-border-m)'}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--c-border)'}
                >
                  {/* Row 1: name + add button */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: chips.length > 0 || item.armorType ? 4 : 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-1)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.name}
                      {(item.category === 'Magic Item' || item.category === 'Wondrous Item') && <span style={{ fontSize: 9, color: '#a78bfa', marginLeft: 5 }}>✦</span>}
                    </div>
                    {item.rollExpression && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: '#60a5fa', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: 99, padding: '1px 6px', flexShrink: 0 }}>
                        🎲 {item.rollExpression}
                      </span>
                    )}
                    {item.weight > 0 && <span style={{ fontSize: 10, color: 'var(--t-3)', flexShrink: 0 }}>{item.weight} lb</span>}
                    {item.cost && <span style={{ fontSize: 10, color: 'var(--t-3)', flexShrink: 0 }}>{item.cost}</span>}
                    <button
                      onClick={() => addItem(item)}
                      style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 7, cursor: 'pointer', border: '1px solid var(--c-gold-bdr)', background: 'var(--c-gold-bg)', color: 'var(--c-gold-l)', flexShrink: 0 }}
                    >Add</button>
                  </div>
                  {/* Row 2: tag strip */}
                  {(chips.length > 0 || item.armorType) && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4, color: catColor, background: catBg, border: `1px solid ${catColor}33`, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{catLabel}</span>
                      {item.armorType && item.baseAC && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4, color: '#60a5fa', background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)' }}>
                          {item.armorType === 'shield' ? `+${item.baseAC} AC` : item.addDexMod ? `AC ${item.baseAC}${item.maxDexBonus !== undefined ? ` +DEX(≤${item.maxDexBonus})` : ' +DEX'}` : `AC ${item.baseAC}`}
                        </span>
                      )}
                      {chips.slice(0, 4).map((chip: string, i: number) => (
                        <span key={i} style={{ fontSize: 9, fontWeight: 500, padding: '1px 6px', borderRadius: 4, color: 'var(--t-3)', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--c-border)' }}>{chip}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
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
      damage: (catalogueItem as any).damage,
      range: (catalogueItem as any).range,
      properties: (catalogueItem as any).properties,
      castingTime: (catalogueItem as any).castingTime,
      saveOrHit: (catalogueItem as any).saveOrHit,
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
        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* ── Stat Table (D&D Beyond style) ── */}
          {(item.damage || item.range || item.saveOrHit || item.baseAC !== undefined || item.castingTime) && (
            <div style={{ border: '1px solid var(--c-border)', borderRadius: 8, overflow: 'hidden' }}>
              {/* Table header */}
              <div style={{ display: 'grid', gridTemplateColumns: item.saveOrHit ? '2fr 1fr 1fr 1fr' : '2fr 1fr 1fr', background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid var(--c-border)' }}>
                {['Name', item.saveOrHit ? 'Hit / DC' : item.range ? 'Range' : 'AC', item.damage ? 'Damage / Effect' : 'AC', ...(item.saveOrHit ? ['Range'] : [])].map((h, i) => (
                  <div key={i} style={{ padding: '6px 10px', fontSize: 10, fontWeight: 700, color: 'var(--t-3)', textTransform: 'uppercase', letterSpacing: '0.08em', borderRight: i < (item.saveOrHit ? 3 : 2) ? '1px solid var(--c-border)' : undefined }}>
                    {h}
                  </div>
                ))}
              </div>
              {/* Table row */}
              <div style={{ display: 'grid', gridTemplateColumns: item.saveOrHit ? '2fr 1fr 1fr 1fr' : '2fr 1fr 1fr' }}>
                <div style={{ padding: '8px 10px', borderRight: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-1)' }}>{item.name}</span>
                  {item.quantity > 1 && <span style={{ fontSize: 11, color: 'var(--c-gold-l)', fontWeight: 700 }}>×{item.quantity}</span>}
                </div>
                <div style={{ padding: '8px 10px', borderRight: '1px solid var(--c-border)', fontSize: 13, color: '#60a5fa', fontWeight: 600 }}>
                  {item.saveOrHit ? item.saveOrHit : item.range ? item.range : item.baseAC !== undefined ? (item.armorType === 'shield' ? `+${item.baseAC}` : String(item.baseAC)) : '—'}
                </div>
                <div style={{ padding: '8px 10px', borderRight: item.saveOrHit ? '1px solid var(--c-border)' : undefined, fontSize: 13, color: 'var(--c-gold-l)', fontWeight: 700 }}>
                  {item.damage ?? (item.baseAC !== undefined ? `AC ${item.baseAC}` : '—')}
                  {item.rollExpression && (
                    <button onClick={() => onRoll(item)} title={`Roll ${item.rollExpression}`}
                      style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 99, cursor: 'pointer',
                        border: '1px solid rgba(96,165,250,0.4)', background: 'rgba(96,165,250,0.1)', color: '#60a5fa' }}>
                      🎲
                    </button>
                  )}
                </div>
                {item.saveOrHit && (
                  <div style={{ padding: '8px 10px', fontSize: 13, color: 'var(--t-2)' }}>{item.range ?? '—'}</div>
                )}
              </div>
            </div>
          )}

          {/* ── Properties / casting time ── */}
          {(item.properties || item.castingTime || item.cost || item.weight > 0) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {item.castingTime && (
                <span style={{ fontSize: 11, color: 'var(--t-2)', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--c-border)', borderRadius: 6, padding: '3px 8px' }}>
                  ⏱ {item.castingTime}
                </span>
              )}
              {item.properties && (
                <span style={{ fontSize: 11, color: 'var(--t-2)', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--c-border)', borderRadius: 6, padding: '3px 8px' }}>
                  {item.properties}
                </span>
              )}
              {item.cost && (
                <span style={{ fontSize: 11, color: 'var(--c-gold-l)', background: 'rgba(201,146,42,0.08)', border: '1px solid rgba(201,146,42,0.2)', borderRadius: 6, padding: '3px 8px' }}>
                  {item.cost}
                </span>
              )}
              {item.weight > 0 && (
                <span style={{ fontSize: 11, color: 'var(--t-3)', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--c-border)', borderRadius: 6, padding: '3px 8px' }}>
                  {(item.weight * item.quantity).toFixed(item.weight % 1 === 0 ? 0 : 1)} lb
                </span>
              )}
            </div>
          )}

          {/* ── Description / Notes ── */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--t-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Description</div>
            {editingDesc ? (
              <textarea value={descDraft} onChange={e => setDescDraft(e.target.value)} autoFocus rows={3}
                onBlur={() => { onUpdate(item.id, { description: descDraft }); setEditingDesc(false); }}
                style={{ width: '100%', fontSize: 13, resize: 'vertical', fontFamily: 'var(--ff-body)' }} />
            ) : (
              <div onClick={() => setEditingDesc(true)} title="Click to edit"
                style={{ fontSize: 13, color: item.description ? 'var(--t-2)' : 'var(--t-3)', cursor: 'text',
                  fontStyle: item.description ? 'normal' : 'italic', lineHeight: 1.6,
                  padding: '7px 10px', borderRadius: 6, border: '1px solid var(--c-border)', background: 'var(--c-raised)', minHeight: 36 }}>
                {item.description || 'Click to add notes...'}
              </div>
            )}
          </div>

          {/* ── Qty stepper ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--t-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: 4 }}>Qty</span>
            <button onClick={() => onUpdate(item.id, { quantity: Math.max(1, item.quantity - 1) })}
              style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--c-border)', background: 'var(--c-raised)', color: 'var(--t-1)', cursor: 'pointer', fontSize: 16 }}>−</button>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--c-gold-l)', minWidth: 28, textAlign: 'center' }}>{item.quantity}</span>
            <button onClick={() => onUpdate(item.id, { quantity: item.quantity + 1 })}
              style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--c-border)', background: 'var(--c-raised)', color: 'var(--t-1)', cursor: 'pointer', fontSize: 16 }}>+</button>
          </div>

          {/* ── Actions ── */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {item.rollExpression && (
              <button onClick={() => onRoll(item)}
                style={{ flex: 2, minWidth: 140, padding: '9px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                  border: '1px solid rgba(96,165,250,0.4)', background: 'rgba(96,165,250,0.1)', color: '#60a5fa' }}>
                🎲 {item.rollExpression}{item.rollLabel ? ` ${item.rollLabel}` : ''}
              </button>
            )}
            <button onClick={() => { onToggle(item.id); onClose(); }}
              style={{ flex: 1, padding: '9px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                border: item.equipped ? '1px solid var(--c-border-m)' : '1px solid var(--c-gold-bdr)',
                background: item.equipped ? 'var(--c-raised)' : 'var(--c-gold-bg)',
                color: item.equipped ? 'var(--t-2)' : 'var(--c-gold-l)' }}>
              {item.armorType ? (item.equipped ? '🛡 Unequip' : '🛡 Equip') : (item.equipped ? 'Unequip' : '⚔ Equip')}
            </button>
            <button onClick={() => { onRemove(item.id); onClose(); }}
              style={{ padding: '9px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                border: '1px solid rgba(220,38,38,0.3)', background: 'rgba(220,38,38,0.08)', color: 'var(--c-red-l)' }}>
              Remove
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────
function itemTypeBadge(item: InventoryItem): string {
  if (item.armorType === 'shield') return 'Shield';
  if (item.armorType === 'light')  return 'Light Armor';
  if (item.armorType === 'medium') return 'Medium Armor';
  if (item.armorType === 'heavy')  return 'Heavy Armor';
  if (item.category === 'Potion')  return 'Potion';
  if (item.category === 'Scroll')  return 'Scroll';
  if (item.category === 'Wondrous Item') return 'Wondrous';
  if (item.category === 'Weapon')  return 'Weapon';
  if (item.category === 'Magic Item') return 'Magic';
  if (item.category === 'Adventuring Gear') return 'Gear';
  if (item.category === 'Tools')   return 'Tool';
  return item.category ?? '';
}

function itemACText(item: InventoryItem): string | null {
  if (!item.baseAC) return null;
  if (item.armorType === 'shield') return `+${item.baseAC} AC`;
  if (item.addDexMod) {
    const cap = item.maxDexBonus !== undefined ? ` (max +${item.maxDexBonus} DEX)` : ' + DEX';
    return `AC ${item.baseAC}${cap}`;
  }
  return `AC ${item.baseAC}`;
}

// Parse the notes field to extract chips: damage dice, range, properties, etc.
function parseNoteChips(notes: string): string[] {
  if (!notes) return [];
  // Split on · or comma
  return notes.split(/[·,]/).map(s => s.trim()).filter(Boolean);
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
  const typeBadge = itemTypeBadge(item);
  const acText = itemACText(item);
  const noteChips = parseNoteChips(item.description);
  const isArmor = !!item.armorType;
  const isEquippable = isArmor || item.category === 'Weapon' || item.magical;

  return (
    <>
      <div
        onClick={() => setShowDetail(true)}
        style={{
          padding: '9px 12px',
          borderRadius: 'var(--r-sm)',
          cursor: 'pointer',
          background: item.equipped ? 'rgba(201,146,42,0.06)' : 'var(--c-raised)',
          border: item.equipped ? '1px solid rgba(201,146,42,0.25)' : '1px solid var(--c-border)',
          marginBottom: 3,
          transition: 'border-color 0.1s, background 0.1s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = item.equipped ? 'rgba(201,146,42,0.5)' : 'var(--c-border-m)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = item.equipped ? 'rgba(201,146,42,0.25)' : 'var(--c-border)'; }}
      >
        {/* ── Row 1: name + right-side actions ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: noteChips.length > 0 || acText || item.rollExpression ? 4 : 0 }}>
          {/* Equipped indicator */}
          <div style={{
            width: 7, height: 7, borderRadius: '50%', flexShrink: 0, marginTop: 1,
            background: item.equipped ? 'var(--c-gold-l)' : 'var(--c-border-m)',
            boxShadow: item.equipped ? '0 0 4px var(--c-gold-l)' : 'none',
          }} />

          {/* Name */}
          <span style={{
            flex: 1, fontFamily: 'var(--ff-body)', fontSize: 13, fontWeight: 600,
            color: item.equipped ? 'var(--t-1)' : 'var(--t-2)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {item.name}
            {item.magical && <span style={{ fontSize: 9, color: '#a78bfa', marginLeft: 6, fontWeight: 700 }}>✦</span>}
          </span>

          {/* Qty */}
          {item.quantity > 1 && (
            <span style={{ fontSize: 11, color: 'var(--c-gold-l)', fontWeight: 700, flexShrink: 0 }}>×{item.quantity}</span>
          )}

          {/* Roll button */}
          {item.rollExpression && (
            <span
              onClick={e => { e.stopPropagation(); onRoll(item); }}
              title={`Roll ${item.rollExpression}${item.rollLabel ? ' — ' + item.rollLabel : ''}`}
              style={{
                fontSize: 10, fontWeight: 700, color: '#60a5fa',
                background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.3)',
                borderRadius: 99, padding: '2px 8px', cursor: 'pointer', flexShrink: 0,
                display: 'flex', alignItems: 'center', gap: 3,
              }}>
              🎲 {item.rollExpression}
            </span>
          )}

          {/* Weight */}
          {item.weight > 0 && (
            <span style={{ fontSize: 10, color: 'var(--t-3)', flexShrink: 0 }}>
              {(item.weight * item.quantity).toFixed(item.weight % 1 === 0 ? 0 : 1)} lb
            </span>
          )}

          <span style={{ fontSize: 11, color: 'var(--t-3)', flexShrink: 0 }}>›</span>
        </div>

        {/* ── Row 2: tag strip ── */}
        {(typeBadge || acText || noteChips.length > 0 || item.cost) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, paddingLeft: 13 }}>
            {/* Category badge */}
            {typeBadge && (
              <span style={{
                fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                padding: '1px 6px', borderRadius: 4,
                color: isArmor ? 'var(--c-gold-l)' : item.category === 'Potion' ? '#4ade80' : item.category === 'Scroll' ? '#c084fc' : item.magical ? '#a78bfa' : 'var(--t-3)',
                background: isArmor ? 'var(--c-gold-bg)' : item.category === 'Potion' ? 'rgba(74,222,128,0.08)' : item.category === 'Scroll' ? 'rgba(192,132,252,0.08)' : item.magical ? 'rgba(167,139,250,0.08)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${isArmor ? 'var(--c-gold-bdr)' : item.category === 'Potion' ? 'rgba(74,222,128,0.25)' : item.category === 'Scroll' ? 'rgba(192,132,252,0.25)' : item.magical ? 'rgba(167,139,250,0.25)' : 'var(--c-border)'}`,
              }}>
                {typeBadge}
              </span>
            )}

            {/* AC text for armor */}
            {acText && (
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                color: '#60a5fa', background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.25)',
              }}>
                {acText}
              </span>
            )}

            {/* Equip status */}
            {isEquippable && item.equipped && (
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                color: 'var(--c-gold-l)', background: 'var(--c-gold-bg)', border: '1px solid var(--c-gold-bdr)',
              }}>
                Equipped
              </span>
            )}

            {/* Note chips — damage dice, properties, range, etc. */}
            {noteChips.slice(0, 4).map((chip, i) => (
              <span key={i} style={{
                fontSize: 9, fontWeight: 500, padding: '1px 6px', borderRadius: 4,
                color: 'var(--t-3)', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--c-border)',
              }}>
                {chip}
              </span>
            ))}

            {/* Cost */}
            {item.cost && (
              <span style={{
                fontSize: 9, fontWeight: 500, padding: '1px 6px', borderRadius: 4,
                color: 'var(--t-3)', marginLeft: 'auto',
              }}>
                {item.cost}
              </span>
            )}
          </div>
        )}
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
