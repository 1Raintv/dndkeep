import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface OnboardingProps {
  onDismiss: () => void;
}

const STEPS = [
  {
    emoji: '',
    title: 'Welcome to DNDKeep',
    body: 'Your D&D 5e session companion. Build characters, track spells and HP, roll dice, and run live sessions with your party.',
    action: 'Get Started',
  },
  {
    emoji: '',
    title: 'Create Your Character',
    body: 'Use the Character Creator to build a character using the 2024 PHB rules. Pick your species, class, background, and ability scores — then jump straight in.',
    action: 'Next',
  },
  {
    emoji: '',
    title: 'At the Table',
    body: 'The floating button lets you roll any die instantly. Your character sheet tracks HP, spell slots, conditions, and weapons. Everything auto-saves.',
    action: 'Next',
  },
  {
    emoji: '',
    title: 'Campaigns & Party Play',
    body: 'Join a campaign with a 6-character code from your DM. Free accounts can play in any campaign. Upgrade to Pro to create and run your own.',
    action: 'Let\'s Go!',
  },
];

export default function Onboarding({ onDismiss }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  function next() {
    if (isLast) {
      onDismiss();
      navigate('/creator');
    } else {
      setStep(s => s + 1);
    }
  }

  return (
    <div className="modal-overlay" onClick={onDismiss}>
      <div
        className="modal animate-fade-in"
        style={{ maxWidth: 460, textAlign: 'center' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 'var(--sp-6)' }}>
          {STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                width: i === step ? 20 : 6,
                height: 6,
                borderRadius: 3,
                background: i === step ? 'var(--c-gold)' : i < step ? 'var(--c-gold)' : 'var(--c-border-m)',
                transition: 'all var(--tr-normal)',
              }}
            />
          ))}
        </div>

        {/* Content */}
        <div key={step} className="animate-fade-in">
          <div style={{ fontSize: 56, marginBottom: 'var(--sp-4)', lineHeight: 1 }}>
            {current.emoji}
          </div>
          <h2 style={{ marginBottom: 'var(--sp-3)', fontFamily: 'var(--ff-brand)' }}>
            {current.title}
          </h2>
          <p style={{
            fontSize: 'var(--fs-md)', color: 'var(--t-2)',
            lineHeight: 1.7, marginBottom: 'var(--sp-8)',
            maxWidth: 360, margin: '0 auto var(--sp-8)',
          }}>
            {current.body}
          </p>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', alignItems: 'center' }}>
          <button
            className="btn-gold btn-lg"
            onClick={next}
            style={{ minWidth: 200, justifyContent: 'center' }}
          >
            {current.action}
          </button>
          <button
            className="btn-ghost btn-sm"
            onClick={onDismiss}
            style={{ color: 'var(--t-2)', fontSize: 'var(--fs-xs)' }}
          >
            Skip intro
          </button>
        </div>
      </div>
    </div>
  );
}
