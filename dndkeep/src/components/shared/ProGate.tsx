import { useNavigate } from 'react-router-dom';

interface ProGateProps {
  feature: string;
  description?: string;
  perks?: string[];
  inline?: boolean;
}

export default function ProGate({ feature, description, perks, inline = false }: ProGateProps) {
  const navigate = useNavigate();

  const defaultPerks = [
    'Unlimited characters',
    'Campaign management with DM/player roles',
    'Real-time multiplayer combat sync',
  ];

  const content = (
    <div style={inline ? {} : { textAlign: 'center' }}>
      <h3 style={{ marginBottom: 'var(--space-3)', color: 'var(--text-gold)' }}>
        {feature} — Pro Feature
      </h3>
      {description && (
        <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
          {description}
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-6)', textAlign: 'left' }}>
        {(perks ?? defaultPerks).map(p => (
          <div key={p} style={{ display: 'flex', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
            <span style={{ color: 'var(--color-gold)' }}>+</span>
            <span style={{ color: 'var(--text-secondary)' }}>{p}</span>
          </div>
        ))}
      </div>
      <button className="btn-gold btn-lg" onClick={() => navigate('/settings')} style={{ width: inline ? 'auto' : '100%', justifyContent: 'center' }}>
        Upgrade to Pro
      </button>
    </div>
  );

  if (inline) return content;

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-8)' }}>
      <div className="card card-gold" style={{ maxWidth: 440, width: '100%' }}>
        {content}
      </div>
    </div>
  );
}
