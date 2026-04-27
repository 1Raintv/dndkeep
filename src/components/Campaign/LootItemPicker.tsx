import { useState, useMemo, useRef, useEffect } from 'react';
import { useMagicItems } from '../../lib/hooks/useMagicItems';
import { RARITY_COLORS, type MagicItem, type MagicItemRarity } from '../../data/magicItems';

// v2.337.0 — F1: Typeahead picker for the Distribute Loot panel.
//
// Replaces the free-text "Item name" input with a real catalog search.
// User types "potion" → dropdown shows every potion in the catalog
// (~8 matches max in view, scrollable for more); click one to pick it.
// Picked items carry their full magic_item_id linkage so attunement,
// AC bonuses, ability overrides, weapon damage dice, etc. all flow
// through automatically when the loot lands in a recipient's inventory
// — none of the prior "free-text item" loot kept that linkage.
//
// Custom-text fallback: if the DM is dropping a non-catalog item
// (e.g. "Old map", "Mysterious sigil", "Half a torn letter"), the
// picker still accepts the typed string as a custom-named item via
// the "Use 'X' as custom item" affordance at the bottom of the
// dropdown. That path stores no magic_item_id and the recipient
// just gets a generic Other-category inventory row, matching the
// pre-v2.337 free-text behavior.
//
// Why a separate component (not just inline JSX): the dropdown needs
// (a) outside-click dismissal, (b) keyboard navigation (arrow + enter),
// (c) a sane "max 8 visible, scrollable for more" container — those
// are easier to keep correct in one focused file than scattered across
// the 1700-line PartyDashboard.

interface LootItemPickerProps {
  /** The currently-picked catalog item, or null when nothing/custom. */
  selected: MagicItem | null;
  /** Set when the user picks a catalog item; null clears the selection. */
  onSelect: (item: MagicItem | null) => void;
  /** The custom-text fallback. Used when user types a non-catalog item. */
  customName: string;
  /** Updates the custom-text fallback. */
  onCustomNameChange: (name: string) => void;
  /** Optional placeholder when the input is empty. */
  placeholder?: string;
  /** Called when user hits Enter on the input — lets parent submit. */
  onSubmit?: () => void;
}

const MAX_SUGGESTIONS = 8;

export default function LootItemPicker({
  selected,
  onSelect,
  customName,
  onCustomNameChange,
  placeholder = 'Search items or type a custom name…',
  onSubmit,
}: LootItemPickerProps) {
  const { items: MAGIC_ITEMS } = useMagicItems();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Outside-click dismisses the dropdown without clearing the input
  // (so a user can click off and back without losing what they typed).
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Compute typeahead matches. Substring match on name with simple
  // prefix-prioritized ranking — catalog is small (~115 entries) so
  // this stays sub-millisecond. Skip when nothing's typed; the
  // dropdown only opens once there's at least 1 character.
  const suggestions = useMemo<MagicItem[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const startsWith: MagicItem[] = [];
    const contains: MagicItem[] = [];
    for (const item of MAGIC_ITEMS) {
      const name = item.name.toLowerCase();
      if (name.startsWith(q)) startsWith.push(item);
      else if (name.includes(q)) contains.push(item);
    }
    return [...startsWith, ...contains].slice(0, MAX_SUGGESTIONS);
  }, [MAGIC_ITEMS, query]);

  // Reset highlight when suggestions list changes shape so arrow keys
  // don't index off the end of a shrunken list.
  useEffect(() => { setHighlightIdx(0); }, [suggestions.length]);

  function pickItem(item: MagicItem) {
    onSelect(item);
    onCustomNameChange(''); // catalog item supersedes any custom name
    setQuery('');
    setOpen(false);
  }

  function pickCustom() {
    const trimmed = query.trim();
    if (!trimmed) return;
    onCustomNameChange(trimmed);
    onSelect(null);
    setQuery('');
    setOpen(false);
  }

  function clearSelection() {
    onSelect(null);
    onCustomNameChange('');
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(i => Math.min(i + 1, Math.max(0, suggestions.length - 1)));
      setOpen(true);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // If suggestions visible, picking the highlighted one is the
      // expected action. Otherwise fall back to custom or, if there's
      // already a selection + no input, to onSubmit (let parent
      // distribute). This keeps Enter useful from any state.
      if (open && suggestions.length > 0) pickItem(suggestions[highlightIdx]);
      else if (query.trim()) pickCustom();
      else onSubmit?.();
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  // Render: either the picked-chip view (catalog selection) or
  // the search-input + dropdown view. The custom-name fallback
  // is shown as a smaller chip below the input when active.
  return (
    <div ref={wrapRef} style={{ position: 'relative' as const, flex: 1 }}>
      {selected ? (
        // Picked-from-catalog state: chip + clear button. Rarity
        // color stripe gives at-a-glance read of the item's tier.
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 10px', borderRadius: 7,
          border: `1px solid ${RARITY_COLORS[selected.rarity]}55`,
          background: 'var(--c-raised)',
          minHeight: 30,
        }}>
          <span style={{
            display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
            background: RARITY_COLORS[selected.rarity], flexShrink: 0,
          }} />
          <span style={{ fontFamily: 'var(--ff-body)', fontSize: 13, fontWeight: 700, color: 'var(--t-1)', flex: 1 }}>
            {selected.name}
          </span>
          <span style={{
            fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 800,
            letterSpacing: '0.06em', textTransform: 'uppercase' as const,
            color: RARITY_COLORS[selected.rarity],
          }}>
            {selected.rarity}{selected.requiresAttunement ? ' · Attune' : ''}
          </span>
          <button
            onClick={clearSelection}
            title="Clear selection"
            style={{
              background: 'transparent', border: 'none', color: 'var(--t-3)',
              cursor: 'pointer', padding: '0 4px', fontSize: 16, lineHeight: 1,
              minHeight: 0,
            }}
          >
            ×
          </button>
        </div>
      ) : customName ? (
        // Custom-text state: chip with the typed name + clear button.
        // Visually distinct from the catalog chip (no rarity stripe)
        // so the DM knows this is a free-text drop without catalog
        // bonuses / attunement / etc.
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 10px', borderRadius: 7,
          border: '1px dashed var(--c-border-m)',
          background: 'var(--c-raised)',
          minHeight: 30,
        }}>
          <span style={{ fontFamily: 'var(--ff-body)', fontSize: 13, fontWeight: 600, color: 'var(--t-1)', flex: 1 }}>
            {customName}
          </span>
          <span style={{
            fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 800,
            letterSpacing: '0.06em', textTransform: 'uppercase' as const,
            color: 'var(--t-3)',
          }}>
            Custom
          </span>
          <button
            onClick={clearSelection}
            title="Clear"
            style={{
              background: 'transparent', border: 'none', color: 'var(--t-3)',
              cursor: 'pointer', padding: '0 4px', fontSize: 16, lineHeight: 1,
              minHeight: 0,
            }}
          >
            ×
          </button>
        </div>
      ) : (
        // Search-input state with optional dropdown.
        <>
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => { if (query) setOpen(true); }}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            style={{
              width: '100%', fontSize: 13, padding: '6px 10px', borderRadius: 7,
              border: '1px solid var(--c-border-m)',
              background: 'var(--c-raised)', color: 'var(--t-1)',
              boxSizing: 'border-box' as const,
            }}
          />
          {open && query.trim() && (
            <div style={{
              position: 'absolute' as const, top: 'calc(100% + 4px)', left: 0, right: 0,
              maxHeight: 280, overflowY: 'auto' as const,
              background: 'rgba(15,16,18,0.98)',
              border: '1px solid var(--c-border-m)',
              borderRadius: 7,
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
              zIndex: 50,
            }}>
              {suggestions.length === 0 ? (
                <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--t-3)', fontStyle: 'italic' }}>
                  No matches in the catalog.
                </div>
              ) : (
                suggestions.map((item, i) => (
                  <div
                    key={item.id}
                    onMouseDown={(e) => { e.preventDefault(); pickItem(item); }}
                    onMouseEnter={() => setHighlightIdx(i)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 10px',
                      cursor: 'pointer',
                      background: i === highlightIdx ? 'rgba(255,255,255,0.06)' : 'transparent',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}
                  >
                    <span style={{
                      display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                      background: RARITY_COLORS[item.rarity as MagicItemRarity], flexShrink: 0,
                    }} />
                    <span style={{ fontFamily: 'var(--ff-body)', fontSize: 12, fontWeight: 600, color: 'var(--t-1)', flex: 1 }}>
                      {item.name}
                    </span>
                    <span style={{
                      fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 700,
                      letterSpacing: '0.06em', textTransform: 'uppercase' as const,
                      color: RARITY_COLORS[item.rarity as MagicItemRarity],
                    }}>
                      {item.rarity}{item.requiresAttunement ? ' · A' : ''}
                    </span>
                  </div>
                ))
              )}
              {/* Custom-text fallback. Always rendered when there's a
                  query so the DM has a path forward even if the
                  catalog has nothing — e.g. "Tattered letter" or
                  "Half of a brass key" type RP loot. */}
              <div
                onMouseDown={(e) => { e.preventDefault(); pickCustom(); }}
                style={{
                  padding: '7px 10px',
                  cursor: 'pointer',
                  background: 'rgba(212,160,23,0.04)',
                  borderTop: '1px solid var(--c-border)',
                  fontSize: 11,
                  color: 'var(--c-gold-l)',
                  fontStyle: 'italic' as const,
                }}
              >
                Use "{query.trim()}" as a custom item
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
