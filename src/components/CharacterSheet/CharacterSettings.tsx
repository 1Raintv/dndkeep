import { useState } from 'react';
import type { Character, AbilityKey } from '../../types';
import { abilityModifier, formatModifier } from '../../lib/gameUtils';
import LevelUp from './LevelUp';
import ModalPortal from '../shared/ModalPortal';
import { deleteCharacter } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { useCampaign } from '../../context/CampaignContext';
import { AUTOMATIONS, resolveAutomation, labelForValue, type AutomationValue } from '../../lib/automations';
import { SPECIES } from '../../data/species';
import { BACKGROUNDS } from '../../data/backgrounds';
import { CLASSES, getSubclassSpellIds } from '../../data/classes';
import { SPELL_MAP } from '../../data/spells';
import { CLASS_LEVEL_PROGRESSION } from '../../data/levelProgression';
import { METAMAGIC_OPTIONS, FIGHTING_STYLE_OPTIONS, WARLOCK_INVOCATIONS } from '../../data/choiceOptions';

type SettingsTab = 'stats' | 'levelup' | 'automations' | 'export' | 'danger';

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

// ── 2024 PHB language suggestions ──
const LANGUAGE_SUGGESTIONS = [
  'Common', 'Common Sign Language',
  'Draconic', 'Dwarvish', 'Elvish', 'Giant', 'Gnomish', 'Goblin', 'Halfling', 'Orc',
  'Abyssal', 'Celestial', 'Deep Speech', 'Druidic', 'Infernal', 'Primordial', 'Sylvan', 'Thieves\' Cant', 'Undercommon',
];

// ── 2024 PHB tool proficiency suggestions (grouped roughly) ──
const TOOL_SUGGESTIONS = [
  // Artisan's Tools
  "Alchemist's Supplies", "Brewer's Supplies", "Calligrapher's Supplies", "Carpenter's Tools",
  "Cartographer's Tools", "Cobbler's Tools", "Cook's Utensils", "Glassblower's Tools",
  "Jeweler's Tools", "Leatherworker's Tools", "Mason's Tools", "Painter's Supplies",
  "Potter's Tools", "Smith's Tools", "Tinker's Tools", "Weaver's Tools", "Woodcarver's Tools",
  // Gaming sets
  "Dice Set", "Dragonchess Set", "Playing Cards", "Three-Dragon Ante Set",
  // Musical instruments
  "Bagpipes", "Drum", "Dulcimer", "Flute", "Horn", "Lute", "Lyre", "Pan Flute", "Shawm", "Viol",
  // Other
  "Disguise Kit", "Forgery Kit", "Herbalism Kit", "Navigator's Tools", "Poisoner's Kit", "Thieves' Tools",
  // Vehicles
  "Land Vehicles", "Water Vehicles",
];

// v2.41.0: Damage type suggestions for the resistance/immunity/vulnerability editors.
// Display labels are Title Case; storage normalizes to lowercase via the editor.
const DAMAGE_TYPE_SUGGESTIONS = [
  'Acid', 'Bludgeoning', 'Cold', 'Fire', 'Force', 'Lightning',
  'Necrotic', 'Piercing', 'Poison', 'Psychic', 'Radiant', 'Slashing', 'Thunder',
];

/**
 * Small reusable editor for adding/removing free-text chips with a suggestion dropdown.
 * Used by Languages and Tool Proficiencies sections in the Stats tab.
 */
function ChipListEditor({
  label, items, suggestions, onChange,
}: {
  label: string;
  items: string[];
  suggestions: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const remaining = suggestions.filter(s => !items.includes(s));

  function addItem(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (items.some(x => x.toLowerCase() === trimmed.toLowerCase())) return;
    onChange([...items, trimmed]);
    setDraft('');
  }

  function removeItem(value: string) {
    onChange(items.filter(x => x !== value));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
      {items.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {items.map(it => (
            <button
              key={it}
              onClick={() => removeItem(it)}
              title={`Remove ${it}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', borderRadius: 999, cursor: 'pointer', minHeight: 0,
                fontSize: 11, fontWeight: 600,
                background: 'var(--c-gold-bg)',
                border: '1px solid var(--c-gold-bdr)',
                color: 'var(--c-gold-l)',
              }}
            >
              <span>{it}</span>
              <span style={{ opacity: 0.6, fontSize: 11 }}>×</span>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-3)', fontStyle: 'italic' }}>
          None added.
        </div>
      )}
      <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
        <input
          list={`chip-suggest-${label}`}
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem(draft); } }}
          placeholder={`Add ${label.toLowerCase()}…`}
          style={{ flex: 1, fontSize: 'var(--fs-sm)', padding: '6px 10px' }}
        />
        <datalist id={`chip-suggest-${label}`}>
          {remaining.map(s => <option key={s} value={s} />)}
        </datalist>
        <button
          className="btn-gold btn-sm"
          onClick={() => addItem(draft)}
          disabled={!draft.trim()}
        >
          Add
        </button>
      </div>
    </div>
  );
}

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
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--sp-2) 0', borderBottom: '1px solid var(--c-border)' }}>
      <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t-2)' }}>
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
          style={{ width: 72, textAlign: 'right', fontFamily: 'var(--ff-body)', fontWeight: 700 }}
        />
      ) : (
        <button
          className="btn-ghost"
          onClick={open}
          title={`Edit ${label.toLowerCase()}`}
          style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--c-gold-l)', padding: '2px 8px' }}
        >
          {format ? format(value) : value}
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)', marginLeft: 6 }}>edit</span>
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-2) var(--sp-3)', borderRadius: 'var(--r-sm)', background: '#080d14' }}>
      <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-xs)', letterSpacing: '0.08em', color: 'var(--t-2)', width: 28 }}>
        {ABBREV[ability]}
      </span>
      <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', color: 'var(--t-2)', width: 30, textAlign: 'center' }}>
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
          style={{ width: 56, fontFamily: 'var(--ff-body)', fontWeight: 700, textAlign: 'center' }}
        />
      ) : (
        <button
          className="btn-ghost"
          onClick={open}
          style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-lg)', color: 'var(--c-gold-l)', padding: '0 var(--sp-2)', minWidth: 40, textAlign: 'center' }}
          title={`Edit ${ability} (1–30)`}
        >
          {score}
        </button>
      )}
      <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', marginLeft: 'auto' }}>
        {ability}
      </span>
    </div>
  );
}

export default function CharacterSettings({ character, onUpdate, onClose }: CharacterSettingsProps) {
  const navigate = useNavigate();
  const { campaigns } = useCampaign();
  const activeCampaign = campaigns.find(c => c.id === character.campaign_id) ?? null;
  const [tab, setTab] = useState<SettingsTab>('stats');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showLevelUp, setShowLevelUp] = useState(false);

  function setAutomationOverride(key: string, value: AutomationValue | null) {
    const current = character.automation_overrides ?? {};
    const next = { ...current };
    if (value === null) delete next[key];
    else next[key] = value;
    onUpdate({ automation_overrides: next });
  }

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
    { id: 'stats',       label: 'Edit Stats' },
    { id: 'levelup',     label: 'Level Up' },
    { id: 'automations', label: 'Automations' },
    { id: 'export',      label: 'Export' },
    { id: 'danger',      label: 'Danger Zone' },
  ];

  return (
    <>
      <ModalPortal>
      <div className="modal-overlay" onClick={onClose}>
        <div
          className="modal"
          style={{
            // Bumped 660 → 760 for more breathing room with ability scores + 2-col multiclass fields.
            maxWidth: 760,
            width: '100%',
            // .modal itself has no padding in the stylesheet (it expects
            // .modal-header/.modal-body/.modal-footer children). This component
            // renders content directly inside .modal, so padding lives here.
            padding: 'var(--sp-5) var(--sp-6) var(--sp-6)',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-4)' }}>
            <div>
              <h2>Character Settings</h2>
            </div>
            <button className="btn-ghost btn-sm" onClick={onClose}>Close</button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--c-border)', marginBottom: 'var(--sp-5)' }}>
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-xs)',
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  padding: 'var(--sp-2) var(--sp-4)', border: 'none',
                  borderBottom: tab === t.id ? '2px solid var(--c-gold)' : '2px solid transparent',
                  background: 'transparent',
                  color: tab === t.id ? 'var(--c-gold-l)'
                    : t.id === 'danger' ? 'var(--c-red-l)'
                    : 'var(--t-2)',
                  cursor: 'pointer', marginBottom: -1,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Edit Stats */}
          {tab === 'stats' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>

              {/* ── MASTER UNLOCK — gates everything in this tab ── */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-3) var(--sp-4)', border: '1px solid var(--c-gold-bdr)', borderRadius: 'var(--r-md)', background: 'rgba(201,146,42,0.06)' }}>
                <span style={{ fontSize: 18 }}>{character.advanced_edits_unlocked ? '🔓' : '🔒'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--c-gold-l)' }}>
                    Edit Stats {character.advanced_edits_unlocked ? 'unlocked' : 'locked'}
                  </div>
                  <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', marginTop: 2 }}>
                    {character.advanced_edits_unlocked
                      ? 'You can edit ability scores, AC, Max HP, Speed, Initiative bonus, and remove individual known spells. Re-lock to prevent accidental edits.'
                      : 'All editable fields below are read-only. Unlock to edit ability scores, combat stats, and remove known spells.'}
                  </div>
                </div>
                <button
                  className={character.advanced_edits_unlocked ? 'btn-secondary btn-sm' : 'btn-gold btn-sm'}
                  onClick={() => onUpdate({
                    advanced_edits_unlocked: !character.advanced_edits_unlocked,
                    // Keep spell-edits flag in sync with the master toggle (same semantics now)
                    advanced_spell_edits_unlocked: !character.advanced_edits_unlocked,
                  })}
                >
                  {character.advanced_edits_unlocked ? 'Lock' : 'Unlock'}
                </button>
              </div>

              <div style={{ opacity: character.advanced_edits_unlocked ? 1 : 0.55, pointerEvents: character.advanced_edits_unlocked ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
                <div className="section-header">Ability Scores</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
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

              <div style={{ opacity: character.advanced_edits_unlocked ? 1 : 0.55, pointerEvents: character.advanced_edits_unlocked ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
                <div className="section-header">Combat Stats</div>
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

              {/* ── Languages (user-added) ── */}
              <div style={{ opacity: character.advanced_edits_unlocked ? 1 : 0.55, pointerEvents: character.advanced_edits_unlocked ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
                <div className="section-header">Languages</div>
                <p style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', marginBottom: 'var(--sp-3)', lineHeight: 1.5 }}>
                  Add languages learned during play. Species-granted languages stay applied automatically — these are extras.
                </p>
                <ChipListEditor
                  label="Language"
                  items={character.extra_languages ?? []}
                  suggestions={LANGUAGE_SUGGESTIONS}
                  onChange={next => onUpdate({ extra_languages: next })}
                />
              </div>

              {/* ── Tool Proficiencies (user-added) ── */}
              <div style={{ opacity: character.advanced_edits_unlocked ? 1 : 0.55, pointerEvents: character.advanced_edits_unlocked ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
                <div className="section-header">Tool Proficiencies</div>
                <p style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', marginBottom: 'var(--sp-3)', lineHeight: 1.5 }}>
                  Add tool proficiencies gained during play. Background-granted tools stay applied automatically.
                </p>
                <ChipListEditor
                  label="Tool"
                  items={character.extra_tool_proficiencies ?? []}
                  suggestions={TOOL_SUGGESTIONS}
                  onChange={next => onUpdate({ extra_tool_proficiencies: next })}
                />
              </div>

              {/* ── v2.41.0: Damage Modifiers (user-edited) ── */}
              <div style={{ opacity: character.advanced_edits_unlocked ? 1 : 0.55, pointerEvents: character.advanced_edits_unlocked ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
                <div className="section-header">Damage Modifiers</div>
                <p style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', marginBottom: 'var(--sp-3)', lineHeight: 1.5 }}>
                  Track resistances, immunities, and vulnerabilities to damage types.
                  Species defaults (Tiefling fire, Dwarf poison, etc.) apply automatically and don't need to be added here.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
                  <div>
                    <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-xs)', color: '#4ade80', letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: 4 }}>Resistances <span style={{ fontWeight: 400, color: 'var(--t-3)', textTransform: 'none', letterSpacing: 0 }}>(half damage)</span></div>
                    <ChipListEditor
                      label="Resistance"
                      items={(character.damage_resistances ?? []).map(s => s.charAt(0).toUpperCase() + s.slice(1))}
                      suggestions={DAMAGE_TYPE_SUGGESTIONS}
                      onChange={next => onUpdate({ damage_resistances: next.map(s => s.toLowerCase()) })}
                    />
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-xs)', color: '#60a5fa', letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: 4 }}>Immunities <span style={{ fontWeight: 400, color: 'var(--t-3)', textTransform: 'none', letterSpacing: 0 }}>(no damage)</span></div>
                    <ChipListEditor
                      label="Immunity"
                      items={(character.damage_immunities ?? []).map(s => s.charAt(0).toUpperCase() + s.slice(1))}
                      suggestions={DAMAGE_TYPE_SUGGESTIONS}
                      onChange={next => onUpdate({ damage_immunities: next.map(s => s.toLowerCase()) })}
                    />
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-xs)', color: '#ef4444', letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: 4 }}>Vulnerabilities <span style={{ fontWeight: 400, color: 'var(--t-3)', textTransform: 'none', letterSpacing: 0 }}>(double damage)</span></div>
                    <ChipListEditor
                      label="Vulnerability"
                      items={(character.damage_vulnerabilities ?? []).map(s => s.charAt(0).toUpperCase() + s.slice(1))}
                      suggestions={DAMAGE_TYPE_SUGGESTIONS}
                      onChange={next => onUpdate({ damage_vulnerabilities: next.map(s => s.toLowerCase()) })}
                    />
                  </div>
                </div>
              </div>

              {/* ── v2.49.0: House rule — NAT 1/20 on saving throws ── */}
              <div style={{ opacity: character.advanced_edits_unlocked ? 1 : 0.55, pointerEvents: character.advanced_edits_unlocked ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
                <div className="section-header">House Rules</div>
                <label style={{
                  display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-3)',
                  padding: 'var(--sp-3)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)',
                  background: 'var(--c-raised)', cursor: character.advanced_edits_unlocked ? 'pointer' : 'not-allowed',
                }}>
                  <input
                    type="checkbox"
                    checked={character.nat_1_20_saves !== false}
                    onChange={e => onUpdate({ nat_1_20_saves: e.target.checked })}
                    style={{
                      // v2.63.0: explicit dimensions + flexShrink:0 to override the global
                      // input { width: 100% } rule which otherwise stretched the checkbox
                      // across the whole column and squeezed the label/description into a
                      // tiny right column wrapping every word. Width auto, fixed pixel size.
                      width: 18, height: 18, flexShrink: 0,
                      marginTop: 3, cursor: character.advanced_edits_unlocked ? 'pointer' : 'not-allowed',
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--t-1)', marginBottom: 2 }}>
                      Natural 1 & 20 on Saving Throws
                    </div>
                    <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', lineHeight: 1.5 }}>
                      When enabled: rolling a natural 1 on a saving throw is an automatic failure regardless of total, and a natural 20 is an automatic success.
                      Per RAW 5e, only attack rolls and death saves use this rule — many tables extend it to all saves. Currently applies to concentration saves; will extend to other saves in future versions.
                    </div>
                  </div>
                </label>
              </div>

              {/* ── v2.33 Deep Edits: Species / Background / Subclass swap ── */}
              <div style={{ marginTop: 'var(--sp-4)', padding: 'var(--sp-4)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', background: 'var(--c-raised)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginBottom: 'var(--sp-3)' }}>
                  <span style={{ fontSize: 18 }}>{character.advanced_deep_edits_unlocked ? '🔓' : '🔒'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--t-1)' }}>
                      Deep Edits {character.advanced_deep_edits_unlocked ? 'unlocked' : 'locked'}
                    </div>
                    <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', lineHeight: 1.5, marginTop: 2 }}>
                      {character.advanced_deep_edits_unlocked
                        ? 'You can swap species and background below. Retroactive changes affect derived stats.'
                        : 'Swap species and background on an existing character. Use carefully — other stats don\'t auto-adjust.'}
                    </div>
                  </div>
                  <button
                    className={character.advanced_deep_edits_unlocked ? 'btn-secondary btn-sm' : 'btn-gold btn-sm'}
                    onClick={() => onUpdate({ advanced_deep_edits_unlocked: !character.advanced_deep_edits_unlocked })}
                    style={{ fontSize: 11, whiteSpace: 'nowrap' }}
                  >
                    {character.advanced_deep_edits_unlocked ? 'Lock' : 'Unlock'}
                  </button>
                </div>

                {character.advanced_deep_edits_unlocked && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
                    {/* Species swap */}
                    <div>
                      <label style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--t-3)', marginBottom: 4, display: 'block' }}>
                        Species
                      </label>
                      <select
                        value={character.species}
                        onChange={e => {
                          const newSpecies = e.target.value;
                          const oldData = SPECIES.find(s => s.name === character.species);
                          const newData = SPECIES.find(s => s.name === newSpecies);
                          if (!newData) return;
                          // Confirm change — shows old vs new implications
                          const oldSummary = oldData
                            ? `${oldData.name} (size ${oldData.size}, speed ${oldData.speed}, ${oldData.traits.length} traits, languages: ${oldData.languages.join(', ')})`
                            : character.species;
                          const newSummary = `${newData.name} (size ${newData.size}, speed ${newData.speed}, ${newData.traits.length} traits, languages: ${newData.languages.join(', ')})`;
                          if (window.confirm(
                            `Change species?\n\nFrom: ${oldSummary}\nTo:   ${newSummary}\n\nYour displayed traits, languages, and darkvision will update immediately. Base speed on your sheet will not auto-adjust — edit Speed manually if needed.`
                          )) {
                            onUpdate({ species: newSpecies });
                          }
                        }}
                        style={{ fontSize: 'var(--fs-sm)', width: '100%' }}
                      >
                        {SPECIES.map(s => (
                          <option key={s.name} value={s.name}>
                            {s.name} — speed {s.speed}{s.darkvision > 0 ? `, darkvision ${s.darkvision}ft` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Background swap */}
                    <div>
                      <label style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--t-3)', marginBottom: 4, display: 'block' }}>
                        Background
                      </label>
                      <select
                        value={character.background}
                        onChange={e => {
                          const newBg = e.target.value;
                          const oldData = BACKGROUNDS.find((b: any) => b.name === character.background);
                          const newData = BACKGROUNDS.find((b: any) => b.name === newBg);
                          if (!newData) return;
                          const oldSummary = oldData
                            ? `${oldData.name} (skills: ${oldData.skill_proficiencies.join(', ')}${oldData.tool_proficiency ? ', tool: ' + oldData.tool_proficiency : ''})`
                            : character.background;
                          const newSummary = `${newData.name} (skills: ${newData.skill_proficiencies.join(', ')}${newData.tool_proficiency ? ', tool: ' + newData.tool_proficiency : ''})`;
                          if (window.confirm(
                            `Change background?\n\nFrom: ${oldSummary}\nTo:   ${newSummary}\n\nSkill/tool proficiencies and the background feature description update. Your skill_proficiencies array is NOT auto-rewritten — manually remove old background skills if they shouldn't carry over.`
                          )) {
                            onUpdate({ background: newBg });
                          }
                        }}
                        style={{ fontSize: 'var(--fs-sm)', width: '100%' }}
                      >
                        {BACKGROUNDS.map((b: any) => (
                          <option key={b.name} value={b.name}>
                            {b.name} — {b.skill_proficiencies.join(', ')}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Subclass swap(s) — handles primary and secondary independently */}
                    {(() => {
                      const isMulticlass = !!character.secondary_class && (character.secondary_level ?? 0) > 0;

                      function renderSubclassPicker(which: 'primary' | 'secondary') {
                        const className = which === 'primary' ? character.class_name : character.secondary_class!;
                        const classLevel = which === 'primary' ? character.level : (character.secondary_level ?? 0);
                        const currentSub = which === 'primary' ? (character.subclass ?? '') : (character.secondary_subclass ?? '');
                        const cls = CLASSES.find(c => c.name === className);
                        const options = cls?.subclasses ?? [];
                        const unlockLevel = options[0]?.unlock_level ?? 3;
                        const locked = classLevel < unlockLevel;

                        return (
                          <div key={which}>
                            <label style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--t-3)', marginBottom: 4, display: 'block' }}>
                              {isMulticlass ? `${className} subclass (${which})` : 'Subclass'}
                            </label>
                            <select
                              value={currentSub}
                              disabled={locked || options.length === 0}
                              onChange={e => {
                                const newSub = e.target.value;
                                if (newSub === currentSub) return;

                                // Compute old and new granted spell sets at the target class's current level
                                const oldGranted = currentSub
                                  ? getSubclassSpellIds(currentSub, className, classLevel)
                                  : [];
                                const newGranted = newSub
                                  ? getSubclassSpellIds(newSub, className, classLevel)
                                  : [];

                                const oldSpellNames = oldGranted.map(id => SPELL_MAP[id]?.name).filter(Boolean);
                                const newSpellNames = newGranted.map(id => SPELL_MAP[id]?.name).filter(Boolean);

                                const msg = [
                                  `Swap ${className} subclass?`,
                                  '',
                                  `From: ${currentSub || '(none)'}`,
                                  `To:   ${newSub || '(none)'}`,
                                  '',
                                  oldSpellNames.length
                                    ? `Removing auto-granted spells: ${oldSpellNames.join(', ')}`
                                    : 'No auto-granted spells to remove.',
                                  newSpellNames.length
                                    ? `Adding auto-granted spells: ${newSpellNames.join(', ')}`
                                    : 'No auto-granted spells to add.',
                                  '',
                                  'Features/abilities from the old subclass in your Features & Traits notes are NOT auto-removed — edit those manually. Choices tied to the old subclass (manoeuvres, totem spirits, etc.) are not reset either.',
                                ].join('\n');

                                if (!window.confirm(msg)) return;

                                // Rewrite known_spells: drop old granted, add new granted (dedup with existing)
                                const withoutOld = character.known_spells.filter(id => !oldGranted.includes(id));
                                const newKnown = [...new Set([...withoutOld, ...newGranted])];

                                // Also drop any old-granted entries from prepared_spells
                                const newPrepared = character.prepared_spells.filter(id => !oldGranted.includes(id));

                                const updates: Partial<Character> = {
                                  known_spells: newKnown,
                                  prepared_spells: newPrepared,
                                };
                                if (which === 'primary') updates.subclass = newSub;
                                else updates.secondary_subclass = newSub;

                                onUpdate(updates);
                              }}
                              style={{ fontSize: 'var(--fs-sm)', width: '100%' }}
                            >
                              <option value="">(none)</option>
                              {options.map((s: any) => (
                                <option key={s.name} value={s.name}>{s.name}</option>
                              ))}
                            </select>
                            {locked && (
                              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-3)', fontStyle: 'italic', marginTop: 4 }}>
                                Locked — this class reaches subclass unlock at level {unlockLevel}.
                              </div>
                            )}
                            {!locked && options.length === 0 && (
                              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-3)', fontStyle: 'italic', marginTop: 4 }}>
                                No subclasses defined for {className}.
                              </div>
                            )}
                          </div>
                        );
                      }

                      return (
                        <>
                          {renderSubclassPicker('primary')}
                          {isMulticlass && renderSubclassPicker('secondary')}
                        </>
                      );
                    })()}

                    {/* v2.33 Phase 3 — Class choice re-picks */}
                    {(() => {
                      const primaryCls = character.class_name;
                      const secondaryCls = character.secondary_class;
                      const relevantClasses = [primaryCls, ...(secondaryCls ? [secondaryCls] : [])];
                      const hasFightingStyle = relevantClasses.some(c => ['Fighter', 'Paladin', 'Ranger'].includes(c));
                      const hasMetamagic = relevantClasses.includes('Sorcerer');
                      const hasInvocations = relevantClasses.includes('Warlock');

                      if (!hasFightingStyle && !hasMetamagic && !hasInvocations) return null;

                      const classRes = (character.class_resources ?? {}) as Record<string, unknown>;
                      const currentFightingStyle = (classRes.fighting_style as string) ?? '';
                      const currentMetamagic = Array.isArray(classRes.metamagic) ? classRes.metamagic as string[] : [];
                      const currentInvocations = Array.isArray(classRes.invocations) ? classRes.invocations as string[] : [];

                      function updateClassResource(key: string, value: unknown) {
                        const next = { ...classRes, [key]: value } as typeof character.class_resources;
                        onUpdate({ class_resources: next });
                      }

                      function toggleArrayItem(key: 'metamagic' | 'invocations', name: string) {
                        const current = (classRes[key] as string[] | undefined) ?? [];
                        const next = current.includes(name)
                          ? current.filter(x => x !== name)
                          : [...current, name];
                        updateClassResource(key, next);
                      }

                      return (
                        <>
                          {/* Fighting Style */}
                          {hasFightingStyle && (
                            <div>
                              <label style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--t-3)', marginBottom: 4, display: 'block' }}>
                                Fighting Style
                              </label>
                              <select
                                value={currentFightingStyle}
                                onChange={e => updateClassResource('fighting_style', e.target.value)}
                                style={{ fontSize: 'var(--fs-sm)', width: '100%' }}
                              >
                                <option value="">(none)</option>
                                {FIGHTING_STYLE_OPTIONS.map(s => (
                                  <option key={s.id} value={s.name}>{s.name}</option>
                                ))}
                              </select>
                              {currentFightingStyle && (() => {
                                const desc = FIGHTING_STYLE_OPTIONS.find(s => s.name === currentFightingStyle)?.description;
                                return desc ? (
                                  <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-3)', marginTop: 4, lineHeight: 1.5 }}>
                                    {desc}
                                  </div>
                                ) : null;
                              })()}
                            </div>
                          )}

                          {/* Metamagic (Sorcerer) */}
                          {hasMetamagic && (
                            <div>
                              <label style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--t-3)', marginBottom: 4, display: 'block' }}>
                                Metamagic known
                                <span style={{ color: 'var(--t-3)', fontWeight: 400, marginLeft: 6 }}>
                                  ({currentMetamagic.length} selected)
                                </span>
                              </label>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {METAMAGIC_OPTIONS.map(m => {
                                  const active = currentMetamagic.includes(m.name);
                                  return (
                                    <button
                                      key={m.id}
                                      onClick={() => toggleArrayItem('metamagic', m.name)}
                                      style={{
                                        textAlign: 'left', padding: '8px 12px', borderRadius: 'var(--r-sm)',
                                        cursor: 'pointer', minHeight: 0,
                                        border: active ? '2px solid var(--c-gold)' : '1px solid var(--c-border)',
                                        background: active ? 'var(--c-gold-bg)' : 'var(--c-card)',
                                        color: active ? 'var(--c-gold-l)' : 'var(--t-1)',
                                      }}
                                    >
                                      <div style={{ fontSize: 12, fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                                        <span>{m.name}</span>
                                        <span style={{ color: 'var(--t-3)', fontWeight: 500, fontSize: 11 }}>
                                          {m.cost} pt{String(m.cost) !== '1' ? 's' : ''}
                                        </span>
                                      </div>
                                      <div style={{ fontSize: 11, color: 'var(--t-3)', marginTop: 2, lineHeight: 1.4 }}>
                                        {m.description}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Eldritch Invocations (Warlock) */}
                          {hasInvocations && (
                            <div>
                              <label style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--t-3)', marginBottom: 4, display: 'block' }}>
                                Eldritch Invocations
                                <span style={{ color: 'var(--t-3)', fontWeight: 400, marginLeft: 6 }}>
                                  ({currentInvocations.length} selected)
                                </span>
                              </label>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {WARLOCK_INVOCATIONS.map(inv => {
                                  const active = currentInvocations.includes(inv.name);
                                  return (
                                    <button
                                      key={inv.id}
                                      onClick={() => toggleArrayItem('invocations', inv.name)}
                                      style={{
                                        textAlign: 'left', padding: '8px 12px', borderRadius: 'var(--r-sm)',
                                        cursor: 'pointer', minHeight: 0,
                                        border: active ? '2px solid var(--c-gold)' : '1px solid var(--c-border)',
                                        background: active ? 'var(--c-gold-bg)' : 'var(--c-card)',
                                        color: active ? 'var(--c-gold-l)' : 'var(--t-1)',
                                      }}
                                    >
                                      <div style={{ fontSize: 12, fontWeight: 700, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                        <span>{inv.name}</span>
                                        {inv.prereq && (
                                          <span style={{ color: 'var(--t-3)', fontWeight: 500, fontSize: 10, whiteSpace: 'nowrap' }}>
                                            {inv.prereq}
                                          </span>
                                        )}
                                      </div>
                                      <div style={{ fontSize: 11, color: 'var(--t-3)', marginTop: 2, lineHeight: 1.4 }}>
                                        {inv.description}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}

                    {/* Features by Level — read-only reference */}
                    {(() => {
                      const primaryProg = CLASS_LEVEL_PROGRESSION[character.class_name] ?? [];
                      const primaryFeatures = primaryProg
                        .filter((m: any) => m.level <= character.level && (m.features?.length > 0))
                        .flatMap((m: any) => m.features.map((f: string) => ({ level: m.level, class: character.class_name, feature: f })));

                      const secondaryProg = character.secondary_class ? (CLASS_LEVEL_PROGRESSION[character.secondary_class] ?? []) : [];
                      const secondaryFeatures = secondaryProg
                        .filter((m: any) => m.level <= (character.secondary_level ?? 0) && (m.features?.length > 0))
                        .flatMap((m: any) => m.features.map((f: string) => ({ level: m.level, class: character.secondary_class!, feature: f })));

                      const allFeatures = [...primaryFeatures, ...secondaryFeatures].sort((a, b) => a.level - b.level);
                      if (allFeatures.length === 0) return null;

                      return (
                        <details style={{ borderTop: '1px solid var(--c-border)', paddingTop: 'var(--sp-3)' }}>
                          <summary style={{ cursor: 'pointer', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--t-2)' }}>
                            Features by level ({allFeatures.length})
                          </summary>
                          <div style={{ marginTop: 'var(--sp-2)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {allFeatures.map((f, i) => (
                              <div key={i} style={{ display: 'grid', gridTemplateColumns: '50px 80px 1fr', gap: 8, padding: '3px 6px', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
                                <span style={{ fontFamily: 'var(--ff-stat)', color: 'var(--c-gold-l)', fontWeight: 700 }}>Lvl {f.level}</span>
                                <span style={{ color: 'var(--t-3)', fontWeight: 500 }}>{f.class}</span>
                                <span>{f.feature}</span>
                              </div>
                            ))}
                          </div>
                        </details>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Multiclass section removed in v2.32 — multiclass is now handled
                  via the Level-Up Wizard's class picker step. */}
            </div>
          )}

          {/* Level Up */}
          {tab === 'levelup' && (
            <div>
              {character.level >= 20 ? (
                <div style={{ padding: 'var(--sp-8)', textAlign: 'center' }}>
                  <p style={{ color: 'var(--c-gold-l)', fontFamily: 'var(--ff-body)', fontWeight: 700, marginBottom: 'var(--sp-2)' }}>
                    Level 20
                  </p>
                  <p style={{ color: 'var(--t-2)', fontSize: 'var(--fs-sm)' }}>
                    This character has reached the pinnacle of adventuring power.
                  </p>
                </div>
              ) : (
                <div>
                  <p style={{ color: 'var(--t-2)', fontSize: 'var(--fs-sm)', marginBottom: 'var(--sp-4)', lineHeight: 1.6 }}>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
              <div style={{ padding: 'var(--sp-4)', border: '1px solid var(--c-gold-bdr)', borderRadius: 'var(--r-md)', background: 'rgba(201,146,42,0.06)' }}>
                <p style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--c-gold-l)', marginBottom: 'var(--sp-2)' }}>
                  Print / Save as PDF
                </p>
                <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', marginBottom: 'var(--sp-4)', lineHeight: 1.6 }}>
                  Print your character sheet or save it as a PDF using your browser's print dialog. Use "Save as PDF" in the print destination for a digital copy.
                </p>
                <button
                  className="btn-gold"
                  onClick={() => {
                    onClose();
                    setTimeout(() => window.print(), 300);
                  }}
                >
                  Print Character Sheet
                </button>
              </div>

              <div style={{ padding: 'var(--sp-4)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', background: '#080d14' }}>
                <p style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--t-1)', marginBottom: 'var(--sp-2)' }}>
                  Share Link
                </p>
                <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', marginBottom: 'var(--sp-4)', lineHeight: 1.6 }}>
                  Generate a public read-only link anyone can view without an account.
                </p>
                {character.share_enabled && character.share_token ? (
                  <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                    <input
                      readOnly
                      value={`${window.location.origin}/share/${character.share_token}`}
                      style={{ flex: 1, fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}
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
                      style={{ color: 'var(--c-red-l)', fontSize: 'var(--fs-xs)' }}
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

          {/* Automations */}
          {tab === 'automations' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
              <div style={{ padding: 'var(--sp-3) var(--sp-4)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', background: 'var(--c-surface-1)' }}>
                <p style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', color: 'var(--t-2)', lineHeight: 1.6 }}>
                  Your DM sets automation defaults for this campaign. Unlock custom automations to override them on this character only.
                </p>
              </div>

              {/* Unlock toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-3) var(--sp-4)', border: '1px solid var(--c-gold-bdr)', borderRadius: 'var(--r-md)', background: 'rgba(201,146,42,0.06)' }}>
                <span style={{ fontSize: 18 }}>{character.advanced_automations_unlocked ? '🔓' : '🔒'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--c-gold-l)' }}>
                    Custom automations {character.advanced_automations_unlocked ? 'unlocked' : 'locked'}
                  </div>
                  <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', marginTop: 2 }}>
                    {character.advanced_automations_unlocked
                      ? 'This character uses your per-setting overrides below. Remove an override to fall back to the DM default.'
                      : 'This character follows the DM campaign defaults. Unlock to override per-automation.'}
                  </div>
                </div>
                <button
                  className={character.advanced_automations_unlocked ? 'btn-secondary btn-sm' : 'btn-gold btn-sm'}
                  onClick={() => onUpdate({ advanced_automations_unlocked: !character.advanced_automations_unlocked })}
                >
                  {character.advanced_automations_unlocked ? 'Lock' : 'Unlock'}
                </button>
              </div>

              {/* Per-automation rows */}
              {AUTOMATIONS.map(auto => {
                const campaignDefault = activeCampaign?.automation_defaults?.[auto.key];
                const override = character.automation_overrides?.[auto.key];
                const effective = resolveAutomation(auto.key, character, activeCampaign);
                const unlocked = character.advanced_automations_unlocked;
                return (
                  <div key={auto.key} style={{ padding: 'var(--sp-4)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', background: 'var(--c-surface-1)' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-2)', marginBottom: 'var(--sp-2)' }}>
                      <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--t-1)' }}>
                        {auto.label}
                      </span>
                      <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-3)', marginLeft: 'auto' }}>
                        Effective: <strong style={{ color: 'var(--c-gold-l)' }}>{labelForValue(effective)}</strong>
                      </span>
                    </div>
                    <p style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', lineHeight: 1.6, marginBottom: 'var(--sp-3)' }}>
                      {auto.description}
                    </p>
                    <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-3)', marginBottom: 'var(--sp-2)' }}>
                      DM default: <strong>{campaignDefault ? labelForValue(campaignDefault) : `${labelForValue(auto.default)} (built-in)`}</strong>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap', opacity: unlocked ? 1 : 0.5 }}>
                      {auto.allowed.map(v => {
                        const selected = override === v;
                        return (
                          <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', border: `1px solid ${selected ? 'var(--c-gold)' : 'var(--c-border)'}`, borderRadius: 'var(--r-sm)', cursor: unlocked ? 'pointer' : 'not-allowed', background: selected ? 'rgba(201,146,42,0.12)' : 'transparent' }}>
                            <input
                              type="radio"
                              name={`override-${auto.key}`}
                              checked={selected}
                              disabled={!unlocked}
                              onChange={() => setAutomationOverride(auto.key, v)}
                            />
                            <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 700, color: selected ? 'var(--c-gold-l)' : 'var(--t-2)' }}>
                              {labelForValue(v)}
                            </span>
                          </label>
                        );
                      })}
                      {override && unlocked && (
                        <button className="btn-ghost btn-sm" onClick={() => setAutomationOverride(auto.key, null)} style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-3)' }}>
                          Clear override
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Danger Zone */}
          {tab === 'danger' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>

              {/* Share character sheet */}
              <div style={{ padding: 'var(--sp-4)', border: '1px solid var(--c-gold-bdr)', borderRadius: 'var(--r-md)', background: 'rgba(201,146,42,0.06)' }}>
                <p style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--c-gold-l)', marginBottom: 'var(--sp-2)' }}>
                  Share Character Sheet
                </p>
                <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', marginBottom: 'var(--sp-3)', lineHeight: 1.6 }}>
                  Generate a public read-only link to share your character with anyone — no account required.
                </p>
                {character.share_enabled && character.share_token ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                    <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
                      <input
                        readOnly
                        value={`${window.location.origin}/share/${character.share_token}`}
                        style={{ flex: 1, fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}
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
                      style={{ alignSelf: 'flex-start', color: 'var(--c-red-l)', fontSize: 'var(--fs-xs)' }}
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
              <div style={{ padding: 'var(--sp-4)', border: '1px solid rgba(107,20,20,1)', borderRadius: 'var(--r-md)', background: 'rgba(127,29,29,0.1)' }}>
                <p style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: '#fca5a5', marginBottom: 'var(--sp-2)' }}>
                  Delete Character
                </p>
                <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', marginBottom: 'var(--sp-4)', lineHeight: 1.6 }}>
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
                  <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center' }}>
                    <p style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: '#fca5a5', flex: 1 }}>
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
      </ModalPortal>

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
