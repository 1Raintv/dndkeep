import { useState } from 'react';
import type { ActiveBuff } from '../../types';
import { COMMON_BUFFS } from '../../data/buffs';

interface ActiveBuffsPanelProps {
  buffs: ActiveBuff[];
  onAddBuff: (buff: ActiveBuff) => void;
  onRemoveBuff: (id: string) => void;
  onTickDown: () => void; // advance one round on all durations
}

function genId() { return `buff-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

export default function ActiveBuffsPanel({ buffs, onAddBuff, onRemoveBuff, onTickDown }: ActiveBuffsPanelProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customDuration, setCustomDuration] = useState('10');
  const [customEffect, setCustomEffect] = useState('');
  const [search, setSearch] = useState('');

  const filtered = COMMON_BUFFS.filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase())
  );

  function addPreset(preset: typeof COMMON_BUFFS[0]) {
    onAddBuff({
      id: genId(),
      name: preset.name,
      icon: preset.icon ?? '✦',
      color: preset.color ?? '#64748b',
      duration: 10, // 1 minute = 10 rounds default
      effects: preset.effects,
      acBonus: preset.acBonus,
      attackBonus: preset.attackBonus,
      damageBonus: preset.damageBonus,
      saveBonus: preset.saveBonus,
      speedBonus: preset.speedBonus,
      advantages: preset.advantages,
      disadvantages: preset.disadvantages,
      resistances: preset.resistances,
      immunities: preset.immunities,
    });
    setShowPicker(false);
    setSearch('');
  }

  function addCustom() {
    if (!customName.trim()) return;
    onAddBuff({
      id: genId(),
      name: customName.trim(),
      icon: '✦',
      color: '#64748b',
      duration: parseInt(customDuration) || 10,
      effects: customEffect ? [customEffect] : ['Custom effect'],
    });
    setCustomName(''); setCustomDuration('10'); setCustomEffect('');
    setShowPicker(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="section-header" style={{ margin: 0 }}>
          Active Buffs & Debuffs
          {buffs.length > 0 && (
            <span style={{ marginLeft: 8, fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0 }}>
              {buffs.length} active
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {buffs.length > 0 && (
            <button
              className="btn-ghost btn-sm"
              onClick={onTickDown}
              title="Advance 1 round (decrements duration timers)"
              style={{ fontSize: 11, color: 'var(--text-muted)' }}
            >
              ⏱ +1 Round
            </button>
          )}
          <button
            className="btn-gold btn-sm"
            onClick={() => setShowPicker(v => !v)}
          >
            {showPicker ? '✕ Close' : '+ Add Buff'}
          </button>
        </div>
      </div>

      {/* Active buff chips */}
      {buffs.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          {buffs.map(buff => (
            <BuffChip key={buff.id} buff={buff} onRemove={() => onRemoveBuff(buff.id)} />
          ))}
        </div>
      )}

      {buffs.length === 0 && !showPicker && (
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', fontStyle: 'italic', padding: 'var(--space-2) 0' }}>
          No active buffs. Click <strong>+ Add Buff</strong> to track Rage, Bless, Haste, and more.
        </div>
      )}

      {/* Buff picker panel */}
      {showPicker && (
        <div style={{
          border: '1px solid var(--border-gold)',
          borderRadius: 'var(--radius-xl)',
          background: 'var(--bg-sunken)',
          padding: 'var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
        }}>
          {/* Search */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search buffs (Rage, Bless, Haste…)"
            autoFocus
            style={{ fontSize: 'var(--text-sm)' }}
          />

          {/* Preset list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 300, overflowY: 'auto' }}>
            {filtered.map(preset => (
              <button
                key={preset.name}
                onClick={() => addPreset(preset)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                  padding: 'var(--space-2) var(--space-3)',
                  background: 'var(--bg-card)', border: `1px solid ${preset.color}30`,
                  borderRadius: 'var(--radius-md)', cursor: 'pointer', textAlign: 'left',
                  transition: 'all var(--transition-fast)',
                }}
              >
                <span style={{ fontSize: 20, flexShrink: 0 }}>{preset.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--text-sm)', color: preset.color }}>
                    {preset.name}
                  </div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {preset.effects[0]}
                  </div>
                </div>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-gold-bright)', flexShrink: 0 }}>+ Add</span>
              </button>
            ))}
          </div>

          {/* Custom buff */}
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 'var(--space-3)' }}>
            <div style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 'var(--space-2)' }}>
              Custom
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <input
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                placeholder="Buff name"
                style={{ flex: 2, minWidth: 120, fontSize: 'var(--text-sm)' }}
              />
              <input
                value={customDuration}
                onChange={e => setCustomDuration(e.target.value)}
                placeholder="Rounds"
                type="number"
                min={1}
                style={{ width: 72, fontSize: 'var(--text-sm)' }}
              />
              <input
                value={customEffect}
                onChange={e => setCustomEffect(e.target.value)}
                placeholder="Effect description"
                style={{ flex: 3, minWidth: 160, fontSize: 'var(--text-sm)' }}
              />
              <button
                className="btn-gold btn-sm"
                onClick={addCustom}
                disabled={!customName.trim()}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Individual buff chip ───────────────────────────────────────────────
function BuffChip({ buff, onRemove }: { buff: ActiveBuff; onRemove: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const isExpiring = buff.duration >= 0 && buff.duration <= 2;
  const isPermanent = buff.duration < 0;

  return (
    <div style={{
      border: `1px solid ${buff.color ?? '#64748b'}40`,
      borderRadius: 'var(--radius-lg)',
      background: `${buff.color ?? '#64748b'}08`,
      overflow: 'hidden',
      transition: 'all var(--transition-fast)',
      minWidth: 0,
    }}>
      <div
        onClick={() => setExpanded(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', cursor: 'pointer' }}
      >
        <span style={{ fontSize: 14 }}>{buff.icon}</span>
        <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--text-sm)', color: buff.color ?? 'var(--text-primary)', whiteSpace: 'nowrap' }}>
          {buff.name}
        </span>
        {!isPermanent && (
          <span style={{
            fontFamily: 'var(--font-body)', fontSize: 9, fontWeight: 700,
            color: isExpiring ? '#f87171' : 'var(--text-muted)',
            background: isExpiring ? 'rgba(248,113,113,0.15)' : 'var(--bg-raised)',
            border: `1px solid ${isExpiring ? 'rgba(248,113,113,0.4)' : 'var(--border-subtle)'}`,
            padding: '1px 4px', borderRadius: 999,
          }}>
            {buff.duration}r
          </span>
        )}
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          style={{ marginLeft: 2, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 2px', fontSize: 12, minHeight: 0 }}
        >
          ✕
        </button>
      </div>

      {expanded && (
        <div style={{ padding: '4px 10px 8px', borderTop: `1px solid ${buff.color ?? '#64748b'}20` }}>
          {buff.effects.map((e, i) => (
            <div key={i} style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              • {e}
            </div>
          ))}
          {buff.acBonus !== undefined && buff.acBonus !== 0 && (
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: '#60a5fa', marginTop: 2 }}>
              ➤ AC {buff.acBonus > 0 ? '+' : ''}{buff.acBonus} applied to sheet
            </div>
          )}
          {buff.damageBonus !== undefined && buff.damageBonus !== 0 && (
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: '#f87171', marginTop: 2 }}>
              ➤ Damage {buff.damageBonus > 0 ? '+' : ''}{buff.damageBonus} per hit
            </div>
          )}
        </div>
      )}
    </div>
  );
}
