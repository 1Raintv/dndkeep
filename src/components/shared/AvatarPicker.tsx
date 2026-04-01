import { useState } from 'react';

// Uses DiceBear adventurer style — free, no auth required
// https://www.dicebear.com/styles/adventurer/
const PRESET_SEEDS = [
  'warrior', 'mage', 'rogue', 'cleric',
  'ranger', 'bard', 'paladin', 'druid',
  'monk', 'barbarian', 'warlock', 'sorcerer',
];

function avatarUrl(seed: string) {
  return `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(seed)}&backgroundColor=0d0b09`;
}

interface AvatarPickerProps {
  currentSeed: string | null;
  characterName: string;
  onSelect: (url: string) => void;
  onClose: () => void;
}

export default function AvatarPicker({ currentSeed, characterName, onSelect, onClose }: AvatarPickerProps) {
  const [customSeed, setCustomSeed] = useState(characterName ?? '');
  const [preview, setPreview] = useState<string | null>(currentSeed);

  const allSeeds = [...PRESET_SEEDS, ...(customSeed && !PRESET_SEEDS.includes(customSeed.toLowerCase()) ? [customSeed.toLowerCase()] : [])];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <h3 style={{ marginBottom: 'var(--sp-2)' }}>Choose Portrait</h3>
        <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', marginBottom: 'var(--sp-4)' }}>
          Pick a preset or type any name to generate a unique portrait.
        </p>

        {/* Custom seed input */}
        <div style={{ marginBottom: 'var(--sp-4)', display: 'flex', gap: 'var(--sp-2)' }}>
          <input
            value={customSeed}
            onChange={e => setCustomSeed(e.target.value)}
            placeholder="Type anything for a custom portrait…"
            style={{ flex: 1, fontSize: 'var(--fs-sm)' }}
          />
          {customSeed && (
            <button
              className="btn-gold btn-sm"
              onClick={() => setPreview(customSeed.toLowerCase())}
            >
              Preview
            </button>
          )}
        </div>

        {/* Grid of preset portraits */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--sp-2)', marginBottom: 'var(--sp-4)' }}>
          {allSeeds.map(seed => (
            <button
              key={seed}
              onClick={() => setPreview(seed)}
              style={{
                border: preview === seed ? '2px solid var(--c-gold)' : '1px solid var(--c-border)',
                borderRadius: 'var(--r-md)',
                background: preview === seed ? 'rgba(201,146,42,0.1)' : '#080d14',
                padding: 'var(--sp-2)',
                cursor: 'pointer', transition: 'all var(--tr-fast)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}
            >
              <img
                src={avatarUrl(seed)}
                alt={seed}
                width={56}
                height={56}
                style={{ borderRadius: 'var(--r-sm)', display: 'block' }}
                loading="lazy"
              />
              <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, textTransform: 'capitalize', color: preview === seed ? 'var(--c-gold-l)' : 'var(--t-2)', letterSpacing: '0.06em' }}>
                {seed}
              </span>
            </button>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 'var(--sp-3)', justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-gold"
            disabled={!preview}
            onClick={() => { if (preview) { onSelect(avatarUrl(preview)); onClose(); } }}
          >
            Use This Portrait
          </button>
        </div>
      </div>
    </div>
  );
}

export { avatarUrl };
