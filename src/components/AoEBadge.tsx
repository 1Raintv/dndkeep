import React from 'react';
import type { SpellData } from '../types';

interface AoEBadgeProps {
  spell: SpellData;
}

const AoEBadge: React.FC<AoEBadgeProps> = ({ spell }) => {
  if (!spell.area_of_effect) return null;

  const { type, size } = spell.area_of_effect;

  // Color-coded icons for different AoE types (D&D 5e standard shapes)
  const getTypeIcon = (aoeType: string) => {
    switch (aoeType.toLowerCase()) {
      case 'sphere': return '🔴';      // Fireball, etc.
      case 'cone': return '🟡';        // Burning Hands, etc.
      case 'cube': return '🟢';        // Web, etc. 
      case 'cylinder': return '🔵';    // Flame Strike, etc.
      case 'line': return '🟠';        // Lightning Bolt, etc.
      default: return '⚫';
    }
  };

  return (
    <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-orange-100 text-orange-800 rounded-full hover:bg-orange-200 transition-colors">
      {getTypeIcon(type)} {size}ft {type}
    </span>
  );
};

export default AoEBadge;
