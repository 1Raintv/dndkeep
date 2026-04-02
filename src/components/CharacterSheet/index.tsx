import { useState, useCallback, useMemo, useEffect, useRef, type ReactNode } from 'react';
import type { Character, ConditionName, InventoryItem, SpellSlots, NoteField, ActiveBuff } from '../../types';
import { computeStats, abilityModifier, rollDie } from '../../lib/gameUtils';
import { updateCharacter } from '../../lib/supabase';
import { useDebouncedCallback } from '../../lib/useDebounce';
import { SPELL_MAP, SPELLS } from '../../data/spells';
import { CLASS_MAP } from '../../data/classes';
import { CONDITION_MAP } from '../../data/conditions';
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
  { id: 'abilities', label: 'Abilities' },
  { id: 'spells',    label: 'Spells' },
  { id: 'combat',    label: 'Combat' },
  { id: 'bio',       label: 'Bio' },
  { id: 'history',   label: 'History' },
  { id: 'session',   label: 'Session' },
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
    // Auto-drop concentration if an incapacitating condition is applied
    const breaksConc = active_conditions.some(c => CONDITION_MAP[c]?.concentrationBreaks);
    if (breaksConc && concentrationSpellId) {
      setConcentrationSpellId(null);
      applyUpdate({ active_conditions, concentration_spell: '' }, true);
    } else {
      applyUpdate({ active_conditions }, true);
    }
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
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>

      <CharacterHeader
        character={character}
        computed={computed}
        onOpenSettings={() => setShowSettings(true)}
        onUpdateXP={xp => applyUpdate({ experience_points: xp })}
        onOpenAvatarPicker={() => setShowAvatarPicker(true)}
        onToggleInspiration={() => applyUpdate({ inspiration: !character.inspiration }, true)}
        onOpenRest={() => setShowRest(true)}
        onUpdateAC={ac => applyUpdate({ armor_class: ac }, true)}
        onUpdateSpeed={speed => applyUpdate({ speed }, true)}
        onShare={character.share_token && character.share_enabled ? () => {
          navigator.clipboard.writeText(window.location.origin + '/share/' + character.share_token);
        } : undefined}
        onUpdateHP={(delta, tempHP) => {
            if (tempHP !== undefined) {
              handleUpdateHP(character.current_hp, tempHP);
            } else {
              const newHP = Math.max(0, Math.min(character.max_hp, character.current_hp + delta));
              handleUpdateHP(newHP, character.temp_hp);
            }
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
            padding: 'var(--sp-3) var(--sp-4)',
            background: 'rgba(167,139,250,0.08)',
            border: '1px solid rgba(167,139,250,0.4)',
            borderRadius: 'var(--r-md)',
            gap: 'var(--sp-3)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
              
              <div>
                <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: '#a78bfa' }}>
                  Concentrating: {spell.name}
                </div>
                <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
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
            padding: 'var(--sp-3) var(--sp-4)',
            background: 'rgba(22,163,74,0.08)',
            border: '1px solid rgba(22,163,74,0.4)',
            borderRadius: 'var(--r-md)',
            gap: 'var(--sp-3)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flex: 1, minWidth: 0 }}>
              
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--hp-full)', marginBottom: 4 }}>
                  Wildshape: {character.wildshape_beast_name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
                  <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-md)', color: hpColor }}>
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
            <h2 style={{ marginBottom: 'var(--sp-2)' }}>Take a Rest</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>

              {/* Short rest panel */}
              <div className="panel">
                <h4 style={{ marginBottom: 'var(--sp-3)' }}>Short Rest</h4>

                {/* Hit dice status */}
                {(() => {
                  const cls = CLASS_MAP[character.class_name];
                  const hitDie = cls?.hit_die ?? 8;
                  const spent = character.hit_dice_spent ?? 0;
                  const available = Math.max(0, character.level - spent);
                  const conMod = abilityModifier(character.constitution);
                  const atMax = character.current_hp >= character.max_hp;

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t-2)', marginBottom: 2 }}>
                            Hit Dice Available
                          </div>
                          <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-lg)', color: available > 0 ? 'var(--c-gold-l)' : 'var(--t-2)' }}>
                            {available} / {character.level} d{hitDie}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t-2)', marginBottom: 2 }}>
                            Current HP
                          </div>
                          <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-lg)', color: 'var(--t-1)' }}>
                            {character.current_hp} / {character.max_hp}
                          </div>
                        </div>
                      </div>

                      {shortRestHpGained > 0 && (
                        <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', color: 'var(--hp-full)', textAlign: 'center' }}>
                          +{shortRestHpGained} HP recovered this rest
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
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
                        <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-gold-l)', fontFamily: 'var(--ff-body)' }}>
                          Pact Magic slots will be recovered when you finish this rest.
                        </p>
                      )}

                      {available === 0 && (
                        <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)', fontFamily: 'var(--ff-body)' }}>
                          No hit dice remaining. Take a long rest to recover them.
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Long rest panel */}
              <div className="panel">
                <h4 style={{ marginBottom: 'var(--sp-2)' }}>Long Rest</h4>
                <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', marginBottom: 'var(--sp-3)', lineHeight: 1.5 }}>
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
              style={{ marginTop: 'var(--sp-4)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Toolbar row: save status only */}
      {(saving || saveError) && (
        <div style={{ height: 20, display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
          {saving && (
            <>
              <span className="spinner" style={{ width: 12, height: 12 }} />
              <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', letterSpacing: '0.06em' }}>
                Saving...
              </span>
            </>
          )}
          {saveError && !saving && (
            <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--c-red-l)' }}>
              {saveError}
            </span>
          )}
        </div>
      )}

      {/* Active conditions banner */}
      {character.active_conditions.length > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)',
          padding: 'var(--sp-3)', background: 'rgba(155,28,28,0.08)',
          border: '1px solid rgba(155,28,28,0.3)', borderRadius: 'var(--r-md)',
        }}>
          <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#fca5a5', alignSelf: 'center' }}>
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
          display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
          padding: 'var(--sp-3) var(--sp-4)',
          background: 'rgba(201,146,42,0.06)', border: '1px solid rgba(201,146,42,0.3)',
          borderRadius: 'var(--r-md)',
        }}>
          <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--c-gold-l)' }}>
            Concentrating:
          </span>
          <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', color: 'var(--t-1)', flex: 1 }}>
            {SPELL_MAP[concentrationSpellId]?.name ?? concentrationSpellId}
          </span>
          <button className="btn-ghost btn-sm" onClick={() => setConcentrationSpellId(null)}
            style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
            End
          </button>
        </div>
      )}



      {/* Active condition warning banner */}
      {(() => {
        const mechConditions = (character.active_conditions ?? []).filter(c => {
          const m = CONDITION_MAP[c];
          return m?.attackDisadvantage || m?.abilityCheckDisadvantage || m?.concentrationBreaks || m?.cantAct;
        });
        if (!mechConditions.length) return null;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-2) var(--sp-4)', background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 'var(--r-md)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--c-red-l)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>⚠ Active Conditions:</span>
            {mechConditions.map(c => {
              const m = CONDITION_MAP[c];
              const effects = [];
              if (m?.attackDisadvantage) effects.push('disadv. attacks');
              if (m?.abilityCheckDisadvantage) effects.push('disadv. checks');
              if (m?.cantAct) effects.push("can't act");
              return (
                <span key={c} style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: m?.color ?? 'var(--t-2)', background: `${m?.color ?? '#64748b'}15`, border: `1px solid ${m?.color ?? '#64748b'}30`, padding: '2px 8px', borderRadius: 999 }}>
                  {m?.icon} {c}{effects.length ? ` — ${effects.join(', ')}` : ''}
                </span>
              );
            })}
          </div>
        );
      })()}

      {/* Tabs */}
      <div className="tabs" style={{ overflowX: "auto", flexWrap: "nowrap" }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.id === 'spells' && allSpellIds.length > 0 && (
              <span style={{ marginLeft: 4, fontSize: 10, background: 'rgba(201,146,42,0.2)', color: 'var(--c-gold-l)', padding: '1px 5px', borderRadius: 9, fontFamily: 'var(--ff-body)' }}>
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
          <div className="abilities-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 'var(--sp-6)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>
              <AbilityScores character={character} computed={computed} />
              <DeathSaves character={character} onUpdate={u => applyUpdate(u, true)} />
              <SkillsList character={character} computed={computed} onUpdate={u => applyUpdate(u, true)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>
              <CombatStats character={character} computed={computed} onUpdateHP={handleUpdateHP} />
              {(character.active_conditions?.length > 0) && (
                <ConditionMechanics conditions={character.active_conditions} />
              )}
              <ConditionsPanel character={character} onUpdateConditions={handleUpdateConditions} />
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-8)', maxWidth: 720 }}>
            <div>
              <div className="section-header">Weapons & Attacks</div>
              {(!character.weapons || character.weapons.length === 0) && (
                <div style={{ padding: 'var(--sp-4)', background: '#080d14', border: '1px dashed var(--c-border-m)', borderRadius: 'var(--r-lg)', textAlign: 'center', marginBottom: 'var(--sp-3)' }}>
                  <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', margin: 0 }}>
                    No weapons added yet. Add your weapons to roll attacks directly from your sheet.
                  </p>
                </div>
              )}
              <WeaponsTracker weapons={character.weapons ?? []} onUpdate={weapons => applyUpdate({ weapons })} characterId={userId} characterName={character.name} campaignId={character.campaign_id} activeConditions={character.active_conditions} activeBufss={(character as any).active_buffs ?? []} />
            </div>
            <div>
              <div className="section-header">Inventory</div>
              <Inventory character={character} onUpdateInventory={handleUpdateInventory} onUpdateCurrency={currency => applyUpdate({ currency })} />
            </div>
            <div>
              <div className="section-header">
                Magic Items
                <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 400, fontSize: 'var(--fs-xs)', color: 'var(--t-2)', marginLeft: 'var(--sp-2)', textTransform: 'none', letterSpacing: 0 }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 'var(--sp-6)', maxWidth: 900 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
              {/* Structured features from character creation */}
              {character.features_and_traits && (() => {
                const raw = character.features_and_traits;
                const sections = raw.split(/\n\n(?=\[)/).filter(Boolean);
                if (sections.length <= 1) return (
                  <div>
                    <div className="section-header">Features & Traits</div>
                    <FeaturesPanel character={character} onUpdateNotes={notes => applyUpdate({ features_text: notes }, true)} />
                  </div>
                );
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
                    <div className="section-header">Features & Traits</div>
                    {sections.map((section, i) => {
                      const match = section.match(/^\[([^\]]+)\]\n([\s\S]*)$/);
                      if (!match) return <div key={i} style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', whiteSpace: 'pre-wrap' }}>{section}</div>;
                      const [, title, body] = match;
                      const sectionIcons: Record<string, string> = {
                        'Origin Feat': '', 'Fighting Style': '', 'Metamagic': '',
                        'Eldritch Invocations': '', 'Expertise': '', 'Divine Order': '',
                        'Primal Order': '', 'Feats from ASI': '',
                      };
                      return (
                        <div key={i} style={{ background: 'var(--c-raised)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)', padding: 'var(--sp-3) var(--sp-4)' }}>
                          <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--c-gold-l)', marginBottom: 6 }}>
                            {title}
                          </div>
                          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', lineHeight: 1.6 }}>{body.trim()}</div>
                        </div>
                      );
                    })}
                    <FeaturesPanel character={character} onUpdateNotes={notes => applyUpdate({ features_text: notes }, true)} />
                  </div>
                );
              })()}
              {!character.features_and_traits && (
                <div>
                  <div className="section-header">Features & Traits</div>
                  <FeaturesPanel character={character} onUpdateNotes={notes => applyUpdate({ features_text: notes }, true)} />
                </div>
              )}
            </div>
            <div>
              <div className="section-header">Notes & Personality</div>
              <Notes character={character} onUpdate={handleUpdateNote} />
            </div>
          </div>
        )}

        {/* ── HISTORY: Roll log + Action log merged ── */}
        {activeTab === 'history' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 'var(--sp-6)', maxWidth: 1100 }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>
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
      border: isConcentrating ? '1px solid rgba(201,146,42,0.5)' : '1px solid var(--c-border)',
      borderRadius: 'var(--r-md)',
      background: isConcentrating ? 'rgba(201,146,42,0.05)' : 'var(--c-surface)',
      overflow: 'hidden',
      transition: 'border-color var(--tr-fast)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-3) var(--sp-4)' }}>
        <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--c-gold-l)', minWidth: 42 }}>
          {LEVEL_LABELS[spell.level]}
        </span>

        <button
          onClick={() => setExpanded(e => !e)}
          style={{ fontFamily: 'var(--ff-body)', fontWeight: 600, fontSize: 'var(--fs-sm)', color: 'var(--t-1)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', flex: 1 }}
        >
          {spell.name}
        </button>

        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {spell.concentration && (
            <span style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--c-gold)', fontWeight: 700 }} title="Concentration">C</span>
          )}
          {spell.ritual && (
            <span style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: '#60a5fa', fontWeight: 700 }} title="Ritual">R</span>
          )}
        </div>

        {spell.concentration && (
          <button
            onClick={onConcentrate}
            className={isConcentrating ? 'btn-gold btn-sm' : 'btn-secondary btn-sm'}
            style={{ fontSize: 'var(--fs-xs)' }}
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
            style={{ fontSize: 'var(--fs-xs)' }}
          >
            {isPrepared ? 'Prepared' : 'Prepare'}
          </button>
        )}

        <button
          onClick={onRemove}
          className="btn-ghost btn-sm"
          style={{ color: 'var(--t-2)', fontSize: 'var(--fs-xs)', padding: '2px 6px' }}
          title="Remove from spellbook"
        >
          ✕
        </button>
      </div>

      {expanded && (
        <div style={{ padding: 'var(--sp-3) var(--sp-4)', borderTop: '1px solid var(--c-border)', background: '#080d14', animation: 'fadeIn 120ms ease both' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)' }}>
            {([['Time', spell.casting_time], ['Range', spell.range], ['Duration', spell.duration], ['Components', spell.components]] as [string, string][]).map(([l, v]) => (
              <div key={l}>
                <div style={{ fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t-2)', marginBottom: 1 }}>{l}</div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>{v}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.6, color: 'var(--t-2)' }}>{spell.description}</p>
          {spell.higher_levels && (
            <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)', marginTop: 'var(--sp-2)', fontStyle: 'italic' }}>
              At Higher Levels: {spell.higher_levels}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
