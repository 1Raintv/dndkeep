import { useState } from 'react';

// DiceBear adventurer style — free, no auth needed
// Seeds chosen to generate diverse, recognizable fantasy archetypes
const PRESETS = [
  { seed: 'warrior',    label: 'Warrior' },
  { seed: 'mage',       label: 'Mage' },
  { seed: 'rogue',      label: 'Rogue' },
  { seed: 'cleric',     label: 'Cleric' },
  { seed: 'ranger',     label: 'Ranger' },
  { seed: 'bard',       label: 'Bard' },
  { seed: 'paladin',    label: 'Paladin' },
  { seed: 'druid',      label: 'Druid' },
  { seed: 'monk',       label: 'Monk' },
  { seed: 'barbarian',  label: 'Barbarian' },
  { seed: 'warlock',    label: 'Warlock' },
  { seed: 'sorcerer',   label: 'Sorcerer' },
  { seed: 'artificer',  label: 'Artificer' },
  { seed: 'shadowblade',label: 'Shadow' },
  { seed: 'archmage',   label: 'Archmage' },
  { seed: 'champion',   label: 'Champion' },
  { seed: 'hexblade',   label: 'Hexblade' },
  { seed: 'warden',     label: 'Warden' },
  { seed: 'oracle',     label: 'Oracle' },
  { seed: 'shaman',     label: 'Shaman' },
  { seed: 'assassin',   label: 'Assassin' },
  { seed: 'crusader',   label: 'Crusader' },
  { seed: 'trickster',  label: 'Trickster' },
  { seed: 'stormcaller',label: 'Storm' },
];

export function avatarUrl(seed: string) {
  return `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(seed)}&backgroundColor=0d1219`;
}

interface AvatarPickerProps {
  currentSeed: string | null;
  characterName: string;
  onSelect: (url: string) => void;
  onClose: () => void;
}

export default function AvatarPicker({ currentSeed, characterName, onSelect, onClose }: AvatarPickerProps) {
  const [selected, setSelected] = useState<string>(currentSeed ?? characterName.toLowerCase());
  const [customSeed, setCustomSeed] = useState('');
  const [customPreview, setCustomPreview] = useState<string | null>(null);

  const previewSeed = customPreview ?? selected;

  function applyCustom() {
    const seed = customSeed.trim().toLowerCase();
    if (!seed) return;
    setCustomPreview(seed);
    setSelected(seed);
  }

  function handleUse() {
    onSelect(avatarUrl(previewSeed));
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 540, width: '100%', padding: 0, overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--c-border)', background: 'linear-gradient(135deg, var(--c-surface), var(--c-card))' }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--t-1)', marginBottom: 4 }}>Choose Portrait</div>
          <div style={{ fontSize: 12, color: 'var(--t-3)' }}>Pick a preset archetype or enter any name for a unique portrait.</div>
        </div>

        <div style={{ display: 'flex', height: 380 }}>
          {/* Left: portrait grid */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {PRESETS.map(({ seed, label }) => {
                const isSel = selected === seed && !customPreview;
                return (
                  <button
                    key={seed}
                    onClick={() => { setSelected(seed); setCustomPreview(null); setCustomSeed(''); }}
                    style={{
                      border: isSel ? '2px solid var(--c-gold)' : '1px solid var(--c-border)',
                      borderRadius: 10, background: isSel ? 'var(--c-gold-bg)' : 'var(--c-raised)',
                      padding: '8px 4px 6px', cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--c-border-m)'; }}
                    onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--c-border)'; }}
                  >
                    <img
                      src={avatarUrl(seed)}
                      alt={label}
                      width={52}
                      height={52}
                      style={{ borderRadius: 8, display: 'block' }}
                      loading="lazy"
                    />
                    <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: isSel ? 'var(--c-gold-l)' : 'var(--t-3)' }}>
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: preview + custom */}
          <div style={{ width: 160, borderLeft: '1px solid var(--c-border)', padding: '20px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, flexShrink: 0 }}>
            {/* Large preview */}
            <div>
              <img
                src={avatarUrl(previewSeed)}
                alt="preview"
                width={100}
                height={100}
                style={{ borderRadius: 14, border: '2px solid var(--c-gold-bdr)', display: 'block' }}
              />
              <div style={{ fontSize: 10, color: 'var(--t-3)', textAlign: 'center', marginTop: 6, textTransform: 'capitalize' }}>
                {previewSeed}
              </div>
            </div>

            {/* Custom seed */}
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-3)' }}>Custom</div>
              <input
                value={customSeed}
                onChange={e => setCustomSeed(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyCustom()}
                placeholder="Any name or word…"
                style={{ fontSize: 11, padding: '5px 8px', borderRadius: 6, width: '100%' }}
              />
              <button
                onClick={applyCustom}
                disabled={!customSeed.trim()}
                style={{ fontSize: 11, fontWeight: 700, padding: '5px 8px', borderRadius: 6, cursor: customSeed.trim() ? 'pointer' : 'not-allowed', minHeight: 0, background: 'var(--c-raised)', border: '1px solid var(--c-border-m)', color: 'var(--t-2)' }}
              >
                Preview
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--c-border)', display: 'flex', gap: 10, justifyContent: 'flex-end', background: 'var(--c-surface)' }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-gold" onClick={handleUse}>
            Use This Portrait
          </button>
        </div>
      </div>
    </div>
  );
}
