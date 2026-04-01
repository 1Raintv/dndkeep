import { useNavigate } from 'react-router-dom';

const GAPS = [
  { icon: '⚡', label: 'Conditions auto-apply', desc: 'Poisoned? You get disadvantage automatically. Stunned? Concentration drops. No more looking up rules.' },
  { icon: '🎲', label: 'Rolls with real results', desc: 'Every skill, save, and attack triggers a dice animation. Nat 20s glow gold. Fumbles flash red.' },
  { icon: '🛡️', label: 'Buffs that actually work', desc: 'Toggle Bless and your next roll includes the 1d4. Toggle Rage and your damage goes up. Automatically.' },
  { icon: '⚔️', label: 'Attack vs AC', desc: 'Enter the enemy\'s AC and every attack instantly says HIT or MISS in green or red.' },
  { icon: '🗺️', label: 'DM combat dashboard', desc: 'Real-time HP for every PC. Apply damage directly. Roll NPC attacks. No spreadsheets.' },
  { icon: '📖', label: 'Built for 2024 rules', desc: 'The new PHB exhaustion, conditions, concentration rules, and all 48 subclasses. Not retrofitted.' },
];

const STEPS = [
  { step: '1', title: 'Build your character', desc: 'Species, class, background, ability scores, spells — all guided, level by level.' },
  { step: '2', title: 'Play at the table', desc: 'Roll checks. Track HP. Manage spell slots. Everything auto-saves.' },
  { step: '3', title: 'Run a campaign', desc: 'DM creates a session, players join with a code. Real-time sync for the whole party.' },
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)', color: 'var(--t-1)', fontFamily: 'var(--ff-body)' }}>

      {/* Nav */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 48px', borderBottom: '1px solid var(--c-border)' }}>
        <span style={{ fontFamily: 'var(--ff-brand)', fontSize: 20, fontWeight: 700, color: 'var(--c-gold-l)', letterSpacing: '0.1em' }}>DNDKeep</span>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn-ghost btn-sm" onClick={() => navigate('/auth')}>Sign in</button>
          <button className="btn-primary btn-sm" onClick={() => navigate('/auth')}>Get started free</button>
        </div>
      </nav>

      {/* Hero */}
      <div style={{ textAlign: 'center', padding: '96px 48px 64px', maxWidth: 760, margin: '0 auto' }}>
        <div style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--c-gold-l)', background: 'var(--c-gold-bg)', border: '1px solid var(--c-gold-bdr)', padding: '4px 14px', borderRadius: 999, marginBottom: 28 }}>
          D&D 5e · 2024 rules · Free to start
        </div>
        <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.03em', marginBottom: 24, color: 'var(--t-1)' }}>
          The D&D companion that<br />
          <span style={{ color: 'var(--c-gold-l)' }}>actually automates things</span>
        </h1>
        <p style={{ fontSize: 18, color: 'var(--t-2)', lineHeight: 1.7, marginBottom: 40, maxWidth: 560, margin: '0 auto 40px' }}>
          Character sheets, dice rolls, conditions, buffs, initiative tracking — all wired together.
          D&D Beyond shows you the data. DNDKeep plays the game with you.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn-primary" style={{ fontSize: 16, padding: '12px 32px', minHeight: 48 }} onClick={() => navigate('/auth')}>
            Create a free account
          </button>
          <button className="btn-ghost" style={{ fontSize: 16, padding: '12px 32px', minHeight: 48 }} onClick={() => navigate('/auth')}>
            Sign in
          </button>
        </div>
        <p style={{ marginTop: 16, fontSize: 13, color: 'var(--t-3)' }}>Free forever for 1 character. No credit card.</p>
      </div>

      {/* What makes it different */}
      <div style={{ padding: '64px 48px', borderTop: '1px solid var(--c-border)', borderBottom: '1px solid var(--c-border)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t-3)', marginBottom: 12 }}>
              What D&D Beyond doesn't do
            </div>
            <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--t-1)', margin: 0 }}>
              Rules should apply themselves
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
            {GAPS.map(g => (
              <div key={g.label} style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-xl)', padding: '24px' }}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>{g.icon}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-1)', marginBottom: 8 }}>{g.label}</div>
                <div style={{ fontSize: 14, color: 'var(--t-2)', lineHeight: 1.6 }}>{g.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* How it works */}
      <div style={{ padding: '64px 48px' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--t-1)', margin: 0 }}>How it works</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {STEPS.map((s, i) => (
              <div key={s.step} style={{ display: 'flex', gap: 24, padding: '28px 0', borderBottom: i < STEPS.length - 1 ? '1px solid var(--c-border)' : 'none' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--c-gold-bg)', border: '1px solid var(--c-gold-bdr)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, color: 'var(--c-gold-l)', flexShrink: 0, marginTop: 2 }}>
                  {s.step}
                </div>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--t-1)', marginBottom: 6 }}>{s.title}</div>
                  <div style={{ fontSize: 15, color: 'var(--t-2)', lineHeight: 1.6 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={{ padding: '64px 48px', borderTop: '1px solid var(--c-border)', textAlign: 'center' }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--t-1)', marginBottom: 16 }}>Ready to play smarter?</h2>
        <p style={{ fontSize: 16, color: 'var(--t-2)', marginBottom: 32 }}>Free for one character. Upgrade for unlimited characters and full DM tools.</p>
        <button className="btn-primary" style={{ fontSize: 16, padding: '12px 40px', minHeight: 48 }} onClick={() => navigate('/auth')}>
          Create your first character
        </button>
      </div>

      {/* Footer */}
      <div style={{ padding: '24px 48px', borderTop: '1px solid var(--c-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <span style={{ fontFamily: 'var(--ff-brand)', fontSize: 14, fontWeight: 700, color: 'var(--c-gold-l)', letterSpacing: '0.1em' }}>DNDKeep</span>
        <span style={{ fontSize: 12, color: 'var(--t-3)' }}>Compatible with 5th Edition. Not affiliated with Wizards of the Coast.</span>
      </div>
    </div>
  );
}
