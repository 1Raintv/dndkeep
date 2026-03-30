import { useState } from 'react';
import type { Character, InventoryItem } from '../../types';
import { v4 as uuidv4 } from 'uuid';

interface InventoryProps {
  character: Character;
  onUpdateInventory: (items: InventoryItem[]) => void;
  onUpdateCurrency: (currency: Character['currency']) => void;
}

function CurrencyDisplay({
  currency,
  onUpdate,
}: {
  currency: Character['currency'];
  onUpdate: (currency: Character['currency']) => void;
}) {
  const [editing, setEditing] = useState<keyof Character['currency'] | null>(null);
  const [draft, setDraft] = useState('');

  const coins: { key: keyof Character['currency']; label: string; color: string }[] = [
    { key: 'pp', label: 'PP', color: '#e0e0e0' },
    { key: 'gp', label: 'GP', color: 'var(--color-gold-bright)' },
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
      display: 'flex', gap: 'var(--space-3)', padding: 'var(--space-3)',
      background: 'var(--bg-sunken)', borderRadius: 'var(--radius-md)',
      marginBottom: 'var(--space-4)',
    }}>
      {coins.map(({ key, label, color }) => (
        <div
          key={key}
          style={{ textAlign: 'center', flex: 1, cursor: 'pointer' }}
          onClick={() => editing !== key && open(key)}
          title={`Click to edit ${label}`}
        >
          {editing === key ? (
            <input
              type="number"
              value={draft}
              min={0}
              autoFocus
              onChange={e => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(null); }}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%', textAlign: 'center', fontFamily: 'var(--font-heading)',
                fontWeight: 700, fontSize: 'var(--text-md)', color,
                background: 'var(--bg-raised)', border: '1px solid var(--border-gold)',
                borderRadius: 'var(--radius-sm)', padding: '1px 2px',
              }}
            />
          ) : (
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-md)', color }}>
              {currency[key]}
            </div>
          )}
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Inventory({ character, onUpdateInventory, onUpdateCurrency }: InventoryProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', quantity: '1', weight: '0', description: '' });

  const inventory = character.inventory;
  const totalWeight = inventory.reduce((sum, item) => sum + item.weight * item.quantity, 0);

  function toggleEquipped(id: string) {
    onUpdateInventory(
      inventory.map(item => item.id === id ? { ...item, equipped: !item.equipped } : item)
    );
  }

  function removeItem(id: string) {
    onUpdateInventory(inventory.filter(item => item.id !== id));
  }

  function updateItem(id: string, updates: Partial<InventoryItem>) {
    onUpdateInventory(
      inventory.map(item => item.id === id ? { ...item, ...updates } : item)
    );
  }

  function addItem() {
    if (!newItem.name.trim()) return;
    const item: InventoryItem = {
      id: uuidv4(),
      name: newItem.name.trim(),
      quantity: Math.max(1, parseInt(newItem.quantity, 10) || 1),
      weight: parseFloat(newItem.weight) || 0,
      description: newItem.description.trim(),
      equipped: false,
      magical: false,
    };
    onUpdateInventory([...inventory, item]);
    setNewItem({ name: '', quantity: '1', weight: '0', description: '' });
    setShowAdd(false);
  }

  const equipped = inventory.filter(i => i.equipped);
  const carried = inventory.filter(i => !i.equipped);

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="section-header" style={{ marginBottom: 0, borderBottom: 'none', flex: 1 }}>
          Inventory
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-heading)', alignSelf: 'center' }}>
            {totalWeight} lb
          </span>
          <button className="btn-gold btn-sm" onClick={() => setShowAdd(v => !v)}>
            {showAdd ? 'Cancel' : 'Add Item'}
          </button>
        </div>
      </div>
      <div style={{ borderBottom: '1px solid var(--border-gold)', marginBottom: 'var(--space-4)' }} />

      <CurrencyDisplay currency={character.currency} onUpdate={onUpdateCurrency} />

      {/* Add item form */}
      {showAdd && (
        <div style={{
          background: 'var(--bg-sunken)',
          border: '1px solid var(--border-gold)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-4)',
          marginBottom: 'var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
          animation: 'fadeIn 150ms ease both',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 'var(--space-2)' }}>
            <div>
              <label>Item Name</label>
              <input
                value={newItem.name}
                onChange={e => setNewItem(v => ({ ...v, name: e.target.value }))}
                placeholder="e.g. Longsword"
                autoFocus
              />
            </div>
            <div>
              <label>Qty</label>
              <input
                type="number"
                value={newItem.quantity}
                onChange={e => setNewItem(v => ({ ...v, quantity: e.target.value }))}
                style={{ width: '56px' }}
              />
            </div>
            <div>
              <label>Weight</label>
              <input
                type="number"
                value={newItem.weight}
                onChange={e => setNewItem(v => ({ ...v, weight: e.target.value }))}
                style={{ width: '64px' }}
              />
            </div>
          </div>
          <div>
            <label>Description</label>
            <input
              value={newItem.description}
              onChange={e => setNewItem(v => ({ ...v, description: e.target.value }))}
              placeholder="Optional notes"
            />
          </div>
          <button className="btn-gold" onClick={addItem}>Add to Inventory</button>
        </div>
      )}

      {inventory.length === 0 ? (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', fontStyle: 'italic', fontFamily: 'var(--font-heading)' }}>
          No items carried
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          {equipped.length > 0 && (
            <div style={{ marginBottom: 'var(--space-2)' }}>
              <div style={{
                fontSize: 'var(--text-xs)',
                fontFamily: 'var(--font-heading)',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--text-gold)',
                marginBottom: 'var(--space-1)',
              }}>
                Equipped
              </div>
              {equipped.map(item => (
                <InventoryRow key={item.id} item={item} onToggle={toggleEquipped} onRemove={removeItem} onUpdate={updateItem} />
              ))}
            </div>
          )}

          {carried.length > 0 && (
            <div>
              {equipped.length > 0 && (
                <div style={{
                  fontSize: 'var(--text-xs)',
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                  marginBottom: 'var(--space-1)',
                }}>
                  Carried
                </div>
              )}
              {carried.map(item => (
                <InventoryRow key={item.id} item={item} onToggle={toggleEquipped} onRemove={removeItem} onUpdate={updateItem} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function InventoryRow({
  item,
  onToggle,
  onRemove,
  onUpdate,
}: {
  item: InventoryItem;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<InventoryItem>) => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  function openName() {
    setNameDraft(item.name);
    setEditingName(true);
  }

  function commitName() {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== item.name) onUpdate(item.id, { name: trimmed });
    setEditingName(false);
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-2)',
      padding: 'var(--space-2) var(--space-3)',
      borderRadius: 'var(--radius-sm)',
      background: item.equipped ? 'rgba(201,146,42,0.05)' : 'transparent',
      border: item.equipped ? '1px solid rgba(201,146,42,0.2)' : '1px solid transparent',
      transition: 'background var(--transition-fast)',
    }}>
      {/* Equipped toggle */}
      <input
        type="checkbox"
        checked={item.equipped}
        onChange={() => onToggle(item.id)}
        title="Toggle equipped"
        style={{ width: 14, height: 14, cursor: 'pointer', flexShrink: 0 }}
      />

      {/* Name — click to edit */}
      {editingName ? (
        <input
          value={nameDraft}
          onChange={e => setNameDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') setEditingName(false); }}
          autoFocus
          style={{ flex: 1, fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)' }}
        />
      ) : (
        <span
          onClick={openName}
          title="Click to rename"
          style={{
            flex: 1,
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-sm)',
            color: item.equipped ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: item.equipped ? 600 : 400,
            cursor: 'text',
          }}
        >
          {item.name}
        </span>
      )}

      {/* Quantity stepper */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        <button
          className="btn-ghost btn-sm btn-icon"
          onClick={() => onUpdate(item.id, { quantity: Math.max(1, item.quantity - 1) })}
          disabled={item.quantity <= 1}
          style={{ width: 20, height: 20, fontSize: 12, padding: 0, color: 'var(--text-muted)' }}
          title="Decrease quantity"
        >
          −
        </button>
        <span style={{
          fontFamily: 'var(--font-heading)',
          fontSize: 'var(--text-xs)',
          fontWeight: 700,
          color: 'var(--text-gold)',
          minWidth: 24,
          textAlign: 'center',
        }}>
          {item.quantity}
        </span>
        <button
          className="btn-ghost btn-sm btn-icon"
          onClick={() => onUpdate(item.id, { quantity: item.quantity + 1 })}
          style={{ width: 20, height: 20, fontSize: 12, padding: 0, color: 'var(--text-muted)' }}
          title="Increase quantity"
        >
          +
        </button>
      </div>

      {/* Weight */}
      {item.weight > 0 && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', flexShrink: 0 }}>
          {(item.weight * item.quantity).toFixed(item.weight % 1 === 0 ? 0 : 1)} lb
        </span>
      )}

      {/* Remove */}
      <button
        className="btn-ghost btn-sm"
        onClick={() => onRemove(item.id)}
        title="Remove item"
        style={{ color: 'var(--color-ash)', padding: '2px 6px', flexShrink: 0 }}
      >
        ✕
      </button>
    </div>
  );
}
