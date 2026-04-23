import { useState, useEffect } from 'react';
import type { Character, InventoryItem } from '../../types';
import MagicItemBrowser from '../shared/MagicItemBrowser';
import { useAuth } from '../../context/AuthContext';
import { getCharacters, updateCharacter } from '../../lib/supabase';

// v2.159.0 — Phase P pt 7 (final): standalone magic items browser page.
//
// Mirrors the SpellsPage pattern: the MagicItemBrowser component
// (built in v2.154 with useMagicItems, orphaned since then) is now
// mounted at the /magic-items route. A character picker dropdown sits
// in the header so users can add items from the browser directly to
// any of their characters' inventories without navigating back to the
// character sheet first.
//
// Discoverability:
//   • Routed in App.tsx (see v2.159 changes there).
//   • Linked from the sidebar nav under "Compendium" alongside
//     Bestiary and Classes & Subclasses.
//
// Caveats:
//   • Only shows items visible per RLS: SRD canonical + own homebrew
//     + public homebrew. Matches what MagicItemBrowser already does.
//   • "Add to inventory" appends the item to the chosen character's
//     inventory[] and writes back via updateCharacter. The catalogue
//     link (magic_item_id), mechanical bonuses, and charges all
//     propagate — Phase P's full stack is live from this path.

export default function MagicItemsPage() {
  const { user } = useAuth();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [targetCharacterId, setTargetCharacterId] = useState<string>('');
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    getCharacters(user.id).then(({ data }) => {
      setCharacters(data);
      if (data.length > 0 && !targetCharacterId) {
        setTargetCharacterId(data[0].id);
      }
    });
    // intentionally run once — targetCharacterId only defaults on first load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleAddToInventory(item: InventoryItem) {
    const char = characters.find(c => c.id === targetCharacterId);
    if (!char) {
      setFlash('Select a character first');
      setTimeout(() => setFlash(null), 2000);
      return;
    }
    const newInventory = [...(char.inventory ?? []), item];
    const { error } = await updateCharacter(char.id, { inventory: newInventory });
    if (!error) {
      setCharacters(prev => prev.map(c =>
        c.id === char.id ? { ...c, inventory: newInventory } : c
      ));
      setFlash(`Added ${item.name} to ${char.name}`);
      setTimeout(() => setFlash(null), 2500);
    } else {
      setFlash(`Failed to add: ${error.message}`);
      setTimeout(() => setFlash(null), 3000);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-6)', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
        <h1>Magic Items</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 12, color: 'var(--t-2)', fontFamily: 'var(--ff-body)' }}>
            Add to:
          </label>
          <select
            value={targetCharacterId}
            onChange={e => setTargetCharacterId(e.target.value)}
            disabled={characters.length === 0}
            style={{
              fontSize: 13, padding: '5px 8px', borderRadius: 5,
              border: '1px solid var(--c-border)',
              background: 'var(--c-raised)', color: 'var(--t-1)',
              minWidth: 180,
            }}
          >
            {characters.length === 0 && <option value="">No characters</option>}
            {characters.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.class_name} {c.level}
              </option>
            ))}
          </select>
        </div>
      </div>

      {flash && (
        <div style={{
          marginBottom: 'var(--sp-3)', padding: '8px 12px',
          borderRadius: 6,
          background: flash.startsWith('Failed') || flash.startsWith('Select')
            ? 'rgba(239,68,68,0.1)'
            : 'rgba(74,222,128,0.12)',
          border: `1px solid ${flash.startsWith('Failed') || flash.startsWith('Select') ? 'rgba(239,68,68,0.4)' : 'rgba(74,222,128,0.4)'}`,
          color: flash.startsWith('Failed') || flash.startsWith('Select') ? '#f87171' : '#4ade80',
          fontSize: 12, fontWeight: 600,
        }}>
          {flash}
        </div>
      )}

      <MagicItemBrowser onAddToInventory={handleAddToInventory} />
    </div>
  );
}
