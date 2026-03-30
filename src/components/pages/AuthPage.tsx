import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signIn, signUp } from '../../lib/supabase';

type Mode = 'signin' | 'signup';

export default function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    if (mode === 'signup') {
      const { error: err } = await signUp(email, password, displayName);
      if (err) setError(err.message);
      else setConfirmed(true);
    } else {
      const { error: err } = await signIn(email, password);
      if (err) setError(err.message);
      else navigate('/lobby');
    }
    setLoading(false);
  }

  if (confirmed) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-16)' }}>
        <div className="card card-gold" style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
          <h2 style={{ marginBottom: 'var(--space-4)' }}>Check Your Email</h2>
          <p style={{ color: 'var(--text-secondary)' }}>
            We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account, then sign in.
          </p>
          <button className="btn-secondary" style={{ marginTop: 'var(--space-6)' }} onClick={() => { setConfirmed(false); setMode('signin'); }}>
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-16) var(--space-4)' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-8)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', color: 'var(--text-gold)', textShadow: '0 0 32px rgba(201,146,42,0.4)', marginBottom: 'var(--space-2)' }}>
            DNDKeep
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Your D&D 5e session companion</p>
        </div>
        <div className="card card-gold">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: 'var(--bg-sunken)', borderRadius: 'var(--radius-md)', padding: '3px', marginBottom: 'var(--space-6)' }}>
            {(['signin', 'signup'] as Mode[]).map(m => (
              <button key={m} onClick={() => { setMode(m); setError(null); }}
                style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)', border: 'none', background: mode === m ? 'var(--bg-surface)' : 'transparent', color: mode === m ? 'var(--text-gold)' : 'var(--text-muted)', cursor: 'pointer', transition: 'all var(--transition-fast)' }}>
                {m === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {mode === 'signup' && (
              <div>
                <label>Display Name</label>
                <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="How shall you be known?" required autoFocus />
              </div>
            )}
            <div>
              <label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required />
            </div>
            <div>
              <label>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'} required minLength={mode === 'signup' ? 8 : 1} />
            </div>
            {error && (
              <div style={{ background: 'rgba(155,28,28,0.15)', border: '1px solid var(--color-blood)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', fontSize: 'var(--text-sm)', color: '#fca5a5', fontFamily: 'var(--font-heading)' }}>{error}</div>
            )}
            <button type="submit" className="btn-primary btn-lg" disabled={loading} style={{ marginTop: 'var(--space-2)' }}>
              {loading ? 'Working...' : mode === 'signin' ? 'Enter the Keep' : 'Create Account'}
            </button>
          </form>
          {mode === 'signin' && (
            <p style={{ textAlign: 'center', marginTop: 'var(--space-4)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-heading)' }}>
              No account?{' '}
              <span style={{ color: 'var(--text-gold)', cursor: 'pointer' }} onClick={() => setMode('signup')}>Create one free</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
