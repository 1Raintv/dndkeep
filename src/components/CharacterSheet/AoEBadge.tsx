import React from 'react';

interface AoEBadgeProps {
  spell: any; // Using any to avoid type conflicts
}

/**
 * AoEBadge - Displays area of effect information for spells
 * Failsafe version using 'any' type to avoid TypeScript conflicts
 */
const AoEBadge: React.FC<AoEBadgeProps> = ({ spell }) => {
  // Check if the spell has area_of_effect data
  if (!spell?.area_of_effect) return null;

  const { type, size } = spell.area_of_effect;

  // Color-coded emoji icons for D&D 5e area shapes
  const getTypeIcon = (aoeType: string) => {
    switch (aoeType?.toLowerCase()) {
      case 'sphere': return '🔴';
      case 'cone': return '🟡';
      case 'cube': return '🟢';
      case 'cylinder': return '🔵';
      case 'line': return '🟠';
      default: return '⚫';
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
