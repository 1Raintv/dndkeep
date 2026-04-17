import React from 'react';
import { SpellData } from '../types';

interface SpellCastButtonProps {
  spell: SpellData;
  character?: any; // Replace with your Character type
  onCast?: () => void;
  disabled?: boolean;
}

const SpellCastButton: React.FC<SpellCastButtonProps> = ({ 
  spell, 
  character, 
  onCast, 
  disabled = false 
}) => {
  const handleCast = () => {
    if (!disabled && onCast) {
      onCast();
    }
  };

  // Determine button appearance based on spell level and character's spell slots
  const getButtonStyle = () => {
    if (disabled) return 'bg-gray-300 text-gray-500 cursor-not-allowed';
    return 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer';
  };

  const canCast = !disabled && (spell.level === 0 || character?.spell_slots?.[spell.level]?.total > 0);

  return (
    <button
      onClick={handleCast}
      disabled={disabled || !canCast}
      className={`px-3 py-2 rounded text-sm font-medium transition-colors ${getButtonStyle()}`}
      title={spell.level === 0 ? 'Cast Cantrip' : `Cast (Level ${spell.level})`}
    >
      Cast
    </button>
  );
};

export default SpellCastButton;
