import { useState, useRef, useEffect, useMemo } from 'react';
import { useDiceRoll } from '../../context/DiceRollContext';
import { rollDie } from '../../lib/gameUtils';
import { calcArmorAC, acBreakdown } from '../../data/equipment';
import type { Character, InventoryItem } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import {
  currencyToCp, cpToCurrency, currencyToGp, currencyWeightLbs, formatCurrency,
  canAfford, parseCurrencyString, subtractCurrency,
} from '../../lib/currency';
import { currentWeightLbs, encumbranceStatus } from '../../lib/encumbrance';
import {
  itemRequiresAttunement, countAttunedItems, hasAttunementSlotAvailable,
  ATTUNEMENT_SLOT_MAX,
} from '../../lib/attunement';
import { recomputeAC, describeACBreakdown } from '../../lib/armorClass';
import { drinkPotion, isPotionByType } from '../../lib/potions';
import { useMagicItems } from '../../lib/hooks/useMagicItems';
import { emitCombatEvent } from '../../lib/combatEvents';

interface InventoryProps {
 character: Character;
 onUpdateInventory: (items: InventoryItem[]) => void;
 onUpdateCurrency: (currency: Character['currency']) => void;
 onUpdateAC?: (ac: number) => void;
 // v2.158.0 — Phase P pt 6: potion drink flow applies healing to
 // character.current_hp. Optional to preserve the existing call
 // sites that mount Inventory without this capability (the add-
 // at-mount-site change in CharacterSheet provides it).
 onUpdateHP?: (hp: number) => void;
}

import { CATALOGUE, ALL_CATEGORIES, type CatalogueItem, type ItemCategory } from '../../data/equipment';

// ── Item Picker Modal ──────────────────────────────────────────────
function ItemPickerModal({ onAdd, onBuy, currency, onClose }: {
 onAdd: (item: CatalogueItem, qty: number) => void;
 // v2.137.0 — Phase L pt 5: merchant flow. When `onBuy` is provided the
 // modal surfaces a per-row Buy button (in addition to Add) that deducts
 // the item's cost from the character's pouch. Passing `currency` lets
 // the modal grey out Buy buttons the character can't afford.
 onBuy?: (item: CatalogueItem, qty: number) => void;
 currency?: Character['currency'];
 onClose: () => void;
}) {
 const [search, setSearch] = useState('');
 const [category, setCategory] = useState<ItemCategory | 'All'>('All');
 // v2.33.4: Track the name of the most-recently-added item so we can flash its row green
 const [recentlyAdded, setRecentlyAdded] = useState<string | null>(null);
 const searchRef = useRef<HTMLInputElement>(null);
 const flashTimerRef = useRef<number | null>(null);

 useEffect(() => { searchRef.current?.focus(); }, []);

 // Clear any pending flash timer on unmount
 useEffect(() => {
 return () => {
 if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
 };
 }, []);

 // Close on Escape
 useEffect(() => {
 const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
 window.addEventListener('keydown', handler);
 return () => window.removeEventListener('keydown', handler);
 }, [onClose]);

 // v2.33.4: memoize filtered to prevent row list re-allocation on unrelated parent re-renders
 const filtered = useMemo(() => CATALOGUE.filter(item => {
 const matchesSearch = search.trim() === '' ||
 item.name.toLowerCase().includes(search.toLowerCase()) ||
 (item.notes ?? '').toLowerCase().includes(search.toLowerCase());
 const matchesCat = category === 'All' || item.category === category;
 return matchesSearch && matchesCat;
 }), [search, category]);

 function addItem(item: CatalogueItem) {
 onAdd(item, 1);
 // Flash green on this row for ~700ms so user has clear add-feedback without losing modal
 setRecentlyAdded(item.name);
 if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
 flashTimerRef.current = window.setTimeout(() => {
 setRecentlyAdded(curr => curr === item.name ? null : curr);
 flashTimerRef.current = null;
 }, 700);
 }

 // v2.137.0 — Phase L pt 5: Buy calls the parent's onBuy which does the
 // combined inventory-append + currency-deduct transaction. Reuses the
 // same green flash as Add for consistent feedback.
 function buyItem(item: CatalogueItem) {
 if (!onBuy) return;
 onBuy(item, 1);
 setRecentlyAdded(item.name);
 if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
 flashTimerRef.current = window.setTimeout(() => {
 setRecentlyAdded(curr => curr === item.name ? null : curr);
 flashTimerRef.current = null;
 }, 700);
 }

 // v2.137.0 — Phase L pt 5: can the character afford this item? Used to
 // grey out the Buy button when funds are insufficient. Returns:
 //   'no_cost'   — catalogue item has no cost string (can't buy)
 //   'unparseable' — cost exists but doesn't match "X gp" format (can't buy)
 //   'affordable' — cost parsed and pouch >= cost
 //   'unaffordable' — cost parsed but pouch < cost
 function affordabilityFor(item: CatalogueItem): 'no_cost' | 'unparseable' | 'affordable' | 'unaffordable' {
 if (!item.cost) return 'no_cost';
 const parsed = parseCurrencyString(item.cost);
 if (!parsed) return 'unparseable';
 if (!currency) return 'unaffordable';  // no pouch = can't pay
 return canAfford(currency, parsed) ? 'affordable' : 'unaffordable';
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
 <div style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--c-gold-l)', marginBottom: 8, display: 'flex', alignItems: 'baseline', gap: 10 }}>
 <span>Add Item</span>
 {/* v2.137.0 — Phase L pt 5: pouch total in the header when merchant
     flow is wired. Gives the player context for Buy affordability checks. */}
 {onBuy && currency && (
 <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--t-3)', letterSpacing: 0, textTransform: 'none' }}>
 Pouch: <span style={{ color: 'var(--c-gold-l)' }}>{formatCurrency(currency)}</span>
 </span>
 )}
 </div>
 <input
 ref={searchRef}
 value={search}
 onChange={e => setSearch(e.target.value)}
 placeholder="Search equipment..."
 style={{ width: '100%', fontSize: 14, padding: '7px 10px', borderRadius: 7 }}
 />
 </div>
 <button onClick={onClose} title="Close" style={{ fontSize: 18, background: 'none', border: 'none', color: 'var(--t-2)', cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}>×</button>
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
 // v2.33.4: flash this row green when it was just added
 const isFlashing = recentlyAdded === item.name;
 return (
 <div
 key={item.name}
 className="item-picker-row"
 style={{
 padding: '8px 10px', borderRadius: 8, marginBottom: 3,
 background: isFlashing ? 'rgba(74,222,128,0.18)' : 'var(--c-raised)',
 border: `1px solid ${isFlashing ? 'rgba(74,222,128,0.6)' : 'var(--c-border)'}`,
 transition: 'background 0.2s, border-color 0.2s',
 }}
 >
 {/* Row 1: name + add button */}
 <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: chips.length > 0 || item.armorType ? 4 : 0 }}>
 <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-1)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
 {item.name}
 {(item.category === 'Magic Item' || item.category === 'Wondrous Item') && <span style={{ fontSize: 9, color: '#a78bfa', marginLeft: 5 }}></span>}
 </div>
 {item.rollExpression && (
 <span style={{ fontSize: 9, fontWeight: 700, color: '#60a5fa', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: 99, padding: '1px 6px', flexShrink: 0 }}>
 {item.rollExpression}
 </span>
 )}
 {item.weight > 0 && <span style={{ fontSize: 10, color: 'var(--t-3)', flexShrink: 0 }}>{item.weight} lb</span>}
 {item.cost && <span style={{ fontSize: 10, color: 'var(--t-3)', flexShrink: 0 }}>{item.cost}</span>}
 <button
 onClick={() => addItem(item)}
 style={{
 fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 7, cursor: 'pointer',
 border: `1px solid ${isFlashing ? 'rgba(74,222,128,0.6)' : 'var(--c-gold-bdr)'}`,
 background: isFlashing ? 'rgba(74,222,128,0.2)' : 'var(--c-gold-bg)',
 color: isFlashing ? '#4ade80' : 'var(--c-gold-l)',
 flexShrink: 0,
 transition: 'background 0.2s, color 0.2s, border-color 0.2s',
 minWidth: 68,
 }}
 >{isFlashing ? 'Added ✓' : '+ Add'}</button>
 {/* v2.137.0 — Phase L pt 5: Buy button. Only renders when merchant
     flow is wired (onBuy provided) AND the item has a parseable cost.
     Greyed/disabled when pouch can't cover the cost. Hovering tells the
     player what they're paying and what they have. */}
 {onBuy && (() => {
   const afford = affordabilityFor(item);
   if (afford === 'no_cost' || afford === 'unparseable') return null;
   const canPay = afford === 'affordable';
   return (
     <button
       onClick={() => canPay && buyItem(item)}
       disabled={!canPay}
       title={canPay
         ? `Deduct ${item.cost} from your pouch`
         : `Can't afford (${item.cost}). Currently: ${currency ? formatCurrency(currency) : '0 cp'}.`}
       style={{
         fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 7,
         cursor: canPay ? 'pointer' : 'not-allowed',
         border: `1px solid ${canPay ? 'rgba(74,222,128,0.4)' : 'var(--c-border)'}`,
         background: canPay ? 'rgba(74,222,128,0.08)' : 'transparent',
         color: canPay ? '#4ade80' : 'var(--t-3)',
         flexShrink: 0, opacity: canPay ? 1 : 0.5,
         transition: 'all 0.2s',
         minWidth: 56,
       }}
     >Buy</button>
   );
 })()}
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

 const coins: { key: keyof Character['currency']; label: string; color: string; icon: string; title: string }[] = [
 { key: 'pp', label: 'PP', color: '#e2e8f0', icon: '', title: 'Platinum Pieces (1 PP = 10 GP)' },
 { key: 'gp', label: 'GP', color: 'var(--c-gold-l)', icon: '', title: 'Gold Pieces' },
 { key: 'ep', label: 'EP', color: '#60a5fa', icon: '', title: 'Electrum Pieces (1 EP = 5 SP) — optional in 2024' },
 { key: 'sp', label: 'SP', color: '#9ca3af', icon: '', title: 'Silver Pieces (1 SP = 10 CP)' },
 { key: 'cp', label: 'CP', color: '#b45309', icon: '', title: 'Copper Pieces' },
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

 // v2.134.0 — Phase L pt 2: re-mix coins into the best-fit distribution
 // using the v2.133 library. Preserves EP only if the player already had
 // EP (respects the 2024 optional-EP default — players without EP get a
 // clean PP/GP/SP/CP breakdown; legacy characters keep their EP).
 function handleOptimize() {
 const totalCp = currencyToCp(currency);
 const useEp = (currency.ep ?? 0) > 0;
 onUpdate(cpToCurrency(totalCp, useEp));
 }

 // v2.134.0 — computed summaries for the footer row
 const totalGp = currencyToGp(currency);
 const coinWeight = currencyWeightLbs(currency);
 const isEmpty = currencyToCp(currency) === 0;

 return (
 <div style={{
 padding: 'var(--sp-3)',
 background: '#080d14', borderRadius: 'var(--r-md)',
 marginBottom: 'var(--sp-4)',
 display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)',
 }}>
 <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
 {coins.map(({ key, label, color, icon, title }) => (
 <div key={key} style={{ textAlign: 'center', flex: 1, cursor: 'pointer' }}
 onClick={() => editing !== key && open(key)} title={title}>
 <div style={{ fontSize: 14, marginBottom: 2 }}>{icon}</div>
 {editing === key ? (
 <input type="number" value={draft} min={0} autoFocus
 onChange={e => setDraft(e.target.value)}
 onBlur={commit}
 onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(null); }}
 onClick={e => e.stopPropagation()}
 style={{ width: '100%', textAlign: 'center', fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-md)', color, background: 'var(--c-raised)', border: '1px solid var(--c-gold-bdr)', borderRadius: 'var(--r-sm)', padding: '1px 2px' }} />
 ) : (
 <div style={{ fontFamily: 'var(--ff-stat)', fontWeight: 800, fontSize: 15, color, lineHeight: 1 }}>{currency[key]}</div>
 )}
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-3)', letterSpacing: '0.1em', fontWeight: 700, textTransform: 'uppercase' as const, marginTop: 2 }}>{label}</div>
 </div>
 ))}
 </div>
 {/* v2.134.0 — Phase L pt 2: footer with total value, coin weight, and
     an Optimize button that collapses small coins into larger denominations
     (e.g. 12 sp → 1 gp 2 sp). Hidden when the pouch is empty. */}
 {!isEmpty && (
 <div style={{
 display: 'flex', alignItems: 'center', justifyContent: 'space-between',
 paddingTop: 'var(--sp-2)',
 borderTop: '1px solid rgba(255,255,255,0.05)',
 fontSize: 10, color: 'var(--t-3)', fontFamily: 'var(--ff-body)',
 }}>
 <span title={formatCurrency(currency)}>
 <strong style={{ color: 'var(--c-gold-l)', fontFamily: 'var(--ff-stat)', fontWeight: 800 }}>
 {totalGp.toFixed(totalGp % 1 === 0 ? 0 : 2)} gp
 </strong>
 <span style={{ marginLeft: 8, opacity: 0.7 }}>
 · {coinWeight.toFixed(coinWeight < 1 ? 2 : 1)} lb
 </span>
 </span>
 <button
 onClick={handleOptimize}
 title="Re-mix coins into the best-fit distribution (e.g. 25 sp → 2 gp 5 sp)"
 style={{
 fontSize: 10, fontWeight: 700, padding: '2px 8px', minHeight: 0,
 background: 'transparent', color: 'var(--t-2)',
 border: '1px solid var(--c-border)', borderRadius: 4,
 cursor: 'pointer',
 }}
 >
 ⇅ Optimize
 </button>
 </div>
 )}
 </div>
 );
}

// ── Main Inventory Component ───────────────────────────────────────
export default function Inventory({ character, onUpdateInventory, onUpdateCurrency, onUpdateAC, onUpdateHP }: InventoryProps) {
 const [showPicker, setShowPicker] = useState(false);
 const [search, setSearch] = useState('');

 const { triggerRoll } = useDiceRoll();
 // v2.158.0 — Phase P pt 6: need the catalogue map so each row can
 // tell if it's a potion via magic_item_id lookup without another
 // per-row hook call. Using itemMap (id → MagicItem) keeps it sync.
 const { itemMap: magicItemMap } = useMagicItems();
 const inventory = character.inventory;
 // v2.134.0 — Phase L pt 2: delegate to encumbrance library so coin weight
 // is included and tier thresholds come from one source of truth.
 const totalWeight = currentWeightLbs(character);

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

 // v2.137.0 — Phase L pt 5: merchant purchase. Runs add + deduct in
 // sequence. Both onUpdateInventory and onUpdateCurrency route through
 // applyUpdate → debouncedFlush (see CharacterSheet/index.tsx), so both
 // writes batch into the same DB round-trip. If the deduct fails
 // (insufficient funds — shouldn't happen since Buy is gated by
 // affordabilityFor, but guard anyway), we abort without adding the item.
 function buyFromCatalogue(catalogueItem: CatalogueItem, qty: number) {
 if (!catalogueItem.cost) return;
 const parsedCost = parseCurrencyString(catalogueItem.cost);
 if (!parsedCost) return;
 const newPouch = subtractCurrency(character.currency, parsedCost);
 if (!newPouch) return;   // can't afford — defensive; button should be disabled
 // Deduct first so that if anything downstream fails the item doesn't
 // land in the inventory without payment.
 onUpdateCurrency(newPouch);
 addFromCatalogue(catalogueItem, qty);
 }

 function toggleEquippedWithAC(id: string) {
 const item = inventory.find(i => i.id === id);
 if (!item) return;
 const newEquipped = !item.equipped;
 const updated = inventory.map(i => i.id === id ? { ...i, equipped: newEquipped } : i);
 onUpdateInventory(updated);

 // v2.156.0 — Phase P pt 4: AC recompute now covers the full stack.
 // Before v2.156 this branch only fired for armorType items and
 // computed AC from a single piece of armor + Dex. Now we fire for
 // ANY equip/unequip and let recomputeAC sum armor + shield + all
 // +AC magic items that pass the attunement gate. This is the
 // write-on-equip model: the persisted character.armor_class is
 // always an up-to-date equipment-only snapshot.
 if (onUpdateAC) {
 const newAC = recomputeAC(character, updated);
 onUpdateAC(newAC);
 }

 // v2.193.0 — Phase Q.0 pt 34: emit combat_event so the unified
 // History tab shows equipment toggles. Fire-and-forget — never
 // block the UI on the log write.
 emitCombatEvent({
 campaignId: character.campaign_id ?? null,
 actorType: 'player',
 actorId: character.id,
 actorName: character.name,
 eventType: newEquipped ? 'item_equipped' : 'item_unequipped',
 payload: {
 item_name: item.name,
 item_id: item.id,
 magic_item_id: item.magic_item_id ?? null,
 },
 }).catch(() => {});
 }

 // v2.155.0 — Phase P pt 3: attunement toggle with RAW 3-slot cap.
 // Only items that require attunement (per catalogue lookup) can
 // be toggled. Attempting to attune when already at cap is blocked
 // UI-side (button disabled); this function is defensive and also
 // refuses at the logic layer so programmatic callers can't exceed
 // the cap either.
 //
 // v2.156.0 — Phase P pt 4: also fires recomputeAC so a Ring of
 // Protection (+1 AC) immediately updates the character's AC the
 // moment attunement toggles. Without this, the +1 would only
 // appear after the user manually re-equipped the item. The gate
 // means AC recomputes even when the attuned item has no acBonus
 // (cheap no-op) rather than threading the check through this
 // function.
 function toggleAttunement(id: string) {
 const item = inventory.find(i => i.id === id);
 if (!item) return;
 if (!itemRequiresAttunement(item)) return; // non-attuning items — no-op
 const turningOn = !item.attuned;
 if (turningOn && !hasAttunementSlotAvailable(inventory)) return;
 const updated = inventory.map(i =>
 i.id === id ? { ...i, attuned: turningOn } : i
 );
 onUpdateInventory(updated);
 if (onUpdateAC) {
 const newAC = recomputeAC(character, updated);
 onUpdateAC(newAC);
 }

 // v2.193.0 — Phase Q.0 pt 34: emit attunement event. Uses
 // 'item_used' as the event type (attunement is a meaningful
 // "use" of a magic item — establishes the bond) with payload
 // disambiguating it from charge spends or activations.
 emitCombatEvent({
 campaignId: character.campaign_id ?? null,
 actorType: 'player',
 actorId: character.id,
 actorName: character.name,
 eventType: 'item_used',
 payload: {
 sub_type: 'attunement',
 attuned: turningOn,
 item_name: item.name,
 item_id: item.id,
 magic_item_id: item.magic_item_id ?? null,
 },
 }).catch(() => {});
 }

 // v2.196.0 — Phase Q.0 pt 37: charge-spent emitter callback.
 // Lives in this scope (not InventoryRow) because `character` is
 // here. InventoryRow calls this from its inline charge-button onClick.
 function handleChargeSpent(item: InventoryItem, chargesBefore: number) {
 emitCombatEvent({
 campaignId: character.campaign_id ?? null,
 actorType: 'player',
 actorId: character.id,
 actorName: character.name,
 eventType: 'item_used',
 payload: {
 sub_type: 'charge_spent',
 item_name: item.name,
 item_id: item.id,
 magic_item_id: item.magic_item_id ?? null,
 charges_before: chargesBefore,
 charges_after: chargesBefore - 1,
 charges_max: item.charges_max ?? 0,
 },
 }).catch(() => {});
 }

 // v2.158.0 — Phase P pt 6: drink potion flow.
 //   • Healing potions: roll dice, apply to character.current_hp
 //     (capped at max_hp), emit log line.
 //   • Non-healing potions: decrement quantity + emit a descriptive
 //     log line. Actual buff effect tracking isn't handled here —
 //     buffs live on combat_participants, not on character, so a
 //     Potion of Speed drunk out of combat has no durable home. DM
 //     + player track duration manually. Known buff mappings live
 //     in lib/potions.ts POTION_TO_BUFF_NAME for future wiring.
 //   • Either way: quantity -= 1, and if the count hits 0 the item
 //     is removed from the inventory entirely.
 function handleDrinkPotion(id: string) {
 const item = inventory.find(i => i.id === id);
 if (!item) return;
 if ((item.quantity ?? 1) <= 0) return;
 const result = drinkPotion(item, character);

 // Apply heal if any
 if (result.healApplied > 0 && onUpdateHP) {
 onUpdateHP(Math.min(character.max_hp, character.current_hp + result.healApplied));
 }

 // Decrement quantity / remove from inventory
 let updated: InventoryItem[];
 if (result.removeFromInventory) {
 updated = inventory.filter(i => i.id !== id);
 } else {
 updated = inventory.map(i =>
 i.id === id ? { ...i, quantity: (i.quantity ?? 1) - 1 } : i
 );
 }
 onUpdateInventory(updated);

 // Surface the outcome. Event log integration (combat_events) can
 // plug in later — for now console is the audit trail.
 // eslint-disable-next-line no-console
 console.log('[potion]', result.message);
 }

 function rollItemExpression(item: InventoryItem) {
 if (!item.rollExpression) return;
 const expr = item.rollExpression;
 let total = 0;
 let flatBonus = 0;
 const allDice: {die: number; value: number}[] = [];
 const parts = expr.replace(/\s/g,'').split(/(?=[+-])/);
 for (const part of parts) {
 const diceMatch = part.match(/([+-]?\d*)d(\d+)/);
 const flatMatch = part.match(/^([+-]?\d+)$/);
 if (diceMatch) {
 const count = parseInt(diceMatch[1] || '1');
 const sides = parseInt(diceMatch[2]);
 for (let i = 0; i < Math.abs(count); i++) {
 const v = rollDie(sides);
 allDice.push({ die: sides, value: v });
 total += count < 0 ? -v : v;
 }
 } else if (flatMatch) {
 const n = parseInt(flatMatch[1]);
 total += n;
 flatBonus += n;
 }
 }
 triggerRoll({
 result: allDice[0]?.value ?? total,
 dieType: allDice[0]?.die ?? 6,
 total,
 label: `${item.name}${item.rollLabel ? ' — ' + item.rollLabel : ''}`,
 allDice,
 expression: expr,
 flatBonus: flatBonus !== 0 ? flatBonus : undefined,
 });
 }

 // v2.156.0 — Phase P pt 4: acTooltip now built from describeACBreakdown
 // so if/when a future caller wires this into a visible tooltip, it
 // shows the full stack (armor + Dex + shield + magic items) instead
 // of the narrower armor-only legacy helper. Today this variable is
 // not rendered anywhere — kept for readiness, not a behavioral change.
 // eslint-disable-next-line @typescript-eslint/no-unused-vars
 const acTooltip = describeACBreakdown(character, inventory);

 const filtered = search.trim()
 ? inventory.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
 : inventory;

 const equipped = filtered.filter(i => i.equipped);
 const carried = filtered.filter(i => !i.equipped);

 return (
 <section>
 {/* v2.172.0 — Phase Q.0 pt 13: coin purse moved to the very top of
     the Inventory tab per playtest feedback. Previously it sat
     below the Inventory header, so users scanning top-down saw
     "Inventory" → weight chip → + Add Item BEFORE their money.
     New order: money first, then Inventory (with its Add Item
     control). Matches how users intuitively think — "what have
     I got?" starts with gold. */}
 <div className="section-header" style={{ marginBottom: 'var(--sp-2)' }}>
 Coin Purse
 </div>
 <CurrencyDisplay currency={character.currency} onUpdate={onUpdateCurrency} />

 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--sp-5)' }}>
 <div className="section-header" style={{ marginBottom: 0, borderBottom: 'none', flex: 1 }}>
 Inventory
 </div>
 <div style={{ display: 'flex', gap: 'var(--sp-2)', marginBottom: 'var(--sp-2)', alignItems: 'center' }}>
 {(() => {
 // v2.134.0 — Phase L pt 2: delegate to encumbrance library. Uses the
 // 3-tier variant rule (unencumbered / encumbered / heavy / over_max)
 // because that's what this component was already displaying. Base 2024
 // rule can be opted into via a future campaign flag.
 const enc = encumbranceStatus(character, 'variant');
 const isEncumbered = enc.status === 'encumbered' || enc.status === 'heavy' || enc.status === 'over_max';
 const isHeavy = enc.status === 'heavy' || enc.status === 'over_max';
 const encColor = isHeavy ? '#ef4444' : isEncumbered ? '#fbbf24' : 'var(--t-2)';
 const encLabel = enc.status === 'over_max'
   ? ' (Over Max)'
   : isHeavy
     ? ' (Heavy)'
     : isEncumbered
       ? ' (Encumbered)'
       : '';
 return (
 <span title={`Carry capacity: ${enc.capacityLbs} lb max (STR ${character.strength} × 15). Thresholds: ${enc.tiers.encumbered} / ${enc.tiers.heavy} / ${enc.tiers.max} lb.`}
 style={{ fontSize: 'var(--fs-xs)', color: encColor, fontFamily: 'var(--ff-body)', fontWeight: isEncumbered ? 700 : 400 }}>
 {totalWeight.toFixed(totalWeight % 1 === 0 ? 0 : 1)} / {enc.capacityLbs} lb{encLabel}
 </span>
 );
 })()}
 <button className="btn-gold btn-sm" onClick={() => setShowPicker(true)}>
 + Add Item
 </button>
 </div>
 </div>
 <div style={{ borderBottom: '1px solid var(--c-gold-bdr)', marginBottom: 'var(--sp-4)' }} />

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
 <InventoryRow
   key={item.id}
   item={item}
   onToggle={toggleEquippedWithAC}
   onRemove={removeItem}
   onUpdate={updateItem}
   onRoll={rollItemExpression}
   isPotion={!!item.magic_item_id && isPotionByType(magicItemMap[item.magic_item_id]?.type)}
   onDrink={handleDrinkPotion}
   onChargeSpent={handleChargeSpent}
 />
 ))}
 </div>
 )}
 {/* v2.155.0 — Phase P pt 3: real attunement.
     Replaced the pre-v2.155 display that treated any equipped
     magical item as attuned. Now we show only items that require
     attunement per catalogue, a real toggle, and hard enforcement
     of the RAW 2024 3-slot cap. */}
 {(() => {
 const attunable = filtered.filter(itemRequiresAttunement);
 if (attunable.length === 0) return null;
 const attunedCount = countAttunedItems(inventory);
 const atCap = attunedCount >= ATTUNEMENT_SLOT_MAX;
 return (
 <div style={{ marginBottom: 'var(--sp-2)', padding: '8px 12px', borderRadius: 'var(--r-md)', background: 'rgba(167,139,250,0.04)', border: '1px solid rgba(167,139,250,0.2)' }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
 <div style={{ fontSize: 'var(--fs-xs)', fontFamily: 'var(--ff-body)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#a78bfa' }}>
 Attunement
 </div>
 <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--ff-stat)', color: atCap ? '#ef4444' : '#a78bfa', background: atCap ? 'rgba(239,68,68,0.12)' : 'rgba(167,139,250,0.12)', border: `1px solid ${atCap ? 'rgba(239,68,68,0.4)' : 'rgba(167,139,250,0.4)'}`, borderRadius: 999, padding: '1px 7px' }}>
 {attunedCount}/{ATTUNEMENT_SLOT_MAX}
 </span>
 </div>
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
 {attunable.map(item => {
 const isAttuned = item.attuned === true;
 const canAttune = isAttuned || !atCap;
 return (
 <button
 key={item.id}
 onClick={() => toggleAttunement(item.id)}
 disabled={!canAttune}
 title={isAttuned ? 'Click to break attunement' : atCap ? 'Attunement cap reached — break another attunement first' : 'Click to attune'}
 style={{
 fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
 cursor: canAttune ? 'pointer' : 'not-allowed',
 background: isAttuned ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.03)',
 border: `1px solid ${isAttuned ? 'rgba(167,139,250,0.5)' : 'var(--c-border)'}`,
 color: isAttuned ? '#c084fc' : 'var(--t-3)',
 opacity: canAttune ? 1 : 0.5,
 fontFamily: 'inherit',
 }}
 >
 {isAttuned ? '✦ ' : ''}{item.name}
 </button>
 );
 })}
 </div>
 {atCap && (
 <div style={{ fontSize: 10, color: '#ef4444', marginTop: 5, fontFamily: 'var(--ff-body)' }}>
 Maximum attunement reached — break an attunement before attuning another
 </div>
 )}
 </div>
 );
 })()}
 {carried.length > 0 && (
 <div>
 {equipped.length > 0 && (
 <div style={{ fontSize: 'var(--fs-xs)', fontFamily: 'var(--ff-body)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t-2)', marginBottom: 'var(--sp-1)' }}>
 Carried
 </div>
 )}
 {carried.map(item => (
 <InventoryRow
   key={item.id}
   item={item}
   onToggle={toggleEquippedWithAC}
   onRemove={removeItem}
   onUpdate={updateItem}
   onRoll={rollItemExpression}
   isPotion={!!item.magic_item_id && isPotionByType(magicItemMap[item.magic_item_id]?.type)}
   onDrink={handleDrinkPotion}
   onChargeSpent={handleChargeSpent}
 />
 ))}
 </div>
 )}
 </div>
 )}

 {/* Item picker modal */}
 {showPicker && (
 <ItemPickerModal
 onAdd={(item, qty) => { addFromCatalogue(item, qty); }}
 onBuy={(item, qty) => { buyFromCatalogue(item, qty); }}
 currency={character.currency}
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
 {item.magical && <span style={{ fontSize: 10, color: '#a78bfa', fontWeight: 700, marginTop: 2, display: 'block' }}> MAGIC ITEM</span>}
 </div>
 <button onClick={onClose} title="Close" style={{ fontSize: 18, background: 'none', border: 'none', color: 'var(--t-2)', cursor: 'pointer', padding: '0 4px', lineHeight: 1, flexShrink: 0 }}>×</button>
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
 {item.rollExpression}{item.rollLabel ? ` ${item.rollLabel}` : ''}
 </button>
 )}
 {/* v2.82.0: Potions don't get Equip or "Use as Attack" buttons — they're
     consumables used via the Potions row in the Actions tab. Showing Equip
     for a health potion made no sense (you can't wear a potion), and "Use
     as Attack" implied you could throw it at enemies to deal damage, which
     isn't how healing potions work. */}
 {item.category !== 'Potion' && (
 <button onClick={() => { onToggle(item.id); onClose(); }}
 style={{ flex: 1, padding: '9px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700,
 border: item.equipped ? '1px solid var(--c-border-m)' : '1px solid var(--c-gold-bdr)',
 background: item.equipped ? 'var(--c-raised)' : 'var(--c-gold-bg)',
 color: item.equipped ? 'var(--t-2)' : 'var(--c-gold-l)' }}>
 {item.armorType ? (item.equipped ? ' Unequip' : ' Equip') : (item.equipped ? 'Unequip' : ' Equip')}
 </button>
 )}
 {/* v2.179.0 — Phase Q.0 pt 20: removed the "Use as Attack" / "In
     Actions" toggle button. The Actions tab now auto-detects
     weapon-class items and promotes them to attacks whenever the
     item is equipped (and, for attunement-required magic items,
     attuned). A separate button was redundant UX — equipping a
     sword has only one reasonable meaning: you're wielding it to
     attack. The is_weapon flag stays in the schema as a legacy
     override for edge cases (e.g., a Staff of the Magi you want
     to treat as a weapon even though the catalogue doesn't mark
     it as one). */}
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
 if (item.armorType === 'light') return 'Light Armor';
 if (item.armorType === 'medium') return 'Medium Armor';
 if (item.armorType === 'heavy') return 'Heavy Armor';
 if (item.category === 'Potion') return 'Potion';
 if (item.category === 'Scroll') return 'Scroll';
 if (item.category === 'Wondrous Item') return 'Wondrous';
 if (item.category === 'Weapon') return 'Weapon';
 if (item.category === 'Magic Item') return 'Magic';
 if (item.category === 'Adventuring Gear') return 'Gear';
 if (item.category === 'Tools') return 'Tool';
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
function InventoryRow({ item, onToggle, onRemove, onUpdate, onRoll, isPotion, onDrink, onChargeSpent }: {
 item: InventoryItem;
 onToggle: (id: string) => void;
 onRemove: (id: string) => void;
 onUpdate: (id: string, updates: Partial<InventoryItem>) => void;
 onRoll: (item: InventoryItem) => void;
 // v2.158.0 — Phase P pt 6: optional so legacy call sites don't
 // break. When isPotion is true and onDrink is provided, a Drink
 // button renders on the row.
 isPotion?: boolean;
 onDrink?: (id: string) => void;
 // v2.196.0 — Phase Q.0 pt 37: callback fired after a charge is
 // spent. Implemented in the parent (Inventory) where `character`
 // is in scope so we can emit the combat_event correctly. Optional
 // for safety — InventoryRow used to do the emit inline (v2.193)
 // but `character` wasn't in this row's scope, breaking the build.
 onChargeSpent?: (item: InventoryItem, chargesBefore: number) => void;
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
 {item.magical && <span style={{ fontSize: 9, color: '#a78bfa', marginLeft: 6, fontWeight: 700 }}></span>}
 </span>

 {/* Qty */}
 {item.quantity > 1 && (
 <span style={{ fontSize: 11, color: 'var(--c-gold-l)', fontWeight: 700, flexShrink: 0 }}>×{item.quantity}</span>
 )}

 {/* v2.157.0 — Phase P pt 5: charges counter.
     Renders for any item that has a charges system (typeof
     charges_max === 'number'). Player can tap − to spend a
     charge, + to restore one (DM override / item interactions).
     Stays visible even when charges_current === 0 so the player
     can see the depleted state and remember to rest. */}
 {typeof item.charges_max === 'number' && (
 <div
 onClick={e => e.stopPropagation()}
 style={{
 display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0,
 fontSize: 10, fontWeight: 700,
 background: 'rgba(168,85,247,0.1)',
 border: '1px solid rgba(168,85,247,0.35)',
 borderRadius: 99, padding: '1px 2px 1px 7px',
 color: (item.charges_current ?? 0) === 0 ? '#f87171' : '#c084fc',
 }}
 title={`${item.charges_current ?? 0}/${item.charges_max} charges${item.recharge ? ` · recharges on ${String(item.recharge).replace('_', ' ')}${item.recharge_dice ? ` (${item.recharge_dice})` : ' (full)'}` : ''}`}
 >
 <span>{item.charges_current ?? 0}/{item.charges_max}</span>
 <button
 onClick={() => {
 const cur = item.charges_current ?? 0;
 if (cur <= 0) return;
 onUpdate(item.id, { charges_current: cur - 1 });
 // v2.196.0 — Phase Q.0 pt 37: hand off to parent so the
 // emit happens where `character` is in scope. Build was
 // broken in v2.193 by trying to emit inline here without
 // access to character — fixed by lifting the side effect.
 onChargeSpent?.(item, cur);
 }}
 disabled={(item.charges_current ?? 0) <= 0}
 style={{
 background: 'none', border: 'none', color: 'inherit',
 fontSize: 12, lineHeight: 1, padding: '0 4px',
 cursor: (item.charges_current ?? 0) > 0 ? 'pointer' : 'not-allowed',
 opacity: (item.charges_current ?? 0) > 0 ? 1 : 0.4,
 }}
 title="Spend 1 charge"
 >−</button>
 <button
 onClick={() => {
 const cur = item.charges_current ?? 0;
 const max = item.charges_max ?? 0;
 if (cur >= max) return;
 onUpdate(item.id, { charges_current: cur + 1 });
 }}
 disabled={(item.charges_current ?? 0) >= (item.charges_max ?? 0)}
 style={{
 background: 'none', border: 'none', color: 'inherit',
 fontSize: 12, lineHeight: 1, padding: '0 4px',
 cursor: (item.charges_current ?? 0) < (item.charges_max ?? 0) ? 'pointer' : 'not-allowed',
 opacity: (item.charges_current ?? 0) < (item.charges_max ?? 0) ? 1 : 0.4,
 }}
 title="Restore 1 charge"
 >+</button>
 </div>
 )}

 {/* v2.158.0 — Phase P pt 6: Drink button for potions.
     Only renders when the item's catalogue entry is type='potion'
     (detected via the magic_item_id lookup in the parent). Click
     routes through handleDrinkPotion → parses heal dice, applies
     to character HP, decrements quantity. Stops event propagation
     so it doesn't also expand the detail modal. */}
 {isPotion && onDrink && (
 <span
 onClick={e => { e.stopPropagation(); onDrink(item.id); }}
 title="Drink potion"
 style={{
 fontSize: 10, fontWeight: 700, color: '#4ade80',
 background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.4)',
 borderRadius: 99, padding: '2px 9px', cursor: 'pointer', flexShrink: 0,
 display: 'flex', alignItems: 'center', gap: 3,
 }}>
 🧪 Drink
 </span>
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
 {item.rollExpression}
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
