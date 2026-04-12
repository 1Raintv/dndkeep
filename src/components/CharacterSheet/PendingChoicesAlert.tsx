import { useState } from 'react';
import type { Character } from '../../types';
import { PSION_DISCIPLINES, getDisciplineCount } from '../../data/psionDisciplines';
import { SPELLS } from '../../data/spells';

interface Props {
  character: Character;
  onUpdate: (u: Partial<Character>) => void;
}

interface PendingChoice {
  id: string;
  title: string;
  description: string;
  type: 'discipline' | 'cantrip' | 'spell' | 'feat' | 'info';
  urgent: boolean;
}

function getPendingChoices(character: Character): PendingChoice[] {
  const choices: PendingChoice[] = [];
  const level = character.level;
  const className = character.class_name;

  // ── PSION SPECIFIC ────────────────────────────────────────────────
  if (className === 'Psion') {
    // Disciplines
    const expectedDisciplines = getDisciplineCount(level);
    const currentDisciplines = (character.class_resources?.['psion-disciplines'] as string[] ?? []);
    const disciplineCount = Array.isArray(currentDisciplines) ? currentDisciplines.length : 0;
    if (disciplineCount < expectedDisciplines && level >= 2) {
      choices.push({
        id: 'psion-disciplines',
        title: `Choose Psionic Disciplines (${disciplineCount}/${expectedDisciplines})`,
        description: `You need to choose ${expectedDisciplines - disciplineCount} more Psionic Discipline${expectedDisciplines - disciplineCount > 1 ? 's' : ''}. Go to the Features tab to make your selection.`,
        type: 'discipline',
        urgent: disciplineCount === 0,
      });
    }

    // Cantrips check
    const cantripsExpected = level >= 10 ? 4 : level >= 4 ? 3 : 2;
    const classCantrips = SPELLS.filter(s => s.classes.includes('Psion') && s.level === 0);
    const currentCantrips = character.known_spells.filter(id => classCantrips.find(s => s.id === id)).length;
    // Don't count Mage Hand in the 2/3/4 limit (it's auto-granted)
    const mageHandGranted = character.known_spells.includes('mage-hand');
    const effectiveCantrips = mageHandGranted ? currentCantrips - 1 : currentCantrips;
    if (effectiveCantrips < cantripsExpected) {
      choices.push({
        id: 'psion-cantrips',
        title: `Choose Psion Cantrips (${effectiveCantrips}/${cantripsExpected})`,
        description: `You need ${cantripsExpected - effectiveCantrips} more cantrip${cantripsExpected - effectiveCantrips > 1 ? 's' : ''} from the Psion spell list. Go to the Spells tab and add cantrips (level 0 spells).`,
        type: 'cantrip',
        urgent: effectiveCantrips === 0,
      });
    }
  }

  return choices;
}

export default function PendingChoicesAlert({ character, onUpdate }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const allChoices = getPendingChoices(character).filter(c => !dismissed.has(c.id));
  const urgent = allChoices.filter(c => c.urgent);
  const normal = allChoices.filter(c => !c.urgent);

  if (allChoices.length === 0) return null;

  return (
    <div style={{
      margin: '0 0 16px 0',
      borderRadius: 'var(--r-lg)',
      border: '1px solid rgba(251,191,36,0.4)',
      background: 'rgba(251,191,36,0.05)',
      padding: '12px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: allChoices.length > 0 ? 10 : 0 }}>
        <span style={{ fontSize: 15 }}>📋</span>
        <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 13, color: '#fbbf24' }}>
          {allChoices.length} pending choice{allChoices.length > 1 ? 's' : ''} for your character
        </span>
        <button
          onClick={() => setDismissed(new Set(allChoices.map(c => c.id)))}
          style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 'var(--r-sm)', background: 'transparent', border: '1px solid var(--c-border)', color: 'var(--t-3)', cursor: 'pointer', fontFamily: 'var(--ff-body)', fontSize: 10 }}
        >
          Dismiss all
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {allChoices.map(choice => (
          <div
            key={choice.id}
            style={{
              padding: '8px 12px',
              background: choice.urgent ? 'rgba(239,68,68,0.07)' : 'rgba(251,191,36,0.07)',
              border: `1px solid ${choice.urgent ? 'rgba(239,68,68,0.3)' : 'rgba(251,191,36,0.25)'}`,
              borderRadius: 'var(--r-md)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 12, color: choice.urgent ? '#ef4444' : '#fbbf24', flex: 1 }}>
                {choice.urgent ? '🔴 ' : '🟡 '}{choice.title}
              </span>
              <button
                onClick={() => setDismissed(d => new Set([...d, choice.id]))}
                style={{ background: 'transparent', border: 'none', color: 'var(--t-3)', cursor: 'pointer', fontSize: 11, padding: '0 4px' }}
              >
                ✕
              </button>
            </div>
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-2)', marginTop: 3, lineHeight: 1.5 }}>
              {choice.description}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
