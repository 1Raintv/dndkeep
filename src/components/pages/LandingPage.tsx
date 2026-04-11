import { useNavigate } from 'react-router-dom';

const FEATURES = [
  { icon: '⚡', label: 'Instant dice rolls', desc: 'Click any skill, ability, or weapon to roll instantly. Nat 20s glow gold. Nat 1s flash red. Full modifier breakdown every time.' },
  { icon: '🧠', label: 'Conditions that think', desc: 'Toggle Poisoned and every check gets disadvantage automatically. Stunned drops concentration. The rules apply themselves.' },
  { icon: '🎯', label: 'HIT or MISS instantly', desc: "Enter the enemy's AC and every weapon attack tells you immediately whether it connects — no math required." },
  { icon: '✨', label: 'Buffs that actually work', desc: 'Toggle Bless and your next roll includes the d4. Toggle Rage and your damage increases. Automatically, every time.' },
  { icon: '⚔️', label: 'DM combat dashboard', desc: 'Real-time HP for every party member. Apply damage directly. Roll NPC attacks. Track initiative. No spreadsheet needed.' },
  { icon: '📖', label: 'Built for 2024 rules', desc: 'New PHB exhaustion, updated conditions, concentration mechanics, and all subclasses. Not a retrofit — built from scratch.' },
];

const STEPS = [
  { n: '1', title: 'Build your character', desc: 'A guided 6-step creator walks you through species, class, background, ability scores, and build choices — with the rules explained in context.' },
  { n: '2', title: 'Play at the table', desc: 'Tap ability scores and skills to roll. Track HP, spell slots, and conditions. Everything calculates automatically. Nothing needs manual math.' },
  { n: '3', title: 'Run your campaign', desc: 'The DM creates a campaign and shares a code. Players join and the whole party syncs live. DMs manage initiative and apply damage from their screen.' },
];

const FREE_FEATURES = ['1 full character', 'Complete character sheet', 'Animated dice roller', '402 spells to browse', 'Condition tracking', 'Combat tools & weapons', 'Join campaigns'];
const PRO_FEATURES = ['Everything in Free', 'Unlimited characters', 'Create & run campaigns', 'Real-time party sync', 'DM combat dashboard', 'Initiative tracker', 'Homebrew Workshop'];

export default function LandingPage() {
  const navigate = useNavigate();
  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-void)', color: 'var(--t-1)', fontFamily: 'var(--ff-body)', position: 'relative', overflowX: 'hidden' }}>

      {/* Ambient orbs */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-10%', left: '-5%', width: 700, height: 700, background: 'radial-gradient(ellipse, rgba(123,94,167,0.06) 0%, transparent 70%)', filter: 'blur(40px)' }} />
        <div style={{ position: 'absolute', bottom: '20%', right: '-5%', width: 600, height: 600, background: 'radial-gradient(ellipse, rgba(200,146,42,0.05) 0%, transparent 70%)', filter: 'blur(50px)' }} />
      </div>

      {/* NAV */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 48px', borderBottom: '1px solid var(--c-border)', position: 'sticky', top: 0, background: 'rgba(13,13,21,0.88)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', zIndex: 50 }}>
        <span style={{ fontFamily: 'var(--ff-brand)', fontSize: 20, fontWeight: 700, color: 'var(--c-gold-l)', letterSpacing: '0.12em' }}>DNDKEEP</span>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button onClick={() => navigate('/auth')} style={{ background: 'none', border: 'none', color: 'var(--t-2)', cursor: 'pointer', fontSize: 14, padding: '8px 16px', minHeight: 0, borderRadius: 8 }}>Sign in</button>
          <button className="btn-gold" onClick={() => navigate('/auth')} style={{ fontSize: 14 }}>Get started free →</button>
        </div>
      </nav>

      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* HERO */}
        <section style={{ textAlign: 'center', padding: 'clamp(64px, 10vw, 120px) 24px 80px', maxWidth: 860, margin: '0 auto' }}>
          <div className="landing-hero-dice" style={{ marginBottom: 24 }}>🎲</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--c-gold-bg)', border: '1px solid var(--c-gold-bdr)', borderRadius: 999, padding: '5px 16px', fontSize: 12, fontWeight: 700, color: 'var(--c-gold-l)', letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 28 }}>
            ✦ 2024 PHB rules · Free to start
          </div>
          <h1 className="landing-hero-title" style={{ marginBottom: 24 }}>
            Your D&D companion<br />that does the math
          </h1>
          <p style={{ fontSize: 'clamp(1rem, 2vw, 1.2rem)', color: 'var(--t-2)', lineHeight: 1.7, maxWidth: 640, margin: '0 auto 40px' }}>
            Build characters. Roll dice. Track conditions, spells, and HP. Run campaigns with real-time party sync.{' '}
            <strong style={{ color: 'var(--t-1)' }}>Everything calculates automatically</strong> so you can focus on playing.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' as const, marginBottom: 16 }}>
            <button className="btn-gold btn-lg" onClick={() => navigate('/auth')} style={{ fontSize: 16, paddingLeft: 32, paddingRight: 32 }}>Create a free character →</button>
            <button className="btn-secondary btn-lg" onClick={() => navigate('/auth')} style={{ fontSize: 16 }}>Sign in</button>
          </div>
          <p style={{ fontSize: 12, color: 'var(--t-3)' }}>Free forever for 1 character. No credit card required.</p>
        </section>

        {/* STATS BAR */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 'clamp(16px, 4vw, 48px)', flexWrap: 'wrap' as const, padding: '32px 24px', borderTop: '1px solid var(--c-border)', borderBottom: '1px solid var(--c-border)', background: 'rgba(26,26,38,0.5)' }}>
          {[{ n: '13', label: 'Character classes' }, { n: '402', label: 'Spells in the browser' }, { n: '2024', label: 'PHB rules supported' }, { n: '∞', label: 'Dice rolls awaiting' }].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--ff-brand)', fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 900, color: 'var(--c-gold-l)' }}>{s.n}</div>
              <div style={{ fontSize: 12, color: 'var(--t-3)', fontWeight: 500, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* FEATURES */}
        <section style={{ maxWidth: 1100, margin: '0 auto', padding: '80px 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: 'var(--c-gold-l)', marginBottom: 12 }}>What it does</div>
            <h2 style={{ fontFamily: 'var(--ff-brand)', fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', fontWeight: 700, color: 'var(--t-1)' }}>Designed for the table</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
            {FEATURES.map(f => (
              <div key={f.label} className="landing-feature-card">
                <div style={{ fontSize: 28, marginBottom: 12 }}>{f.icon}</div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--t-1)', marginBottom: 8 }}>{f.label}</h3>
                <p style={{ fontSize: 14, color: 'var(--t-2)', lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px 80px' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: 'var(--c-gold-l)', marginBottom: 12 }}>How it works</div>
            <h2 style={{ fontFamily: 'var(--ff-brand)', fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', fontWeight: 700, color: 'var(--t-1)' }}>Three steps to the table</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 0 }}>
            {STEPS.map((step, i) => (
              <div key={step.n} style={{ display: 'flex', gap: 24, alignItems: 'flex-start', padding: '28px 0', borderBottom: i < STEPS.length - 1 ? '1px solid var(--c-border)' : 'none' }}>
                <div className="step-badge">{step.n}</div>
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--t-1)', marginBottom: 8 }}>{step.title}</h3>
                  <p style={{ fontSize: 14, color: 'var(--t-2)', lineHeight: 1.7, margin: 0, maxWidth: 560 }}>{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* PRICING */}
        <section style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px 100px' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: 'var(--c-gold-l)', marginBottom: 12 }}>Pricing</div>
            <h2 style={{ fontFamily: 'var(--ff-brand)', fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', fontWeight: 700, color: 'var(--t-1)' }}>Start free. Upgrade when ready.</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            <div className="pricing-card">
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-2)', marginBottom: 8 }}>Free</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontFamily: 'var(--ff-brand)', fontSize: 40, fontWeight: 900, color: 'var(--t-1)' }}>$0</span>
                  <span style={{ color: 'var(--t-3)', fontSize: 14 }}>forever</span>
                </div>
              </div>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column' as const, gap: 10, marginBottom: 28 }}>
                {FREE_FEATURES.map(f => (
                  <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--t-2)' }}>
                    <span style={{ color: 'var(--c-green-l)', fontSize: 16, flexShrink: 0 }}>✓</span>{f}
                  </li>
                ))}
              </ul>
              <button className="btn-secondary" onClick={() => navigate('/auth')} style={{ width: '100%', justifyContent: 'center' }}>Get started free</button>
            </div>
            <div className="pricing-card pro" style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', top: 16, right: 16, background: 'var(--c-gold)', color: '#150C00', fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' as const, padding: '3px 10px', borderRadius: 999 }}>Most popular</div>
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-gold-l)', marginBottom: 8 }}>Pro</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontFamily: 'var(--ff-brand)', fontSize: 40, fontWeight: 900, color: 'var(--t-1)' }}>$4.99</span>
                  <span style={{ color: 'var(--t-3)', fontSize: 14 }}>/month</span>
                </div>
              </div>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column' as const, gap: 10, marginBottom: 28 }}>
                {PRO_FEATURES.map(f => (
                  <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--t-2)' }}>
                    <span style={{ color: 'var(--c-gold-l)', fontSize: 16, flexShrink: 0 }}>✦</span>{f}
                  </li>
                ))}
              </ul>
              <button className="btn-gold" onClick={() => navigate('/auth')} style={{ width: '100%', justifyContent: 'center' }}>Start Pro free trial →</button>
            </div>
          </div>
        </section>

        {/* FOOTER CTA */}
        <section style={{ textAlign: 'center', padding: '72px 24px', borderTop: '1px solid var(--c-border)', background: 'rgba(26,26,38,0.4)' }}>
          <h2 style={{ fontFamily: 'var(--ff-brand)', fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', fontWeight: 700, color: 'var(--t-1)', marginBottom: 16 }}>Ready to roll?</h2>
          <p style={{ fontSize: 16, color: 'var(--t-2)', marginBottom: 32, maxWidth: 480, margin: '0 auto 32px' }}>Build your first character in under 5 minutes. No credit card required.</p>
          <button className="btn-gold btn-lg" onClick={() => navigate('/auth')} style={{ fontSize: 16, paddingLeft: 40, paddingRight: 40 }}>Create a free character →</button>
          <p style={{ marginTop: 16, fontSize: 12, color: 'var(--t-3)' }}>Compatible with D&D 5e · 2024 PHB rules · Not affiliated with Wizards of the Coast</p>
        </section>
      </div>
    </div>
  );
}
