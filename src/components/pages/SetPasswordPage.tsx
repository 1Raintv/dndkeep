import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { setPassword } from '../../lib/supabase';
import { consumeAuthLanding, peekAuthLanding } from '../../lib/authLanding';
import { friendlyAuthError } from '../../lib/authErrors';

// v2.680.0 — The landing for both emailed auth links, added with the
// invite-only beta.
//
// Two arms, one form:
//   invite   — an account was created for this address from the Supabase
//              dashboard. They hold a session but have never had a
//              password, and their display name is currently the local
//              part of their email (handle_new_user's fallback). Ask for
//              both.
//   recovery — an existing user forgot their password. Ask for the
//              password only; they already have a name they chose.
//
// Reaching this page at all means supabase-js already exchanged the
// emailed token for a session — that session is the authorisation for
// the change, which is why no current-password check is asked for and
// why the route is public (they are signed in by the time it renders).

const MIN_PASSWORD = 8;

export default function SetPasswordPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  // Read non-destructively: the flag is only consumed on success, so a
  // failed attempt (or an accidental reload) leaves them on the form
  // rather than dropping them into the app half-configured.
  const [landing] = useState(() => peekAuthLanding());
  const [displayName, setDisplayName] = useState('');
  const [password, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isInvite = landing === 'invite';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    // Checked here rather than with `pattern` so the message lands in the
    // same place as every other error on this form.
    if (password !== confirm) {
      setError('Those passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await setPassword(password, isInvite ? displayName : undefined);
      if (err) {
        setError(friendlyAuthError(err));
      } else {
        consumeAuthLanding();
        navigate('/lobby', { replace: true });
      }
    } catch (err) {
      setError(friendlyAuthError(err as { message?: string }));
    }
    setBusy(false);
  }

  // The session is minted asynchronously from the URL fragment, so on a
  // cold load this page can render a tick before `user` exists.
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: 'var(--t-3)' }}>
        Checking your link...
      </div>
    );
  }

  // No session means the link was expired, already used, or opened in a
  // different browser than it was requested from. A password form would
  // have nothing to act on, so send them somewhere that can help.
  if (!user) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--sp-8) var(--sp-4)', background: 'var(--c-bg)' }}>
        <div className="card card-gold" style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
          <h2 style={{ marginBottom: 'var(--sp-4)' }}>This Link Has Expired</h2>
          <p style={{ color: 'var(--t-2)', fontSize: 'var(--fs-sm)' }}>
            Invitation and reset links can only be used once, and they time out.
            Head to the sign-in page and request a fresh one.
          </p>
          <button className="btn-primary" style={{ marginTop: 'var(--sp-6)' }} onClick={() => navigate('/auth')}>
            Go to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'var(--sp-8) var(--sp-4)', background: 'var(--c-bg)' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--sp-8)' }}>
          <div style={{ fontFamily: 'var(--ff-brand)', fontSize: 'var(--fs-3xl)', fontWeight: 700, color: 'var(--c-gold-l)', letterSpacing: '0.1em', marginBottom: 'var(--sp-2)' }}>
            DNDKEEP
          </div>
          <p style={{ color: 'var(--t-2)', fontSize: 'var(--fs-sm)' }}>
            {isInvite
              ? 'Welcome to the beta — choose a password to finish setting up.'
              : 'Choose a new password for your account.'}
          </p>
        </div>
        <div className="card card-gold">
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
            {isInvite && (
              <div>
                <label>Display Name</label>
                <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
                  placeholder="How shall you be known?" required autoFocus />
              </div>
            )}
            <div>
              <label>{isInvite ? 'Password' : 'New Password'}</label>
              <input type="password" value={password} onChange={e => setPw(e.target.value)}
                placeholder={`At least ${MIN_PASSWORD} characters`} required minLength={MIN_PASSWORD}
                autoFocus={!isInvite} autoComplete="new-password" />
            </div>
            <div>
              <label>Confirm Password</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="Type it once more" required minLength={MIN_PASSWORD}
                autoComplete="new-password" />
            </div>
            {error && (
              <div style={{ background: 'rgba(155,28,28,0.15)', border: '1px solid rgba(107,20,20,1)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)', fontSize: 'var(--fs-sm)', color: '#fca5a5', fontFamily: 'var(--ff-body)' }}>{error}</div>
            )}
            <button type="submit" className="btn-primary btn-lg" disabled={busy} style={{ marginTop: 'var(--sp-2)' }}>
              {busy ? 'Saving...' : isInvite ? 'Enter the Keep' : 'Save New Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
