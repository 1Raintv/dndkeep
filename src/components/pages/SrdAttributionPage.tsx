import { useNavigate } from 'react-router-dom';

const SRD_CLASSES = [
  'Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk',
  'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard',
];

const SRD_SPECIES = [
  'Dragonborn', 'Dwarf', 'Elf', 'Gnome', 'Half-Elf', 'Half-Orc',
  'Halfling', 'Human', 'Tiefling',
];

export default function SrdAttributionPage() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)', color: 'var(--t-1)', fontFamily: 'var(--ff-body)' }}>

      {/* Nav */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 48px', borderBottom: '1px solid var(--c-border)', background: 'var(--c-bg)', position: 'sticky', top: 0, zIndex: 50 }}>
        <span style={{ fontFamily: 'var(--ff-brand)', fontSize: 20, fontWeight: 700, color: 'var(--c-gold-l)', letterSpacing: '0.1em', cursor: 'pointer' }} onClick={() => navigate('/')}>
          DNDKEEP
        </span>
        <button className="btn-ghost btn-sm" onClick={() => navigate('/')} style={{ color: 'var(--t-3)' }}>
          ← Back to home
        </button>
      </nav>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '64px 48px' }}>

        {/* Header */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--t-3)', marginBottom: 16 }}>
            Legal · Open Gaming License
          </div>
          <h1 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 16, color: 'var(--t-1)' }}>
            SRD Attribution
          </h1>
          <p style={{ fontSize: 16, color: 'var(--t-2)', lineHeight: 1.75, maxWidth: 600 }}>
            DNDKeep uses game content from the Systems Reference Document (SRD) 5.1, published by Wizards of the Coast under the Creative Commons Attribution 4.0 International License.
          </p>
        </div>

        {/* Primary attribution */}
        <div style={{ background: 'var(--c-card)', border: '1px solid var(--c-border-m)', borderRadius: 'var(--r-xl)', padding: '32px', marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--t-1)', marginBottom: 16 }}>Primary Attribution</h2>
          <div style={{ fontSize: 15, color: 'var(--t-2)', lineHeight: 1.8 }}>
            <p style={{ marginBottom: 12 }}>
              This work includes material from the Systems Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC, available at{' '}
              <a href="https://dnd.wizards.com/resources/systems-reference-document" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--c-gold-l)' }}>
                https://dnd.wizards.com/resources/systems-reference-document
              </a>
              . The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at{' '}
              <a href="https://creativecommons.org/licenses/by/4.0/legalcode" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--c-gold-l)' }}>
                https://creativecommons.org/licenses/by/4.0/legalcode
              </a>.
            </p>
            <p style={{ marginBottom: 0 }}>
              DNDKeep is not affiliated with, endorsed by, or officially connected to Wizards of the Coast LLC or its parent company Hasbro, Inc.
            </p>
          </div>
        </div>

        {/* What content is from the SRD */}
        <div style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-xl)', padding: '32px', marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--t-1)', marginBottom: 16 }}>Content Derived from the SRD</h2>
          <p style={{ fontSize: 14, color: 'var(--t-2)', lineHeight: 1.7, marginBottom: 20 }}>
            The following content in DNDKeep is derived from or based on the SRD 5.1:
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-3)', marginBottom: 10 }}>Classes</div>
              {SRD_CLASSES.map(c => (
                <div key={c} style={{ fontSize: 14, color: 'var(--t-2)', lineHeight: 1.8 }}>{c}</div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-3)', marginBottom: 10 }}>Species</div>
              {SRD_SPECIES.map(s => (
                <div key={s} style={{ fontSize: 14, color: 'var(--t-2)', lineHeight: 1.8 }}>{s}</div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-3)', marginBottom: 10 }}>Other Content</div>
              {['Spells (282 from SRD)', 'Monsters (SRD entries)', 'Conditions', 'Equipment & armor rules', 'Ability score rules', 'Combat rules', 'Spell slot tables', 'Proficiency bonus', 'Saving throw rules'].map(s => (
                <div key={s} style={{ fontSize: 14, color: 'var(--t-2)', lineHeight: 1.8 }}>{s}</div>
              ))}
            </div>
          </div>
        </div>

        {/* Modifications */}
        <div style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-xl)', padding: '32px', marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--t-1)', marginBottom: 16 }}>Modifications</h2>
          <p style={{ fontSize: 14, color: 'var(--t-2)', lineHeight: 1.75 }}>
            DNDKeep has adapted, reorganized, and presented SRD content in a digital interface format. Spell descriptions and monster stat blocks have been reformatted for screen display. Some content has been supplemented with additional game content not from the SRD (such as non-SRD subclasses, species, and backgrounds), which is either original content or sourced and noted separately.
          </p>
          <p style={{ fontSize: 14, color: 'var(--t-2)', lineHeight: 1.75, marginTop: 12 }}>
            Non-SRD additions include: Psion class, Ardling/Goliath/Tabaxi/Aasimar species, and certain subclasses and backgrounds. These additions are original content created for DNDKeep and are not covered by the SRD license.
          </p>
        </div>

        {/* License box */}
        <div style={{ background: 'rgba(212,160,23,0.04)', border: '1px solid var(--c-gold-bdr)', borderRadius: 'var(--r-xl)', padding: '28px', marginBottom: 48 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--c-gold-l)', marginBottom: 12 }}>Creative Commons Attribution 4.0 Summary</h2>
          <p style={{ fontSize: 14, color: 'var(--t-2)', lineHeight: 1.75, marginBottom: 12 }}>
            The CC-BY-4.0 license allows anyone to share and adapt the material for any purpose, including commercially, provided they give appropriate credit, provide a link to the license, and indicate if changes were made.
          </p>
          <p style={{ fontSize: 14, color: 'var(--t-2)', lineHeight: 1.75 }}>
            Full license text:{' '}
            <a href="https://creativecommons.org/licenses/by/4.0/legalcode" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--c-gold-l)' }}>
              creativecommons.org/licenses/by/4.0/legalcode
            </a>
          </p>
        </div>

        {/* Trademarks notice */}
        <div style={{ fontSize: 13, color: 'var(--t-3)', lineHeight: 1.7, borderTop: '1px solid var(--c-border)', paddingTop: 24 }}>
          <p>
            "Dungeons & Dragons," "D&D," "Wizards of the Coast," and related marks are trademarks of Wizards of the Coast LLC. DNDKeep is an independent product and is not affiliated with, endorsed by, or sponsored by Wizards of the Coast.
          </p>
          <p style={{ marginTop: 8 }}>
            Certain monsters and content that appear in the SRD may be associated with Wizards of the Coast trade dress and product identity not covered by the CC-BY-4.0 license; such content is used solely in accordance with the SRD 5.1 as published.
          </p>
        </div>

      </div>
    </div>
  );
}
