import { useState, useMemo } from 'react';
// v2.154.0 — Phase P pt 2: read from the DB-backed hook instead of the
// static MAGIC_ITEMS import. Canonical list = 110 SRD items plus any
// user homebrew entries filtered by RLS. Types, rarity order, and color
// palette stay in data/magicItems.ts because they're display metadata
// (not spell-like drifting rows).
import { RARITY_COLORS, RARITY_ORDER, type MagicItem, type MagicItemRarity, type MagicItemType } from '../../data/magicItems';
import { useMagicItems } from '../../lib/hooks/useMagicItems';
import type { InventoryItem } from '../../types';
import { v4 as uuidv4 } from 'uuid';

interface MagicItemBrowserProps {
  onAddToInventory?: (item: InventoryItem) => void;
  compact?: boolean;
}

const TYPE_LABELS: Record<MagicItemType, string> = {
  armor: 'Armor', potion: 'Potions', ring: 'Rings', rod: 'Rods',
  scroll: 'Scrolls', staff: 'Staffs', wand: 'Wands', weapon: 'Weapons',
  wondrous: 'Wondrous', ammunition: 'Ammunition',
};

export default function MagicItemBrowser({ onAddToInventory, compact = false }: MagicItemBrowserProps) {
  const { items: MAGIC_ITEMS } = useMagicItems();
  const [search, setSearch] = useState('');
  const [filterRarity, setFilterRarity] = useState<MagicItemRarity | ''>('');
  const [filterType, setFilterType] = useState<MagicItemType | ''>('');
  const [filterAttunement, setFilterAttunement] = useState<boolean | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    return MAGIC_ITEMS.filter(item => {
      if (search && !item.name.toLowerCase().includes(search.toLowerCase()) && !item.description.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterRarity && item.rarity !== filterRarity) return false;
      if (filterType && item.type !== filterType) return false;
      if (filterAttunement !== null && item.requiresAttunement !== filterAttunement) return false;
      return true;
    });
  }, [MAGIC_ITEMS, search, filterRarity, filterType, filterAttunement]);

  function addToInventory(item: MagicItem) {
    if (!onAddToInventory) return;
    // v2.154.0 — Phase P pt 2: propagate structured mechanical bonus
    // fields onto the InventoryItem so computeActiveBonuses (for
    // attack/damage/save) and recomputeAC (for AC) can read them
    // directly. The description prefix is preserved for human display.
    // v2.155.0 — Phase P pt 3: also link magic_item_id so the
    // attunement gate can look up requires_attunement from the
    // catalogue at bonus-aggregation time.
    // v2.157.0 — Phase P pt 5: copy charges metadata from the
    // catalogue so the item arrives at full capacity and the long-
    // rest recharge pass can see its recharge schedule.
    const invItem: InventoryItem = {
      id: uuidv4(),
      name: item.name,
      quantity: 1,
      weight: item.weight ?? 0,
      description: `[${item.rarity.toUpperCase()}${item.requiresAttunement ? ' — Requires Attunement' : ''}] ${item.description}`,
      equipped: false,
      magical: true,
      magic_item_id: item.id,
      ...(item.acBonus     !== undefined ? { acBonus:     item.acBonus     } : {}),
      ...(item.saveBonus   !== undefined ? { saveBonus:   item.saveBonus   } : {}),
      ...(item.attackBonus !== undefined ? { attackBonus: item.attackBonus } : {}),
      ...(item.damageBonus !== undefined ? { damageBonus: item.damageBonus } : {}),
      ...(item.maxCharges  !== undefined ? {
        charges_max:     item.maxCharges,
        charges_current: item.maxCharges, // start at full capacity
        ...(item.recharge     ? { recharge:      item.recharge     } : {}),
        ...(item.rechargeDice ? { recharge_dice: item.rechargeDice } : {}),
      } : {}),
    };
    onAddToInventory(invItem);
    setAdded(prev => new Set([...prev, item.id]));
    setTimeout(() => setAdded(prev => { const n = new Set(prev); n.delete(item.id); return n; }), 2000);
  }

  const types = useMemo(
    () => [...new Set(MAGIC_ITEMS.map(i => i.type))].sort() as MagicItemType[],
    [MAGIC_ITEMS],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
      {/* Search + filters */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search magic items by name or description…"
          style={{ fontSize: 'var(--fs-sm)', width: '100%' }}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select
            value={filterRarity}
            onChange={e => setFilterRarity(e.target.value as MagicItemRarity | '')}
            style={{ flex: '1 1 140px', fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--c-border-m)', background: 'var(--c-card)', color: 'var(--t-1)', cursor: 'pointer' }}
          >
            <option value="">All Rarities</option>
            {RARITY_ORDER.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
          </select>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value as MagicItemType | '')}
            style={{ flex: '1 1 140px', fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--c-border-m)', background: 'var(--c-card)', color: 'var(--t-1)', cursor: 'pointer' }}
          >
            <option value="">All Types</option>
            {types.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
          {!compact && (
            <select
              value={filterAttunement === null ? '' : String(filterAttunement)}
              onChange={e => setFilterAttunement(e.target.value === '' ? null : e.target.value === 'true')}
              style={{ flex: '1 1 140px', fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--c-border-m)', background: 'var(--c-card)', color: 'var(--t-1)', cursor: 'pointer' }}
            >
              <option value="">Attunement: Any</option>
              <option value="true">Requires Attunement</option>
              <option value="false">No Attunement</option>
            </select>
          )}
        </div>
      </div>

      <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
        {filtered.length} item{filtered.length !== 1 ? 's' : ''}
      </div>

      {/* Item list */}
      {/* v2.177.0 — Phase Q.0 pt 18: row sizing matched to the Attacks
          table in the Actions tab. Previous sizing (8px padding, 40px
          min height, 9-11px badges) was visually cramped — we were
          compressing vertically to "fit more on one screen" but every
          info-dense row was unreadable. Standardized on comfortable
          12/16 padding + 15px name + 11px badges + gap 6 between rows
          to match the weapon row feel. */}
      {/* v2.178.0 — Phase Q.0 pt 19: structural rewrite to mirror the
          character-sheet Spells tab row pattern (SpellsTab.tsx line 546).
          The spell row uses a DDB-style table grid:
            [90px type] [3px color stripe] [1fr name+sub] [badges...] [button] [chevron]
          which makes the columns visually aligned across rows. Magic
          Items now uses the same grid so a DM scanning the list can
          scan down rather than across. Previous flexbox layout had
          everything jammed on one line and then flex-wrap made column
          positions jitter between rows. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: compact ? 320 : 520, overflowY: 'auto' }}>
        {filtered.map(item => {
          const rarityColor = RARITY_COLORS[item.rarity as MagicItemRarity] ?? '#c4c4c4';
          const isExpanded = expanded === item.id;
          const wasAdded = added.has(item.id);
          const typeLabel = TYPE_LABELS[item.type as MagicItemType] ?? item.type;
          return (
            <div
              key={item.id}
              style={{
                borderRadius: 8,
                border: `1px solid ${isExpanded ? rarityColor + '40' : 'var(--c-border)'}`,
                background: isExpanded ? rarityColor + '06' : 'var(--c-card)',
                overflow: 'hidden',
                transition: 'border-color var(--tr-fast)',
                flexShrink: 0,
              }}
            >
              {/* Collapsed row — spell-tab grid layout */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '90px 3px 1fr auto auto auto 16px',
                  alignItems: 'center', gap: '0 10px',
                  padding: '9px 12px', cursor: 'pointer', minHeight: 48,
                }}
                onClick={() => setExpanded(isExpanded ? null : item.id)}
              >
                {/* Col 0: Type label (mirrors "AT WILL" column) */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{
                    fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 800,
                    color: rarityColor, letterSpacing: '0.04em',
                    textTransform: 'uppercase' as const, textAlign: 'center', lineHeight: 1.2,
                  }}>
                    {typeLabel}
                  </span>
                </div>

                {/* Col 1: rarity color stripe */}
                <div style={{ width: 3, height: 28, background: rarityColor, borderRadius: 2 }} />

                {/* Col 2: name + description */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--t-1)', lineHeight: 1.3 }}>
                    {item.name}
                  </div>
                  {!isExpanded && (
                    <div style={{
                      fontSize: 11, color: 'var(--t-3)', marginTop: 2,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
                      maxWidth: '100%', lineHeight: 1.35,
                    }}>
                      {item.description}
                    </div>
                  )}
                </div>

                {/* Col 3: rarity pill */}
                <span style={{
                  fontSize: 10, fontWeight: 700, color: rarityColor,
                  padding: '2px 8px', borderRadius: 4,
                  border: `1px solid ${rarityColor}50`, background: `${rarityColor}12`,
                  whiteSpace: 'nowrap' as const, textTransform: 'capitalize' as const,
                }}>
                  {item.rarity}
                </span>

                {/* Col 4: attunement pill (or empty spacer) */}
                <span style={{ minWidth: 90, display: 'flex', justifyContent: 'center' }}>
                  {item.requiresAttunement ? (
                    <span style={{
                      fontSize: 10, fontWeight: 600, color: 'var(--c-amber-l)',
                      background: 'rgba(245,200,66,0.08)',
                      padding: '2px 8px', borderRadius: 4,
                      border: '1px solid rgba(245,200,66,0.3)', whiteSpace: 'nowrap' as const,
                    }}>
                      Attunement
                    </span>
                  ) : null}
                </span>

                {/* Col 5: Add button */}
                <div>
                  {onAddToInventory ? (
                    <button
                      onClick={e => { e.stopPropagation(); addToInventory(item); }}
                      style={{
                        fontSize: 12, fontWeight: 700, padding: '5px 14px', borderRadius: 6,
                        cursor: 'pointer', minHeight: 0, minWidth: 70,
                        border: wasAdded ? '1px solid var(--c-border-m)' : `1px solid ${rarityColor}50`,
                        background: wasAdded ? 'var(--c-raised)' : `${rarityColor}12`,
                        color: wasAdded ? 'var(--t-3)' : rarityColor,
                        transition: 'all var(--tr-fast)',
                      }}
                    >
                      {wasAdded ? '✓ Added' : '+ Add'}
                    </button>
                  ) : null}
                </div>

                {/* Col 6: chevron */}
                <span style={{
                  fontSize: 11, color: 'var(--t-3)',
                  transform: isExpanded ? 'rotate(180deg)' : 'none',
                  transition: 'transform var(--tr-fast)', textAlign: 'center' as const,
                }}>▼</span>
              </div>

              {/* Expanded description */}
              {isExpanded && (
                <div className="animate-fade-in" style={{ padding: '0 16px 14px 105px', borderTop: `1px solid ${rarityColor}20` }}>
                  <p style={{ fontSize: 13, color: 'var(--t-2)', lineHeight: 1.65, margin: '10px 0' }}>
                    {item.description}
                  </p>
                  {item.weight !== undefined && item.weight > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--t-3)', marginTop: 4 }}>Weight: {item.weight} lb</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 'var(--sp-8)', color: 'var(--t-2)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)' }}>
            No magic items match your search.
          </div>
        )}
      </div>
    </div>
  );
}
