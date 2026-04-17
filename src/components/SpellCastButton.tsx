import React from 'react';
import { SpellData } from '../types';

interface SpellCastButtonProps {
  spell: SpellData;
  character?: any; // Using any to match your existing interface
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

  // Determine if the character can cast this spell
  const canCast = () => {
    if (disabled) return false;
    if (spell.level === 0) return true; // Cantrips can always be cast
    
    // Check if character has spell slots available for this level
    if (character?.spell_slots?.[spell.level]?.total > 0) {
      const used = character.spell_slots[spell.level]?.used || 0;
      const total = character.spell_slots[spell.level]?.total || 0;
      return used < total;
    }
    
    return false;
  };

  const isEnabled = canCast();

  return (
    <button
      onClick={handleCast}
      disabled={!isEnabled}
      className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
        isEnabled
          ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
      }`}
      title={
        spell.level === 0 
          ? 'Cast Cantrip' 
          : isEnabled 
            ? `Cast (Level ${spell.level})` 
            : 'No spell slots available'
      }
    >
      Cast
    </button>
  );
};

export default SpellCastButton;
