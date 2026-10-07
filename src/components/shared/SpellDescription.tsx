import type { SpellData } from '../../types';

/** v2.749 — One readable rules block across browse, prepare, and cast screens. */
export function SpellDescription({ spell }: { spell: SpellData }) {
  return (
    <div style={{ fontSize: 13, color: 'var(--t-2)', lineHeight: 1.7, overflowWrap: 'anywhere' }}>
      {spell.description.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => (
        <p key={index} style={{ margin: '0 0 12px', whiteSpace: 'pre-line' }}>{paragraph}</p>
      ))}
      {spell.higher_levels && (
        <p style={{ margin: '0 0 12px', padding: '10px 12px', borderLeft: '2px solid var(--c-gold)', background: 'var(--c-raised)', borderRadius: 6, whiteSpace: 'pre-line' }}>
          <strong style={{ color: 'var(--c-gold-l)' }}>At Higher Levels. </strong>{spell.higher_levels}
        </p>
      )}
      {spell.rules_source && (
        <p style={{ margin: '0 0 12px', fontSize: 11, color: 'var(--t-3)' }}>
          <a href={`https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf#page=${spell.rules_source.page}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--c-gold-l)' }}>
            SRD {spell.rules_source.version} · p. {spell.rules_source.page}
          </a>{' · '}<a href="/srd" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--c-gold-l)' }}>Attribution &amp; CC BY 4.0</a>
        </p>
      )}
    </div>
  );
}
