import React from 'react';
import type { SpellData } from '../../types';

interface AoEBadgeProps {
  spell: SpellData;
}

/**
 * AoEBadge - Displays area of effect information for spells
 * Shows colored emoji + size + type (e.g., "🔴 20ft sphere")
 * Integrates with existing spell card design in SpellsTab
 */
const AoEBadge: React.FC<AoEBadgeProps> = ({ spell }) => {
  if (!spell.area_of_effect) return null;

  const { type, size } = spell.area_of_effect;

  // Color-coded emoji icons for D&D 5e area shapes
  const getTypeIcon = (aoeType: string) => {
    switch (aoeType.toLowerCase()) {
      case 'sphere': return '🔴';      // Fireball, Shatter
      case 'cone': return '🟡';        // Burning Hands, Lightning Bolt
      case 'cube': return '🟢';        // Web, Entangle
      case 'cylinder': return '🔵';    // Flame Strike, Moonbeam
      case 'line': return '🟠';        // Lightning Bolt (line form)
      default: return '⚫';            // Fallback
    }
  };

  return (
    <span 
      className="inline-flex items-center px-2 py-1 text-xs font-medium bg-orange-100 text-orange-800 rounded-full hover:bg-orange-200 transition-colors cursor-help" 
      title={`Area of Effect: ${size}-foot ${type}`}
    >
      {getTypeIcon(type)} {size}ft {type}
    </span>
  );
};

export default AoEBadge;
