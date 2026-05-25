import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  STRIPE_PRICES, STRIPE_CONFIGURED, isPriceConfigured,
  redirectToCheckout, redirectToOneTimeCheckout, redirectToCustomerPortal,
} from '../../lib/stripe';
import {
  isSubscriptionActive, totalCharacterSlots, MAX_CHARACTER_SLOTS,
  activeCampaignSlots,
} from '../../lib/entitlements';

// v2.519.0 — The Store. Surfaces the subscription + one-time purchases
// that the entitlement gates (v2.518) point users toward. Buy buttons
// call the Stripe helpers from src/lib/stripe.ts. Until Stripe is
// configured (publishable key + per-product price IDs), the catalog
// still renders with disabled "Coming soon" buttons so the page is
// reviewable before the Stripe account exists.

interface StoreItem {
  key: string;
  title: string;
  price: string;
  blurb: string;
  bullets: string[];
  priceId: string | undefined;
  accent: string;
}

export default function StorePage() {
  const { user, profile, refreshProfile } = useAuth();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justPurchased, setJustPurchased] = useState<string | null>(null);

  // Read ?purchased=KEY back from a successful one-time checkout return.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const p = params.get('purchased');
    if (p) {
      setJustPurchased(p);
      // Refresh entitlements (webhook may have credited the purchase).
      refreshProfile?.();
      // Clean the URL.
      window.history.replaceState({}, '', '/store');
    }
  }, [refreshProfile]);

  const active = isSubscriptionActive(profile);
  const charSlots = totalCharacterSlots(profile);
  const campSlots = activeCampaignSlots(profile);
  const hasUltimate = profile?.ultimate_campaign === true;
  const atMaxSlots = charSlots >= MAX_CHARACTER_SLOTS;

  async function buySubscription() {
    if (!user) return;
    setError(null); setBusyKey('sub');
    try {
      await redirectToCheckout(STRIPE_PRICES.PRO_MONTHLY, user.id);
    } catch (e) {
      setError((e as Error).message); setBusyKey(null);
    }
  }

  async function manageBilling() {
    if (!user) return;
    setError(null); setBusyKey('manage');
    try {
      await redirectToCustomerPortal(user.id);
    } catch (e) {
      setError((e as Error).message); setBusyKey(null);
    }
  }

  async function buyOneTime(item: StoreItem) {
    if (!user || !item.priceId) return;
    setError(null); setBusyKey(item.key);
    try {
      await redirectToOneTimeCheckout(item.priceId, user.id, item.key);
    } catch (e) {
      setError((e as Error).message); setBusyKey(null);
    }
  }

  const oneTimeItems: StoreItem[] = [
    {
      key: 'character_slot',
      title: 'Character Slot',
      price: '$5',
      blurb: 'Permanently add one more character slot (up to 10 total). Yours forever.',
      bullets: [
        'Stacks up to 10 total slots',
        'Owned permanently — never expires',
        'Characters past level 9 still need an active subscription',
      ],
      priceId: STRIPE_PRICES.CHARACTER_SLOT,
      accent: '#60a5fa',
    },
    {
      key: 'campaign_slot',
      title: 'Extra Campaign Slot',
      price: '$5',
      blurb: 'Run an additional concurrent campaign as DM, on top of the one your subscription includes.',
      bullets: [
        'Adds one concurrent campaign you can DM',
        'Subscriber-only — pauses if your subscription lapses',
        'Stackable',
      ],
      priceId: STRIPE_PRICES.CAMPAIGN_SLOT,
      accent: '#a78bfa',
    },
    {
      key: 'ultimate_campaign',
      title: 'Ultimate Campaign',
      price: '$10',
      blurb: 'Raise the scene cap from 10 to 50. Applies account-wide: every campaign you create afterward gets 50 scenes.',
      bullets: [
        'Account-wide — affects all future campaigns',
        '50 scenes per campaign instead of 10',
        'One-time purchase, owned forever',
      ],
      priceId: STRIPE_PRICES.ULTIMATE_CAMPAIGN,
      accent: '#fbbf24',
    },
  ];

  const diceDyes: StoreItem[] = [
    { key: 'dice_dye_red',   title: 'Crimson Dice',  price: '$2', blurb: 'A deep red dice set.',   bullets: [], priceId: STRIPE_PRICES.DICE_DYE_RED,   accent: '#ef4444' },
    { key: 'dice_dye_green', title: 'Emerald Dice',  price: '$2', blurb: 'A rich green dice set.',  bullets: [], priceId: STRIPE_PRICES.DICE_DYE_GREEN, accent: '#22c55e' },
    { key: 'dice_dye_blue',  title: 'Sapphire Dice', price: '$2', blurb: 'A cool blue dice set.',   bullets: [], priceId: STRIPE_PRICES.DICE_DYE_BLUE,  accent: '#3b82f6' },
  ];

  function buyButton(item: StoreItem, owned?: boolean, ownedLabel?: string) {
    if (owned) {
      return <button className="btn-secondary btn-sm" disabled style={{ opacity: 0.7 }}>{ownedLabel ?? 'Owned'}</button>;
    }
    const configured = isPriceConfigured(item.priceId);
    if (!configured) {
      return <button className="btn-secondary btn-sm" disabled title="Available soon">Coming soon</button>;
    }
    return (
      <button className="btn-gold btn-sm" disabled={busyKey === item.key} onClick={() => buyOneTime(item)}>
        {busyKey === item.key ? 'Opening…' : `Buy ${item.price}`}
      </button>
    );
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 'var(--sp-2)' }}>Store</h1>
      <p style={{ color: 'var(--t-2)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', marginBottom: 'var(--sp-6)' }}>
        Subscribe to unlock high-level play and DM tools, or grab one-time upgrades that are yours to keep.
      </p>

      {!STRIPE_CONFIGURED && (
        <div style={{ marginBottom: 'var(--sp-5)', background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.3)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3) var(--sp-4)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', color: 'var(--c-amber-l)' }}>
          The store is in preview — purchasing isn't live yet. Everything below shows what's coming.
        </div>
      )}

      {error && (
        <div style={{ marginBottom: 'var(--sp-5)', background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3) var(--sp-4)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', color: '#fca5a5' }}>
          {error}
        </div>
      )}

      {justPurchased && (
        <div style={{ marginBottom: 'var(--sp-5)', background: 'rgba(22,163,74,0.1)', border: '1px solid var(--hp-full)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3) var(--sp-4)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', color: '#86efac' }}>
          Purchase complete — your upgrade is being applied. It may take a moment to appear.
        </div>
      )}

      {/* ── SUBSCRIPTION ─────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 'var(--sp-6)', borderColor: 'var(--c-gold-bdr)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span className="section-header" style={{ margin: 0 }}>Subscription</span>
              {active && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: '#86efac', background: 'rgba(22,163,74,0.15)', border: '1px solid rgba(22,163,74,0.4)', borderRadius: 999, padding: '2px 8px' }}>ACTIVE</span>}
            </div>
            <div style={{ fontWeight: 900, fontSize: '1.8rem', color: 'var(--t-1)' }}>$5<span style={{ fontSize: '0.9rem', color: 'var(--t-3)', fontWeight: 400 }}>/month</span></div>
            <ul style={{ color: 'var(--t-2)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', lineHeight: 1.8, paddingLeft: 18, margin: '8px 0 0' }}>
              <li>Level characters past 9 (unlocks 10–20)</li>
              <li>Create &amp; run a campaign as DM (1 slot included)</li>
              <li>Real-time party sync &amp; DM combat dashboard</li>
              <li>Unfreezes any frozen level-10+ characters</li>
            </ul>
          </div>
          <div style={{ flexShrink: 0 }}>
            {active ? (
              <button className="btn-secondary btn-sm" disabled={busyKey === 'manage'} onClick={manageBilling}>
                {busyKey === 'manage' ? 'Opening…' : 'Manage billing'}
              </button>
            ) : isPriceConfigured(STRIPE_PRICES.PRO_MONTHLY) ? (
              <button className="btn-gold" disabled={busyKey === 'sub'} onClick={buySubscription}>
                {busyKey === 'sub' ? 'Opening…' : 'Subscribe'}
              </button>
            ) : (
              <button className="btn-secondary btn-sm" disabled title="Available soon">Coming soon</button>
            )}
          </div>
        </div>
      </div>

      {/* ── ONE-TIME UPGRADES ────────────────────────────────────── */}
      <div className="section-header" style={{ marginBottom: 'var(--sp-3)' }}>One-time upgrades</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 'var(--sp-4)', marginBottom: 'var(--sp-6)' }}>
        {oneTimeItems.map(item => {
          const owned =
            item.key === 'ultimate_campaign' ? hasUltimate :
            item.key === 'character_slot' ? atMaxSlots :
            false;
          const ownedLabel =
            item.key === 'ultimate_campaign' ? 'Owned' :
            item.key === 'character_slot' ? 'Max slots' :
            'Owned';
          return (
            <div key={item.key} className="card" style={{ borderLeft: `3px solid ${item.accent}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--t-1)' }}>{item.title}</span>
                <span style={{ fontWeight: 900, fontSize: 16, color: item.accent }}>{item.price}</span>
              </div>
              <p style={{ color: 'var(--t-2)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', lineHeight: 1.5, margin: '6px 0 10px' }}>{item.blurb}</p>
              {item.bullets.length > 0 && (
                <ul style={{ color: 'var(--t-3)', fontFamily: 'var(--ff-body)', fontSize: 12, lineHeight: 1.7, paddingLeft: 16, margin: '0 0 12px' }}>
                  {item.bullets.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                {buyButton(item, owned, ownedLabel)}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── COSMETIC DICE ────────────────────────────────────────── */}
      <div className="section-header" style={{ marginBottom: 'var(--sp-3)' }}>Dice dyes <span style={{ fontWeight: 400, color: 'var(--t-3)', fontSize: 12 }}>· cosmetic, never expire</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--sp-3)', marginBottom: 'var(--sp-8)' }}>
        {diceDyes.map(item => (
          <div key={item.key} className="card" style={{ textAlign: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, margin: '4px auto 10px', background: item.accent, boxShadow: `0 0 18px ${item.accent}66`, transform: 'rotate(45deg)' }} />
            <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--t-1)' }}>{item.title}</div>
            <div style={{ color: 'var(--t-3)', fontFamily: 'var(--ff-body)', fontSize: 12, margin: '2px 0 10px' }}>{item.price}</div>
            {buyButton(item)}
          </div>
        ))}
      </div>

      {/* Account snapshot */}
      <div className="card" style={{ marginBottom: 'var(--sp-8)' }}>
        <div className="section-header" style={{ marginBottom: 'var(--sp-3)' }}>Your account</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)' }}>
          <Row label="Subscription" value={active ? 'Active' : 'Free'} />
          <Row label="Character slots" value={`${charSlots} of ${MAX_CHARACTER_SLOTS}`} />
          <Row label="Campaign slots" value={active ? String(campSlots) : '0 (subscribe to DM)'} />
          <Row label="Ultimate Campaign" value={hasUltimate ? 'Owned (50 scenes)' : 'Not owned (10 scenes)'} />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: 'var(--t-2)' }}>{label}</span>
      <span style={{ color: 'var(--t-1)', fontWeight: 600 }}>{value}</span>
    </div>
  );
}
