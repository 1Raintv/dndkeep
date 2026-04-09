import { useState } from 'react';
import { createPortal } from 'react-dom';
import RollLog from './RollLog';

interface FloatingRollLogProps {
  characterId: string;
  userId: string;
  characterName?: string;
}

export default function FloatingRollLog({ characterId, userId, characterName }: FloatingRollLogProps) {
  const [open, setOpen] = useState(false);

  return createPortal(
    <>
      {/* Toggle button — sits left of the dice roller button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Roll Log"
        style={{
          position: 'fixed',
          bottom: 'var(--sp-10)',
          right: 'calc(var(--sp-4) + 52px + 10px)', // left of the dice roller
          zIndex: 90,
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: open
            ? 'linear-gradient(160deg, #1e3a2e 0%, #0a1f12 100%)'
            : 'linear-gradient(160deg, #1a2e1e 0%, #0d2010 100%)',
          border: `2px solid ${open ? '#4ade80' : '#22c55e'}`,
          boxShadow: open
            ? '0 4px 20px rgba(74,222,128,0.35), 0 2px 8px rgba(0,0,0,0.6)'
            : '0 4px 20px rgba(34,197,94,0.25), 0 2px 8px rgba(0,0,0,0.5)',
          cursor: 'pointer',
          transition: 'all var(--tr-fast)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: open ? 18 : 22,
          color: 'var(--t-1)',
        }}
      >
        {open ? '✕' : '📜'}
      </button>

      {/* Panel */}
      {open && (
        <div
          className="animate-fade-in"
          style={{
            position: 'fixed',
            bottom: 76,
            right: 'calc(var(--sp-4) + 52px + 10px)',
            zIndex: 89,
            width: 340,
            height: 420,
            background: 'linear-gradient(160deg, #0d1a0f 0%, #080d09 100%)',
            border: '1px solid rgba(74,222,128,0.3)',
            borderRadius: 'var(--r-xl)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.7), 0 0 20px rgba(74,222,128,0.1)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            padding: '10px 12px',
          }}
        >
          <RollLog
            characterId={characterId}
            userId={userId}
            characterName={characterName}
          />
        </div>
      )}
    </>,
    document.body
  );
}
