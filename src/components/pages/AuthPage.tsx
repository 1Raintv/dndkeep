import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signIn, requestPasswordReset } from '../../lib/supabase';
// v2.648 — raw gotrue/browser wordings ("Failed to fetch") are useless to
// a user; friendlyAuthError turns the ones that matter into next steps.
import { friendlyAuthError } from '../../lib/authErrors';

// v2.680.0 — Sign-in only. DNDKeep is an invite-only beta: accounts are
// created by inviting an email address, and public sign-ups are disabled
// at the Supabase project level. The "Create Account" tab is gone rather
// than hidden — a disabled control that still posts is a hole, and a
// visible one that always fails reads as broken.
//
// The forgot-password arm is NEW here, not a port. Until now the app had
// no recovery path of any kind, so a forgotten password was a permanent
// lockout. That was survivable while anyone could sign up again with the
// same address; under invite-only it would mean the account is simply
// gone. The emailed link lands on /set-password.

type Mode = 'signin' | 'forgot';

export default function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'forgot') {
        const { error: err } = await requestPasswordReset(email);
        // Deliberately reporting success even when gotrue objects: whether
        // an address has an account is not something an unauthenticated
        // form should confirm, and under invite-only that would leak who
        // is in the beta. Real transport failures still surface.
        if (err && /network|fetch|timeout/i.test(err.message ?? '')) {
          setError(friendlyAuthError(err));
        } else {
          setResetSent(true);
        }
      } else {
        const { error: err } = await signIn(email, password);
        if (err) setError(friendlyAuthError(err));
        else navigate('/lobby');
      }
    } catch (err) {
      // supabase-js returns auth failures rather than throwing, but a
      // transport error can still escape (a fetch rejection outside the
      // gotrue client). Without this the form silently stuck on
      // "Working..." with no message at all.
      setError(friendlyAuthError(err as { message?: string }));
    }
    setLoading(false);
  }

  if (resetSent) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--sp-16)' }}>
        <div className="card card-gold" style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
          <h2 style={{ marginBottom: 'var(--sp-4)' }}>Check Your Email</h2>
          <p style={{ color: 'var(--t-2)' }}>
            If <strong>{email}</strong> has an account, a password-reset link is on its way.
            The link expires, so use it soon.
          </p>
          <button className="btn-secondary" style={{ marginTop: 'var(--sp-6)' }}
            onClick={() => { setResetSent(false); setMode('signin'); setError(null); }}>
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  const forgot = mode === 'forgot';

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
            {forgot ? 'We will email you a link to set a new password.' : 'Welcome back — sign in to your account.'}
          </p>
        </div>
        <div className="card card-gold">
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
            <div>
              <label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required autoFocus />
            </div>
            {!forgot && (
              <div>
                <label>Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password" required autoComplete="current-password" />
              </div>
            )}
            {error && (
              <div style={{ background: 'rgba(155,28,28,0.15)', border: '1px solid rgba(107,20,20,1)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)', fontSize: 'var(--fs-sm)', color: '#fca5a5', fontFamily: 'var(--ff-body)' }}>{error}</div>
            )}
            <button type="submit" className="btn-primary btn-lg" disabled={loading} style={{ marginTop: 'var(--sp-2)' }}>
              {loading ? 'Working...' : forgot ? 'Send Reset Link' : 'Enter the Keep'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 'var(--sp-4)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', fontFamily: 'var(--ff-body)' }}>
            <span style={{ color: 'var(--c-gold-l)', cursor: 'pointer' }}
              onClick={() => { setMode(forgot ? 'signin' : 'forgot'); setError(null); }}>
              {forgot ? 'Back to sign in' : 'Forgot your password?'}
            </span>
          </p>

          {/* Invite-only notice — the honest replacement for the old
              "Create one free" link, which now has nothing to point at. */}
          <div style={{ marginTop: 'var(--sp-5)', paddingTop: 'var(--sp-5)', borderTop: '1px solid var(--c-border)', textAlign: 'center' }}>
            <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-3)', fontFamily: 'var(--ff-body)', lineHeight: 1.6 }}>
              DNDKeep is in <strong style={{ color: 'var(--t-2)' }}>invite-only beta</strong>.
              Accounts are created by invitation — check your email for your link.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
