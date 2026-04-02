import { useNavigate } from 'react-router-dom';

const FEATURES = [
  {
    label: 'Conditions auto-apply',
    desc: 'Poisoned? You get disadvantage automatically. Stunned? Concentration drops. No more looking up rules mid-combat.',
  },
  {
    label: 'Rolls with real results',
    desc: 'Every skill check, saving throw, and attack roll triggers an animated dice result. Critical hits glow gold. The result is shown instantly.',
  },
  {
    label: 'Buffs that actually work',
    desc: 'Toggle Bless and your next roll includes the d4. Toggle Rage and your damage increases. It happens automatically, every time.',
  },
  {
    label: 'HIT or MISS on every attack',
    desc: 'Enter the enemy\'s AC and every weapon attack tells you instantly whether it connects — in green or red, no math required.',
  },
  {
    label: 'DM combat dashboard',
    desc: 'Real-time HP for every player in the party. Apply damage directly. Roll NPC attacks. Track initiative. No spreadsheet needed.',
  },
  {
    label: 'Built for 2024 rules',
    desc: 'The new PHB exhaustion system, updated conditions, concentration mechanics, and all 48 subclasses. Not a retrofit — built from scratch.',
  },
];

const STEPS = [
  {
    n: '1',
    title: 'Build your character',
    desc: 'A guided creator walks you through species, class, background, ability scores, and build choices — level by level, with the rules explained in context.',
  },
  {
    n: '2',
    title: 'Play at the table',
    desc: 'Click ability scores and skills to roll dice. Track HP, spell slots, and conditions. Everything syncs automatically. Nothing needs to be manually calculated.',
  },
  {
    n: '3',
    title: 'Run a campaign',
    desc: 'The DM creates a campaign and shares a code. Players join and the whole party syncs in real time. The DM can apply damage and track initiative from their own screen.',
  },
];

const FREE_FEATURES = [
  '1 character',
  'Full character sheet',
  'Dice rolling with animations',
  'Spell browser (402 spells)',
  'Condition tracking',
  'Combat tools',
  'Join campaigns with a code',
];

const PRO_FEATURES = [
  'Everything in Free',
  'Unlimited characters',
  'Create and run campaigns',
  'Real-time party sync',
  'DM combat dashboard',
  'Homebrew Workshop',
  'Initiative tracker',
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)', color: 'var(--t-1)', fontFamily: 'var(--ff-body)' }}>

      {/* Nav */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 48px', borderBottom: '1px solid var(--c-border)',
        position: 'sticky', top: 0, background: 'var(--c-bg)', zIndex: 50,
      }}>
        <span style={{ fontFamily: 'var(--ff-brand)', fontSize: 20, fontWeight: 700, color: 'var(--c-gold-l)', letterSpacing: '0.1em' }}>
          DNDKEEP
        </span>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn-ghost btn-sm" onClick={() => navigate('/auth')}>Sign in</button>
          <button className="btn-gold btn-sm" onClick={() => navigate('/auth')}>Get started free</button>
        </div>
      </nav>

      {/* Hero */}
      <div style={{ textAlign: 'center', padding: '100px 48px 72px', maxWidth: 820, margin: '0 auto' }}>
        <div style={{
          display: 'inline-block', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: 'var(--c-gold-l)', background: 'var(--c-gold-bg)',
          border: '1px solid var(--c-gold-bdr)', padding: '4px 16px', borderRadius: 999, marginBottom: 32,
        }}>
          Compatible with 5th Edition · 2024 PHB rules · Free to start
        </div>

        <h1 style={{
          fontSize: 'clamp(2.2rem, 5vw, 3.8rem)', fontWeight: 900, lineHeight: 1.08,
          letterSpacing: '-0.03em', marginBottom: 28, color: 'var(--t-1)',
        }}>
          The D&D companion that<br />
          <span style={{ color: 'var(--c-gold-l)' }}>automates the rules</span>
        </h1>

        <p style={{
          fontSize: 18, color: 'var(--t-2)', lineHeight: 1.75, maxWidth: 580,
          margin: '0 auto 44px',
        }}>
          Character sheets, dice rolls, conditions, buffs, spell slots, and initiative tracking — all connected.
          When you apply a condition, the rules change automatically. When you roll, the math is already done.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn-gold"
            style={{ fontSize: 16, padding: '13px 36px', minHeight: 50 }}
            onClick={() => navigate('/auth')}
          >
            Create a free account
          </button>
          <button
            className="btn-secondary"
            style={{ fontSize: 16, padding: '13px 36px', minHeight: 50 }}
            onClick={() => navigate('/auth')}
          >
            Sign in
          </button>
        </div>
        <p style={{ marginTop: 16, fontSize: 13, color: 'var(--t-3)' }}>
          Free forever for one character. No credit card required.
        </p>
      </div>

      {/* Feature grid */}
      <div style={{ padding: '72px 48px', borderTop: '1px solid var(--c-border)', background: 'var(--c-surface)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--t-3)', marginBottom: 14 }}>
              What D&D Beyond doesn't do
            </div>
            <h2 style={{ fontSize: 32, fontWeight: 800, color: 'var(--t-1)', margin: 0, letterSpacing: '-0.02em' }}>
              Rules that apply themselves
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
            {FEATURES.map(f => (
              <div key={f.label} style={{
                background: 'var(--c-card)', border: '1px solid var(--c-border)',
                borderRadius: 'var(--r-xl)', padding: '24px 28px',
              }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-1)', marginBottom: 10 }}>{f.label}</div>
                <div style={{ fontSize: 14, color: 'var(--t-2)', lineHeight: 1.65 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* How it works */}
      <div style={{ padding: '72px 48px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <h2 style={{ fontSize: 32, fontWeight: 800, color: 'var(--t-1)', margin: 0, letterSpacing: '-0.02em' }}>How it works</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {STEPS.map((s, i) => (
              <div key={s.n} style={{
                display: 'flex', gap: 24, padding: '32px 0',
                borderBottom: i < STEPS.length - 1 ? '1px solid var(--c-border)' : 'none',
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: 'var(--c-gold-bg)', border: '2px solid var(--c-gold-bdr)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 900, fontSize: 18, color: 'var(--c-gold-l)', flexShrink: 0, marginTop: 2,
                }}>
                  {s.n}
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t-1)', marginBottom: 8 }}>{s.title}</div>
                  <div style={{ fontSize: 15, color: 'var(--t-2)', lineHeight: 1.7 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pricing */}
      <div style={{ padding: '72px 48px', borderTop: '1px solid var(--c-border)', background: 'var(--c-surface)' }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <h2 style={{ fontSize: 32, fontWeight: 800, color: 'var(--t-1)', margin: 0, letterSpacing: '-0.02em' }}>Simple pricing</h2>
            <p style={{ color: 'var(--t-2)', marginTop: 12, fontSize: 16 }}>Start free. Upgrade when your party is ready.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, maxWidth: 700, margin: '0 auto' }}>
            {/* Free tier */}
            <div style={{
              background: 'var(--c-card)', border: '1px solid var(--c-border)',
              borderRadius: 'var(--r-2xl)', padding: '36px 32px',
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-3)', marginBottom: 12 }}>Free</div>
              <div style={{ fontSize: 40, fontWeight: 900, color: 'var(--t-1)', lineHeight: 1, marginBottom: 6 }}>$0</div>
              <div style={{ fontSize: 14, color: 'var(--t-3)', marginBottom: 28 }}>forever</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
                {FREE_FEATURES.map(f => (
                  <div key={f} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--c-green-bg)', border: '1px solid rgba(5,150,105,0.3)', flexShrink: 0, marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--c-green-l)' }} />
                    </div>
                    <span style={{ fontSize: 14, color: 'var(--t-2)' }}>{f}</span>
                  </div>
                ))}
              </div>
              <button className="btn-secondary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => navigate('/auth')}>
                Get started
              </button>
            </div>

            {/* Pro tier */}
            <div style={{
              background: 'var(--c-card)', border: '2px solid var(--c-gold-bdr)',
              borderRadius: 'var(--r-2xl)', padding: '36px 32px', position: 'relative',
              boxShadow: '0 0 40px rgba(212,160,23,0.08)',
            }}>
              <div style={{
                position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'var(--c-gold-l)', background: 'var(--c-gold-bg)',
                border: '1px solid var(--c-gold-bdr)', padding: '3px 14px', borderRadius: 999, whiteSpace: 'nowrap',
              }}>
                Most popular
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--c-gold-l)', marginBottom: 12 }}>Pro</div>
              <div style={{ fontSize: 40, fontWeight: 900, color: 'var(--t-1)', lineHeight: 1, marginBottom: 6 }}>$4.99</div>
              <div style={{ fontSize: 14, color: 'var(--t-3)', marginBottom: 28 }}>per month</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
                {PRO_FEATURES.map(f => (
                  <div key={f} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--c-gold-bg)', border: '1px solid var(--c-gold-bdr)', flexShrink: 0, marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--c-gold-l)' }} />
                    </div>
                    <span style={{ fontSize: 14, color: f === 'Everything in Free' ? 'var(--t-3)' : 'var(--t-2)' }}>{f}</span>
                  </div>
                ))}
              </div>
              <button className="btn-gold" style={{ width: '100%', justifyContent: 'center' }} onClick={() => navigate('/auth')}>
                Start free trial
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Final CTA */}
      <div style={{ padding: '72px 48px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 32, fontWeight: 800, color: 'var(--t-1)', marginBottom: 16, letterSpacing: '-0.02em' }}>
          Ready to play smarter?
        </h2>
        <p style={{ fontSize: 16, color: 'var(--t-2)', marginBottom: 36, maxWidth: 440, margin: '0 auto 36px' }}>
          Free for one character. No credit card. Takes about five minutes to build your first character.
        </p>
        <button
          className="btn-gold"
          style={{ fontSize: 16, padding: '14px 44px', minHeight: 52 }}
          onClick={() => navigate('/auth')}
        >
          Create your first character
        </button>
      </div>

      {/* Footer */}
      <div style={{
        padding: '24px 48px', borderTop: '1px solid var(--c-border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 12,
      }}>
        <span style={{ fontFamily: 'var(--ff-brand)', fontSize: 14, fontWeight: 700, color: 'var(--c-gold-l)', letterSpacing: '0.1em' }}>
          DNDKEEP
        </span>
        <span style={{ fontSize: 12, color: 'var(--t-3)' }}>
          Compatible with 5th Edition. Not affiliated with Wizards of the Coast.
          Content used under Creative Commons CC-BY-4.0.
        </span>
      </div>
    </div>
  );
}
