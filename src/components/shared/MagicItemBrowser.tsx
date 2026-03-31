import { useState, useMemo } from 'react';
import { MAGIC_ITEMS, RARITY_COLORS, RARITY_ORDER, type MagicItem, type MagicItemRarity, type MagicItemType } from '../../data/magicItems';
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
  }, [search, filterRarity, filterType, filterAttunement]);

  function addToInventory(item: MagicItem) {
    if (!onAddToInventory) return;
    const invItem: InventoryItem = {
      id: uuidv4(),
      name: item.name,
      quantity: 1,
      weight: item.weight ?? 0,
      description: `[${item.rarity.toUpperCase()}${item.requiresAttunement ? ' — Requires Attunement' : ''}] ${item.description}`,
      equipped: false,
      magical: true,
    };
    onAddToInventory(invItem);
    setAdded(prev => new Set([...prev, item.id]));
    setTimeout(() => setAdded(prev => { const n = new Set(prev); n.delete(item.id); return n; }), 2000);
  }

  const types = [...new Set(MAGIC_ITEMS.map(i => i.type))].sort() as MagicItemType[];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {/* Search + filters */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search magic items…"
          style={{ flex: 1, minWidth: 160, fontSize: 'var(--text-sm)' }}
        />
        <select value={filterRarity} onChange={e => setFilterRarity(e.target.value as MagicItemRarity | '')} style={{ fontSize: 'var(--text-sm)' }}>
          <option value="">All Rarities</option>
          {RARITY_ORDER.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value as MagicItemType | '')} style={{ fontSize: 'var(--text-sm)' }}>
          <option value="">All Types</option>
          {types.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
        </select>
        {!compact && (
          <select value={filterAttunement === null ? '' : String(filterAttunement)} onChange={e => setFilterAttunement(e.target.value === '' ? null : e.target.value === 'true')} style={{ fontSize: 'var(--text-sm)' }}>
            <option value="">Attunement: Any</option>
            <option value="true">Requires Attunement</option>
            <option value="false">No Attunement</option>
          </select>
        )}
      </div>

      <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
        {filtered.length} item{filtered.length !== 1 ? 's' : ''}
      </div>

      {/* Item list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', maxHeight: compact ? 320 : 560, overflowY: 'auto' }}>
        {filtered.map(item => {
          const rarityColor = RARITY_COLORS[item.rarity as MagicItemRarity] ?? '#c4c4c4';
          const isExpanded = expanded === item.id;
          const wasAdded = added.has(item.id);
          return (
            <div
              key={item.id}
              style={{
                borderRadius: 'var(--radius-sm)',
                border: `1px solid ${rarityColor}30`,
                background: 'var(--bg-sunken)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                  padding: 'var(--space-2) var(--space-3)', cursor: 'pointer',
                }}
                onClick={() => setExpanded(isExpanded ? null : item.id)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
                      {item.name}
                    </span>
                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: 9, fontWeight: 700, color: rarityColor, padding: '1px 5px', borderRadius: 3, border: `1px solid ${rarityColor}50`, background: `${rarityColor}10`, whiteSpace: 'nowrap' }}>
                      {item.rarity}
                    </span>
                    {item.requiresAttunement && (
                      <span style={{ fontFamily: 'var(--font-heading)', fontSize: 9, color: 'var(--color-amber)', background: 'rgba(245,200,66,0.08)', padding: '1px 5px', borderRadius: 3, border: '1px solid rgba(245,200,66,0.3)' }}>
                        Attunement
                      </span>
                    )}
                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: 9, color: 'var(--text-muted)' }}>
                      {TYPE_LABELS[item.type as MagicItemType] ?? item.type}
                    </span>
                  </div>
                  {!isExpanded && (
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.description}
                    </div>
                  )}
                </div>
                {onAddToInventory && (
                  <button
                    onClick={e => { e.stopPropagation(); addToInventory(item); }}
                    className={wasAdded ? 'btn-secondary btn-sm' : 'btn-gold btn-sm'}
                    style={{ flexShrink: 0, fontSize: 'var(--text-xs)' }}
                  >
                    {wasAdded ? '✓ Added' : '+ Add'}
                  </button>
                )}
              </div>

              {isExpanded && (
                <div className="animate-fade-in" style={{ padding: 'var(--space-3)', borderTop: `1px solid ${rarityColor}20`, background: `${rarityColor}05` }}>
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                    {item.description}
                  </p>
                  {item.weight !== undefined && item.weight > 0 && (
                    <div style={{ fontFamily: 'var(--font-heading)', fontSize: 9, color: 'var(--text-muted)', marginTop: 'var(--space-2)' }}>
                      Weight: {item.weight} lb
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)', fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)' }}>
            No magic items match your search.
          </div>
        )}
      </div>
    </div>
  );
}
