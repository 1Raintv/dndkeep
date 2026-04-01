import { useState, useCallback } from 'react';
import type { Character, NoteField } from '../../types';

interface NotesProps {
  character: Character;
  onUpdate: (field: NoteField, value: string) => void;
}

const FIELDS: { key: NoteField; label: string; rows: number; placeholder: string }[] = [
  {
    key: 'personality_traits',
    label: 'Personality Traits',
    rows: 2,
    placeholder: 'How do you present yourself to the world?',
  },
  {
    key: 'ideals',
    label: 'Ideals',
    rows: 2,
    placeholder: 'What drives you? What do you believe in?',
  },
  {
    key: 'bonds',
    label: 'Bonds',
    rows: 2,
    placeholder: 'Who or what do you care most about?',
  },
  {
    key: 'flaws',
    label: 'Flaws',
    rows: 2,
    placeholder: 'What weakness or fear could be your undoing?',
  },
  {
    key: 'features_and_traits',
    label: 'Features & Traits',
    rows: 4,
    placeholder: 'Class features, racial traits, feats...',
  },
  {
    key: 'notes',
    label: 'Session Notes',
    rows: 5,
    placeholder: 'Anything worth remembering from tonight...',
  },
];

export default function Notes({ character, onUpdate }: NotesProps) {
  const [activeField, setActiveField] = useState<NoteField | null>(null);

  const handleBlur = useCallback(
    (field: NoteField, value: string) => {
      setActiveField(null);
      onUpdate(field, value);
    },
    [onUpdate]
  );

  return (
    <section>
      <div className="section-header">Character Details</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
        {FIELDS.map(({ key, label, rows, placeholder }) => (
          <div key={key}>
            <label style={{
              color: activeField === key ? 'var(--c-gold-l)' : undefined,
            }}>
              {label}
            </label>
            <textarea
              defaultValue={character[key]}
              rows={rows}
              placeholder={placeholder}
              onFocus={() => setActiveField(key)}
              onBlur={e => handleBlur(key, e.target.value)}
              style={{
                resize: 'vertical',
                fontFamily: 'var(--ff-body)',
                lineHeight: '1.5',
                transition: 'border-color var(--tr-fast), box-shadow var(--tr-fast)',
              }}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
