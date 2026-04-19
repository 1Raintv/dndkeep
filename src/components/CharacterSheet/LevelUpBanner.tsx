import type { Character } from '../../types';
import { xpToLevel, xpForNextLevel } from '../../lib/gameUtils';

interface LevelUpBannerProps {
  character: Character;
  onOpen: () => void;
}

/**
 * v2.31: Pending level-up notification. Renders above the character sheet body
 * when XP has crossed the next-level threshold and the character hasn't yet
 * allocated their level point.
 *
 * Pending count = xpToLevel(XP) − (class_level + secondary_level).
 * Clicking the banner opens the LevelUpWizard where the player picks which
 * class the new level(s) go into.
 */
export default function LevelUpBanner({ character, onOpen }: LevelUpBannerProps) {
  const totalLevel = (character.level ?? 1) + (character.secondary_level ?? 0);
  const targetLevel = xpToLevel(character.experience_points ?? 0);
  // v2.32.1: total pending = XP-earned pending + DM manually-granted pending
  const xpPending = Math.max(0, targetLevel - totalLevel);
  const dmPending = character.pending_manual_level_grants ?? 0;
  const pending = xpPending + dmPending;

  if (pending <= 0 || totalLevel >= 20) return null;

  const nextThreshold = xpForNextLevel(targetLevel);
  const progressXP = character.experience_points ?? 0;

  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onOpen(); }}
      style={{
        position: 'relative',
        cursor: 'pointer',
        padding: '10px 16px',
        borderRadius: 'var(--r-md)',
        background: 'linear-gradient(135deg, rgba(201,146,42,0.22), rgba(201,146,42,0.08))',
        border: '1px solid var(--c-gold-bdr)',
        boxShadow: '0 0 0 0 rgba(201,146,42,0.5)',
        animation: 'levelUpPulse 2.2s ease-in-out infinite',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-3)',
        transition: 'transform 0.12s, background 0.2s',
      }}
      onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.01)')}
      onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
    >
      <style>{`
        @keyframes levelUpPulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(201,146,42,0.0); }
          50%     { box-shadow: 0 0 0 6px rgba(201,146,42,0.15); }
        }
      `}</style>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'var(--ff-brand)',
          fontSize: 'var(--fs-sm)',
          fontWeight: 700,
          letterSpacing: '0.08em',
          color: 'var(--c-gold-l)',
          textTransform: 'uppercase',
        }}>
          {pending === 1 ? 'Level up available' : `${pending} Level ups available`}
        </div>
        <div style={{
          fontFamily: 'var(--ff-body)',
          fontSize: 'var(--fs-xs)',
          color: 'var(--t-2)',
          marginTop: 2,
        }}>
          {totalLevel < 20 && (
            <>
              You&apos;re ready for level {totalLevel + 1}
              {pending > 1 ? ` — ${pending} levels behind` : ''}.
              {' '}Click to allocate it.
              {nextThreshold > 0 && pending === 1 && totalLevel + 1 < 20 && (
                <span style={{ color: 'var(--t-3)', marginLeft: 6 }}>
                  ({progressXP.toLocaleString()} / {nextThreshold.toLocaleString()} XP to level {totalLevel + 2})
                </span>
              )}
            </>
          )}
        </div>
      </div>

      <div style={{
        padding: '4px 14px',
        borderRadius: 999,
        background: 'var(--c-gold-bg)',
        border: '1px solid var(--c-gold-bdr)',
        color: 'var(--c-gold-l)',
        fontFamily: 'var(--ff-body)',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.08em',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}>
        LEVEL UP
      </div>
    </div>
  );
}
