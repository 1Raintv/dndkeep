import { useState, useMemo, useEffect } from 'react';
import type { SpellData, SpellLevel, Character } from '../../types';
import { SPELLS, SPELL_CLASSES, SPELL_SCHOOLS } from '../../data/spells';
import { useAuth } from '../../context/AuthContext';
import { getCharacters, updateCharacter } from '../../lib/supabase';

const LEVEL_LABELS: Record<number, string> = {
  0: 'Cantrip', 1: '1st', 2: '2nd', 3: '3rd', 4: '4th',
  5: '5th', 6: '6th', 7: '7th', 8: '8th', 9: '9th',
};

export default function SpellsPage() {
  const { user } = useAuth();
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
    return SPELLS.filter(s => {
      if (search && !s.name.toLowerCase().includes(search.toLowerCase()) &&
          !s.description.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterClass && !s.classes.includes(filterClass)) return false;
      if (filterLevel !== '' && s.level !== filterLevel) return false;
      if (filterSchool && s.school !== filterSchool) return false;
      if (filterConcentration && !s.concentration) return false;
      if (filterRitual && !s.ritual) return false;
      return true;
    }).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  }, [search, filterClass, filterLevel, filterSchool, filterConcentration, filterRitual]);

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
  spell, characters, addingTo, addSuccess,
  onAddStart, onAddCancel, onAddConfirm,
}: {
  spell: SpellData;
  characters: Character[];
  addingTo: string | null;
  addSuccess: string | null;
  onAddStart: () => void;
  onAddCancel: () => void;
  onAddConfirm: (characterId: string, spellId: string) => void;
}) {
  const isPickingChar = addingTo === spell.id;

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

      {/* Add to character */}
      <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 'var(--sp-4)' }}>
        {addSuccess ? (
          <p style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', color: 'var(--hp-full)' }}>
            {addSuccess}
          </p>
        ) : isPickingChar ? (
          <div>
            <p style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', marginBottom: 'var(--sp-2)' }}>
              Add to which character?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
              {characters.map(c => (
                <button
                  key={c.id}
                  className="btn-secondary"
                  onClick={() => onAddConfirm(c.id, spell.id)}
                  style={{ justifyContent: 'space-between' }}
                >
                  <span>{c.name}</span>
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
                    Lv {c.level} {c.class_name}
                    {c.known_spells.includes(spell.id) ? ' — already known' : ''}
                  </span>
                </button>
              ))}
              <button className="btn-ghost btn-sm" onClick={onAddCancel} style={{ alignSelf: 'flex-start' }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            className="btn-gold"
            onClick={onAddStart}
            disabled={characters.length === 0}
            title={characters.length === 0 ? 'Create a character first' : ''}
          >
            Add to Character
          </button>
        )}
      </div>
    </div>
  );
}
