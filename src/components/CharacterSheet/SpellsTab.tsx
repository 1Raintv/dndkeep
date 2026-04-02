import { useState, useMemo, type ReactNode } from 'react';
import type { Character, ComputedStats, SpellData } from '../../types';
import SpellSlotsPanel from './SpellSlots';
import SpellCastButton from './SpellCastButton';

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
  0: 'Cantrips', 1: '1st Level', 2: '2nd Level', 3: '3rd Level',
  4: '4th Level', 5: '5th Level', 6: '6th Level', 7: '7th Level',
  8: '8th Level', 9: '9th Level',
};

const PREPARER_CLASSES = ['Cleric', 'Druid', 'Paladin', 'Wizard', 'Artificer'];

export default function SpellsTab({
  character, computed, knownSpellData, availableSpells, maxSpellLevel,
  concentrationSpellId, hasSpellSlots, onUpdateSlots, onAddSpell,
  onRemoveSpell, onTogglePrepared, onConcentrate, userId, campaignId,
}: SpellsTabProps) {
  const [showBrowser, setShowBrowser] = useState(false);
  const [search, setSearch] = useState('');
  const [filterLevel, setFilterLevel] = useState<number | 'all'>('all');
  const [filterSchool, setFilterSchool] = useState<string>('all');
  const [filterPrepared, setFilterPrepared] = useState(false);
  const [collapsedLevels, setCollapsedLevels] = useState<Set<number>>(new Set());
  const [expandedKnown, setExpandedKnown] = useState<string | null>(null);
  const [expandedAvailable, setExpandedAvailable] = useState<string | null>(null);

  const isPreparer = PREPARER_CLASSES.includes(character.class_name);
  const prepareMax = isPreparer
    ? character.level + Math.max(0, Math.floor(((character.class_name === 'Wizard' || character.class_name === 'Artificer'
        ? character.intelligence
        : character.class_name === 'Paladin'
          ? character.charisma
          : character.wisdom) - 10) / 2))
    : 0;

  // Slot info per level
  const slotInfo = useMemo(() => {
    const info: Record<number, { max: number; remaining: number }> = {};
    if (character.spell_slots) {
      Object.entries(character.spell_slots).forEach(([k, v]) => {
        const lvl = parseInt(k.replace('level_', ''));
        if (!isNaN(lvl)) info[lvl] = v as unknown as { max: number; remaining: number };
      });
    }
    return info;
  }, [character.spell_slots]);

  // Group known spells by level
  const knownByLevel = useMemo(() => {
    const map: Record<number, SpellData[]> = {};
    for (const spell of knownSpellData) {
      if (!map[spell.level]) map[spell.level] = [];
      map[spell.level].push(spell);
    }
    return map;
  }, [knownSpellData]);

  // Filter available spells for browser
  const filtered = useMemo(() => {
    return availableSpells.filter(s => {
      if (filterLevel !== 'all' && s.level !== filterLevel) return false;
      if (filterSchool !== 'all' && s.school !== filterSchool) return false;
      if (filterPrepared && !character.prepared_spells.includes(s.id)) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!s.name.toLowerCase().includes(q) &&
            !s.school.toLowerCase().includes(q) &&
            !(s.description?.toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [availableSpells, search, filterLevel, filterSchool, filterPrepared, character.prepared_spells]);

  const availableSchools = useMemo(() => {
    const schools = new Set(availableSpells.map(s => s.school));
    return Array.from(schools).sort();
  }, [availableSpells]);

  function toggleLevel(level: number) {
    setCollapsedLevels(prev => {
      const next = new Set(prev);
      next.has(level) ? next.delete(level) : next.add(level);
      return next;
    });
  }

  // Non-caster empty state
  if (!hasSpellSlots) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--sp-12)', color: 'var(--t-2)', maxWidth: 720 }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)', maxWidth: 740 }}>

      {/* Spell slots */}
      <SpellSlotsPanel character={character} onUpdateSlots={onUpdateSlots} />

      {/* Preparer status bar */}
      {isPreparer && (
        <div style={{ padding: 'var(--sp-2) var(--sp-4)', background: 'rgba(212,160,23,0.05)', border: '1px solid rgba(212,160,23,0.2)', borderRadius: 'var(--r-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--sp-3)' }}>
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
            {character.class_name}s prepare spells from the full list each long rest.
          </span>
          <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: preparedCount >= prepareMax ? 'var(--c-gold-l)' : 'var(--t-2)', whiteSpace: 'nowrap' }}>
            {preparedCount} / {prepareMax} prepared
          </span>
        </div>
      )}

      {/* Search + filter bar — always visible */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', padding: 'var(--sp-3) var(--sp-4)', background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-xl)' }}>
        {/* Search row */}
        <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search spells by name, school, or description..."
            style={{ flex: 1, fontSize: 'var(--fs-sm)' }}
          />
          {isPreparer && (
            <button
              onClick={() => setFilterPrepared(v => !v)}
              style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, padding: '4px 12px', borderRadius: 999, cursor: 'pointer', minHeight: 0, whiteSpace: 'nowrap',
                border: filterPrepared ? '1px solid var(--c-gold)' : '1px solid var(--c-border-m)',
                background: filterPrepared ? 'var(--c-gold-bg)' : 'transparent',
                color: filterPrepared ? 'var(--c-gold-l)' : 'var(--t-2)' }}>
              Prepared only
            </button>
          )}
        </div>

        {/* Level pills */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t-3)', marginRight: 2 }}>Level</span>
          {(['all', 0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as (number | 'all')[])
            .filter(l => l === 'all' || (l as number) <= maxSpellLevel)
            .map(l => {
              const active = filterLevel === l;
              const slots = l !== 'all' && l > 0 ? slotInfo[l as number] : null;
              return (
                <button key={l} onClick={() => setFilterLevel(l)}
                  style={{ fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 999, cursor: 'pointer', minHeight: 0,
                    border: active ? '1px solid var(--c-gold)' : '1px solid var(--c-border-m)',
                    background: active ? 'var(--c-gold-bg)' : 'transparent',
                    color: active ? 'var(--c-gold-l)' : 'var(--t-2)' }}>
                  {l === 'all' ? 'All' : l === 0 ? 'Cantrip' : `${l}${slots ? ` (${slots.remaining}/${slots.max})` : ''}`}
                </button>
              );
            })}
        </div>

        {/* School pills */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t-3)', marginRight: 2 }}>School</span>
          <button onClick={() => setFilterSchool('all')}
            style={{ fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 999, cursor: 'pointer', minHeight: 0,
              border: filterSchool === 'all' ? '1px solid var(--c-gold)' : '1px solid var(--c-border-m)',
              background: filterSchool === 'all' ? 'var(--c-gold-bg)' : 'transparent',
              color: filterSchool === 'all' ? 'var(--c-gold-l)' : 'var(--t-2)' }}>All</button>
          {availableSchools.map(school => {
            const color = SCHOOL_COLORS[school] ?? '#94a3b8';
            const active = filterSchool === school;
            return (
              <button key={school} onClick={() => setFilterSchool(school)}
                style={{ fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 999, cursor: 'pointer', minHeight: 0,
                  border: active ? `1px solid ${color}` : '1px solid var(--c-border-m)',
                  background: active ? `${color}18` : 'transparent',
                  color: active ? color : 'var(--t-2)' }}>
                {school}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Spellbook (known/prepared spells) ── */}
      {knownSpellData.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 'var(--sp-8)', border: '1px dashed var(--c-border-m)', borderRadius: 'var(--r-xl)', color: 'var(--t-2)' }}>
          <div style={{ fontWeight: 600, fontSize: 'var(--fs-sm)', color: 'var(--t-1)', marginBottom: 'var(--sp-2)' }}>No spells in spellbook</div>
          <p style={{ fontSize: 'var(--fs-sm)', marginBottom: 'var(--sp-4)' }}>Use the browser below to add {character.class_name} spells.</p>
          <button className="btn-gold btn-sm" onClick={() => setShowBrowser(true)}>Browse Spells</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
          {(Object.entries(knownByLevel) as [string, SpellData[]][])
            .sort(([a], [b]) => +a - +b)
            .filter(([lvlStr, spells]) => {
              const level = parseInt(lvlStr);
              if (filterLevel !== 'all' && level !== filterLevel) return false;
              if (search) return spells.some(s =>
                s.name.toLowerCase().includes(search.toLowerCase()) ||
                s.school.toLowerCase().includes(search.toLowerCase())
              );
              return true;
            })
            .map(([lvlStr, allSpells]) => {
              const level = parseInt(lvlStr);
              const spells = filterPrepared && isPreparer && level > 0
                ? allSpells.filter(s => character.prepared_spells.includes(s.id))
                : allSpells;
              if (spells.length === 0) return null;
              const collapsed = collapsedLevels.has(level);
              const slots = level > 0 ? slotInfo[level] : null;
              return (
                <div key={level}>
                  <button onClick={() => toggleLevel(level)} style={{ width: '100%', background: 'none', border: 'none', padding: '0 0 var(--sp-2)', display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', cursor: 'pointer' }}>
                    <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t-2)' }}>
                      {LEVEL_LABELS[level]}
                    </span>
                    <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)', background: 'var(--c-raised)', padding: '1px 6px', borderRadius: 999 }}>
                      {spells.length}
                    </span>
                    {/* Slot pips */}
                    {slots && (
                      <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                        {Array.from({ length: slots.max }).map((_, i) => (
                          <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', border: '1px solid var(--c-gold)', background: i < slots.remaining ? 'var(--c-gold)' : 'transparent' }} />
                        ))}
                      </div>
                    )}
                    <div style={{ flex: 1, height: 1, background: 'var(--c-border)' }} />
                    <span style={{ color: 'var(--t-2)', fontSize: 11, transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform var(--tr-fast)' }}>▼</span>
                  </button>

                  {!collapsed && (
                    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
                      {spells
                        .filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.school.toLowerCase().includes(search.toLowerCase()))
                        .map(spell => (
                          <KnownSpellRow
                            key={spell.id}
                            spell={spell}
                            isExpanded={expandedKnown === spell.id}
                            isPrepared={character.prepared_spells.includes(spell.id)}
                            isConcentrating={concentrationSpellId === spell.id}
                            isPreparer={isPreparer}
                            castButton={<SpellCastButton spell={spell} character={character} userId={userId} campaignId={campaignId} onUpdateSlots={onUpdateSlots} />}
                            onExpand={() => setExpandedKnown(expandedKnown === spell.id ? null : spell.id)}
                            onTogglePrepared={() => onTogglePrepared(spell.id)}
                            onConcentrate={() => onConcentrate(spell.id)}
                            onRemove={() => onRemoveSpell(spell.id)}
                          />
                        ))
                      }
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {/* ── Add Spells Browser ── */}
      <div style={{ border: `1px solid ${showBrowser ? 'rgba(212,160,23,0.3)' : 'var(--c-border)'}`, borderRadius: 'var(--r-xl)', overflow: 'hidden', background: '#080d14' }}>
        <button onClick={() => setShowBrowser(v => !v)} style={{ width: '100%', background: showBrowser ? 'rgba(212,160,23,0.05)' : 'transparent', border: 'none', padding: 'var(--sp-3) var(--sp-4)', display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', cursor: 'pointer' }}>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--c-gold-l)' }}>Add Spells</div>
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
              {character.class_name} spell list · up to level {maxSpellLevel === 0 ? 'cantrip' : maxSpellLevel} · {availableSpells.length} available
            </div>
          </div>
          <span style={{ color: 'var(--c-gold-l)', fontSize: 14, transform: showBrowser ? 'rotate(180deg)' : 'none', transition: 'transform var(--tr-fast)' }}>▼</span>
        </button>

        {showBrowser && (
          <div className="animate-fade-in" style={{ borderTop: '1px solid rgba(212,160,23,0.15)', padding: 'var(--sp-3) var(--sp-4)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
              {filtered.length} spell{filtered.length !== 1 ? 's' : ''} match
              {search ? ` "${search}"` : ''}
              {filterLevel !== 'all' ? ` · level ${filterLevel === 0 ? 'cantrip' : filterLevel}` : ''}
              {filterSchool !== 'all' ? ` · ${filterSchool}` : ''}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 520, overflowY: 'auto' }}>
              {filtered.map(spell => {
                const isOpen = expandedAvailable === spell.id;
                const schoolColor = SCHOOL_COLORS[spell.school] ?? '#94a3b8';
                const alreadyKnown = character.known_spells.includes(spell.id);
                return (
                  <div key={spell.id} style={{ borderRadius: 'var(--r-md)', border: `1px solid ${isOpen ? `${schoolColor}40` : 'var(--c-border)'}`, background: isOpen ? `${schoolColor}05` : 'var(--c-card)', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-2) var(--sp-3)', cursor: 'pointer' }} onClick={() => setExpandedAvailable(isOpen ? null : spell.id)}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600, fontSize: 'var(--fs-sm)', color: alreadyKnown ? 'var(--t-3)' : 'var(--t-1)' }}>{spell.name}</span>
                          <span style={{ fontSize: 9, fontWeight: 700, color: schoolColor, background: `${schoolColor}15`, border: `1px solid ${schoolColor}40`, padding: '1px 5px', borderRadius: 999 }}>
                            {spell.level === 0 ? 'Cantrip' : `Lv${spell.level}`} · {spell.school}
                          </span>
                          {spell.concentration && <span style={{ fontSize: 9, color: '#a78bfa', background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.3)', padding: '1px 5px', borderRadius: 999 }}>Conc</span>}
                          {spell.ritual && <span style={{ fontSize: 9, color: 'var(--c-gold-l)', background: 'rgba(212,160,23,0.12)', border: '1px solid rgba(212,160,23,0.3)', padding: '1px 5px', borderRadius: 999 }}>Ritual</span>}
                        </div>
                        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-3)', marginTop: 1 }}>{spell.casting_time} · {spell.range} · {spell.duration}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', flexShrink: 0 }}>
                        {alreadyKnown ? (
                          <span style={{ fontSize: 11, color: 'var(--t-3)', padding: '3px 10px', border: '1px solid var(--c-border)', borderRadius: 999 }}>Known</span>
                        ) : (
                          <button className="btn-gold btn-sm" onClick={e => { e.stopPropagation(); onAddSpell(spell.id); }} style={{ fontSize: 11 }}>+ Add</button>
                        )}
                        <span style={{ color: 'var(--t-2)', fontSize: 11, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform var(--tr-fast)' }}>▼</span>
                      </div>
                    </div>
                    {isOpen && (
                      <div className="animate-fade-in" style={{ padding: 'var(--sp-2) var(--sp-3) var(--sp-3)', borderTop: `1px solid ${schoolColor}20` }}>
                        <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', lineHeight: 1.65, margin: '0 0 var(--sp-2)' }}>{spell.description}</p>
                        {spell.components && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-3)' }}><strong>Components:</strong> {spell.components}</div>}
                      </div>
                    )}
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div style={{ textAlign: 'center', padding: 'var(--sp-6)', color: 'var(--t-2)', fontSize: 'var(--fs-sm)' }}>No spells match your filters.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Known spell row ─────────────────────────────────────────────────
function KnownSpellRow({ spell, isExpanded, isPrepared, isConcentrating, isPreparer, castButton, onExpand, onTogglePrepared, onConcentrate, onRemove }: {
  spell: SpellData; isExpanded: boolean; isPrepared: boolean; isConcentrating: boolean;
  isPreparer: boolean; castButton: ReactNode;
  onExpand: () => void; onTogglePrepared: () => void;
  onConcentrate: () => void; onRemove: () => void;
}) {
  const schoolColor = SCHOOL_COLORS[spell.school] ?? '#94a3b8';
  const dimmed = isPreparer && !isPrepared && spell.level > 0;
  return (
    <div style={{
      border: `1px solid ${isConcentrating ? 'rgba(167,139,250,0.5)' : isExpanded ? `${schoolColor}40` : 'var(--c-border)'}`,
      borderRadius: 'var(--r-md)', background: isConcentrating ? 'rgba(167,139,250,0.05)' : 'var(--c-card)',
      overflow: 'hidden', opacity: dimmed ? 0.5 : 1, transition: 'all var(--tr-fast)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', padding: '7px var(--sp-3)', cursor: 'pointer' }} onClick={onExpand}>
        {/* Prepare dot */}
        {isPreparer && spell.level > 0 && (
          <button onClick={e => { e.stopPropagation(); onTogglePrepared(); }} title={isPrepared ? 'Unprepare' : 'Prepare'}
            style={{ width: 14, height: 14, borderRadius: '50%', flexShrink: 0, cursor: 'pointer', minHeight: 0, padding: 0,
              border: `2px solid ${isPrepared ? 'var(--c-gold)' : 'var(--c-border-m)'}`,
              background: isPrepared ? 'rgba(212,160,23,0.25)' : 'transparent' }} />
        )}
        {/* Name + meta */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: 'var(--fs-sm)', color: 'var(--t-1)' }}>{spell.name}</span>
          <span style={{ fontSize: 9, color: schoolColor }}>{spell.school}</span>
          {spell.concentration && <span style={{ fontSize: 9, color: '#a78bfa', background: 'rgba(167,139,250,0.12)', padding: '1px 5px', borderRadius: 999, border: '1px solid rgba(167,139,250,0.25)' }}>Conc</span>}
          {spell.ritual && <span style={{ fontSize: 9, color: 'var(--c-gold-l)', background: 'var(--c-gold-bg)', padding: '1px 5px', borderRadius: 999, border: '1px solid var(--c-gold-bdr)' }}>Ritual</span>}
          {isConcentrating && <span style={{ fontSize: 9, color: '#a78bfa', fontWeight: 700 }}>Concentrating</span>}
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-3)', marginLeft: 'auto' }}>{spell.casting_time}</span>
        </div>
        {/* Cast button */}
        <div style={{ flexShrink: 0 }} onClick={e => e.stopPropagation()}>{castButton}</div>
        <span style={{ color: 'var(--t-2)', fontSize: 11, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform var(--tr-fast)', flexShrink: 0 }}>▼</span>
      </div>

      {isExpanded && (
        <div className="animate-fade-in" style={{ borderTop: `1px solid ${schoolColor}20`, padding: 'var(--sp-3)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
          <div style={{ display: 'flex', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
            {[['Range', spell.range], ['Duration', spell.duration], ['Components', spell.components]].map(([k, v]) => v ? (
              <div key={k}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-3)', marginBottom: 2 }}>{k}</div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>{v}</div>
              </div>
            ) : null)}
          </div>
          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', lineHeight: 1.65, margin: 0 }}>{spell.description}</p>
          <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap', paddingTop: 4, borderTop: '1px solid var(--c-border)' }}>
            {spell.concentration && (
              <button onClick={onConcentrate} className={isConcentrating ? 'btn-arcane btn-sm' : 'btn-secondary btn-sm'} style={{ fontSize: 11 }}>
                {isConcentrating ? 'Drop Concentration' : 'Concentrate'}
              </button>
            )}
            <button onClick={onRemove} className="btn-ghost btn-sm" style={{ color: 'var(--c-red-l)', fontSize: 11, marginLeft: 'auto' }}>Remove</button>
          </div>
        </div>
      )}
    </div>
  );
}
