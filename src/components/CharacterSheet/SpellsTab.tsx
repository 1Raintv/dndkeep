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

export default function SpellsTab({
  character, computed, knownSpellData, availableSpells, maxSpellLevel,
  concentrationSpellId, hasSpellSlots, onUpdateSlots, onAddSpell,
  onRemoveSpell, onTogglePrepared, onConcentrate, userId, campaignId,
}: SpellsTabProps) {
  const [showBrowser, setShowBrowser] = useState(false);
  const [search, setSearch] = useState('');
  const [filterLevel, setFilterLevel] = useState<number | 'all'>('all');
  const [filterSchool, setFilterSchool] = useState<string>('all');
  const [collapsedLevels, setCollapsedLevels] = useState<Set<number>>(new Set());
  const [expandedKnown, setExpandedKnown] = useState<string | null>(null);
  const [expandedAvailable, setExpandedAvailable] = useState<string | null>(null);

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
      if (search && !s.name.toLowerCase().includes(search.toLowerCase()) &&
          !s.school.toLowerCase().includes(search.toLowerCase()) &&
          !s.description?.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [availableSpells, search, filterLevel, filterSchool]);

  // Unique schools from available spells
  const availableSchools = useMemo(() => {
    const schools = new Set(availableSpells.map(s => s.school));
    return ['all', ...Array.from(schools).sort()];
  }, [availableSpells]);

  function toggleLevel(level: number) {
    setCollapsedLevels(prev => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level); else next.add(level);
      return next;
    });
  }

  const preparerClasses = ['Cleric','Druid','Paladin','Wizard','Artificer'];
  const isPreparer = preparerClasses.includes(character.class_name);
  const prepareMax = character.level + Math.max(0, Math.floor((character.intelligence - 10) / 2));

  if (!hasSpellSlots) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--sp-12)', color: 'var(--t-2)', maxWidth: 720 }}>
        <div style={{ fontSize: 52, marginBottom: 'var(--sp-4)' }}>⚔️</div>
        <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-md)', color: 'var(--t-1)', marginBottom: 'var(--sp-2)' }}>
          {character.class_name}s don't cast spells
        </div>
        <p style={{ fontSize: 'var(--fs-sm)', maxWidth: 340, margin: '0 auto' }}>
          Your power comes from martial skill. Head to the <strong>Combat</strong> tab to manage weapons and inventory.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)', maxWidth: 720 }}>

      {/* Spell slots */}
      <SpellSlotsPanel character={character} onUpdateSlots={onUpdateSlots} />

      {/* Prepare info banner */}
      {isPreparer && (
        <div style={{ padding: 'var(--sp-2) var(--sp-4)', background: 'rgba(212,160,23,0.06)', border: '1px solid rgba(212,160,23,0.2)', borderRadius: 'var(--r-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
            📖 {character.class_name}s prepare spells from the full list each long rest
          </span>
          <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--c-gold-l)' }}>
            {character.prepared_spells.length}/{prepareMax} prepared
          </span>
        </div>
      )}

      {/* ── Spellbook (known spells) ── */}
      {knownSpellData.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 'var(--sp-8)', border: '1px dashed var(--c-border-m)', borderRadius: 'var(--r-xl)', color: 'var(--t-2)' }}>
          <div style={{ fontSize: 32, marginBottom: 'var(--sp-2)' }}>✨</div>
          <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 600, fontSize: 'var(--fs-sm)', color: 'var(--t-1)', marginBottom: 'var(--sp-2)' }}>No spells yet</div>
          <p style={{ fontSize: 'var(--fs-sm)', marginBottom: 'var(--sp-4)' }}>Search and add spells below to build your spellbook.</p>
          <button className="btn-gold btn-sm" onClick={() => setShowBrowser(true)}>Browse Spells</button>
        </div>
      ) : (
        (Object.entries(knownByLevel) as [string, SpellData[]][]).sort(([a], [b]) => +a - +b).map(([lvlStr, spells]) => {
          const level = parseInt(lvlStr);
          const collapsed = collapsedLevels.has(level);
          return (
            <div key={level}>
              {/* Level header — clickable to collapse */}
              <button
                onClick={() => toggleLevel(level)}
                style={{
                  width: '100%', background: 'none', border: 'none', padding: '0 0 var(--sp-2)',
                  display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', cursor: 'pointer',
                }}
              >
                <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--t-2)' }}>
                  {LEVEL_LABELS[level]}
                </span>
                <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', background: 'var(--c-raised)', padding: '1px 6px', borderRadius: 999 }}>
                  {spells.length}
                </span>
                <div style={{ flex: 1, height: 1, background: 'var(--c-border)' }} />
                <span style={{ color: 'var(--t-2)', fontSize: 12, transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform var(--tr-fast)' }}>▼</span>
              </button>

              {!collapsed && (
                <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
                  {spells.map(spell => (
                    <KnownSpellRow
                      key={spell.id}
                      spell={spell}
                      isExpanded={expandedKnown === spell.id}
                      isPrepared={character.prepared_spells.includes(spell.id)}
                      isConcentrating={concentrationSpellId === spell.id}
                      isPreparer={isPreparer}
                      castButton={
                        <SpellCastButton spell={spell} character={character} userId={userId} campaignId={campaignId} onUpdateSlots={onUpdateSlots} />
                      }
                      onExpand={() => setExpandedKnown(expandedKnown === spell.id ? null : spell.id)}
                      onTogglePrepared={() => onTogglePrepared(spell.id)}
                      onConcentrate={() => onConcentrate(spell.id)}
                      onRemove={() => onRemoveSpell(spell.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}

      {/* ── Add Spells Browser ── */}
      <div style={{ border: `1px solid ${showBrowser ? 'rgba(212,160,23,0.3)' : 'var(--c-border)'}`, borderRadius: 'var(--r-xl)', overflow: 'hidden', background: '#080d14', transition: 'border-color var(--tr-fast)' }}>
        {/* Toggle header */}
        <button
          onClick={() => setShowBrowser(v => !v)}
          style={{
            width: '100%', background: showBrowser ? 'rgba(212,160,23,0.06)' : 'transparent',
            border: 'none', padding: 'var(--sp-3) var(--sp-4)',
            display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: 18 }}>✨</span>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--c-gold-l)' }}>
              Add Spells
            </div>
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
              {character.class_name} spells · up to {maxSpellLevel === 0 ? 'cantrips' : `level ${maxSpellLevel}`} · {availableSpells.length} available
            </div>
          </div>
          <span style={{ color: 'var(--c-gold-l)', fontSize: 16, transform: showBrowser ? 'rotate(180deg)' : 'none', transition: 'transform var(--tr-fast)' }}>⌄</span>
        </button>

        {/* Browser panel */}
        {showBrowser && (
          <div className="animate-fade-in" style={{ borderTop: '1px solid rgba(212,160,23,0.15)', padding: 'var(--sp-3) var(--sp-4)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
            {/* Search + level filter */}
            <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search spells…"
                autoFocus
                style={{ flex: 1, minWidth: 140, fontSize: 'var(--fs-sm)' }}
              />
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {(['all', 0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as (number | 'all')[]).filter(l => l === 'all' || (l as number) <= maxSpellLevel).map(l => (
                  <button key={l} onClick={() => setFilterLevel(l as number | 'all')}
                    style={{
                      fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700, padding: '2px 8px',
                      borderRadius: 999, cursor: 'pointer', minHeight: 0,
                      border: filterLevel === l ? '1px solid var(--c-gold)' : '1px solid var(--c-border)',
                      background: filterLevel === l ? 'rgba(212,160,23,0.15)' : 'transparent',
                      color: filterLevel === l ? 'var(--c-gold-l)' : 'var(--t-2)',
                    }}>
                    {l === 'all' ? 'All' : l === 0 ? 'C' : l}
                  </button>
                ))}
              </div>
            </div>

            {/* School filter */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: 'var(--t-2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>School:</span>
              {availableSchools.map(school => (
                <button key={school} onClick={() => setFilterSchool(school)}
                  style={{
                    fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                    cursor: 'pointer', minHeight: 0,
                    border: filterSchool === school ? '1px solid var(--c-gold)' : '1px solid var(--c-border)',
                    background: filterSchool === school ? 'rgba(212,160,23,0.15)' : 'transparent',
                    color: filterSchool === school ? 'var(--c-gold-l)' : 'var(--t-2)',
                  }}>
                  {school === 'all' ? 'All' : school}
                </button>
              ))}
            </div>
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
              {filtered.length} of {availableSpells.length} {character.class_name} spells match
            </div>

            {/* Spell list — collapsed by default, click to expand */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 480, overflowY: 'auto' }}>
              {filtered.map(spell => {
                const isOpen = expandedAvailable === spell.id;
                const schoolColor = SCHOOL_COLORS[spell.school] ?? '#94a3b8';
                return (
                  <div key={spell.id} style={{ borderRadius: 'var(--r-md)', border: `1px solid ${isOpen ? `${schoolColor}40` : 'var(--c-border)'}`, background: isOpen ? `${schoolColor}06` : 'var(--c-card)', overflow: 'hidden', transition: 'border-color var(--tr-fast)' }}>
                    {/* Collapsed row */}
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-2) var(--sp-3)', cursor: 'pointer' }}
                      onClick={() => setExpandedAvailable(isOpen ? null : spell.id)}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 600, fontSize: 'var(--fs-sm)', color: 'var(--t-1)' }}>{spell.name}</span>
                          <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 700, color: schoolColor, background: `${schoolColor}15`, border: `1px solid ${schoolColor}40`, padding: '1px 5px', borderRadius: 999 }}>
                            {spell.level === 0 ? 'Cantrip' : `${spell.level}`} {spell.school}
                          </span>
                          {spell.concentration && <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: '#a78bfa', background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.3)', padding: '1px 5px', borderRadius: 999 }}>Conc</span>}
                          {spell.ritual && <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--c-gold-l)', background: 'rgba(212,160,23,0.12)', border: '1px solid rgba(212,160,23,0.3)', padding: '1px 5px', borderRadius: 999 }}>Ritual</span>}
                        </div>
                        <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', marginTop: 1 }}>
                          {spell.casting_time} · {spell.range} · {spell.duration}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', flexShrink: 0 }}>
                        <button
                          className="btn-gold btn-sm"
                          onClick={e => { e.stopPropagation(); onAddSpell(spell.id); }}
                          style={{ fontSize: 11 }}
                        >
                          + Add
                        </button>
                        <span style={{ color: 'var(--t-2)', fontSize: 11, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform var(--tr-fast)' }}>⌄</span>
                      </div>
                    </div>

                    {/* Expanded description */}
                    {isOpen && (
                      <div className="animate-fade-in" style={{ padding: 'var(--sp-2) var(--sp-3) var(--sp-3)', borderTop: `1px solid ${schoolColor}20` }}>
                        <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', lineHeight: 1.65, margin: 0 }}>
                          {spell.description}
                        </p>
                        {spell.components && (
                          <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', marginTop: 'var(--sp-2)' }}>
                            <strong>Components:</strong> {spell.components}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div style={{ textAlign: 'center', padding: 'var(--sp-6)', color: 'var(--t-2)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)' }}>
                  No spells match your search.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Known spell row (collapsed accordion) ──────────────────────────
function KnownSpellRow({
  spell, isExpanded, isPrepared, isConcentrating, isPreparer, castButton,
  onExpand, onTogglePrepared, onConcentrate, onRemove,
}: {
  spell: SpellData; isExpanded: boolean; isPrepared: boolean; isConcentrating: boolean;
  isPreparer: boolean; castButton: ReactNode;
  onExpand: () => void; onTogglePrepared: () => void;
  onConcentrate: () => void; onRemove: () => void;
}) {
  const schoolColor = SCHOOL_COLORS[spell.school] ?? '#94a3b8';
  return (
    <div style={{
      border: `1px solid ${isExpanded ? `${schoolColor}40` : isConcentrating ? 'rgba(167,139,250,0.4)' : 'var(--c-border)'}`,
      borderRadius: 'var(--r-md)',
      background: isConcentrating ? 'rgba(167,139,250,0.06)' : 'var(--c-card)',
      overflow: 'hidden',
      transition: 'all var(--tr-fast)',
      opacity: isPreparer && !isPrepared && spell.level > 0 ? 0.55 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', padding: '6px var(--sp-3)', cursor: 'pointer' }} onClick={onExpand}>
        {/* Prepare toggle */}
        {isPreparer && spell.level > 0 && (
          <button
            onClick={e => { e.stopPropagation(); onTogglePrepared(); }}
            title={isPrepared ? 'Unprepare' : 'Prepare'}
            style={{
              width: 16, height: 16, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
              border: `2px solid ${isPrepared ? 'var(--c-gold)' : 'var(--c-border-m)'}`,
              background: isPrepared ? 'rgba(212,160,23,0.2)' : 'transparent',
              minHeight: 0, padding: 0,
            }}
          />
        )}
        {/* Name + badges */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 600, fontSize: 'var(--fs-sm)', color: 'var(--t-1)' }}>
            {spell.name}
          </span>
          <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: schoolColor }}>
            {spell.school}
          </span>
          {spell.concentration && <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: '#a78bfa' }}>C</span>}
          {spell.ritual && <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--c-gold-l)' }}>R</span>}
          <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', marginLeft: 'auto' }}>{spell.casting_time}</span>
        </div>
        {/* Cast button + expand */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          {castButton}
        </div>
        <span style={{ color: 'var(--t-2)', fontSize: 11, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform var(--tr-fast)' }}>⌄</span>
      </div>

      {isExpanded && (
        <div className="animate-fade-in" style={{ borderTop: `1px solid ${schoolColor}20`, padding: 'var(--sp-3)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
          <div style={{ display: 'flex', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
            {[['Range', spell.range], ['Duration', spell.duration], ['Components', spell.components]].map(([k, v]) => v ? (
              <div key={k}>
                <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-2)' }}>{k}</div>
                <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>{v}</div>
              </div>
            ) : null)}
          </div>
          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', lineHeight: 1.65, margin: 0 }}>{spell.description}</p>
          <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
            {spell.concentration && (
              <button onClick={onConcentrate} className={isConcentrating ? 'btn-arcane btn-sm' : 'btn-secondary btn-sm'} style={{ fontSize: 11 }}>
                {isConcentrating ? '🔮 Concentrating' : '🔮 Concentrate'}
              </button>
            )}
            <button onClick={onRemove} className="btn-ghost btn-sm" style={{ color: 'var(--c-red-l)', fontSize: 11, marginLeft: 'auto' }}>
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
