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
      <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--sp-16)' }}>
        <div className="card card-gold" style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
          <h2 style={{ marginBottom: 'var(--sp-4)' }}>Check Your Email</h2>
          <p style={{ color: 'var(--t-2)' }}>
            We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account, then sign in.
          </p>
          <button className="btn-secondary" style={{ marginTop: 'var(--sp-6)' }} onClick={() => { setConfirmed(false); setMode('signin'); }}>
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'var(--sp-8) var(--sp-4)', background: 'var(--c-bg)' }}>
      {/* Back to landing */}
      <div style={{ width: '100%', maxWidth: 420, marginBottom: 'var(--sp-4)' }}>
        <button className="btn-ghost btn-sm" onClick={() => navigate('/')} style={{ color: 'var(--t-3)', fontSize: 'var(--fs-xs)' }}>
          ← Back to home
        </button>
      </div>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--sp-8)' }}>
          <div style={{ fontFamily: 'var(--ff-brand)', fontSize: 'var(--fs-3xl)', fontWeight: 700, color: 'var(--c-gold-l)', letterSpacing: '0.1em', marginBottom: 'var(--sp-2)' }}>
            DNDKEEP
          </div>
          <p style={{ color: 'var(--t-2)', fontSize: 'var(--fs-sm)' }}>
            {mode === 'signup' ? 'Create a free account to get started.' : 'Welcome back — sign in to your account.'}
          </p>
        </div>
        <div className="card card-gold">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: '#080d14', borderRadius: 'var(--r-md)', padding: '3px', marginBottom: 'var(--sp-6)' }}>
            {(['signin', 'signup'] as Mode[]).map(m => (
              <button key={m} onClick={() => { setMode(m); setError(null); }}
                style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: 'var(--sp-2)', borderRadius: 'var(--r-sm)', border: 'none', background: mode === m ? 'var(--c-surface)' : 'transparent', color: mode === m ? 'var(--c-gold-l)' : 'var(--t-2)', cursor: 'pointer', transition: 'all var(--tr-fast)' }}>
                {m === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
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
              <div style={{ background: 'rgba(155,28,28,0.15)', border: '1px solid rgba(107,20,20,1)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)', fontSize: 'var(--fs-sm)', color: '#fca5a5', fontFamily: 'var(--ff-body)' }}>{error}</div>
            )}
            <button type="submit" className="btn-primary btn-lg" disabled={loading} style={{ marginTop: 'var(--sp-2)' }}>
              {loading ? 'Working...' : mode === 'signin' ? 'Enter the Keep' : 'Create Account'}
            </button>
          </form>
          {mode === 'signin' && (
            <p style={{ textAlign: 'center', marginTop: 'var(--sp-4)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', fontFamily: 'var(--ff-body)' }}>
              No account?{' '}
              <span style={{ color: 'var(--c-gold-l)', cursor: 'pointer' }} onClick={() => setMode('signup')}>Create one free</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
