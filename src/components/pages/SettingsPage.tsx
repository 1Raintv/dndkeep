import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Character } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { signOut, getCharacters, deleteCharacter, supabase } from '../../lib/supabase';
import { redirectToCheckout, redirectToCustomerPortal, STRIPE_PRICES } from '../../lib/stripe';
import { usePushNotifications } from '../../lib/usePushNotifications';

export default function SettingsPage() {
  const { user, profile, isPro, refreshProfile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { permission, supported, enablePush } = usePushNotifications(user?.id);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgradeSuccess, setUpgradeSuccess] = useState(false);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refreshProfileRef = useRef(refreshProfile);
  refreshProfileRef.current = refreshProfile;

  useEffect(() => {
    // Handle extra character slots purchase return
    const slotsBought = parseInt(searchParams.get('slots_purchased') ?? '0');
    if (slotsBought > 0) {
      (async () => {
        await supabase.from('profiles').update({ extra_character_slots: (profile?.extra_character_slots ?? 0) + slotsBought }).eq('id', user!.id);
        await refreshProfileRef.current();
        setSearchParams({}, { replace: true });
      })();
      return;
    }
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
    return <div style={{ display: 'flex', gap: 'var(--sp-3)', padding: 'var(--sp-8)', alignItems: 'center' }}><div className="spinner" /><span className="loading-text">Loading...</span></div>;
  }

  async function buySlots() {
    if (!user) return;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/buy-character-slots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ origin: window.location.origin }),
      });
      const json = await res.json();
      if (json.url) window.location.href = json.url;
      else setError(json.error || 'Something went wrong');
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
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
      <h1 style={{ marginBottom: 'var(--sp-8)' }}>Settings</h1>

      {upgradeSuccess && (
        <div style={{ marginBottom: 'var(--sp-6)', background: 'rgba(22,163,74,0.1)', border: '1px solid var(--hp-full)', borderRadius: 'var(--r-md)', padding: 'var(--sp-4)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', color: '#86efac' }}>
          Welcome to Pro. Your subscription is being activated — it may take a moment to reflect below.
        </div>
      )}

      {/* Account */}
      <div className="card" style={{ marginBottom: 'var(--sp-6)' }}>
        <div className="section-header">Account</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--t-2)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)' }}>Display Name</span>
            <span style={{ color: 'var(--t-1)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)' }}>{profile.display_name ?? '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--t-2)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)' }}>Email</span>
            <span style={{ color: 'var(--t-1)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)' }}>{profile.email}</span>
          </div>
          <div style={{ paddingTop: 'var(--sp-3)', borderTop: '1px solid var(--c-border)' }}>
            <button className="btn-secondary btn-sm" onClick={handleSignOut}>Sign Out</button>
          </div>
        </div>
      </div>

      {/* Push Notifications */}
      {supported && (
        <div className="card" style={{ marginBottom: 'var(--sp-6)' }}>
          <div className="section-header" style={{ marginBottom: 'var(--sp-3)' }}>Notifications</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--t-1)', marginBottom: 4 }}>
                Session Alerts
              </div>
              <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', maxWidth: 400 }}>
                Get notified when your DM starts a session or sends a party alert.
              </p>
            </div>
            {permission === 'granted' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', color: 'var(--hp-full)' }}>
                <span>✓</span> Notifications enabled
              </div>
            ) : permission === 'denied' ? (
              <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--c-red-l)' }}>
                Blocked — enable in browser settings
              </div>
            ) : (
              <button
                className="btn-secondary btn-sm"
                onClick={enablePush}
                style={{ whiteSpace: 'nowrap' }}
              >
                Enable Notifications
              </button>
            )}
          </div>
        </div>
      )}

      {/* Characters */}
      <div className="card" style={{ marginBottom: 'var(--sp-6)' }}>
        <div className="section-header">My Characters</div>
        {characters.length === 0 ? (
          <p style={{ color: 'var(--t-2)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)' }}>
            No characters yet.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
            {characters.map(c => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--sp-3)', background: '#080d14', borderRadius: 'var(--r-md)', border: '1px solid var(--c-border)' }}>
                <div>
                  <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--t-1)' }}>
                    {c.name}
                  </div>
                  <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', marginTop: 2 }}>
                    Level {c.level} {c.class_name} — {c.species}
                  </div>
                </div>
                <div>
                  {confirmDeleteId === c.id ? (
                    <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
                      <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: '#fca5a5' }}>
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
                      style={{ color: 'var(--t-2)' }}
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
      <div className={`card ${isPro ? 'card-gold' : ''}`} style={{ marginBottom: 'var(--sp-6)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-4)' }}>
          <div className="section-header" style={{ marginBottom: 0, borderBottom: 'none' }}>Subscription</div>
          <span className={isPro ? 'badge badge-gold' : 'badge badge-muted'}>
            {isPro ? 'Pro' : 'Free'}
          </span>
        </div>

        {!isPro ? (
          <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginBottom: 'var(--sp-6)' }}>
              {[
                'Up to 6 characters (+ buy more slots for $1/slot)',
                'Campaign management — create and run campaigns as DM',
                'DM and player roles',
                'Real-time multiplayer combat sync',
              ].map(feature => (
                <div key={feature} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                  <span style={{ color: 'var(--c-gold)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)' }}>+</span>
                  <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)' }}>{feature}</span>
                </div>
              ))}
            </div>
            <button className="btn-gold btn-lg" onClick={handleUpgrade} disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
              {loading ? 'Redirecting...' : 'Upgrade to Pro'}
            </button>
            <p style={{ textAlign: 'center', marginTop: 'var(--sp-3)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', fontFamily: 'var(--ff-body)' }}>
              Billed monthly via Stripe. Cancel anytime.
            </p>
          </div>
        ) : (
          <div>
            <p style={{ color: 'var(--t-2)', marginBottom: 'var(--sp-4)' }}>
              You have full access to all Pro features.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginBottom: 'var(--sp-4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--t-2)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)' }}>Status</span>
                <span style={{ color: 'var(--hp-full)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)' }}>{profile.subscription_status}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--t-2)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)' }}>Character Slots</span>
                <span style={{ color: 'var(--t-1)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', fontWeight: 700 }}>
                  {characters.length} / {6 + (profile.extra_character_slots ?? 0)} used
                </span>
              </div>
            </div>
            {/* Buy extra slots */}
            <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: '12px', marginBottom: 'var(--sp-3)' }}>
              <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 13, color: 'var(--c-gold-l)', marginBottom: 4 }}>Need more characters?</div>
              <div style={{ fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-3)', marginBottom: 10 }}>
                Add 5 more character slots for $5 (one-time purchase). You currently have {6 + (profile.extra_character_slots ?? 0)} slots.
              </div>
              <button className="btn-gold btn-sm" onClick={buySlots} disabled={loading} style={{ justifyContent: 'center' }}>
                {loading ? 'Redirecting...' : '+ 5 Slots — $5'}
              </button>
            </div>
            <button className="btn-secondary btn-sm" onClick={handleManageBilling} disabled={loading}>
              {loading ? 'Redirecting...' : 'Manage Billing'}
            </button>
          </div>
        )}

        {error && (
          <div style={{ marginTop: 'var(--sp-4)', background: 'rgba(155,28,28,0.15)', border: '1px solid rgba(107,20,20,1)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)', fontSize: 'var(--fs-sm)', color: '#fca5a5', fontFamily: 'var(--ff-body)' }}>
            {error}
          </div>
        )}
      </div>

      {!isPro && (
        <div className="panel">
          <div className="section-header">Free Tier</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            <LimitRow label="Characters" used={characters.length} max={1} />
            <LimitRow label="Initiative Tracker" used={0} max={0} locked />
            <LimitRow label="Create campaigns (DM)" used={0} max={0} locked />
            <LimitRow label="Real-time sync" used={0} max={0} locked />
          </div>
          <p style={{ marginTop: 'var(--sp-3)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', fontFamily: 'var(--ff-body)' }}>
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
      <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)' }}>{label}</span>
      {locked ? (
        <span className="badge badge-muted">Pro Only</span>
      ) : (
        <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', color: used >= max ? 'var(--c-red-l)' : 'var(--c-gold-l)' }}>
          {used} / {max}
        </span>
      )}
    </div>
  );
}
