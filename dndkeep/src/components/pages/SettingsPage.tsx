import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Character } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { signOut, getCharacters, deleteCharacter } from '../../lib/supabase';
import { redirectToCheckout, redirectToCustomerPortal, STRIPE_PRICES } from '../../lib/stripe';

export default function SettingsPage() {
  const { user, profile, isPro, refreshProfile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgradeSuccess, setUpgradeSuccess] = useState(false);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refreshProfileRef = useRef(refreshProfile);
  refreshProfileRef.current = refreshProfile;

  useEffect(() => {
    if (searchParams.get('upgraded') !== 'true') return;
    setUpgradeSuccess(true);
    setSearchParams({}, { replace: true });
    let attempts = 0;
    const poll = setInterval(async () => {
      await refreshProfileRef.current();
      attempts++;
      if (attempts >= 6) clearInterval(poll);
    }, 2000);
    return () => clearInterval(poll);
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!user) return;
    getCharacters(user.id).then(({ data }) => setCharacters(data));
  }, [user]);

  if (!profile) {
    return <div style={{ display: 'flex', gap: 'var(--space-3)', padding: 'var(--space-8)', alignItems: 'center' }}><div className="spinner" /><span className="loading-text">Loading...</span></div>;
  }

  async function handleUpgrade() {
    setLoading(true); setError(null);
    try { await redirectToCheckout(STRIPE_PRICES.PRO_MONTHLY, user!.id); }
    catch (e) { setError((e as Error).message); setLoading(false); }
  }

  async function handleManageBilling() {
    setLoading(true); setError(null);
    try { await redirectToCustomerPortal(user!.id); }
    catch (e) { setError((e as Error).message); setLoading(false); }
  }

  async function handleSignOut() {
    await signOut();
  }

  async function handleDeleteCharacter(id: string) {
    setDeleting(true);
    await deleteCharacter(id);
    setCharacters(prev => prev.filter(c => c.id !== id));
    setConfirmDeleteId(null);
    setDeleting(false);
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 'var(--space-8)' }}>Settings</h1>

      {upgradeSuccess && (
        <div style={{ marginBottom: 'var(--space-6)', background: 'rgba(22,163,74,0.1)', border: '1px solid var(--hp-full)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)', color: '#86efac' }}>
          Welcome to Pro. Your subscription is being activated — it may take a moment to reflect below.
        </div>
      )}

      {/* Account */}
      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="section-header">Account</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)' }}>Display Name</span>
            <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)' }}>{profile.display_name ?? '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)' }}>Email</span>
            <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)' }}>{profile.email}</span>
          </div>
          <div style={{ paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border-subtle)' }}>
            <button className="btn-secondary btn-sm" onClick={handleSignOut}>Sign Out</button>
          </div>
        </div>
      </div>

      {/* Characters */}
      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="section-header">My Characters</div>
        {characters.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)' }}>
            No characters yet.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {characters.map(c => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-3)', background: 'var(--bg-sunken)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
                    {c.name}
                  </div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                    Level {c.level} {c.class_name} — {c.species}
                  </div>
                </div>
                <div>
                  {confirmDeleteId === c.id ? (
                    <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                      <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: '#fca5a5' }}>
                        Are you sure?
                      </span>
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        Cancel
                      </button>
                      <button
                        className="btn-danger btn-sm"
                        onClick={() => handleDeleteCharacter(c.id)}
                        disabled={deleting}
                      >
                        {deleting ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  ) : (
                    <button
                      className="btn-ghost btn-sm"
                      onClick={() => setConfirmDeleteId(c.id)}
                      style={{ color: 'var(--color-ash)' }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Subscription */}
      <div className={`card ${isPro ? 'card-gold' : ''}`} style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
          <div className="section-header" style={{ marginBottom: 0, borderBottom: 'none' }}>Subscription</div>
          <span className={isPro ? 'badge badge-gold' : 'badge badge-muted'}>
            {isPro ? 'Pro' : 'Free'}
          </span>
        </div>

        {!isPro ? (
          <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-6)' }}>
              {[
                'Unlimited characters',
                'Campaign management — create and run campaigns as DM',
                'DM and player roles',
                'Real-time multiplayer combat sync',
              ].map(feature => (
                <div key={feature} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <span style={{ color: 'var(--color-gold)', fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)' }}>+</span>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{feature}</span>
                </div>
              ))}
            </div>
            <button className="btn-gold btn-lg" onClick={handleUpgrade} disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
              {loading ? 'Redirecting...' : 'Upgrade to Pro'}
            </button>
            <p style={{ textAlign: 'center', marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-heading)' }}>
              Billed monthly via Stripe. Cancel anytime.
            </p>
          </div>
        ) : (
          <div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
              You have full access to all Pro features.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)' }}>Status</span>
                <span style={{ color: 'var(--hp-full)', fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)' }}>{profile.subscription_status}</span>
              </div>
            </div>
            <button className="btn-secondary btn-sm" onClick={handleManageBilling} disabled={loading}>
              {loading ? 'Redirecting...' : 'Manage Billing'}
            </button>
          </div>
        )}

        {error && (
          <div style={{ marginTop: 'var(--space-4)', background: 'rgba(155,28,28,0.15)', border: '1px solid var(--color-blood)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', fontSize: 'var(--text-sm)', color: '#fca5a5', fontFamily: 'var(--font-heading)' }}>
            {error}
          </div>
        )}
      </div>

      {!isPro && (
        <div className="panel">
          <div className="section-header">Free Tier</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <LimitRow label="Characters" used={characters.length} max={1} />
            <LimitRow label="Create campaigns (DM)" used={0} max={0} locked />
            <LimitRow label="Real-time sync" used={0} max={0} locked />
          </div>
          <p style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-heading)' }}>
            Free players can join campaigns via invite code without upgrading.
          </p>
        </div>
      )}
    </div>
  );
}

function LimitRow({ label, used, max, locked }: { label: string; used: number; max: number; locked?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{label}</span>
      {locked ? (
        <span className="badge badge-muted">Pro Only</span>
      ) : (
        <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)', color: used >= max ? 'var(--color-crimson-bright)' : 'var(--text-gold)' }}>
          {used} / {max}
        </span>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { user, profile, isPro, refreshProfile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgradeSuccess, setUpgradeSuccess] = useState(false);

  // Keep a stable ref so the interval callback always calls the latest version
  // without the effect needing to re-run when refreshProfile identity changes.
  const refreshProfileRef = useRef(refreshProfile);
  refreshProfileRef.current = refreshProfile;

  // Stripe redirects back with ?upgraded=true — poll profile until tier updates
  useEffect(() => {
    if (searchParams.get('upgraded') !== 'true') return;
    setUpgradeSuccess(true);
    setSearchParams({}, { replace: true });
    let attempts = 0;
    const poll = setInterval(async () => {
      await refreshProfileRef.current();
      attempts++;
      if (attempts >= 6) clearInterval(poll);
    }, 2000);
    return () => clearInterval(poll);
  }, [searchParams, setSearchParams]);

  if (!profile) {
    // Profile not loaded yet (auth is guaranteed by ProtectedRoute)
    return <div style={{ display: 'flex', gap: 'var(--space-3)', padding: 'var(--space-8)', alignItems: 'center' }}><div className="spinner" /><span className="loading-text">Loading...</span></div>;
  }

  async function handleUpgrade() {
    setLoading(true); setError(null);
    try { await redirectToCheckout(STRIPE_PRICES.PRO_MONTHLY, user!.id); }
    catch (e) { setError((e as Error).message); setLoading(false); }
  }

  async function handleManageBilling() {
    setLoading(true); setError(null);
    try { await redirectToCustomerPortal(user!.id); }
    catch (e) { setError((e as Error).message); setLoading(false); }
  }

  async function handleSignOut() {
    await signOut();
    // AuthContext's onAuthStateChange fires, clears user,
    // ProtectedRoute then redirects to /auth automatically.
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 'var(--space-8)' }}>Settings</h1>

      {upgradeSuccess && (
        <div style={{
          marginBottom: 'var(--space-6)',
          background: 'rgba(22,163,74,0.1)',
          border: '1px solid var(--hp-full)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-4)',
          fontFamily: 'var(--font-heading)',
          fontSize: 'var(--text-sm)',
          color: '#86efac',
        }}>
          Welcome to Pro! Your subscription is being activated — it may take a moment to reflect below.
        </div>
      )}

      {/* Account */}
      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="section-header">Account</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)' }}>Display Name</span>
            <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)' }}>{profile.display_name ?? '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)' }}>Email</span>
            <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)' }}>{profile.email}</span>
          </div>
          <div style={{ paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border-subtle)' }}>
            <button className="btn-secondary btn-sm" onClick={handleSignOut}>Sign Out</button>
          </div>
        </div>
      </div>

      {/* Subscription */}
      <div className={`card ${isPro ? 'card-gold' : ''}`} style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
          <div className="section-header" style={{ marginBottom: 0, borderBottom: 'none' }}>Subscription</div>
          <span className={isPro ? 'badge badge-gold' : 'badge badge-muted'}>
            {isPro ? 'Pro' : 'Free'}
          </span>
        </div>

        {!isPro ? (
          <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-6)' }}>
              {[
                'Unlimited characters',
                'Campaign management',
                'DM and player roles',
                'Real-time multiplayer combat sync',
              ].map(feature => (
                <div key={feature} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <span style={{ color: 'var(--color-gold)', fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)' }}>+</span>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{feature}</span>
                </div>
              ))}
            </div>
            <button className="btn-gold btn-lg" onClick={handleUpgrade} disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
              {loading ? 'Redirecting...' : 'Upgrade to Pro'}
            </button>
            <p style={{ textAlign: 'center', marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-heading)' }}>
              Billed monthly via Stripe. Cancel anytime.
            </p>
          </div>
        ) : (
          <div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
              You have full access to all Pro features. Thank you for your support.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)' }}>Status</span>
                <span style={{ color: 'var(--hp-full)', fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)' }}>{profile.subscription_status}</span>
              </div>
            </div>
            <button className="btn-secondary btn-sm" onClick={handleManageBilling} disabled={loading}>
              {loading ? 'Redirecting...' : 'Manage Billing'}
            </button>
          </div>
        )}

        {error && (
          <div style={{ marginTop: 'var(--space-4)', background: 'rgba(155,28,28,0.15)', border: '1px solid var(--color-blood)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', fontSize: 'var(--text-sm)', color: '#fca5a5', fontFamily: 'var(--font-heading)' }}>
            {error}
          </div>
        )}
      </div>

      {/* Free tier limits */}
      {!isPro && (
        <div className="panel">
          <div className="section-header">Free Tier Limits</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <LimitRow label="Characters" used={1} max={1} />
            <LimitRow label="Campaigns" used={0} max={0} locked />
            <LimitRow label="Real-time sync" used={0} max={0} locked />
          </div>
        </div>
      )}
    </div>
  );
}

function LimitRow({ label, used, max, locked }: { label: string; used: number; max: number; locked?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{label}</span>
      {locked ? (
        <span className="badge badge-muted">Pro Only</span>
      ) : (
        <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-sm)', color: used >= max ? 'var(--color-crimson-bright)' : 'var(--text-gold)' }}>
          {used} / {max}
        </span>
      )}
    </div>
  );
}
