import { useState } from 'react';
import type { Character, AbilityKey } from '../../types';
import { abilityModifier, formatModifier } from '../../lib/gameUtils';
import LevelUp from './LevelUp';
import { deleteCharacter } from '../../lib/supabase';
import { ARMOR_LIST, calcArmorAC } from '../../data/armor';
import { useNavigate } from 'react-router-dom';

type SettingsTab = 'stats' | 'levelup' | 'export' | 'danger';

interface CharacterSettingsProps {
  character: Character;
  onUpdate: (updates: Partial<Character>) => void;
  onClose: () => void;
}

const ABILITY_ORDER: AbilityKey[] = [
  'strength', 'dexterity', 'constitution',
  'intelligence', 'wisdom', 'charisma',
];
const ABBREV: Record<AbilityKey, string> = {
  strength: 'STR', dexterity: 'DEX', constitution: 'CON',
  intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA',
};

function EditableField({
  label, value, min = 0, max = 999, format, onCommit,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  format?: (v: number) => string;
  onCommit: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  function open() { setDraft(String(value)); setEditing(true); }
  function commit() {
    const parsed = parseInt(draft, 10);
    if (!isNaN(parsed)) onCommit(Math.min(max, Math.max(min, parsed)));
    setEditing(false);
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
        {label}
      </span>
      {editing ? (
        <input
          type="number"
          value={draft}
          min={min}
          max={max}
          autoFocus
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
          style={{ width: 72, textAlign: 'right', fontFamily: 'var(--font-heading)', fontWeight: 700 }}
        />
      ) : (
        <button
          className="btn-ghost"
          onClick={open}
          title={`Edit ${label.toLowerCase()}`}
          style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--text-gold)', padding: '2px 8px' }}
        >
          {format ? format(value) : value}
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginLeft: 6 }}>edit</span>
        </button>
      )}
    </div>
  );
}

function AbilityRow({
  ability, score, onCommit,
}: {
  ability: AbilityKey;
  score: number;
  onCommit: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  function open() { setDraft(String(score)); setEditing(true); }
  function commit() {
    const parsed = parseInt(draft, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 30) onCommit(parsed);
    setEditing(false);
  }

  const mod = abilityModifier(editing ? (parseInt(draft, 10) || score) : score);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-sunken)' }}>
      <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-xs)', letterSpacing: '0.08em', color: 'var(--text-muted)', width: 28 }}>
        {ABBREV[ability]}
      </span>
      <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', width: 30, textAlign: 'center' }}>
        {formatModifier(mod)}
      </span>
      {editing ? (
        <input
          type="number"
          value={draft}
          min={1} max={30}
          autoFocus
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
          style={{ width: 56, fontFamily: 'var(--font-heading)', fontWeight: 700, textAlign: 'center' }}
        />
      ) : (
        <button
          className="btn-ghost"
          onClick={open}
          style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-lg)', color: 'var(--text-gold)', padding: '0 var(--space-2)', minWidth: 40, textAlign: 'center' }}
          title={`Edit ${ability} (1–30)`}
        >
          {score}
        </button>
      )}
      <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginLeft: 'auto' }}>
        {ability}
      </span>
    </div>
  );
}

export default function CharacterSettings({ character, onUpdate, onClose }: CharacterSettingsProps) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<SettingsTab>('stats');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showLevelUp, setShowLevelUp] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    await deleteCharacter(character.id);
    navigate('/lobby');
  }

  function handleLevelUpConfirm(updates: Partial<Character>) {
    onUpdate(updates);
    setShowLevelUp(false);
  }

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'stats',   label: 'Edit Stats' },
    { id: 'levelup', label: 'Level Up' },
    { id: 'export',  label: '📄 Export' },
    { id: 'danger',  label: 'Danger Zone' },
  ];

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div
          className="modal"
          style={{ maxWidth: 520, width: '100%' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
            <div>
              <h2 style={{ marginBottom: 2 }}>Character Settings</h2>
              <p style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                {character.name} — Level {character.level} {character.class_name}
              </p>
            </div>
            <button className="btn-ghost btn-sm" onClick={onClose}>Close</button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', marginBottom: 'var(--space-5)' }}>
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-xs)',
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  padding: 'var(--space-2) var(--space-4)', border: 'none',
                  borderBottom: tab === t.id ? '2px solid var(--color-gold)' : '2px solid transparent',
                  background: 'transparent',
                  color: tab === t.id ? 'var(--text-gold)'
                    : t.id === 'danger' ? 'var(--color-crimson-bright)'
                    : 'var(--text-muted)',
                  cursor: 'pointer', marginBottom: -1,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Edit Stats */}
          {tab === 'stats' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
              <div>
                <div className="section-header">Ability Scores</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {ABILITY_ORDER.map(ability => (
                    <AbilityRow
                      key={ability}
                      ability={ability}
                      score={character[ability]}
                      onCommit={v => onUpdate({ [ability]: v })}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="section-header">Combat Stats</div>

                {/* Armor picker */}
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <label style={{ display: 'block', fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 'var(--space-1)', background: 'none', WebkitTextFillColor: 'var(--text-muted)' }}>
                    Equipped Armor
                  </label>
                  <select
                    value={character.equipped_armor ?? 'unarmored'}
                    onChange={e => {
                      const armorId = e.target.value;
                      const newAC = calcArmorAC(armorId, character.dexterity);
                      onUpdate({ equipped_armor: armorId, armor_class: newAC });
                    }}
                    style={{ marginBottom: 'var(--space-2)', fontSize: 'var(--text-sm)' }}
                  >
                    {ARMOR_LIST.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name} — AC {calcArmorAC(a.id, character.dexterity)} ({a.type})
                      </option>
                    ))}
                  </select>
                  <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                    Auto-calculates AC from armor + DEX. Override manually below if needed.
                  </div>
                </div>

                <EditableField
                  label="Armor Class (override)"
                  value={character.armor_class}
                  min={1} max={30}
                  onCommit={v => onUpdate({ armor_class: v })}
                />
                <EditableField
                  label="Max HP"
                  value={character.max_hp}
                  min={1} max={9999}
                  onCommit={v => onUpdate({ max_hp: v, current_hp: Math.min(character.current_hp, v) })}
                />
                <EditableField
                  label="Speed"
                  value={character.speed}
                  min={0} max={999}
                  onCommit={v => onUpdate({ speed: v })}
                />
                <EditableField
                  label="Initiative Bonus"
                  value={character.initiative_bonus}
                  min={-10} max={20}
                  format={formatModifier}
                  onCommit={v => onUpdate({ initiative_bonus: v })}
                />
              </div>

              {/* Multiclassing */}
              <div>
                <div className="section-header">Multiclass (Optional)</div>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-3)', lineHeight: 1.5 }}>
                  Add a second class. Spell slots will use multiclass rules — manage manually or via the Session tab.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                  <div>
                    <label>Secondary Class</label>
                    <select
                      value={character.secondary_class ?? ''}
                      onChange={e => onUpdate({ secondary_class: e.target.value, secondary_level: e.target.value ? (character.secondary_level || 1) : 0 })}
                      style={{ fontSize: 'var(--text-sm)' }}
                    >
                      <option value="">— None —</option>
                      {['Barbarian','Bard','Cleric','Druid','Fighter','Monk','Paladin','Ranger','Rogue','Sorcerer','Warlock','Wizard'].map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label>Secondary Level</label>
                    <select
                      value={character.secondary_level ?? 0}
                      onChange={e => onUpdate({ secondary_level: parseInt(e.target.value) })}
                      disabled={!character.secondary_class}
                      style={{ fontSize: 'var(--text-sm)' }}
                    >
                      {Array.from({ length: 19 }, (_, i) => i + 1)
                        .filter(l => l + character.level <= 20)
                        .map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                </div>
                {character.secondary_class && (character.secondary_level ?? 0) > 0 && (
                  <div style={{ marginTop: 'var(--space-2)', padding: 'var(--space-2) var(--space-3)', background: 'rgba(91,63,168,0.08)', border: '1px solid rgba(91,63,168,0.25)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--color-arcane-bright)' }}>
                    {character.class_name} {character.level} / {character.secondary_class} {character.secondary_level} — Total level {character.level + (character.secondary_level ?? 0)}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Level Up */}
          {tab === 'levelup' && (
            <div>
              {character.level >= 20 ? (
                <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
                  <p style={{ color: 'var(--text-gold)', fontFamily: 'var(--font-heading)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
                    Level 20
                  </p>
                  <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                    This character has reached the pinnacle of adventuring power.
                  </p>
                </div>
              ) : (
                <div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)', lineHeight: 1.6 }}>
                    Ready to advance to Level {character.level + 1}?
                    Review your new features, then confirm to save the changes.
                  </p>
                  <button
                    className="btn-gold"
                    onClick={() => setShowLevelUp(true)}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    Level Up to {character.level + 1}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Danger Zone */}
          {/* Export / Print */}
          {tab === 'export' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div style={{ padding: 'var(--space-4)', border: '1px solid var(--border-gold)', borderRadius: 'var(--radius-md)', background: 'rgba(201,146,42,0.06)' }}>
                <p style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--text-gold)', marginBottom: 'var(--space-2)' }}>
                  Print / Save as PDF
                </p>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 'var(--space-4)', lineHeight: 1.6 }}>
                  Print your character sheet or save it as a PDF using your browser's print dialog. Use "Save as PDF" in the print destination for a digital copy.
                </p>
                <button
                  className="btn-gold"
                  onClick={() => {
                    onClose();
                    setTimeout(() => window.print(), 300);
                  }}
                >
                  🖨️ Print Character Sheet
                </button>
              </div>

              <div style={{ padding: 'var(--space-4)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', background: 'var(--bg-sunken)' }}>
                <p style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>
                  Share Link
                </p>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 'var(--space-4)', lineHeight: 1.6 }}>
                  Generate a public read-only link anyone can view without an account.
                </p>
                {character.share_enabled && character.share_token ? (
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <input
                      readOnly
                      value={`${window.location.origin}/share/${character.share_token}`}
                      style={{ flex: 1, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}
                      onFocus={e => e.target.select()}
                    />
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => navigator.clipboard.writeText(`${window.location.origin}/share/${character.share_token}`)}
                    >
                      Copy
                    </button>
                    <button
                      className="btn-ghost btn-sm"
                      onClick={() => onUpdate({ share_enabled: false, share_token: null })}
                      style={{ color: 'var(--color-crimson-bright)', fontSize: 'var(--text-xs)' }}
                    >
                      Disable
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      const token = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
                      onUpdate({ share_enabled: true, share_token: token });
                    }}
                  >
                    Generate Share Link
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Danger Zone */}
          {tab === 'danger' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>

              {/* Share character sheet */}
              <div style={{ padding: 'var(--space-4)', border: '1px solid var(--border-gold)', borderRadius: 'var(--radius-md)', background: 'rgba(201,146,42,0.06)' }}>
                <p style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--text-gold)', marginBottom: 'var(--space-2)' }}>
                  Share Character Sheet
                </p>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 'var(--space-3)', lineHeight: 1.6 }}>
                  Generate a public read-only link to share your character with anyone — no account required.
                </p>
                {character.share_enabled && character.share_token ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                      <input
                        readOnly
                        value={`${window.location.origin}/share/${character.share_token}`}
                        style={{ flex: 1, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}
                        onFocus={e => e.target.select()}
                      />
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/share/${character.share_token}`); }}
                        style={{ flexShrink: 0 }}
                      >
                        Copy
                      </button>
                    </div>
                    <button
                      className="btn-ghost btn-sm"
                      onClick={() => onUpdate({ share_enabled: false, share_token: null })}
                      style={{ alignSelf: 'flex-start', color: 'var(--color-crimson-bright)', fontSize: 'var(--text-xs)' }}
                    >
                      Disable sharing
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn-gold btn-sm"
                    onClick={() => {
                      const token = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
                      onUpdate({ share_enabled: true, share_token: token });
                    }}
                  >
                    Generate Share Link
                  </button>
                )}
              </div>

              {/* Delete */}
              <div style={{ padding: 'var(--space-4)', border: '1px solid var(--color-blood)', borderRadius: 'var(--radius-md)', background: 'rgba(127,29,29,0.1)' }}>
                <p style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-sm)', color: '#fca5a5', marginBottom: 'var(--space-2)' }}>
                  Delete Character
                </p>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 'var(--space-4)', lineHeight: 1.6 }}>
                  Permanently delete {character.name}. All data including inventory, notes, and progress will be lost. This cannot be undone.
                </p>
                {!confirmDelete ? (
                  <button
                    className="btn-danger"
                    onClick={() => setConfirmDelete(true)}
                  >
                    Delete This Character
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
                    <p style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: '#fca5a5', flex: 1 }}>
                      Are you certain? This is permanent.
                    </p>
                    <button className="btn-secondary btn-sm" onClick={() => setConfirmDelete(false)}>
                      Cancel
                    </button>
                    <button
                      className="btn-danger btn-sm"
                      onClick={handleDelete}
                      disabled={deleting}
                    >
                      {deleting ? 'Deleting...' : 'Confirm Delete'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Level Up modal inside settings — rendered outside the settings overlay */}
      {showLevelUp && (
        <LevelUp
          character={character}
          onConfirm={handleLevelUpConfirm}
          onCancel={() => setShowLevelUp(false)}
        />
      )}
    </>
  );
}
