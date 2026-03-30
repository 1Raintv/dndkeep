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
        padding: 'var(--space-16) var(--space-6)',
        maxWidth: 720,
        margin: '0 auto',
        width: '100%',
      }}>
        {/* Badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)',
          padding: '4px 14px',
          border: '1px solid var(--border-gold)',
          borderRadius: 999,
          background: 'rgba(201,146,42,0.08)',
          fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)',
          fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
          color: 'var(--text-gold)',
          marginBottom: 'var(--space-6)',
        }}>
          <span>✦</span> 2024 Players Handbook Rules
        </div>

        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(2.5rem, 6vw, 4rem)',
          fontWeight: 900,
          lineHeight: 1.1,
          letterSpacing: '0.04em',
          marginBottom: 'var(--space-5)',
          background: 'linear-gradient(160deg, var(--color-amber) 0%, var(--color-gold-bright) 40%, var(--color-parchment) 60%, var(--color-gold-bright) 80%, var(--color-gold) 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        }}>
          DNDKeep
        </h1>

        <p style={{
          fontSize: 'var(--text-xl)', color: 'var(--text-secondary)',
          lineHeight: 1.6, marginBottom: 'var(--space-4)',
          fontFamily: 'var(--font-body)',
        }}>
          Your D&D 5e session companion.
        </p>
        <p style={{
          fontSize: 'var(--text-md)', color: 'var(--text-muted)',
          lineHeight: 1.7, marginBottom: 'var(--space-8)',
          maxWidth: 540, margin: '0 auto var(--space-8)',
        }}>
          Build characters, track HP and spells, roll dice, and run live sessions — everything
          your party needs at the table, in one place.
        </p>

        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn-gold btn-lg"
            onClick={() => navigate('/auth')}
            style={{ minWidth: 180, justifyContent: 'center', fontSize: 'var(--text-md)' }}
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
          marginTop: 'var(--space-4)',
          fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)', letterSpacing: '0.06em',
        }}>
          No credit card required · Free forever plan available
        </p>
      </section>

      {/* ── Divider ──────────────────────────────────────────────── */}
      <div style={{
        height: 1,
        background: 'linear-gradient(90deg, transparent, var(--color-gold-dim), transparent)',
        margin: '0 var(--space-6)',
      }} />

      {/* ── Features ─────────────────────────────────────────────── */}
      <section style={{ padding: 'var(--space-16) var(--space-6)', maxWidth: 1100, margin: '0 auto', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-10)' }}>
          <h2 style={{
            fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', fontWeight: 700,
            marginBottom: 'var(--space-3)',
          }}>
            Everything you need at the table
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-md)', fontFamily: 'var(--font-body)' }}>
            Built specifically for D&D 5e with the 2024 ruleset
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 'var(--space-4)',
        }}>
          {FEATURES.map(f => (
            <div key={f.title} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div style={{ fontSize: 28 }}>{f.icon}</div>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-md)', fontWeight: 700 }}>
                {f.title}
              </h3>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', lineHeight: 1.6, flex: 1 }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────── */}
      <div style={{ background: 'rgba(201,146,42,0.03)', borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
        <section style={{ padding: 'var(--space-16) var(--space-6)', maxWidth: 800, margin: '0 auto', width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: 'var(--space-10)' }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: 'var(--space-3)' }}>
              Simple pricing
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-md)' }}>
              Start free. Upgrade when you're ready to run campaigns.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)' }}>
            {TIERS.map(tier => (
              <div
                key={tier.name}
                className={tier.highlight ? 'card card-gold' : 'card'}
                style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', position: 'relative' }}
              >
                {tier.highlight && (
                  <div style={{
                    position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                    background: 'var(--color-gold)', color: 'var(--color-void)',
                    fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-xs)',
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                    padding: '3px 14px', borderRadius: 999,
                    whiteSpace: 'nowrap',
                  }}>
                    Most Popular
                  </div>
                )}

                <div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-lg)', color: tier.highlight ? 'var(--text-gold)' : 'var(--text-primary)', marginBottom: 4 }}>
                    {tier.name}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-1)' }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '2.5rem', lineHeight: 1, color: 'var(--text-primary)' }}>
                      {tier.price}
                    </span>
                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                      /{tier.period}
                    </span>
                  </div>
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 4 }}>
                    {tier.desc}
                  </p>
                </div>

                <ul style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', listStyle: 'none', flex: 1 }}>
                  {tier.features.map(f => (
                    <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                      <span style={{ color: 'var(--color-gold-bright)', flexShrink: 0, fontSize: 'var(--text-xs)' }}>✓</span>
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
      <section style={{ textAlign: 'center', padding: 'var(--space-16) var(--space-6)', maxWidth: 600, margin: '0 auto', width: '100%' }}>
        <div style={{ fontSize: 36, marginBottom: 'var(--space-4)' }}>🐉</div>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: 'var(--space-3)' }}>
          Ready to adventure?
        </h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-6)', lineHeight: 1.6 }}>
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
        borderTop: '1px solid var(--border-subtle)',
        padding: 'var(--space-6)',
        textAlign: 'center',
        fontFamily: 'var(--font-heading)',
        fontSize: 'var(--text-xs)',
        color: 'var(--text-muted)',
        letterSpacing: '0.06em',
      }}>
        DNDKeep · D&D 5e Session Companion · Built for adventurers
        <span style={{ margin: '0 var(--space-3)', opacity: 0.3 }}>·</span>
        D&D 5e 2024 rules
      </footer>
    </div>
  );
}
