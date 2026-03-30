import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { Character, ConditionName, InventoryItem, SpellSlots, NoteField } from '../../types';
import { computeStats, abilityModifier, rollDie } from '../../lib/gameUtils';
import { updateCharacter } from '../../lib/supabase';
import { useDebouncedCallback } from '../../lib/useDebounce';
import { SPELL_MAP, SPELLS } from '../../data/spells';
import { CLASS_MAP } from '../../data/classes';

import CharacterHeader from './CharacterHeader';
import AbilityScores from './AbilityScores';
import CombatStats from './CombatStats';
import SkillsList from './SkillsList';
import SpellSlotsPanel from './SpellSlots';
import ConditionsPanel from './ConditionsPanel';
import Inventory from './Inventory';
import Notes from './Notes';
import DeathSaves from './DeathSaves';
import CharacterSettings from './CharacterSettings';
import FeaturesPanel from './FeaturesPanel';

type Tab = 'stats' | 'skills' | 'spells' | 'features' | 'inventory' | 'notes';

const TABS: { id: Tab; label: string }[] = [
  { id: 'stats',     label: 'Stats' },
  { id: 'skills',    label: 'Skills' },
  { id: 'spells',    label: 'Spells' },
  { id: 'features',  label: 'Features' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'notes',     label: 'Notes' },
];

const LEVEL_LABELS: Record<number, string> = {
  0: 'Cantrip', 1: '1st', 2: '2nd', 3: '3rd', 4: '4th',
  5: '5th', 6: '6th', 7: '7th', 8: '8th', 9: '9th',
};

interface CharacterSheetProps {
  initialCharacter: Character;
  realtimeEnabled?: boolean;
}

export default function CharacterSheet({ initialCharacter, realtimeEnabled: _realtimeEnabled = false }: CharacterSheetProps) {
  const [character, setCharacter] = useState<Character>(initialCharacter);
  const [activeTab, setActiveTab] = useState<Tab>('stats');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showRest, setShowRest] = useState(false);
  const [concentrationSpellId, setConcentrationSpellId] = useState<string | null>(null);

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
    // Warlocks also recover pact slots on short rest
    const newSlots = character.class_name === 'Warlock'
      ? Object.fromEntries(Object.entries(character.spell_slots).map(([k, s]) => [k, { ...s, used: 0 }]))
      : character.spell_slots;
    applyUpdate({ spell_slots: newSlots }, true);
    setShortRestHpGained(0);
    setShowRest(false);
  }

  function doLongRest() {
    const recoveredSlots = Object.fromEntries(
      Object.entries(character.spell_slots).map(([k, s]) => [k, { ...s, used: 0 }])
    );
    // PHB: on a long rest you recover hit dice equal to half your level (min 1)
    const recoveredHD = Math.max(1, Math.floor(character.level / 2));
    const newSpent = Math.max(0, (character.hit_dice_spent ?? 0) - recoveredHD);

    applyUpdate({
      current_hp: character.max_hp,
      temp_hp: 0,
      spell_slots: recoveredSlots,
      active_conditions: character.active_conditions.filter(c => c !== 'Exhaustion'),
      death_saves_successes: 0,
      death_saves_failures: 0,
      hit_dice_spent: newSpent,
    }, true);
    setConcentrationSpellId(null);
    setShortRestHpGained(0);
    setShowRest(false);
  }

  // ------------------------------------------------------------------
  // Derived
  // ------------------------------------------------------------------
  const hasSpellSlots = Object.values(character.spell_slots).some(s => s.total > 0);
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
      />

      {/* Character settings modal — level up, edit stats, delete */}
      {showSettings && (
        <CharacterSettings
          character={character}
          onUpdate={u => applyUpdate(u, true)}
          onClose={() => setShowSettings(false)}
        />
      )}

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

        {activeTab === 'stats' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 'var(--space-6)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
              <AbilityScores character={character} computed={computed} />
              <CombatStats
                character={character}
                computed={computed}
                onUpdateHP={handleUpdateHP}
              />
              <DeathSaves character={character} onUpdate={u => applyUpdate(u, true)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
              <ConditionsPanel character={character} onUpdateConditions={handleUpdateConditions} />
              {hasSpellSlots && (
                <SpellSlotsPanel character={character} onUpdateSlots={handleUpdateSlots} />
              )}
            </div>
          </div>
        )}

        {activeTab === 'skills' && (
          <div style={{ maxWidth: 480 }}>
            <SkillsList
              character={character}
              computed={computed}
              onUpdate={u => applyUpdate(u, true)}
            />
          </div>
        )}

        {activeTab === 'spells' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', maxWidth: 720 }}>
            {hasSpellSlots && (
              <SpellSlotsPanel character={character} onUpdateSlots={handleUpdateSlots} />
            )}

            {!hasSpellSlots ? (
              <div className="card" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
                <p style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-heading)' }}>
                  {character.class_name} does not use spells.
                </p>
              </div>
            ) : (
              <>
                {/* Known / prepared spells */}
                {knownSpellData.length > 0 && (
                  <div>
                    <div className="section-header">
                      Spellbook — {knownSpellData.length} spell{knownSpellData.length !== 1 ? 's' : ''}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                      {knownSpellData.map(spell => (
                        <SpellRow
                          key={spell.id}
                          spell={spell}
                          isPrepared={character.prepared_spells.includes(spell.id)}
                          isConcentrating={concentrationSpellId === spell.id}
                          onTogglePrepared={() => {
                            const isPrepared = character.prepared_spells.includes(spell.id);
                            applyUpdate({
                              prepared_spells: isPrepared
                                ? character.prepared_spells.filter(id => id !== spell.id)
                                : [...character.prepared_spells, spell.id],
                            }, true);
                          }}
                          onConcentrate={() => setConcentrationSpellId(
                            concentrationSpellId === spell.id ? null : spell.id
                          )}
                          onRemove={() => {
                            if (concentrationSpellId === spell.id) setConcentrationSpellId(null);
                            applyUpdate({
                              known_spells:    character.known_spells.filter(id => id !== spell.id),
                              prepared_spells: character.prepared_spells.filter(id => id !== spell.id),
                            }, true);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Add spells — filtered to this class + level */}
                {availableSpells.length > 0 && (
                  <div>
                    <div className="section-header">
                      Add Spells
                      <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginLeft: 'var(--space-2)', textTransform: 'none', letterSpacing: 0 }}>
                        — {character.class_name} spells up to {maxSpellLevel === 0 ? 'cantrips' : `level ${maxSpellLevel}`}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                      {availableSpells.map(spell => (
                        <div
                          key={spell.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--space-3)',
                            padding: 'var(--space-2) var(--space-3)',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border-subtle)',
                            background: 'var(--bg-sunken)',
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
                                {spell.name}
                              </span>
                              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                                {spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`} · {spell.school}
                              </span>
                            </div>
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {spell.casting_time} · {spell.range} · {spell.duration}
                            </div>
                          </div>
                          <button
                            className="btn-gold btn-sm"
                            onClick={() => applyUpdate({
                              known_spells: [...character.known_spells, spell.id],
                            }, true)}
                          >
                            Add
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {knownSpellData.length === 0 && availableSpells.length === 0 && (
                  <div className="card" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
                    <p style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-heading)' }}>
                      No spells available at this level.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'features' && (
          <div style={{ maxWidth: 680 }}>
            <FeaturesPanel character={character} />
          </div>
        )}

        {activeTab === 'inventory' && (
          <div style={{ maxWidth: 640 }}>
            <Inventory
              character={character}
              onUpdateInventory={handleUpdateInventory}
              onUpdateCurrency={currency => applyUpdate({ currency })}
            />
          </div>
        )}

        {activeTab === 'notes' && (
          <div style={{ maxWidth: 640 }}>
            <Notes character={character} onUpdate={handleUpdateNote} />
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// SpellRow
// ------------------------------------------------------------------
function SpellRow({
  spell, isPrepared, isConcentrating, onTogglePrepared, onConcentrate, onRemove,
}: {
  spell: NonNullable<typeof SPELL_MAP[string]>;
  isPrepared: boolean;
  isConcentrating: boolean;
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
