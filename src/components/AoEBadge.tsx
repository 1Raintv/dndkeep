import React from 'react';
import type { SpellData } from '../types';

interface AoEBadgeProps {
  spell: SpellData;
}

const AoEBadge: React.FC<AoEBadgeProps> = ({ spell }) => {
  if (!spell.area_of_effect) return null;

  const { type, size } = spell.area_of_effect;

  // Color-coded icons for different AoE types
  const getTypeIcon = (aoeType: string) => {
    switch (aoeType.toLowerCase()) {
      case 'sphere': return '🔴';
      case 'cone': return '🟡';
      case 'cube': return '🟢';
      case 'cylinder': return '🔵';
      case 'line': return '🟠';
      default: return '⚫';
    }
  };

  return (
    <span className="aoe-badge">
      {getTypeIcon(type)} {size}ft {type}
    </span>
  );
};

export default AoEBadge;
