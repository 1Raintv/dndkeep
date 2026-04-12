import { useState, useMemo, type ReactNode } from 'react';
import type { Character, ComputedStats, SpellData } from '../../types';
import SpellCastButton from './SpellCastButton';
import SpellPickerDropdown from '../shared/SpellPickerDropdown';
import { SPELLS } from '../../data/spells';
import { getGrantedSpellIds } from '../../lib/grantedSpells';

// Max cantrips per class at each level (index = level-1)
const CANTRIP_MAX: Record<string, number[]> = {
  Psion:     [2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4],
  Wizard:    [3,3,3,4,4,4,4,4,4,5,5,5,5,5,5,5,5,5,5,5],
  Sorcerer:  [4,4,4,5,5,5,5,5,5,6,6,6,6,6,6,6,6,6,6,6],
  Warlock:   [2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4],
  Druid:     [2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4],
  Cleric:    [3,3,3,4,4,4,4,4,4,5,5,5,5,5,5,5,5,5,5,5],
  Bard:      [2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4],
  Artificer: [2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4],
};

interface SpellsTabProps {
  character: Character;
  computed: ComputedStats;
  knownSpellData: SpellData[];
  availableSpells: SpellData[];
  maxSpellLevel: number;
  concentrationSpellId: string | null;
  hasSpellSlots: boolean;
  onUpdateSlots: (slots: Character['spell_slots']) => void;
  onAddSpell: (id: string) => void;
  onRemoveSpell: (id: string) => void;
  onTogglePrepared: (id: string) => void;
  onConcentrate: (id: string) => void;
  userId: string;
  campaignId: string | null;
}

const SCHOOL_COLORS: Record<string, string> = {
  Abjuration: '#60a5fa', Conjuration: '#34d399', Divination: '#fbbf24',
  Enchantment: '#f472b6', Evocation: '#f87171', Illusion: '#a78bfa',
  Necromancy: '#94a3b8', Transmutation: '#fb923c',
};

const LEVEL_LABELS: Record<number, string> = {
  0: 'Cantrips', 1: '1st', 2: '2nd', 3: '3rd',
  4: '4th', 5: '5th', 6: '6th', 7: '7th', 8: '8th', 9: '9th',
};

const PREPARER_CLASSES = ['Cleric', 'Druid', 'Paladin', 'Wizard', 'Artificer', 'Psion'];

export default function SpellsTab({
  character, computed, knownSpellData, availableSpells, maxSpellLevel,
  concentrationSpellId, hasSpellSlots, onUpdateSlots, onAddSpell,
  onRemoveSpell, onTogglePrepared, onConcentrate, userId, campaignId,
}: SpellsTabProps) {
  const [activeLevel, setActiveLevel] = useState<number | 'all'>('all');
  const [expandedSpell, setExpandedSpell] = useState<string | null>(null);
  const [filterPrepared, setFilterPrepared] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const isPreparer = PREPARER_CLASSES.includes(character.class_name);
  const prepareMax = isPreparer
    ? character.level + Math.max(0, Math.floor(((
        character.class_name === 'Wizard' || character.class_name === 'Artificer'
          ? character.intelligence
          : character.class_name === 'Paladin' ? character.charisma : character.wisdom
      ) - 10) / 2))
    : 0;

  // Cantrip limit for this class/level
  const cantripMax = CANTRIP_MAX[character.class_name]?.[Math.min(character.level - 1, 19)];

  // Current cantrip count (exclude auto-granted Mage Hand for Psion)
  const classCantrips = useMemo(() =>
    SPELLS.filter(s => s.classes.includes(character.class_name) && s.level === 0),
    [character.class_name]
  );
  // Granted spells that don't count toward limits
  const { grantedCantrips, grantedPrepared } = useMemo(
    () => getGrantedSpellIds(character),
    [character.class_name, character.subclass] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const currentCantripCount = useMemo(() => {
    let count = character.known_spells.filter(id =>
      classCantrips.find(s => s.id === id) && !grantedCantrips.includes(id)
    ).length;
    return Math.max(0, count);
  }, [character.known_spells, classCantrips, grantedCantrips]);

  // Slots per level for limit display in picker
  const slotsPerLevel = useMemo(() => {
    const map: Record<number, number> = {};
    Object.entries(character.spell_slots).forEach(([k, v]) => {
      const lvl = parseInt(k);
      if (!isNaN(lvl) && (v as any)?.total) map[lvl] = (v as any).total;
    });
    return map;
  }, [character.spell_slots]);

  const slotInfo = useMemo(() => {
    const info: Record<number, { max: number; remaining: number }> = {};
    if (character.spell_slots) {
      Object.entries(character.spell_slots).forEach(([k, v]) => {
        const lvl = parseInt(k.replace('level_', ''));
        const slot = v as { total: number; used: number };
        if (!isNaN(lvl) && slot?.total) {
          info[lvl] = { max: slot.total, remaining: slot.total - (slot.used ?? 0) };
        }
      });
    }
    return info;
  }, [character.spell_slots]);

  // Levels the character actually has spells for
  const knownLevels = useMemo(() => {
    const levels = new Set(knownSpellData.map(s => s.level));
    return Array.from(levels).sort((a, b) => a - b);
  }, [knownSpellData]);

  // Filtered known spells for active level
  const visibleSpells = useMemo(() => {
    return knownSpellData.filter(s => {
      if (activeLevel !== 'all' && s.level !== activeLevel) return false;
      if (filterPrepared && isPreparer && s.level > 0 && !character.prepared_spells.includes(s.id)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          (s.school ?? '').toLowerCase().includes(q) ||
          (s.casting_time ?? '').toLowerCase().includes(q) ||
          (s.damage_type ?? '').toLowerCase().includes(q) ||
          (s.description ?? '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [knownSpellData, activeLevel, filterPrepared, searchQuery, character.prepared_spells, isPreparer]);

  // Group visible spells by level
  const byLevel = useMemo(() => {
    const map: Record<number, SpellData[]> = {};
    visibleSpells.forEach(s => {
      if (!map[s.level]) map[s.level] = [];
      map[s.level].push(s);
    });
    return map;
  }, [visibleSpells]);

  if (!hasSpellSlots) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--sp-12)', color: 'var(--t-2)' }}>
        <div style={{ fontWeight: 700, fontSize: 'var(--fs-md)', color: 'var(--t-1)', marginBottom: 'var(--sp-2)' }}>
          {character.class_name}s don't cast spells
        </div>
        <p style={{ fontSize: 'var(--fs-sm)', maxWidth: 340, margin: '0 auto' }}>
          Your power comes from martial skill. Head to the Combat tab to manage weapons and attacks.
        </p>
      </div>
    );
  }

  const preparedCount = knownSpellData.filter(s => s.level > 0 && character.prepared_spells.includes(s.id)).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Top bar: prepared count + Add Spells button ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {isPreparer && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 999 }}>
            <div style={{
              width: `${Math.min(100, (preparedCount / prepareMax) * 100)}%`,
            }} />
            <span style={{ fontSize: 11, color: 'var(--t-2)' }}>Prepared:</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: preparedCount >= prepareMax ? 'var(--c-gold-l)' : 'var(--t-1)', fontFamily: 'var(--ff-stat)' }}>
              {preparedCount} / {prepareMax}
            </span>
            <button
              onClick={() => setFilterPrepared(v => !v)}
              style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, cursor: 'pointer', minHeight: 0,
                border: filterPrepared ? '1px solid var(--c-gold)' : '1px solid var(--c-border-m)',
                background: filterPrepared ? 'var(--c-gold-bg)' : 'transparent',
                color: filterPrepared ? 'var(--c-gold-l)' : 'var(--t-3)' }}
            >
              {filterPrepared ? 'All' : 'Prepared only'}
            </button>
          </div>
        )}

        {/* Add Spells portal button */}
        <div style={{ marginLeft: 'auto', minWidth: 240 }}>
          <SpellPickerDropdown
            label={`Add ${character.class_name} Spells`}
            isCantrip={false}
            className={character.class_name}
            maxLevel={maxSpellLevel}
            selected={character.known_spells}
            onToggle={id => character.known_spells.includes(id) ? onRemoveSpell(id) : onAddSpell(id)}
            cantripMax={cantripMax}
            prepareMax={isPreparer ? prepareMax : undefined}
            prepareCount={isPreparer ? knownSpellData.filter(s => s.level > 0 && character.prepared_spells.includes(s.id) && !grantedPrepared.includes(s.id)).length : undefined}
            slotsPerLevel={slotsPerLevel}
            grantedSpellIds={[...grantedCantrips, ...grantedPrepared]}
          />
        </div>

      </div>

      {/* ── Spell stats header (DDB-style) — modifier / attack / save DC ── */}
      {computed.proficiency_bonus > 0 && (() => {
        const spellAbility = ({ Bard:'charisma', Cleric:'wisdom', Druid:'wisdom', Paladin:'charisma', Ranger:'wisdom', Sorcerer:'charisma', Warlock:'charisma', Wizard:'intelligence', Artificer:'intelligence' } as Record<string,string>)[character.class_name];
        if (!spellAbility) return null;
        const score = (character as any)[spellAbility] ?? 10;
        const mod = Math.floor((score - 10) / 2);
        const atk = mod + computed.proficiency_bonus;
        const dc = 8 + atk;
        return (
          <div style={{ display: 'flex', gap: 24, padding: '10px 16px', background: 'var(--c-surface)', border: '1px solid rgba(192,132,252,0.2)', borderRadius: 'var(--r-lg)', alignItems: 'center', flexWrap: 'wrap' as const }}>
            {[
              { label: 'MODIFIER', value: mod >= 0 ? `+${mod}` : String(mod) },
              { label: 'SPELL ATTACK', value: atk >= 0 ? `+${atk}` : String(atk) },
              { label: 'SAVE DC', value: String(dc) },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--ff-stat)', fontWeight: 900, fontSize: '1.5rem', color: '#c084fc', lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'rgba(192,132,252,0.6)', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        );
      })()}


      {/* ── Level tabs ── */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <LevelTab label="All" count={knownSpellData.length} active={activeLevel === 'all'} onClick={() => setActiveLevel('all')} />
        {knownLevels.map(lvl => {
          const slots = lvl > 0 ? slotInfo[lvl] : null;
          const count = knownSpellData.filter(s => s.level === lvl).length;
          return (
            <LevelTab
              key={lvl}
              label={LEVEL_LABELS[lvl]}
              count={count}
              slots={slots}
              active={activeLevel === lvl}
              onClick={() => setActiveLevel(lvl)}
            />
          );
        })}
      </div>

      {/* ── Spellbook ── */}
      {knownSpellData.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', border: '1px dashed var(--c-border-m)', borderRadius: 16, color: 'var(--t-2)' }}>
          <div style={{ fontSize: 32, opacity: 0.15, marginBottom: 12 }}>✦</div>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--t-1)', marginBottom: 8 }}>No spells yet</div>
          <p style={{ fontSize: 12, color: 'var(--t-3)', margin: 0 }}>Use the "Add Spells" button above to add {character.class_name} spells to your sheet.</p>
        </div>
      ) : visibleSpells.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--t-3)', fontSize: 13, border: '1px dashed var(--c-border)', borderRadius: 12 }}>
          <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.3 }}>🔮</div>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--t-2)', marginBottom: 4 }}>
            {searchQuery ? `No spells matching "${searchQuery}"` : 'No spells match your filters'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--t-3)' }}>
            {searchQuery ? 'Try a different search term' : 'Clear your filters to see all spells'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {(Object.entries(byLevel) as [string, SpellData[]][])
            .sort(([a], [b]) => +a - +b)
            .map(([lvlStr, spells]) => {
              const lvl = parseInt(lvlStr);
              const slots = lvl > 0 ? slotInfo[lvl] : null;
              return (
                <div key={lvl}>
                  {/* Level header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--c-border)' }}>
                    <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--t-2)' }}>
                      {LEVEL_LABELS[lvl] === 'Cantrips' ? 'Cantrips' : `${LEVEL_LABELS[lvl]} Level`}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--t-3)', background: 'var(--c-raised)', padding: '1px 6px', borderRadius: 999 }}>
                      {spells.length}
                    </span>
                    {slots && (
                      <div style={{ display: 'flex', gap: 3, alignItems: 'center', marginLeft: 4 }}>
                        {Array.from({ length: slots.max }).map((_, i) => (
                          <div key={i} style={{ width: 9, height: 9, borderRadius: '50%', border: `1.5px solid var(--c-gold-bdr)`, background: i < slots.remaining ? 'var(--c-gold)' : 'transparent', boxShadow: i < slots.remaining ? '0 0 4px rgba(212,160,23,0.4)' : 'none' }} />
                        ))}
                        <span style={{ fontSize: 10, color: 'var(--t-3)', marginLeft: 3 }}>{slots.remaining}/{slots.max} slots</span>
                      </div>
                    )}
                  </div>

                  {/* Spell cards */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {spells.map(spell => (
                      <SpellCard
                        key={spell.id}
                        spell={spell}
                        isExpanded={expandedSpell === spell.id}
                        isPrepared={character.prepared_spells.includes(spell.id)}
                        isConcentrating={concentrationSpellId === spell.id}
                        isPreparer={isPreparer}
                        castButton={
                          <SpellCastButton
                            spell={spell}
                            character={character}
                            userId={userId}
                            campaignId={campaignId}
                            onUpdateSlots={onUpdateSlots}
                          />
                        }
                        onExpand={() => setExpandedSpell(expandedSpell === spell.id ? null : spell.id)}
                        onTogglePrepared={() => onTogglePrepared(spell.id)}
                        onConcentrate={() => onConcentrate(spell.id)}
                        onRemove={() => onRemoveSpell(spell.id)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

// ── Level tab button ─────────────────────────────────────────────────
function LevelTab({ label, count, slots, active, onClick }: {
  label: string; count: number; slots?: { max: number; remaining: number } | null; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '5px 12px', borderRadius: 999, cursor: 'pointer', minHeight: 0,
        border: active ? '2px solid var(--c-gold)' : '1px solid var(--c-border-m)',
        background: active ? 'var(--c-gold-bg)' : 'var(--c-raised)',
        color: active ? 'var(--c-gold-l)' : 'var(--t-2)',
        fontSize: 12, fontWeight: active ? 700 : 500,
        transition: 'all 0.15s',
      }}
    >
      {label}
      <span style={{ fontSize: 9, fontWeight: 700, background: active ? 'rgba(212,160,23,0.2)' : 'var(--c-card)', color: active ? 'var(--c-gold-l)' : 'var(--t-3)', padding: '0 5px', borderRadius: 999 }}>
        {count}
      </span>
      {slots && (
        <span style={{ fontSize: 9, color: slots.remaining > 0 ? 'var(--c-gold-l)' : 'var(--t-3)' }}>
          {slots.remaining}/{slots.max}
        </span>
      )}
    </button>
  );
}

// ── Spell card ───────────────────────────────────────────────────────
function SpellCard({ spell, isExpanded, isPrepared, isConcentrating, isPreparer, castButton, onExpand, onTogglePrepared, onConcentrate, onRemove }: {
  spell: SpellData; isExpanded: boolean; isPrepared: boolean; isConcentrating: boolean;
  isPreparer: boolean; castButton: ReactNode;
  onExpand: () => void; onTogglePrepared: () => void;
  onConcentrate: () => void; onRemove: () => void;
}) {
  const schoolColor = SCHOOL_COLORS[spell.school] ?? '#94a3b8';
  const dimmed = isPreparer && spell.level > 0 && !isPrepared;

  return (
    <div style={{
      borderRadius: 10,
      border: `1px solid ${isConcentrating ? 'rgba(167,139,250,0.4)' : isExpanded ? `${schoolColor}35` : 'var(--c-border)'}`,
      background: isConcentrating ? 'rgba(167,139,250,0.04)' : isExpanded ? `${schoolColor}04` : 'var(--c-card)',
      overflow: 'hidden', opacity: dimmed ? 0.55 : 1,
      transition: 'all 0.15s',
    }}>
      {/* Main row */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', minHeight: 52 }}
        onClick={onExpand}
      >
        {/* School color bar */}
        <div style={{ width: 3, height: 36, borderRadius: 2, background: schoolColor, flexShrink: 0, opacity: 0.75 }} />

        {/* Prepare dot — preparers only */}
        {isPreparer && spell.level > 0 && (
          <div
            onClick={e => { e.stopPropagation(); onTogglePrepared(); }}
            title={isPrepared ? 'Prepared — click to unprepare' : 'Not prepared — click to prepare'}
            style={{
              width: 14, height: 14, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
              border: `2px solid ${isPrepared ? 'var(--c-gold)' : 'var(--c-border-m)'}`,
              background: isPrepared ? 'var(--c-gold)' : 'transparent',
              transition: 'all 0.15s',
            }}
          />
        )}

        {/* Spell name + badges */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--t-1)' }}>{spell.name}</span>
            <span style={{ fontSize: 9, fontWeight: 600, color: schoolColor, background: `${schoolColor}15`, border: `1px solid ${schoolColor}30`, padding: '1px 6px', borderRadius: 4 }}>
              {spell.school}
            </span>
            {spell.concentration && (
              <span style={{ fontSize: 9, fontWeight: 700, color: '#a78bfa', background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.3)', padding: '1px 5px', borderRadius: 4 }}>
                Conc.
              </span>
            )}
            {spell.ritual && (
              <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--c-gold-l)', background: 'var(--c-gold-bg)', border: '1px solid var(--c-gold-bdr)', padding: '1px 5px', borderRadius: 4 }}>
                Ritual
              </span>
            )}
            {isConcentrating && (
              <span style={{ fontSize: 9, fontWeight: 800, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                ● Active
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t-3)', marginTop: 2 }}>
            {spell.casting_time} · {spell.range} · {spell.duration}
          </div>
        </div>

        {/* Cast button */}
        <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}>
          {castButton}
        </div>

        {/* Expand chevron */}
        <span style={{ fontSize: 10, color: 'var(--t-3)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>▼</span>
      </div>

      {/* Expanded detail panel */}
      {isExpanded && (
        <div style={{ borderTop: `1px solid ${schoolColor}20`, padding: '12px 14px', background: 'rgba(255,255,255,0.015)' }}>
          {/* Stats row */}
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 10 }}>
            {[['Casting Time', spell.casting_time], ['Range', spell.range], ['Duration', spell.duration], ['Components', spell.components]].map(([k, v]) => v ? (
              <div key={k}>
                <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-3)', marginBottom: 2 }}>{k}</div>
                <div style={{ fontSize: 12, color: 'var(--t-2)', fontWeight: 500 }}>{v}</div>
              </div>
            ) : null)}
          </div>

          {/* Description */}
          <p style={{ fontSize: 13, color: 'var(--t-2)', lineHeight: 1.65, margin: '0 0 12px' }}>{spell.description}</p>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 10, borderTop: '1px solid var(--c-border)', alignItems: 'center' }}>
            {spell.concentration && (
              <button
                onClick={onConcentrate}
                style={{
                  fontSize: 11, fontWeight: 700, padding: '5px 14px', borderRadius: 7, cursor: 'pointer', minHeight: 0,
                  border: isConcentrating ? '1px solid rgba(167,139,250,0.5)' : '1px solid var(--c-border-m)',
                  background: isConcentrating ? 'rgba(167,139,250,0.15)' : 'var(--c-raised)',
                  color: isConcentrating ? '#a78bfa' : 'var(--t-2)',
                }}
              >
                {isConcentrating ? 'Drop Concentration' : 'Concentrate'}
              </button>
            )}
            {isPreparer && spell.level > 0 && (
              <button
                onClick={onTogglePrepared}
                style={{
                  fontSize: 11, fontWeight: 700, padding: '5px 14px', borderRadius: 7, cursor: 'pointer', minHeight: 0,
                  border: isPrepared ? '1px solid var(--c-gold-bdr)' : '1px solid var(--c-border-m)',
                  background: isPrepared ? 'var(--c-gold-bg)' : 'var(--c-raised)',
                  color: isPrepared ? 'var(--c-gold-l)' : 'var(--t-2)',
                }}
              >
                {isPrepared ? '✓ Prepared' : 'Prepare'}
              </button>
            )}
            <button
              onClick={onRemove}
              style={{ fontSize: 11, fontWeight: 600, padding: '5px 14px', borderRadius: 7, cursor: 'pointer', minHeight: 0, marginLeft: 'auto', border: '1px solid rgba(248,113,113,0.2)', background: 'transparent', color: 'var(--stat-str)' }}
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
