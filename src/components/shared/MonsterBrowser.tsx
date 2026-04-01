import { useState, useMemo } from 'react';
import { MONSTERS, formatCR } from '../../data/monsters';
import { abilityModifier } from '../../lib/gameUtils';
import type { MonsterData } from '../../types';

const TYPES = ['All', ...Array.from(new Set(MONSTERS.map(m => m.type))).sort()];
const CR_ORDER = ['0', '1/8', '1/4', '1/2', ...Array.from({ length: 30 }, (_, i) => String(i + 1))];

function crSort(a: MonsterData, b: MonsterData) {
  return CR_ORDER.indexOf(String(a.cr)) - CR_ORDER.indexOf(String(b.cr));
}

function mod(score: number) {
  const m = abilityModifier(score);
  return (m >= 0 ? '+' : '') + m;
}

interface MonsterBrowserProps {
  /** If provided, show an "Add to Combat" button */
  onAddToCombat?: (monster: MonsterData) => void;
  compact?: boolean;
}

export default function MonsterBrowser({ onAddToCombat, compact = false }: MonsterBrowserProps) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [crMin, setCrMin] = useState('');
  const [crMax, setCrMax] = useState('');
  const [selected, setSelected] = useState<MonsterData | null>(null);

  const filtered = useMemo(() => {
    return MONSTERS
      .filter(m => {
        if (typeFilter !== 'All' && m.type !== typeFilter) return false;
        if (search && !m.name.toLowerCase().includes(search.toLowerCase())) return false;
        if (crMin) {
          const minIdx = CR_ORDER.indexOf(crMin);
          if (CR_ORDER.indexOf(String(m.cr)) < minIdx) return false;
        }
        if (crMax) {
          const maxIdx = CR_ORDER.indexOf(crMax);
          if (CR_ORDER.indexOf(String(m.cr)) > maxIdx) return false;
        }
        return true;
      })
      .sort(crSort);
  }, [search, typeFilter, crMin, crMax]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: selected && !compact ? '1fr 1fr' : '1fr', gap: 'var(--sp-6)' }}>
      {/* Left: list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
        {/* Filters */}
        <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
          <input
            placeholder="Search monsters..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 2, minWidth: 140, fontSize: 'var(--fs-sm)' }}
          />
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ flex: 1, minWidth: 110, fontSize: 'var(--fs-sm)' }}>
            {TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
          <select value={crMin} onChange={e => setCrMin(e.target.value)} style={{ width: 80, fontSize: 'var(--fs-sm)' }}>
            <option value="">CR min</option>
            {CR_ORDER.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={crMax} onChange={e => setCrMax(e.target.value)} style={{ width: 80, fontSize: 'var(--fs-sm)' }}>
            <option value="">CR max</option>
            {CR_ORDER.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', letterSpacing: '0.06em' }}>
          {filtered.length} monster{filtered.length !== 1 ? 's' : ''}
        </div>

        {/* Monster list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: compact ? 320 : '60vh', overflowY: 'auto', paddingRight: 4 }}>
          {filtered.map(m => (
            <button
              key={m.id}
              onClick={() => setSelected(selected?.id === m.id ? null : m)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: 'var(--sp-2) var(--sp-3)',
                borderRadius: 'var(--r-sm)',
                border: selected?.id === m.id ? '1px solid var(--c-gold)' : '1px solid var(--c-border)',
                background: selected?.id === m.id ? 'rgba(201,146,42,0.1)' : '#080d14',
                cursor: 'pointer', transition: 'all var(--tr-fast)', textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: selected?.id === m.id ? 'var(--c-gold-l)' : 'var(--t-1)' }}>
                  {m.name}
                </span>
                <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
                  {m.size} {m.type}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', flexShrink: 0 }}>
                <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
                  CR {formatCR(m.cr)} · {m.hp}hp · AC {m.ac}
                </span>
                {onAddToCombat && (
                  <button
                    onClick={e => { e.stopPropagation(); onAddToCombat(m); }}
                    className="btn-gold btn-sm"
                    style={{ fontSize: 9, padding: '2px 7px' }}
                  >
                    + Combat
                  </button>
                )}
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: 'var(--sp-6)', textAlign: 'center', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', color: 'var(--t-2)' }}>
              No monsters match your filters.
            </div>
          )}
        </div>
      </div>

      {/* Right: stat block */}
      {selected && !compact && (
        <div key={selected.id} className="animate-fade-in">
          <StatBlock monster={selected} onAddToCombat={onAddToCombat} />
        </div>
      )}

      {/* Compact mode: inline stat block below */}
      {selected && compact && (
        <div key={selected.id} className="animate-fade-in" style={{ gridColumn: '1 / -1' }}>
          <StatBlock monster={selected} onAddToCombat={onAddToCombat} />
        </div>
      )}
    </div>
  );
}

function StatBlock({ monster: m, onAddToCombat }: { monster: MonsterData; onAddToCombat?: (m: MonsterData) => void }) {
  const xpLabel = m.xp >= 1000 ? `${(m.xp / 1000).toFixed(1)}k` : String(m.xp);

  return (
    <div className="card card-gold" style={{ fontFamily: 'var(--ff-body)' }}>
      {/* Header */}
      <div style={{ borderBottom: '2px solid var(--c-gold)', paddingBottom: 'var(--sp-3)', marginBottom: 'var(--sp-3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
          <div>
            <h3 style={{ marginBottom: 2 }}>{m.name}</h3>
            <p style={{ fontStyle: 'italic', fontSize: 'var(--fs-sm)', color: 'var(--t-2)' }}>
              {m.size} {m.type}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
            <span className="badge badge-gold">CR {formatCR(m.cr)}</span>
            <span className="badge badge-muted">{xpLabel} XP</span>
            {onAddToCombat && (
              <button className="btn-gold btn-sm" onClick={() => onAddToCombat(m)}>
                + Add to Combat
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Core stats */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-4)', marginBottom: 'var(--sp-3)', borderBottom: '1px solid var(--c-border)', paddingBottom: 'var(--sp-3)' }}>
        <Stat label="Armor Class" value={`${m.ac}${m.ac_note ? ` (${m.ac_note})` : ''}`} />
        <Stat label="Hit Points" value={`${m.hp} (${m.hp_formula})`} />
        <Stat label="Speed" value={`${m.speed} ft.`} />
      </div>

      {/* Ability scores */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 'var(--sp-2)', textAlign: 'center', marginBottom: 'var(--sp-3)', borderBottom: '1px solid var(--c-border)', paddingBottom: 'var(--sp-3)' }}>
        {(['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const).map((label, i) => {
          const score = [m.str, m.dex, m.con, m.int, m.wis, m.cha][i];
          return (
            <div key={label}>
              <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--t-2)', letterSpacing: '0.08em' }}>{label}</div>
              <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-md)', color: 'var(--t-1)' }}>{score}</div>
              <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--c-gold-l)' }}>{mod(score)}</div>
            </div>
          );
        })}
      </div>

      {/* Attack */}
      <div style={{ marginBottom: 'var(--sp-3)' }}>
        <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t-2)', marginBottom: 4 }}>
          Actions
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--t-1)' }}>
            {m.attack_name}
          </span>
          <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
            Melee Weapon Attack
          </span>
          <span className="badge badge-gold">+{m.attack_bonus} to hit</span>
          <span className="badge badge-crimson">{m.attack_damage} damage</span>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-xs)', color: 'var(--t-1)' }}>
        {label}{' '}
      </span>
      <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)' }}>{value}</span>
    </div>
  );
}
