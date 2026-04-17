import React, { useState, useMemo } from 'react';
import { SPELLS } from '../data/spells';
import { SpellData, SpellLevel, SpellSchool } from '../types';
import AoEBadge from './AoEBadge';
import SpellCastButton from './SpellCastButton';

interface SpellsTabProps {
  character?: any; // Replace with your Character type
  onCastSpell?: (spell: SpellData) => void;
}

const SpellsTab: React.FC<SpellsTabProps> = ({ character, onCastSpell }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [levelFilter, setLevelFilter] = useState<SpellLevel | 'all'>('all');
  const [schoolFilter, setSchoolFilter] = useState<SpellSchool | 'all'>('all');
  const [classFilter, setClassFilter] = useState<string>('all');

  // Filter spells based on search and filters
  const filteredSpells = useMemo(() => {
    return SPELLS.filter(spell => {
      const matchesSearch = spell.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          spell.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesLevel = levelFilter === 'all' || spell.level === levelFilter;
      const matchesSchool = schoolFilter === 'all' || spell.school === schoolFilter;
      const matchesClass = classFilter === 'all' || spell.classes.includes(classFilter);
      
      return matchesSearch && matchesLevel && matchesSchool && matchesClass;
    });
  }, [searchTerm, levelFilter, schoolFilter, classFilter]);

  const spellLevels: (SpellLevel | 'all')[] = ['all', 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const spellSchools: (SpellSchool | 'all')[] = [
    'all', 'Abjuration', 'Conjuration', 'Divination', 'Enchantment',
    'Evocation', 'Illusion', 'Necromancy', 'Transmutation'
  ];

  const getUniqueClasses = () => {
    const allClasses = new Set<string>();
    SPELLS.forEach(spell => spell.classes.forEach(cls => allClasses.add(cls)));
    return Array.from(allClasses).sort();
  };

  const formatComponents = (components: string): string => {
    return components
      .split(', ')
      .map(comp => {
        if (comp === 'V') return 'Verbal';
        if (comp === 'S') return 'Somatic';
        if (comp.startsWith('M')) return 'Material';
        return comp;
      })
      .join(', ');
  };

  const getSchoolColor = (school: SpellSchool): string => {
    const colors: Record<SpellSchool, string> = {
      'Abjuration': 'bg-blue-100 text-blue-800',
      'Conjuration': 'bg-yellow-100 text-yellow-800',
      'Divination': 'bg-purple-100 text-purple-800',
      'Enchantment': 'bg-pink-100 text-pink-800',
      'Evocation': 'bg-red-100 text-red-800',
      'Illusion': 'bg-indigo-100 text-indigo-800',
      'Necromancy': 'bg-gray-100 text-gray-800',
      'Transmutation': 'bg-green-100 text-green-800',
    };
    return colors[school] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="spells-tab">
      {/* Search and Filters */}
      <div className="mb-6 space-y-4">
        <div>
          <input
            type="text"
            placeholder="Search spells..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Level</label>
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value as SpellLevel | 'all')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {spellLevels.map(level => (
                <option key={level} value={level}>
                  {level === 'all' ? 'All Levels' : level === 0 ? 'Cantrip' : `Level ${level}`}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">School</label>
            <select
              value={schoolFilter}
              onChange={(e) => setSchoolFilter(e.target.value as SpellSchool | 'all')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {spellSchools.map(school => (
                <option key={school} value={school}>
                  {school === 'all' ? 'All Schools' : school}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Classes</option>
              {getUniqueClasses().map(cls => (
                <option key={cls} value={cls}>{cls}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Results Count */}
      <div className="mb-4 text-sm text-gray-600">
        Showing {filteredSpells.length} of {SPELLS.length} spells
      </div>

      {/* Spells List */}
      <div className="space-y-4">
        {filteredSpells.map(spell => (
          <div key={spell.id} className="spell-card bg-white border border-gray-200 rounded-lg shadow-sm p-4">
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-lg font-semibold text-gray-900">{spell.name}</h3>
                  <span className={`px-2 py-1 text-xs rounded-full ${getSchoolColor(spell.school)}`}>
                    {spell.school}
                  </span>
                  {spell.area_of_effect && <AoEBadge spell={spell} />}
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <span className="font-medium">
                    {spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`}
                  </span>
                  <span>{spell.casting_time}</span>
                  <span>{spell.range}</span>
                  <span>{formatComponents(spell.components)}</span>
                  {spell.concentration && <span className="text-yellow-600">Concentration</span>}
                  {spell.ritual && <span className="text-purple-600">Ritual</span>}
                </div>
              </div>
              <div className="ml-4">
                <SpellCastButton 
                  spell={spell} 
                  character={character}
                  onCast={() => onCastSpell?.(spell)}
                />
              </div>
            </div>

            {/* Classes */}
            <div className="mb-3">
              <span className="text-sm text-gray-500">Classes: </span>
              <span className="text-sm text-gray-700">{spell.classes.join(', ')}</span>
            </div>

            {/* Description */}
            <div className="text-sm text-gray-700 leading-relaxed">
              {spell.description.split('\n\n').map((paragraph, idx) => (
                <p key={idx} className={idx > 0 ? 'mt-2' : ''}>
                  {paragraph}
                </p>
              ))}
            </div>

            {/* Higher Levels */}
            {spell.higher_levels && (
              <div className="mt-3 p-3 bg-blue-50 rounded-md">
                <p className="text-sm text-blue-800">
                  <span className="font-medium">At Higher Levels:</span> {spell.higher_levels}
                </p>
              </div>
            )}

            {/* Combat Data (if available) */}
            {(spell.damage_dice || spell.save_type || spell.attack_type) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {spell.damage_dice && (
                  <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded">
                    {spell.damage_dice} {spell.damage_type}
                  </span>
                )}
                {spell.save_type && (
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                    {spell.save_type} save
                  </span>
                )}
                {spell.attack_type && (
                  <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                    {spell.attack_type} attack
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {filteredSpells.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No spells found matching your search criteria.
        </div>
      )}
    </div>
  );
};

export default SpellsTab;
