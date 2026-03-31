import { useState, useCallback, useMemo, useEffect, useRef, type ReactNode } from 'react';
import type { Character, ConditionName, InventoryItem, SpellSlots, NoteField, ActiveBuff } from '../../types';
import { computeStats, abilityModifier, rollDie } from '../../lib/gameUtils';
import { updateCharacter } from '../../lib/supabase';
import { useDebouncedCallback } from '../../lib/useDebounce';
import { SPELL_MAP, SPELLS } from '../../data/spells';
import { CLASS_MAP } from '../../data/classes';
import { getCharacterResources, buildDefaultResources } from '../../data/classResources';

import CharacterHeader from './CharacterHeader';
import AbilityScores from './AbilityScores';
import CombatStats from './CombatStats';
import SkillsList from './SkillsList';
import SpellSlotsPanel from './SpellSlots';
import SpellCastButton from './SpellCastButton';
import ConditionsPanel from './ConditionsPanel';
import Inventory from './Inventory';
import Notes from './Notes';
import DeathSaves from './DeathSaves';
import CharacterSettings from './CharacterSettings';
import FeaturesPanel from './FeaturesPanel';
import SessionTab from './SessionTab';
import QuickRoll from './QuickRoll';
import AvatarPicker from '../shared/AvatarPicker';
import WeaponsTracker from './WeaponsTracker';
import RollHistory from './RollHistory';
import ActiveBuffsPanel from './ActiveBuffsPanel';
import LevelUpWizard from './LevelUpWizard';
import SpellsTab from './SpellsTab';
import ConditionMechanics from './ConditionMechanics';
import ActionLog from '../shared/ActionLog';
import WildshapeTracker from './WildshapeTracker';
import ClassResourcesPanel from './ClassResourcesPanel';
import MagicItemBrowser from '../shared/MagicItemBrowser';
import { useKeyboardShortcuts } from '../../lib/useKeyboardShortcuts';

type Tab = 'abilities' | 'spells' | 'combat' | 'bio' | 'history' | 'session';

const TABS: { id: Tab; label: string }[] = [
  { id: 'abilities', label: '⚔ Abilities' },
  { id: 'spells',    label: '✨ Spells' },
  { id: 'combat',    label: '🗡 Combat' },
  { id: 'bio',       label: '📖 Bio' },
  { id: 'history',   label: '🎲 History' },
  { id: 'session',   label: '⚡ Session' },
];

const LEVEL_LABELS: Record<number, string> = {
  0: 'Cantrip', 1: '1st', 2: '2nd', 3: '3rd', 4: '4th',
  5: '5th', 6: '6th', 7: '7th', 8: '8th', 9: '9th',
};

interface CharacterSheetProps {
  initialCharacter: Character;
  realtimeEnabled?: boolean;
  isPro?: boolean;
  userId?: string;
}

export default function CharacterSheet({ initialCharacter, realtimeEnabled: _realtimeEnabled = false, isPro = false, userId = '' }: CharacterSheetProps) {
  const [character, setCharacter] = useState<Character>(initialCharacter);
  const [activeTab, setActiveTab] = useState<Tab>('abilities');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showRest, setShowRest] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [concentrationSpellId, setConcentrationSpellId] = useState<string | null>(null);

  // Keyboard shortcuts: R = rest, I = inspiration
  useKeyboardShortcuts({
    onRest: () => setShowRest(v => !v),
    onInspiration: () => applyUpdate({ inspiration: !character.inspiration }, true),
  });

  const computed = useMemo(() => computeStats(character), [character]);

  // ------------------------------------------------------------------
  // Debounced Supabase persist — accumulate patches, flush after 800ms
  // ------------------------------------------------------------------
  const pendingRef = useRef<Partial<Character>>({});
  const isSavingRef = useRef(false);

  const flushToSupabase = useCallback(async () => {
    if (isSavingRef.current) return;
    const patch = { ...pendingRef.current };
    if (Object.keys(patch).length === 0) return;
    pendingRef.current = {};
    isSavingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const { error } = await updateCharacter(character.id, patch);
      if (error) setSaveError(error.message);
    } catch {
      setSaveError('Save failed — check your connection.');
    } finally {
      isSavingRef.current = false;
      setSaving(false);
    }
  }, [character.id]);

  const debouncedFlush = useDebouncedCallback(flushToSupabase, 800);

  // Flush any pending writes on unmount
  useEffect(() => () => { flushToSupabase(); }, [flushToSupabase]);

  function applyUpdate(partial: Partial<Character>, immediate = false) {
    setCharacter(prev => ({ ...prev, ...partial }));
    pendingRef.current = { ...pendingRef.current, ...partial };
    if (immediate) flushToSupabase();
    else debouncedFlush();
  }

  // ------------------------------------------------------------------
  // Handlers
  // ------------------------------------------------------------------
  function handleUpdateHP(current_hp: number, temp_hp: number) {
    applyUpdate({ current_hp, temp_hp }, true);
  }
  function handleUpdateSlots(spell_slots: SpellSlots) {
    applyUpdate({ spell_slots }, true);
  }
  function handleUpdateConditions(active_conditions: ConditionName[]) {
    applyUpdate({ active_conditions }, true);
  }
  function handleUpdateInventory(inventory: InventoryItem[]) {
    applyUpdate({ inventory });
  }
  function handleUpdateNote(field: NoteField, value: string) {
    applyUpdate({ [field]: value }); // debounced — user is typing
  }
  function handleLevelUp(updates: Partial<Character>) {
    applyUpdate(updates, true);
  }

  // Short rest: roll hit dice to recover HP
  const [shortRestHpGained, setShortRestHpGained] = useState(0);

  function rollHitDie() {
    const cls = CLASS_MAP[character.class_name];
    if (!cls) return;
    const hitDie = cls.hit_die;
    const conMod = abilityModifier(character.constitution);
    const roll = rollDie(hitDie);
    const gained = Math.max(1, roll + conMod);
    const newHp = Math.min(character.max_hp, character.current_hp + gained);
    const newSpent = (character.hit_dice_spent ?? 0) + 1;
    setShortRestHpGained(prev => prev + (newHp - character.current_hp));
    applyUpdate({ current_hp: newHp, hit_dice_spent: newSpent }, true);
  }

  function finishShortRest() {
    const newSlots = character.class_name === 'Warlock'
      ? Object.fromEntries(Object.entries(character.spell_slots).map(([k, s]) => [k, { ...(s as object), used: 0 }]))
      : character.spell_slots;

    // Recover short-rest class resources
    const abilityScores = { strength: character.strength, dexterity: character.dexterity, constitution: character.constitution, intelligence: character.intelligence, wisdom: character.wisdom, charisma: character.charisma };
    const allResources = getCharacterResources(character.class_name, character.level, abilityScores);
    const shortRestIds = allResources.filter(r => r.recovery === 'short').map(r => r.id);
    const newResources = { ...(character.class_resources ?? {}) };
    for (const id of shortRestIds) {
      const def = allResources.find(r => r.id === id);
      if (def) newResources[id] = def.getMax(character.level, abilityScores);
    }

    applyUpdate({ spell_slots: newSlots, class_resources: newResources }, true);
    setShortRestHpGained(0);
    setShowRest(false);
  }

  function doLongRest() {
    const recoveredSlots = Object.fromEntries(
      Object.entries(character.spell_slots).map(([k, s]) => [k, { ...(s as object), used: 0 }])
    ) as typeof character.spell_slots;
    const recoveredHD = Math.max(1, Math.floor(character.level / 2));
    const newSpent = Math.max(0, (character.hit_dice_spent ?? 0) - recoveredHD);

    // Recover ALL class resources on long rest
    const abilityScores = { strength: character.strength, dexterity: character.dexterity, constitution: character.constitution, intelligence: character.intelligence, wisdom: character.wisdom, charisma: character.charisma };
    const newResources = buildDefaultResources(character.class_name, character.level, abilityScores);

    applyUpdate({
      current_hp: character.max_hp,
      temp_hp: 0,
      spell_slots: recoveredSlots,
      active_conditions: character.active_conditions.filter(c => c !== 'Exhaustion'),
      death_saves_successes: 0,
      death_saves_failures: 0,
      hit_dice_spent: newSpent,
      class_resources: newResources,
    }, true);
    setConcentrationSpellId(null);
    setShortRestHpGained(0);
    setShowRest(false);
  }

  // ------------------------------------------------------------------
  // Derived
  // ------------------------------------------------------------------
  const hasSpellSlots = Object.values(character.spell_slots).some((s: any) => s.total > 0);
  const allSpellIds = [...new Set([...character.known_spells, ...character.prepared_spells])];
  const knownSpellData = allSpellIds
    .map(id => SPELL_MAP[id])
    .filter(Boolean)
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

  // Max spell level this character can cast based on their slots
  const maxSpellLevel = Object.keys(character.spell_slots).reduce((max, k) => {
    const lvl = parseInt(k, 10);
    return character.spell_slots[k].total > 0 ? Math.max(max, lvl) : max;
  }, 0);

  // All spells available to this class at this level (not yet added)
  const availableSpells = SPELLS.filter(spell =>
    spell.classes.includes(character.class_name) &&
    (spell.level === 0 || spell.level <= maxSpellLevel) &&
    !allSpellIds.includes(spell.id)
  ).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

      <CharacterHeader
        character={character}
        computed={computed}
        onOpenSettings={() => setShowSettings(true)}
        onUpdateXP={xp => applyUpdate({ experience_points: xp })}
        onOpenAvatarPicker={() => setShowAvatarPicker(true)}
        onToggleInspiration={() => applyUpdate({ inspiration: !character.inspiration }, true)}
        onOpenRest={() => setShowRest(true)}
        onUpdateHP={delta => {
            const newHP = Math.max(0, Math.min(character.max_hp, character.current_hp + delta));
            handleUpdateHP(newHP, character.temp_hp);
          }}
      />

      {/* Avatar picker */}
      {showAvatarPicker && (
        <AvatarPicker
          currentSeed={null}
          characterName={character.name}
          onSelect={url => applyUpdate({ avatar_url: url }, true)}
          onClose={() => setShowAvatarPicker(false)}
        />
      )}

      {/* Character settings modal — level up, edit stats, delete */}
      {showSettings && (
        <CharacterSettings
          character={character}
          onUpdate={u => applyUpdate(u, true)}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Concentration banner */}
      {concentrationSpellId && (() => {
        const spell = SPELL_MAP[concentrationSpellId];
        return spell ? (
          <div className="animate-fade-in" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: 'var(--space-3) var(--space-4)',
            background: 'rgba(167,139,250,0.08)',
            border: '1px solid rgba(167,139,250,0.4)',
            borderRadius: 'var(--radius-md)',
            gap: 'var(--space-3)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <span style={{ fontSize: 18 }}>🔮</span>
              <div>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-sm)', color: '#a78bfa' }}>
                  Concentrating: {spell.name}
                </div>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  {spell.duration} · Taking damage requires a CON save (DC 10 or half damage taken)
                </div>
              </div>
            </div>
            <button
              onClick={() => setConcentrationSpellId(null)}
              className="btn-secondary btn-sm"
              style={{ flexShrink: 0, borderColor: 'rgba(167,139,250,0.4)', color: '#a78bfa' }}
            >
              Drop
            </button>
          </div>
        ) : null;
      })()}

      {/* Wildshape banner (Druids only) */}
      {character.class_name === 'Druid' && character.wildshape_active && (() => {
        const hpPct = character.wildshape_max_hp > 0 ? (character.wildshape_current_hp ?? 0) / character.wildshape_max_hp : 0;
        const hpColor = hpPct > 0.5 ? 'var(--hp-full)' : hpPct > 0.25 ? 'var(--hp-mid)' : 'var(--hp-low)';
        return (
          <div className="animate-fade-in" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: 'var(--space-3) var(--space-4)',
            background: 'rgba(22,163,74,0.08)',
            border: '1px solid rgba(22,163,74,0.4)',
            borderRadius: 'var(--radius-md)',
            gap: 'var(--space-3)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 18 }}>🐾</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--hp-full)', marginBottom: 4 }}>
                  Wildshape: {character.wildshape_beast_name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-md)', color: hpColor }}>
                    {character.wildshape_current_hp ?? 0}/{character.wildshape_max_hp} HP
                  </span>
                  <div style={{ flex: 1 }}>
                    <div className="hp-bar-container" style={{ height: 4 }}>
                      <div className="hp-bar-fill" style={{ width: `${Math.max(0, hpPct * 100)}%`, background: hpColor }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={() => applyUpdate({ wildshape_active: false, wildshape_beast_name: '', wildshape_current_hp: 0, wildshape_max_hp: 0 }, true)}
              className="btn-secondary btn-sm"
              style={{ flexShrink: 0, borderColor: 'rgba(22,163,74,0.4)', color: 'var(--hp-full)' }}
            >
              Drop Form
            </button>
          </div>
        );
      })()}

      {/* Rest modal */}
      {showRest && (
        <div className="modal-overlay" onClick={() => { setShortRestHpGained(0); setShowRest(false); }}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: 'var(--space-2)' }}>Take a Rest</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>

              {/* Short rest panel */}
              <div className="panel">
                <h4 style={{ marginBottom: 'var(--space-3)' }}>Short Rest</h4>

                {/* Hit dice status */}
                {(() => {
                  const cls = CLASS_MAP[character.class_name];
                  const hitDie = cls?.hit_die ?? 8;
                  const spent = character.hit_dice_spent ?? 0;
                  const available = Math.max(0, character.level - spent);
                  const conMod = abilityModifier(character.constitution);
                  const atMax = character.current_hp >= character.max_hp;

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 2 }}>
                            Hit Dice Available
                          </div>
                          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-lg)', color: available > 0 ? 'var(--text-gold)' : 'var(--text-muted)' }}>
                            {available} / {character.level} d{hitDie}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 2 }}>
                            Current HP
                          </div>
                          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-lg)', color: 'var(--text-primary)' }}>
                            {character.current_hp} / {character.max_hp}
                          </div>
                        </div>
                      </div>

                      {shortRestHpGained > 0 && (
                        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)', color: 'var(--hp-full)', textAlign: 'center' }}>
                          +{shortRestHpGained} HP recovered this rest
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                        <button
                          className="btn-gold"
                          onClick={rollHitDie}
                          disabled={available === 0 || atMax}
                          style={{ flex: 1, justifyContent: 'center' }}
                          title={available === 0 ? 'No hit dice remaining' : atMax ? 'Already at max HP' : `Roll 1d${hitDie}${conMod >= 0 ? '+' : ''}${conMod} to recover HP`}
                        >
                          Roll Hit Die (d{hitDie}{conMod >= 0 ? '+' : ''}{conMod})
                        </button>
                        <button
                          className="btn-secondary"
                          onClick={finishShortRest}
                          title="End short rest"
                        >
                          Done
                        </button>
                      </div>

                      {character.class_name === 'Warlock' && (
                        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-gold)', fontFamily: 'var(--font-heading)' }}>
                          Pact Magic slots will be recovered when you finish this rest.
                        </p>
                      )}

                      {available === 0 && (
                        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-heading)' }}>
                          No hit dice remaining. Take a long rest to recover them.
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Long rest panel */}
              <div className="panel">
                <h4 style={{ marginBottom: 'var(--space-2)' }}>Long Rest</h4>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-3)', lineHeight: 1.5 }}>
                  8+ hours. Regain all HP, all spell slots, and half your spent hit dice (min 1).
                  Removes one level of Exhaustion.
                </p>
                <button className="btn-gold" onClick={doLongRest} style={{ width: '100%', justifyContent: 'center' }}>
                  Take Long Rest
                </button>
              </div>
            </div>

            <button
              className="btn-ghost btn-sm"
              onClick={() => { setShortRestHpGained(0); setShowRest(false); }}
              style={{ marginTop: 'var(--space-4)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Toolbar row: save status + rest */}
      <div style={{ height: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {saving && (
            <>
              <span className="spinner" style={{ width: 12, height: 12 }} />
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
                Saving...
              </span>
            </>
          )}
          {saveError && !saving && (
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--color-crimson-bright)' }}>
              {saveError}
            </span>
          )}
        </div>
        <button className="btn-secondary btn-sm" onClick={() => setShowRest(true)}>
          Rest
        </button>
      </div>

      {/* Active conditions banner */}
      {character.active_conditions.length > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)',
          padding: 'var(--space-3)', background: 'rgba(155,28,28,0.08)',
          border: '1px solid rgba(155,28,28,0.3)', borderRadius: 'var(--radius-md)',
        }}>
          <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#fca5a5', alignSelf: 'center' }}>
            Conditions:
          </span>
          {character.active_conditions.map(c => (
            <span key={c} className="condition-pill">{c}</span>
          ))}
        </div>
      )}

      {/* Concentration banner */}
      {concentrationSpellId && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
          padding: 'var(--space-3) var(--space-4)',
          background: 'rgba(201,146,42,0.06)', border: '1px solid rgba(201,146,42,0.3)',
          borderRadius: 'var(--radius-md)',
        }}>
          <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-gold)' }}>
            Concentrating:
          </span>
          <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)', color: 'var(--text-primary)', flex: 1 }}>
            {SPELL_MAP[concentrationSpellId]?.name ?? concentrationSpellId}
          </span>
          <button className="btn-ghost btn-sm" onClick={() => setConcentrationSpellId(null)}
            style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ash)' }}>
            End
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.id === 'spells' && allSpellIds.length > 0 && (
              <span style={{ marginLeft: 4, fontSize: 10, background: 'rgba(201,146,42,0.2)', color: 'var(--text-gold)', padding: '1px 5px', borderRadius: 9, fontFamily: 'var(--font-heading)' }}>
                {allSpellIds.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div key={activeTab} className="animate-fade-in">

        {/* ── ABILITIES: Stats + Skills merged ── */}
        {activeTab === 'abilities' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 'var(--space-6)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
              <AbilityScores character={character} computed={computed} />
              <DeathSaves character={character} onUpdate={u => applyUpdate(u, true)} />
              <SkillsList character={character} computed={computed} onUpdate={u => applyUpdate(u, true)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
              <CombatStats character={character} computed={computed} onUpdateHP={handleUpdateHP} />
              <ConditionsPanel character={character} onUpdateConditions={handleUpdateConditions} />
              <ConditionMechanics conditions={character.active_conditions} />
              {hasSpellSlots && <SpellSlotsPanel character={character} onUpdateSlots={handleUpdateSlots} />}
            </div>
          </div>
        )}

        {/* ── SPELLS ── */}
        {activeTab === 'spells' && (
          <SpellsTab
            character={character}
            computed={computed}
            knownSpellData={knownSpellData}
            availableSpells={availableSpells}
            maxSpellLevel={maxSpellLevel}
            concentrationSpellId={concentrationSpellId}
            hasSpellSlots={hasSpellSlots}
            onUpdateSlots={handleUpdateSlots}
            onAddSpell={id => applyUpdate({ known_spells: [...character.known_spells, id] }, true)}
            onRemoveSpell={id => {
              if (concentrationSpellId === id) setConcentrationSpellId(null);
              applyUpdate({ known_spells: character.known_spells.filter(x => x !== id), prepared_spells: character.prepared_spells.filter(x => x !== id) }, true);
            }}
            onTogglePrepared={id => {
              const is = character.prepared_spells.includes(id);
              applyUpdate({ prepared_spells: is ? character.prepared_spells.filter(x => x !== id) : [...character.prepared_spells, id] }, true);
            }}
            onConcentrate={id => setConcentrationSpellId(concentrationSpellId === id ? null : id)}
            userId={userId}
            campaignId={character.campaign_id}
          />
        )}

        {/* ── COMBAT: Weapons + Inventory + Magic Items ── */}
        {activeTab === 'combat' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)', maxWidth: 720 }}>
            <div>
              <div className="section-header">Weapons & Attacks</div>
              {(!character.weapons || character.weapons.length === 0) && (
                <div style={{ padding: 'var(--space-4)', background: 'var(--bg-sunken)', border: '1px dashed var(--border-dim)', borderRadius: 'var(--radius-lg)', textAlign: 'center', marginBottom: 'var(--space-3)' }}>
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: 0 }}>
                    ⚔️ No weapons added yet. Add your weapons to roll attacks directly from your sheet.
                  </p>
                </div>
              )}
              <WeaponsTracker weapons={character.weapons ?? []} onUpdate={weapons => applyUpdate({ weapons })} characterId={userId} characterName={character.name} campaignId={character.campaign_id} />
            </div>
            <div>
              <div className="section-header">Inventory</div>
              <Inventory character={character} onUpdateInventory={handleUpdateInventory} onUpdateCurrency={currency => applyUpdate({ currency })} />
            </div>
            <div>
              <div className="section-header">
                Magic Items
                <span style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginLeft: 'var(--space-2)', textTransform: 'none', letterSpacing: 0 }}>
                  — Browse SRD items and add to inventory
                </span>
              </div>
              <MagicItemBrowser
                compact
                onAddToInventory={item => handleUpdateInventory([...(character.inventory ?? []), item])}
              />
            </div>
          </div>
        )}

        {/* ── BIO: Features + Notes merged ── */}
        {activeTab === 'bio' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 'var(--space-6)', maxWidth: 900 }}>
            <div>
              <div className="section-header">Features & Traits</div>
              <FeaturesPanel character={character} onUpdateNotes={notes => applyUpdate({ features_text: notes }, true)} />
            </div>
            <div>
              <div className="section-header">Notes & Personality</div>
              <Notes character={character} onUpdate={handleUpdateNote} />
            </div>
          </div>
        )}

        {/* ── HISTORY: Roll log + Action log merged ── */}
        {activeTab === 'history' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 'var(--space-6)', maxWidth: 1100 }}>
            <div>
              <div className="section-header">Roll History</div>
              <RollHistory characterId={character.id} userId={userId} compact />
            </div>
            <div>
              <div className="section-header">Action Log</div>
              <ActionLog campaignId={character.campaign_id} characterId={character.id} mode={character.campaign_id ? 'campaign' : 'character'} maxHeight={560} />
            </div>
          </div>
        )}

        {/* ── SESSION ── */}
        {activeTab === 'session' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            {/* Active Buffs & Debuffs */}
            <ActiveBuffsPanel
              buffs={(character as any).active_buffs ?? []}
              onAddBuff={buff => {
                const current = (character as any).active_buffs ?? [];
                applyUpdate({ active_buffs: [...current, buff] } as any, true);
              }}
              onRemoveBuff={id => {
                const current = (character as any).active_buffs ?? [];
                applyUpdate({ active_buffs: current.filter((b: ActiveBuff) => b.id !== id) } as any, true);
              }}
              onTickDown={() => {
                const current = (character as any).active_buffs ?? [];
                const updated = current
                  .map((b: ActiveBuff) => b.duration < 0 ? b : { ...b, duration: b.duration - 1 })
                  .filter((b: ActiveBuff) => b.duration < 0 || b.duration > 0);
                applyUpdate({ active_buffs: updated } as any, true);
              }}
            />

            {/* Class resources */}
            <div>
              <div className="section-header">Class Resources — {character.class_name}</div>
              <ClassResourcesPanel
                character={character}
                onUpdate={resources => applyUpdate({ class_resources: resources }, true)}
              />
            </div>

            {character.class_name === 'Druid' && (
              <div>
                <div className="section-header">Wildshape</div>
                <WildshapeTracker
                  character={character}
                  onUpdate={u => applyUpdate(u, true)}
                />
              </div>
            )}

            {/* Level up button */}
            {character.level < 20 && (
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 'var(--space-2)' }}>
                <button
                  className="btn-gold"
                  onClick={() => setShowLevelUp(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
                >
                  ✨ Level Up to {character.class_name} {character.level + 1}
                </button>
              </div>
            )}

            <SessionTab character={character} isPro={isPro} userId={userId} />
          </div>
        )}
      </div>

      {/* Level Up Wizard */}
      {showLevelUp && (
        <LevelUpWizard
          character={character}
          onLevelUp={updates => applyUpdate(updates, true)}
          onClose={() => setShowLevelUp(false)}
        />
      )}

      {/* Quick Roll floating dice roller */}
      <QuickRoll
        characterId={userId}
        characterName={character.name}
        campaignId={character.campaign_id}
      />
    </div>
  );
}

// ------------------------------------------------------------------
// SpellRow
// ------------------------------------------------------------------
function SpellRow({
  spell, isPrepared, isConcentrating, castButton, onTogglePrepared, onConcentrate, onRemove,
}: {
  spell: NonNullable<typeof SPELL_MAP[string]>;
  isPrepared: boolean;
  isConcentrating: boolean;
  castButton?: ReactNode;
  onTogglePrepared: () => void;
  onConcentrate: () => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      border: isConcentrating ? '1px solid rgba(201,146,42,0.5)' : '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-md)',
      background: isConcentrating ? 'rgba(201,146,42,0.05)' : 'var(--bg-surface)',
      overflow: 'hidden',
      transition: 'border-color var(--transition-fast)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)' }}>
        <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-gold)', minWidth: 42 }}>
          {LEVEL_LABELS[spell.level]}
        </span>

        <button
          onClick={() => setExpanded(e => !e)}
          style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text-primary)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', flex: 1 }}
        >
          {spell.name}
        </button>

        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {spell.concentration && (
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: 10, color: 'var(--color-gold-dim)', fontWeight: 700 }} title="Concentration">C</span>
          )}
          {spell.ritual && (
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: 10, color: '#60a5fa', fontWeight: 700 }} title="Ritual">R</span>
          )}
        </div>

        {spell.concentration && (
          <button
            onClick={onConcentrate}
            className={isConcentrating ? 'btn-gold btn-sm' : 'btn-secondary btn-sm'}
            style={{ fontSize: 'var(--text-xs)' }}
          >
            {isConcentrating ? 'Concentrating' : 'Concentrate'}
          </button>
        )}

        {/* Cast button */}
        {castButton}

        {spell.level > 0 && (
          <button
            onClick={onTogglePrepared}
            className={isPrepared ? 'btn-gold btn-sm' : 'btn-secondary btn-sm'}
            style={{ fontSize: 'var(--text-xs)' }}
          >
            {isPrepared ? 'Prepared' : 'Prepare'}
          </button>
        )}

        <button
          onClick={onRemove}
          className="btn-ghost btn-sm"
          style={{ color: 'var(--color-ash)', fontSize: 'var(--text-xs)', padding: '2px 6px' }}
          title="Remove from spellbook"
        >
          ✕
        </button>
      </div>

      {expanded && (
        <div style={{ padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-sunken)', animation: 'fadeIn 120ms ease both' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
            {([['Time', spell.casting_time], ['Range', spell.range], ['Duration', spell.duration], ['Components', spell.components]] as [string, string][]).map(([l, v]) => (
              <div key={l}>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 1 }}>{l}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>{v}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 'var(--text-sm)', lineHeight: 1.6, color: 'var(--text-secondary)' }}>{spell.description}</p>
          {spell.higher_levels && (
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 'var(--space-2)', fontStyle: 'italic' }}>
              At Higher Levels: {spell.higher_levels}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
