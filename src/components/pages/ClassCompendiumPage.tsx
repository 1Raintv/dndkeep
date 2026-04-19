import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CLASSES, CLASS_MAP } from '../../data/classes';
import { CLASS_FEATURES } from '../../data/classFeatures';
import { CLASS_LEVEL_PROGRESSION } from '../../data/levelProgression';
import { getSpellSlotRow } from '../../data/spellSlots';
import { ARTIFICER_INFUSIONS, getActiveInfusionCount } from '../../data/artificerInfusions';
import { PSION_DISCIPLINES, getDisciplineCount } from '../../data/psionDisciplines';

// Class color accents
const CLASS_COLORS: Record<string, string> = {
  Barbarian:  '#ef4444',
  Bard:       '#a855f7',
  Cleric:     '#f59e0b',
  Druid:      '#22c55e',
  Fighter:    '#6366f1',
  Monk:       '#06b6d4',
  Paladin:    '#fbbf24',
  Ranger:     '#84cc16',
  Rogue:      '#64748b',
  Sorcerer:   '#f97316',
  Warlock:    '#7c3aed',
  Wizard:     '#3b82f6',
  Artificer:  '#8b5cf6',
  Psion:      '#e879f9',
};

const CLASS_ICONS: Record<string, string> = {
  Barbarian: '', Bard: '', Cleric: '', Druid: '',
  Fighter: '', Monk: '', Paladin: '', Ranger: '',
  Rogue: '', Sorcerer: '', Warlock: '', Wizard: '',
  Artificer: '', Psion: '',
};

const CLASS_TAGLINES: Record<string, string> = {
  Barbarian: 'Primal warrior who channels rage into devastating power.',
  Bard: 'Magical performer who weaves music and magic to inspire and deceive.',
  Cleric: 'Holy warrior who channels divine power through devotion to a deity.',
  Druid: 'Nature priest who harnesses elemental forces and shapeshifts into beasts.',
  Fighter: 'Versatile martial combatant with unmatched weapon mastery and stamina.',
  Monk: 'Disciplined martial artist who channels inner energy through body and mind.',
  Paladin: 'Holy warrior bound by a sacred oath, wielding divine power and martial might.',
  Ranger: 'Skilled tracker and hunter who is at home in the wilderness.',
  Rogue: 'Cunning trickster who strikes from the shadows for devastating effect.',
  Sorcerer: 'Spellcaster with innate magical power flowing from a mystical bloodline.',
  Warlock: 'Spellcaster who draws eldritch power from a pact with an otherworldly patron.',
  Wizard: 'Scholar who masters spells through study, intellect, and spellbooks.',
  Artificer: 'Inventor who infuses items with magic and deploys mechanical constructs.',
  Psion: 'Psionic spellcaster who wields telekinesis, telepathy, and psionic disciplines. (UA)',
};

function profBonus(level: number) {
  return level >= 17 ? 6 : level >= 13 ? 5 : level >= 9 ? 4 : level >= 5 ? 3 : 2;
}

export default function ClassCompendiumPage() {
  const { className: urlClass, subclassSlug } = useParams<{ className?: string; subclassSlug?: string }>();
  const navigate = useNavigate();

  const [selectedClass, setSelectedClass] = useState<string>(
    urlClass ? CLASSES.find(c => c.name.toLowerCase().replace(/\s+/g, '-') === urlClass)?.name ?? '' : ''
  );
  const [selectedSubclass, setSelectedSubclass] = useState<string>('');
  const [expandedFeature, setExpandedFeature] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const classData = selectedClass ? CLASS_MAP[selectedClass] : null;
  const subclassData = classData?.subclasses?.find(s => s.name === selectedSubclass) ?? null;
  const accentColor = selectedClass ? (CLASS_COLORS[selectedClass] ?? '#a78bfa') : '#a78bfa';

  // Build full level 1-20 progression
  const progression = useMemo(() => {
    if (!classData) return [];
    const classFeaturesList = CLASS_FEATURES[classData.name] ?? [];

    return Array.from({ length: 20 }, (_, i) => {
      const level = i + 1;
      const pb = profBonus(level);
      const slots = getSpellSlotRow(classData.name, level);
      const hasSlots = slots.some(s => s > 0);

      // Class features gained at this level
      const gainedFeatures = classFeaturesList.filter(f => f.level === level);

      // Subclass features at this level (if subclass selected)
      const subclassFeats = subclassData?.features?.filter(f => f.level === level) ?? [];

      // Replace generic "Subclass Feature" with actual subclass feature names
      const displayFeatures = gainedFeatures.map(f => {
        if (f.isSubclassFeature && subclassFeats.length > 0) {
          return { ...f, displayName: subclassFeats.map(sf => sf.name).join(', '), subclassFeats };
        }
        return { ...f, displayName: f.name, subclassFeats: [] };
      });

      return { level, pb, slots: hasSlots ? slots : null, features: displayFeatures };
    });
  }, [classData, subclassData]);

  // All features for the reference section below the table
  const allClassFeatures = useMemo(() => {
    if (!classData) return [];
    return CLASS_FEATURES[classData.name] ?? [];
  }, [classData]);

  const filteredClasses = CLASSES.filter(c =>
    search === '' || c.name.toLowerCase().includes(search.toLowerCase())
  );

  function selectClass(name: string) {
    setSelectedClass(name);
    setSelectedSubclass('');
    setExpandedFeature(null);
    navigate(`/compendium/${name.toLowerCase().replace(/\s+/g, '-')}`);
  }

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, background: 'var(--c-bg)' }}>

      {/* ── LEFT PANEL: Class List ── */}
      <div style={{
        width: 220, flexShrink: 0, borderRight: '1px solid var(--c-border)',
        background: 'var(--c-card)', display: 'flex', flexDirection: 'column',
        height: '100%', overflowY: 'auto',
      }}>
        <div style={{ padding: '16px 14px 10px', borderBottom: '1px solid var(--c-border)', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--c-gold-l)', marginBottom: 10 }}>
            Classes
          </div>
          <input
            type="text"
            placeholder="Filter classes..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '5px 9px', borderRadius: 'var(--r-md)',
              border: '1px solid var(--c-border)', background: 'var(--c-raised)',
              color: 'var(--t-1)', fontFamily: 'var(--ff-body)', fontSize: 12,
              outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {filteredClasses.map(cls => {
            const color = CLASS_COLORS[cls.name] ?? '#a78bfa';
            const isSelected = selectedClass === cls.name;
            return (
              <button
                key={cls.name}
                onClick={() => selectClass(cls.name)}
                style={{
                  width: '100%', textAlign: 'left', padding: '8px 14px',
                  background: isSelected ? color + '18' : 'transparent',
                  border: 'none', borderLeft: isSelected ? `3px solid ${color}` : '3px solid transparent',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                  transition: 'all 0.12s',
                }}
              >
                <span style={{ fontSize: 15, flexShrink: 0 }}>{CLASS_ICONS[cls.name] ?? ''}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--ff-body)', fontWeight: isSelected ? 700 : 600, fontSize: 13, color: isSelected ? color : 'var(--t-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {cls.name}
                  </div>
                  <div style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--t-3)', marginTop: 1 }}>
                    d{cls.hit_die} • {cls.is_spellcaster ? (cls.spellcaster_type === 'warlock' ? 'Pact Magic' : cls.spellcaster_type === 'full' ? 'Full Caster' : 'Half Caster') : 'Non-Caster'}
                    {(cls as any).source === 'ua' && <span style={{ color: '#e879f9', marginLeft: 4 }}>UA</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── RIGHT PANEL: Class Detail ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
        {!selectedClass ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16 }}>
            <div style={{ fontSize: 48, opacity: 0.3 }}></div>
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 18, fontWeight: 700, color: 'var(--t-2)' }}>Select a Class</div>
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 14, color: 'var(--t-3)', textAlign: 'center', maxWidth: 300 }}>
              Choose a class from the left to see the full level 1–20 progression, feature descriptions, and subclass options.
            </div>
          </div>
        ) : classData && (
          <div style={{ maxWidth: 960, margin: '0 auto' }}>

            {/* Class Header */}
            <div style={{
              background: `linear-gradient(135deg, ${accentColor}12, ${accentColor}06)`,
              border: `1px solid ${accentColor}30`,
              borderRadius: 'var(--r-xl)', padding: '24px 28px', marginBottom: 24,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                <div style={{ fontSize: 40, flexShrink: 0 }}>{CLASS_ICONS[classData.name] ?? ''}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
                    <h1 style={{ fontFamily: 'var(--ff-head)', fontSize: 28, fontWeight: 900, color: accentColor, margin: 0 }}>
                      {classData.name}
                    </h1>
                    {(classData as any).source === 'ua' && (
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: '#e879f9', background: 'rgba(232,121,249,0.15)', border: '1px solid rgba(232,121,249,0.4)', borderRadius: 999, padding: '2px 8px' }}>
                        UNEARTHED ARCANA
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: 'var(--ff-body)', fontSize: 14, color: 'var(--t-2)', lineHeight: 1.5, marginBottom: 16 }}>
                    {(classData as any).description ?? CLASS_TAGLINES[classData.name]}
                  </div>

                  {/* Quick Stats */}
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {[
                      { label: 'Hit Die', value: `d${classData.hit_die}` },
                      { label: 'Primary', value: classData.primary_abilities.map((a: string) => a.charAt(0).toUpperCase() + a.slice(1, 3).toUpperCase()).join(', ') },
                      { label: 'Saves', value: classData.saving_throw_proficiencies.map((a: string) => a.charAt(0).toUpperCase() + a.slice(1, 3).toUpperCase()).join(', ') },
                      { label: 'Armor', value: classData.armor_proficiencies.length > 0 ? classData.armor_proficiencies.slice(0, 2).join(', ') + (classData.armor_proficiencies.length > 2 ? '...' : '') : 'None' },
                    ].map(stat => (
                      <div key={stat.label} style={{
                        background: accentColor + '12', border: `1px solid ${accentColor}30`,
                        borderRadius: 'var(--r-md)', padding: '6px 12px', textAlign: 'center',
                      }}>
                        <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: accentColor, marginBottom: 2 }}>
                          {stat.label}
                        </div>
                        <div style={{ fontFamily: 'var(--ff-stat)', fontWeight: 700, fontSize: 13, color: 'var(--t-1)' }}>
                          {stat.value}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Subclass Selector */}
            {classData.subclasses && classData.subclasses.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t-2)', marginBottom: 10 }}>
                  Choose a Subclass (unlocks at level {classData.subclasses[0]?.unlock_level ?? 3})
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setSelectedSubclass('')}
                    style={{
                      padding: '6px 14px', borderRadius: 'var(--r-md)', cursor: 'pointer',
                      fontFamily: 'var(--ff-body)', fontWeight: 600, fontSize: 12,
                      background: selectedSubclass === '' ? 'var(--c-raised)' : 'transparent',
                      color: selectedSubclass === '' ? 'var(--t-1)' : 'var(--t-3)',
                      border: selectedSubclass === '' ? '1px solid var(--c-border-m)' : '1px solid var(--c-border)',
                      transition: 'all 0.12s',
                    }}
                  >
                    No Subclass
                  </button>
                  {classData.subclasses.map((sub: any) => {
                    const isSelected = selectedSubclass === sub.name;
                    return (
                      <button
                        key={sub.name}
                        onClick={() => setSelectedSubclass(isSelected ? '' : sub.name)}
                        style={{
                          padding: '6px 14px', borderRadius: 'var(--r-md)', cursor: 'pointer',
                          fontFamily: 'var(--ff-body)', fontWeight: 600, fontSize: 12,
                          background: isSelected ? accentColor + '20' : 'transparent',
                          color: isSelected ? accentColor : 'var(--t-2)',
                          border: `1px solid ${isSelected ? accentColor + '60' : 'var(--c-border)'}`,
                          transition: 'all 0.12s', display: 'flex', alignItems: 'center', gap: 5,
                        }}
                      >
                        {sub.name}
                        {sub.source === 'ua' && <span style={{ fontSize: 9, color: '#e879f9', fontWeight: 700 }}>UA</span>}
                      </button>
                    );
                  })}
                </div>
                {subclassData && (
                  <div style={{
                    marginTop: 10, padding: '10px 14px',
                    background: accentColor + '08', border: `1px solid ${accentColor}25`,
                    borderRadius: 'var(--r-md)',
                    fontFamily: 'var(--ff-body)', fontSize: 13, color: 'var(--t-2)', lineHeight: 1.5,
                  }}>
                    {subclassData.description}
                  </div>
                )}
              </div>
            )}

            {/* Level Progression Table */}
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: accentColor, marginBottom: 12 }}>
                Level 1–20 Progression
                {selectedSubclass && <span style={{ color: 'var(--t-3)', marginLeft: 8, fontWeight: 400 }}>with {selectedSubclass}</span>}
              </div>

              <div style={{ overflowX: 'auto', borderRadius: 'var(--r-lg)', border: '1px solid var(--c-border)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--ff-body)', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: accentColor + '12', borderBottom: `1px solid ${accentColor}30` }}>
                      <th style={thStyle}>Lv</th>
                      <th style={thStyle}>Prof</th>
                      <th style={{ ...thStyle, textAlign: 'left', paddingLeft: 12 }}>Features Gained</th>
                      {classData.is_spellcaster && ['1st','2nd','3rd','4th','5th','6th','7th','8th','9th'].map(lvl => (
                        <th key={lvl} style={{ ...thStyle, fontSize: 10 }}>{lvl}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {progression.map(({ level, pb, slots, features }) => {
                      const isSubclassLevel = features.some(f => f.isSubclassFeature);
                      const isASILevel = features.some(f => f.isASI);
                      const rowBg = level % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent';

                      return (
                        <tr key={level} style={{ background: rowBg, borderBottom: '1px solid var(--c-border)' }}>
                          <td style={{ ...tdStyle, fontWeight: 700, color: accentColor, textAlign: 'center', width: 40 }}>
                            {level}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--t-2)', width: 48, fontWeight: 600 }}>
                            +{pb}
                          </td>
                          <td style={{ ...tdStyle, paddingLeft: 12, paddingRight: 16 }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {features.map((f, fi) => (
                                <button
                                  key={fi}
                                  onClick={() => setExpandedFeature(expandedFeature === `${level}-${fi}` ? null : `${level}-${fi}`)}
                                  style={{
                                    padding: '2px 8px', borderRadius: 999, cursor: 'pointer',
                                    border: `1px solid ${f.isSubclassFeature ? accentColor + '50' : f.isASI ? 'rgba(251,191,36,0.4)' : 'var(--c-border)'}`,
                                    background: f.isSubclassFeature ? accentColor + '15' : f.isASI ? 'rgba(251,191,36,0.08)' : 'transparent',
                                    color: f.isSubclassFeature ? accentColor : f.isASI ? '#fbbf24' : 'var(--t-1)',
                                    fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: f.isSubclassFeature || f.isASI ? 700 : 500,
                                    transition: 'all 0.1s', textAlign: 'left',
                                  }}
                                >
                                  {f.displayName}
                                  {f.isSubclassFeature && <span style={{ marginLeft: 3, opacity: 0.7 }}>▾</span>}
                                </button>
                              ))}
                            </div>

                            {/* Expanded feature details */}
                            {features.map((f, fi) => {
                              if (expandedFeature !== `${level}-${fi}`) return null;
                              return (
                                <div key={`exp-${fi}`} style={{
                                  marginTop: 8, padding: '10px 12px',
                                  background: f.isSubclassFeature ? accentColor + '08' : 'var(--c-raised)',
                                  border: `1px solid ${f.isSubclassFeature ? accentColor + '25' : 'var(--c-border)'}`,
                                  borderRadius: 'var(--r-md)', fontSize: 12, color: 'var(--t-2)', lineHeight: 1.65,
                                }}>
                                  {f.isSubclassFeature && f.subclassFeats.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                      {f.subclassFeats.map((sf: any, sfi: number) => (
                                        <div key={sfi}>
                                          <div style={{ fontWeight: 700, color: accentColor, fontSize: 12, marginBottom: 3 }}>
                                            {sf.isChoice && '⬡ '}{sf.name}
                                            {sf.isChoice && <span style={{ fontSize: 9, marginLeft: 5, fontWeight: 700, color: '#fbbf24', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 999, padding: '1px 5px' }}>CHOICE</span>}
                                          </div>
                                          <div>{sf.description}</div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    f.description
                                  )}
                                </div>
                              );
                            })}
                          </td>

                          {classData.is_spellcaster && slots && slots.map((count, si) => (
                            <td key={si} style={{ ...tdStyle, textAlign: 'center', color: count > 0 ? '#c084fc' : 'var(--c-border)', fontWeight: count > 0 ? 700 : 400, fontSize: count > 0 ? 12 : 10, width: 32 }}>
                              {count > 0 ? count : '—'}
                            </td>
                          ))}
                          {classData.is_spellcaster && !slots && (
                            ['','','','','','','','',''].map((_, si) => (
                              <td key={si} style={{ ...tdStyle, textAlign: 'center', color: 'var(--c-border)', fontSize: 10, width: 32 }}>—</td>
                            ))
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Feature Reference — full descriptions */}
            <div>
              <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: accentColor, marginBottom: 16 }}>
                Feature Reference
              </div>

              {/* Class features */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {allClassFeatures.filter((f, i, arr) => arr.findIndex(x => x.name === f.name) === i).map(feature => (
                  <div key={feature.name} style={{
                    padding: '14px 0', borderBottom: '1px solid var(--c-border)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 14, color: feature.isSubclassFeature ? '#c084fc' : 'var(--t-1)' }}>
                        {feature.name}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--t-3)', fontFamily: 'var(--ff-body)', background: 'var(--c-raised)', border: '1px solid var(--c-border)', borderRadius: 999, padding: '1px 6px' }}>
                        Level {feature.level}
                      </span>
                      {feature.isASI && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: '#fbbf24', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 999, padding: '1px 6px' }}>
                          ASI / FEAT
                        </span>
                      )}
                      {feature.isSubclassFeature && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: '#c084fc', background: 'rgba(192,132,252,0.1)', border: '1px solid rgba(192,132,252,0.3)', borderRadius: 999, padding: '1px 6px' }}>
                          SUBCLASS
                        </span>
                      )}
                    </div>
                    <div style={{ fontFamily: 'var(--ff-body)', fontSize: 13, color: 'var(--t-2)', lineHeight: 1.65 }}>
                      {feature.description}
                    </div>

                    {/* Show subclass features inline if a subclass is selected */}
                    {feature.isSubclassFeature && subclassData?.features?.filter(sf => sf.level === feature.level).length > 0 && (
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {subclassData.features!.filter(sf => sf.level === feature.level).map((sf, i) => (
                          <div key={i} style={{
                            padding: '10px 14px',
                            background: sf.isChoice ? 'rgba(251,191,36,0.05)' : accentColor + '07',
                            border: `1px solid ${sf.isChoice ? 'rgba(251,191,36,0.2)' : accentColor + '25'}`,
                            borderRadius: 'var(--r-md)',
                          }}>
                            <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 13, color: sf.isChoice ? '#fbbf24' : accentColor, marginBottom: 4 }}>
                              {sf.isChoice && '⬡ '}{sf.name}
                              {sf.isChoice && <span style={{ fontSize: 9, marginLeft: 6, fontWeight: 700, color: '#fbbf24', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 999, padding: '1px 5px' }}>CHOICE</span>}
                            </div>
                            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)', lineHeight: 1.65 }}>
                              {sf.description}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Subclass feature reference (any levels without class feature placeholders) */}
              {subclassData?.features && subclassData.features.length > 0 && (
                <div style={{ marginTop: 24 }}>
                  <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#c084fc', marginBottom: 14 }}>
                    {selectedSubclass} Subclass Features
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {subclassData.features.map((sf, i) => (
                      <div key={i} style={{ padding: '14px 0', borderBottom: '1px solid var(--c-border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 14, color: '#c084fc' }}>
                            {sf.name}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--t-3)', fontFamily: 'var(--ff-body)', background: 'var(--c-raised)', border: '1px solid var(--c-border)', borderRadius: 999, padding: '1px 6px' }}>
                            Level {sf.level}
                          </span>
                          {sf.isChoice && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: '#fbbf24', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 999, padding: '1px 6px' }}>
                              ⬡ CHOICE
                            </span>
                          )}
                        </div>
                        <div style={{ fontFamily: 'var(--ff-body)', fontSize: 13, color: 'var(--t-2)', lineHeight: 1.65 }}>
                          {sf.description}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── ARTIFICER INFUSIONS ── */}
            {selectedClass === 'Artificer' && (
              <div style={{ marginTop: 32 }}>
                <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: accentColor, marginBottom: 16 }}>
                  Artificer Infusions
                  <span style={{ fontWeight: 400, color: 'var(--t-3)', marginLeft: 8, fontSize: 11 }}>— Choose {getActiveInfusionCount(20)} active at level 20 (2 at level 2, scaling every 4 levels)</span>
                </div>
                {[2, 6, 10, 14].map(minLvl => {
                  const infusions = ARTIFICER_INFUSIONS.filter(i => i.minLevel === minLvl);
                  if (infusions.length === 0) return null;
                  return (
                    <div key={minLvl} style={{ marginBottom: 16 }}>
                      <div style={{ fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--t-3)', marginBottom: 8, paddingLeft: 4 }}>
                        Available at Level {minLvl}
                      </div>
                      {infusions.map(inf => (
                        <div key={inf.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--c-border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' as const }}>
                            <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 14, color: 'var(--t-1)' }}>{inf.name}</span>
                            {inf.requiresAttunement && (
                              <span style={{ fontSize: 9, fontWeight: 700, color: '#fbbf24', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 999, padding: '1px 6px' }}>ATTUNEMENT</span>
                            )}
                          </div>
                          <div style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: accentColor, marginBottom: 4, fontStyle: 'italic' }}>
                            Item: {inf.item}
                          </div>
                          <div style={{ fontFamily: 'var(--ff-body)', fontSize: 13, color: 'var(--t-2)', lineHeight: 1.65 }}>
                            {inf.description}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── PSION DISCIPLINES ── */}
            {selectedClass === 'Psion' && (
              <div style={{ marginTop: 32 }}>
                <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: accentColor, marginBottom: 16 }}>
                  Psionic Disciplines
                  <span style={{ fontWeight: 400, color: 'var(--t-3)', marginLeft: 8, fontSize: 11 }}>— Choose 2 at level 2, gaining 1 more at levels 5, 10, 13, and 17 (6 total at level 17+)</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 0 }}>
                  {PSION_DISCIPLINES.map(disc => (
                    <div key={disc.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--c-border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' as const }}>
                        <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 14, color: 'var(--t-1)' }}>{disc.name}</span>
                        <span style={{
                          fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                          color: disc.type === 'passive' ? '#34d399' : disc.type === 'active' ? '#fbbf24' : '#60a5fa',
                          background: disc.type === 'passive' ? 'rgba(52,211,153,0.1)' : disc.type === 'active' ? 'rgba(251,191,36,0.1)' : 'rgba(96,165,250,0.1)',
                          border: `1px solid ${disc.type === 'passive' ? 'rgba(52,211,153,0.3)' : disc.type === 'active' ? 'rgba(251,191,36,0.3)' : 'rgba(96,165,250,0.3)'}`,
                          borderRadius: 999, padding: '1px 6px',
                        }}>
                          {disc.type === 'passive' ? '✓ PASSIVE' : disc.type === 'active' ? 'ACTIVE' : '◈ BOTH'}
                        </span>
                        {disc.dieCost && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: accentColor, background: accentColor + '15', border: `1px solid ${accentColor}40`, borderRadius: 999, padding: '1px 6px' }}>
                            Cost: {disc.dieCost}
                          </span>
                        )}
                        {disc.actionType && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-3)', background: 'var(--c-raised)', border: '1px solid var(--c-border)', borderRadius: 999, padding: '1px 6px' }}>
                            {disc.actionType === 'action' ? 'Action' : disc.actionType === 'bonus' ? 'Bonus Action' : disc.actionType === 'reaction' ? 'Reaction' : 'Free'}
                          </span>
                        )}
                      </div>
                      <div style={{ fontFamily: 'var(--ff-body)', fontSize: 13, color: 'var(--t-2)', lineHeight: 1.65 }}>
                        {disc.description}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '8px 6px', fontFamily: 'var(--ff-body)', fontWeight: 700,
  fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
  color: 'var(--t-2)', textAlign: 'center', whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '8px 6px', verticalAlign: 'top',
};
