import { useState, useMemo, useEffect } from 'react';
import type { SpellData, SpellLevel, Character } from '../../types';
// v2.152.0 — Phase O pt 5: read from useSpells hook so SpellsPage sees
// the same ~400-spell canonical list that DeclareAttackModal /
// SpellCastButton / SpellPickerDropdown get. Prior to v2.152 this page
// imported the static SPELLS array, which:
//   - missed the 17 spells only in the DB (Ensnaring Strike, Conjure
//     Barrage, Holy Weapon, Swift Quiver, Tasha's Caustic Brew, etc.)
//   - carried stale data for any spell where the DB has been corrected
//     (e.g. Scorching Ray's attack_type, fixed in v2.149)
// SPELL_CLASSES and SPELL_SCHOOLS stay imported because they're static
// label/sort metadata, not spell rows.
import { SPELL_CLASSES, SPELL_SCHOOLS } from '../../data/spells';
import { useSpells } from '../../lib/hooks/useSpells';
import { useAuth } from '../../context/AuthContext';
import { getCharacters, updateCharacter } from '../../lib/supabase';

const LEVEL_LABELS: Record<number, string> = {
  0: 'Cantrip', 1: '1st', 2: '2nd', 3: '3rd', 4: '4th',
  5: '5th', 6: '6th', 7: '7th', 8: '8th', 9: '9th',
};

export default function SpellsPage() {
  const { user } = useAuth();
  const { spells } = useSpells();
  const [search, setSearch] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [filterLevel, setFilterLevel] = useState<number | ''>('');
  const [filterSchool, setFilterSchool] = useState('');
  const [filterConcentration, setFilterConcentration] = useState(false);
  const [filterRitual, setFilterRitual] = useState(false);
  const [selected, setSelected] = useState<SpellData | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [addingTo, setAddingTo] = useState<string | null>(null); // characterId
  const [addSuccess, setAddSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    getCharacters(user.id).then(({ data }) => {
      setCharacters(data);
    });
  }, [user]);

  const filtered = useMemo(() => {
    return spells.filter(s => {
      if (search && !s.name.toLowerCase().includes(search.toLowerCase()) &&
          !s.description.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterClass && !s.classes.includes(filterClass)) return false;
      if (filterLevel !== '' && s.level !== filterLevel) return false;
      if (filterSchool && s.school !== filterSchool) return false;
      if (filterConcentration && !s.concentration) return false;
      if (filterRitual && !s.ritual) return false;
      return true;
    }).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  }, [spells, search, filterClass, filterLevel, filterSchool, filterConcentration, filterRitual]);

  async function addSpellToCharacter(characterId: string, spellId: string) {
    const char = characters.find(c => c.id === characterId);
    if (!char) return;
    const already = char.known_spells.includes(spellId);
    if (already) { setAddSuccess(`Already on ${char.name}`); setTimeout(() => setAddSuccess(null), 2000); return; }
    const updated = { known_spells: [...char.known_spells, spellId] };
    const { error } = await updateCharacter(characterId, updated);
    if (!error) {
      setCharacters(prev => prev.map(c => c.id === characterId ? { ...c, ...updated } : c));
      setAddSuccess(`Added to ${char.name}`);
      setTimeout(() => setAddSuccess(null), 2500);
    }
    setAddingTo(null);
  }

  function clearFilters() {
    setSearch(''); setFilterClass(''); setFilterLevel('');
    setFilterSchool(''); setFilterConcentration(false); setFilterRitual(false);
  }

  const hasFilters = search || filterClass || filterLevel !== '' || filterSchool || filterConcentration || filterRitual;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-6)' }}>
        <h1>Spell Browser</h1>
        <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
          {filtered.length} spell{filtered.length !== 1 ? 's' : ''} found
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 'var(--sp-6)' }}>
        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          {/* Filters */}
          <div className="card" style={{ padding: 'var(--sp-4)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
            <div className="section-header">Filters</div>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or description..." />
            <select value={filterClass} onChange={e => setFilterClass(e.target.value)}>
              <option value="">All Classes</option>
              {SPELL_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-2)' }}>
              <select value={filterLevel} onChange={e => setFilterLevel(e.target.value === '' ? '' : Number(e.target.value) as SpellLevel)}>
                <option value="">All Levels</option>
                {[0,1,2,3,4,5,6,7,8,9].map(l => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
              </select>
              <select value={filterSchool} onChange={e => setFilterSchool(e.target.value)}>
                <option value="">All Schools</option>
                {SPELL_SCHOOLS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-1)', cursor: 'pointer', textTransform: 'none', letterSpacing: 0, fontSize: 'var(--fs-xs)', color: 'var(--t-2)', fontWeight: 400 }}>
                <input type="checkbox" checked={filterConcentration} onChange={e => setFilterConcentration(e.target.checked)} style={{ width: 14, height: 14 }} />
                Concentration
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-1)', cursor: 'pointer', textTransform: 'none', letterSpacing: 0, fontSize: 'var(--fs-xs)', color: 'var(--t-2)', fontWeight: 400 }}>
                <input type="checkbox" checked={filterRitual} onChange={e => setFilterRitual(e.target.checked)} style={{ width: 14, height: 14 }} />
                Ritual
              </label>
            </div>
            {hasFilters && (
              <button className="btn-ghost btn-sm" onClick={clearFilters} style={{ alignSelf: 'flex-start' }}>
                Clear filters
              </button>
            )}
          </div>

          {/* Spell list */}
          <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 340px)', display: 'flex', flexDirection: 'column', gap: 1 }}>
            {filtered.map(spell => (
              <button
                key={spell.id}
                onClick={() => setSelected(spell)}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: 'var(--sp-2) var(--sp-3)',
                  borderRadius: 'var(--r-sm)',
                  border: selected?.id === spell.id ? '1px solid var(--c-gold)' : '1px solid transparent',
                  background: selected?.id === spell.id ? 'rgba(201,146,42,0.1)' : 'transparent',
                  cursor: 'pointer', textAlign: 'left',
                  transition: 'all var(--tr-fast)',
                }}
                onMouseEnter={e => { if (selected?.id !== spell.id) (e.currentTarget as HTMLButtonElement).style.background = 'var(--c-raised)'; }}
                onMouseLeave={e => { if (selected?.id !== spell.id) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
              >
                <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', color: selected?.id === spell.id ? 'var(--c-gold-l)' : 'var(--t-2)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {spell.name}
                </span>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0, marginLeft: 4 }}>
                  {spell.concentration && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--c-gold)', display: 'inline-block' }} title="Concentration" />}
                  {spell.ritual && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#60a5fa', display: 'inline-block' }} title="Ritual" />}
                  <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', minWidth: 36, textAlign: 'right' }}>
                    {LEVEL_LABELS[spell.level]}
                  </span>
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <p style={{ padding: 'var(--sp-4)', color: 'var(--t-2)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', textAlign: 'center' }}>
                No spells match
              </p>
            )}
          </div>
        </div>

        {/* Detail panel */}
        <div>
          {selected ? (
            <SpellDetail
              spell={selected}
              characters={characters}
              addingTo={addingTo}
              addSuccess={addSuccess}
              onAddStart={() => setAddingTo(selected.id)}
              onAddCancel={() => setAddingTo(null)}
              onAddConfirm={addSpellToCharacter}
            />
          ) : (
            <div className="panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
              <p style={{ color: 'var(--t-2)', fontStyle: 'italic', fontFamily: 'var(--ff-body)' }}>
                Select a spell to view details
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SpellDetail({
  spell, characters, addSuccess, onAddConfirm,
}: {
  spell: SpellData;
  characters: Character[];
  addingTo: string | null;
  addSuccess: string | null;
  onAddStart: () => void;
  onAddCancel: () => void;
  onAddConfirm: (characterId: string, spellId: string) => void;
}) {
  return (
    <div className="card card-gold animate-fade-in" style={{ position: 'sticky', top: 72 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--sp-4)' }}>
        <div>
          <h2 style={{ marginBottom: 'var(--sp-1)' }}>{spell.name}</h2>
          <p style={{ color: 'var(--t-2)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)' }}>
            {LEVEL_LABELS[spell.level]} {spell.school}
            {spell.ritual && ' (ritual)'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {spell.concentration && <span className="badge badge-gold">Concentration</span>}
          {spell.ritual && <span className="badge badge-muted">Ritual</span>}
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)' }}>
        {[
          ['Casting Time', spell.casting_time],
          ['Range', spell.range],
          ['Components', spell.components],
          ['Duration', spell.duration],
        ].map(([l, v]) => (
          <div key={l}>
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t-2)', marginBottom: 2 }}>{l}</div>
            <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)' }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Description */}
      <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 'var(--sp-4)', marginBottom: 'var(--sp-4)' }}>
        <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.7 }}>{spell.description}</p>
      </div>

      {/* Higher levels */}
      {spell.higher_levels && (
        <div style={{ background: '#080d14', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)', borderLeft: '2px solid var(--c-gold)', marginBottom: 'var(--sp-4)' }}>
          <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--c-gold-l)' }}>At Higher Levels. </span>
          <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)' }}>{spell.higher_levels}</span>
        </div>
      )}

      {/* Classes */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', marginBottom: 'var(--sp-4)' }}>
        {spell.classes.map(c => <span key={c} className="badge badge-muted">{c}</span>)}
      </div>

      {/* v2.177.0 — Phase Q.0 pt 18: direct per-character add buttons
          with eligibility gating. Previously, a generic "Add to
          Character" button opened a picker that let you add ANY spell
          to ANY character regardless of class/level access — users
          were putting Fireball on their Fighter. Now each character
          gets a dedicated button, disabled with a reason tooltip when
          ineligible:
            • Class not on spell.classes     → "Not on [Class] spell list"
            • Cantrip (level 0)              → always OK if class matches
            • Leveled spell                  → character needs a spell
                                               slot of that level or higher
            • Already known                  → disabled with ✓ indicator
          Known limitation: subclass-granted access (Eldritch Knight,
          Arcane Trickster, Artificer infusions) isn't checked — those
          require a subclass-specific spell-list fetch that's out of
          scope. Fall-through is restrictive (disallow), which is the
          correct conservative default. */}
      <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 'var(--sp-4)' }}>
        {addSuccess ? (
          <p style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', color: 'var(--hp-full)' }}>
            {addSuccess}
          </p>
        ) : characters.length === 0 ? (
          <p style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', color: 'var(--t-3)', fontStyle: 'italic' as const }}>
            Create a character first to add spells.
          </p>
        ) : (
          <div>
            <p style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--t-3)', marginBottom: 'var(--sp-2)' }}>
              Add to Character
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
              {characters.map(c => {
                const elig = getSpellEligibility(c, spell);
                const already = c.known_spells.includes(spell.id);
                const disabled = !elig.eligible || already;
                const tooltip =
                  already ? `${c.name} already knows this spell`
                  : !elig.eligible ? elig.reason
                  : `Add ${spell.name} to ${c.name}`;
                return (
                  <button
                    key={c.id}
                    onClick={() => !disabled && onAddConfirm(c.id, spell.id)}
                    disabled={disabled}
                    title={tooltip}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 'var(--sp-3)',
                      padding: '10px 14px', borderRadius: 'var(--r-md)',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      minHeight: 0,
                      border: `1px solid ${disabled ? 'var(--c-border)' : 'rgba(212,160,23,0.45)'}`,
                      background: disabled ? 'var(--c-raised)' : 'rgba(212,160,23,0.08)',
                      color: disabled ? 'var(--t-3)' : 'var(--t-1)',
                      opacity: disabled ? 0.55 : 1,
                      textAlign: 'left' as const,
                      transition: 'all var(--tr-fast)',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-start', gap: 2, minWidth: 0, flex: 1 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: disabled ? 'var(--t-2)' : 'var(--c-gold-l)' }}>
                        {already ? '✓ ' : '+ Add to '}{c.name}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--t-3)', fontWeight: 500 }}>
                        Level {c.level} {c.class_name}
                        {already && ' — already known'}
                        {!already && !elig.eligible && ` — ${elig.reason}`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// v2.177.0 — Phase Q.0 pt 18: check whether a character can currently
// learn/prepare a given spell from the browser.
//
// Rules (RAW 2024, simplified):
//   1. The character's class must be on spell.classes (case-insensitive).
//   2. For cantrips (level 0), rule 1 is sufficient.
//   3. For leveled spells, the character needs at least one spell slot
//      at that level (meaning: their class progression has advanced
//      far enough to cast this level of spell). We check
//      spell_slots[String(level)].total > 0.
//
// Known gaps (flagged as debt, not a blocker):
//   • Subclass-granted access — Eldritch Knight can learn Abjuration
//     & Evocation wizard spells; Arcane Trickster can learn
//     Enchantment & Illusion. Not currently modeled.
//   • Artificer infusions, Warlock Pact of the Tome, etc. — same.
//   • 2024 half-casters (Paladin, Ranger) get spell lists at level 2;
//     at level 1 spell_slots will be empty, which correctly disallows
//     learning leveled spells. This is RAW.
function getSpellEligibility(
  char: Character,
  spell: SpellData,
): { eligible: true } | { eligible: false; reason: string } {
  const charClass = (char.class_name ?? '').trim().toLowerCase();
  const spellClasses = (spell.classes ?? []).map(c => c.toLowerCase());
  if (!charClass) {
    return { eligible: false, reason: 'Character has no class set' };
  }
  if (!spellClasses.includes(charClass)) {
    return { eligible: false, reason: `Not on ${char.class_name} spell list` };
  }
  if (spell.level === 0) {
    return { eligible: true }; // cantrip — class check is enough
  }
  const slotKey = String(spell.level);
  const slot = char.spell_slots?.[slotKey];
  if (!slot || slot.total <= 0) {
    return { eligible: false, reason: `No Level ${spell.level} slots at this level` };
  }
  return { eligible: true };
}
