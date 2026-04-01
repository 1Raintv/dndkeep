import { useNavigate } from 'react-router-dom';

const FEATURES = [
  {
    icon: '⚔️',
    title: 'Character Creator',
    desc: 'Build characters with the full 2024 PHB ruleset. Species traits, class features at every level, subclass choices, background ASIs.',
  },
  {
    icon: '📜',
    title: 'Character Sheet',
    desc: 'Live HP tracking, spell slots, conditions, skills, inventory, death saves — everything at the table, synced in real-time.',
  },
  {
    icon: '✨',
    title: 'Spell Browser',
    desc: '147+ spells with full descriptions, filtering by class, level, and school. Add directly to your character\'s spellbook.',
  },
  {
    icon: '🎲',
    title: 'Dice Roller',
    desc: 'Roll any dice combination with labels, modifiers, and history. Results logged per session.',
  },
  {
    icon: '🗺️',
    title: 'DM Sessions',
    desc: 'Create a campaign, share a join code with players, and track initiative, HP, and conditions for the whole party in real-time.',
  },
  {
    icon: '🛡️',
    title: 'Combat Tracker',
    desc: 'Initiative order, HP bars, condition management, and round counting — all synced across every player\'s device.',
  },
];

const TIERS = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    desc: 'Everything you need to play.',
    features: [
      '1 character',
      'Full character sheet',
      'Spell browser',
      'Dice roller',
      'Combat tracker',
      'Join campaigns as a player',
    ],
    cta: 'Get Started',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$5',
    period: 'per month',
    desc: 'For DMs and power players.',
    features: [
      'Unlimited characters',
      'Create & manage campaigns',
      'Real-time party sync',
      'DM lobby with initiative tracker',
      'Party HP & condition overview',
      'Priority support',
    ],
    cta: 'Go Pro',
    highlight: true,
  },
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section style={{
        textAlign: 'center',
        padding: 'var(--sp-16) var(--sp-6)',
        maxWidth: 720,
        margin: '0 auto',
        width: '100%',
      }}>
        {/* Badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)',
          padding: '4px 14px',
          border: '1px solid var(--c-gold-bdr)',
          borderRadius: 999,
          background: 'rgba(201,146,42,0.08)',
          fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)',
          fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
          color: 'var(--c-gold-l)',
          marginBottom: 'var(--sp-6)',
        }}>
          <span>✦</span> 2024 Players Handbook Rules
        </div>

        <h1 style={{
          fontFamily: 'var(--ff-brand)',
          fontSize: 'clamp(2.5rem, 6vw, 4rem)',
          fontWeight: 900,
          lineHeight: 1.1,
          letterSpacing: '0.04em',
          marginBottom: 'var(--sp-5)',
          background: 'linear-gradient(160deg, var(--c-amber-l) 0%, var(--c-gold-l) 40%, var(--color-parchment) 60%, var(--c-gold-l) 80%, var(--c-gold) 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        }}>
          DNDKeep
        </h1>

        <p style={{
          fontSize: 'var(--fs-xl)', color: 'var(--t-2)',
          lineHeight: 1.6, marginBottom: 'var(--sp-4)',
          fontFamily: 'var(--ff-body)',
        }}>
          Your D&D 5e session companion.
        </p>
        <p style={{
          fontSize: 'var(--fs-md)', color: 'var(--t-2)',
          lineHeight: 1.7, marginBottom: 'var(--sp-8)',
          maxWidth: 540, margin: '0 auto var(--sp-8)',
        }}>
          Build characters, track HP and spells, roll dice, and run live sessions — everything
          your party needs at the table, in one place.
        </p>

        <div style={{ display: 'flex', gap: 'var(--sp-3)', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn-gold btn-lg"
            onClick={() => navigate('/auth')}
            style={{ minWidth: 180, justifyContent: 'center', fontSize: 'var(--fs-md)' }}
          >
            Get Started Free
          </button>
          <button
            className="btn-secondary btn-lg"
            onClick={() => navigate('/auth')}
            style={{ minWidth: 160, justifyContent: 'center' }}
          >
            Sign In
          </button>
        </div>

        <p style={{
          marginTop: 'var(--sp-4)',
          fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)',
          color: 'var(--t-2)', letterSpacing: '0.06em',
        }}>
          No credit card required · Free forever plan available
        </p>
      </section>

      {/* ── Divider ──────────────────────────────────────────────── */}
      <div style={{
        height: 1,
        background: 'linear-gradient(90deg, transparent, var(--c-gold), transparent)',
        margin: '0 var(--sp-6)',
      }} />

      {/* ── Features ─────────────────────────────────────────────── */}
      <section style={{ padding: 'var(--sp-16) var(--sp-6)', maxWidth: 1100, margin: '0 auto', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--sp-10)' }}>
          <h2 style={{
            fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-2xl)', fontWeight: 700,
            marginBottom: 'var(--sp-3)',
          }}>
            Everything you need at the table
          </h2>
          <p style={{ color: 'var(--t-2)', fontSize: 'var(--fs-md)', fontFamily: 'var(--ff-body)' }}>
            Built specifically for D&D 5e with the 2024 ruleset
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 'var(--sp-4)',
        }}>
          {FEATURES.map(f => (
            <div key={f.title} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
              <div style={{ fontSize: 28 }}>{f.icon}</div>
              <h3 style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-md)', fontWeight: 700 }}>
                {f.title}
              </h3>
              <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', lineHeight: 1.6, flex: 1 }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────── */}
      <div style={{ background: 'rgba(201,146,42,0.03)', borderTop: '1px solid var(--c-border)', borderBottom: '1px solid var(--c-border)' }}>
        <section style={{ padding: 'var(--sp-16) var(--sp-6)', maxWidth: 800, margin: '0 auto', width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: 'var(--sp-10)' }}>
            <h2 style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-2xl)', fontWeight: 700, marginBottom: 'var(--sp-3)' }}>
              Simple pricing
            </h2>
            <p style={{ color: 'var(--t-2)', fontSize: 'var(--fs-md)' }}>
              Start free. Upgrade when you're ready to run campaigns.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-5)' }}>
            {TIERS.map(tier => (
              <div
                key={tier.name}
                className={tier.highlight ? 'card card-gold' : 'card'}
                style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)', position: 'relative' }}
              >
                {tier.highlight && (
                  <div style={{
                    position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                    background: 'var(--c-gold)', color: 'var(--c-bg)',
                    fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-xs)',
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                    padding: '3px 14px', borderRadius: 999,
                    whiteSpace: 'nowrap',
                  }}>
                    Most Popular
                  </div>
                )}

                <div>
                  <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-lg)', color: tier.highlight ? 'var(--c-gold-l)' : 'var(--t-1)', marginBottom: 4 }}>
                    {tier.name}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-1)' }}>
                    <span style={{ fontFamily: 'var(--ff-brand)', fontWeight: 900, fontSize: '2.5rem', lineHeight: 1, color: 'var(--t-1)' }}>
                      {tier.price}
                    </span>
                    <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
                      /{tier.period}
                    </span>
                  </div>
                  <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', marginTop: 4 }}>
                    {tier.desc}
                  </p>
                </div>

                <ul style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', listStyle: 'none', flex: 1 }}>
                  {tier.features.map(f => (
                    <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', fontSize: 'var(--fs-sm)', color: 'var(--t-2)' }}>
                      <span style={{ color: 'var(--c-gold-l)', flexShrink: 0, fontSize: 'var(--fs-xs)' }}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  className={tier.highlight ? 'btn-gold' : 'btn-secondary'}
                  onClick={() => navigate('/auth')}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  {tier.cta}
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ── Final CTA ────────────────────────────────────────────── */}
      <section style={{ textAlign: 'center', padding: 'var(--sp-16) var(--sp-6)', maxWidth: 600, margin: '0 auto', width: '100%' }}>
        <div style={{ fontSize: 36, marginBottom: 'var(--sp-4)' }}>🐉</div>
        <h2 style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-2xl)', fontWeight: 700, marginBottom: 'var(--sp-3)' }}>
          Ready to adventure?
        </h2>
        <p style={{ color: 'var(--t-2)', marginBottom: 'var(--sp-6)', lineHeight: 1.6 }}>
          Free to start. No credit card needed.
          Your first character awaits.
        </p>
        <button
          className="btn-gold btn-lg"
          onClick={() => navigate('/auth')}
          style={{ justifyContent: 'center', minWidth: 200 }}
        >
          Create Your Character
        </button>
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer style={{
        borderTop: '1px solid var(--c-border)',
        padding: 'var(--sp-6)',
        textAlign: 'center',
        fontFamily: 'var(--ff-body)',
        fontSize: 'var(--fs-xs)',
        color: 'var(--t-2)',
        letterSpacing: '0.06em',
      }}>
        DNDKeep · D&D 5e Session Companion · Built for adventurers
        <span style={{ margin: '0 var(--sp-3)', opacity: 0.3 }}>·</span>
        D&D 5e 2024 rules
      </footer>
    </div>
  );
}
