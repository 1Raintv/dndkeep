import { useState, useMemo } from 'react';
import { useMonsters } from '../../lib/hooks/useMonsters';
import { formatCR } from '../../lib/monsterUtils';
import { abilityModifier } from '../../lib/gameUtils';
import type { MonsterData } from '../../types';

const CR_ORDER = ['0', '1/8', '1/4', '1/2', ...Array.from({ length: 30 }, (_, i) => String(i + 1))];
const SIZES = ['All', 'Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];

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
  const { monsters } = useMonsters();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [sizeFilter, setSizeFilter] = useState('All');
  const [crMin, setCrMin] = useState('');
  const [crMax, setCrMax] = useState('');
  const [selected, setSelected] = useState<MonsterData | null>(null);

  const TYPES = useMemo(
    () => ['All', ...Array.from(new Set(monsters.map(m => m.type))).sort()],
    [monsters]
  );

  const filtered = useMemo(() => {
    return monsters
      .filter(m => {
        if (typeFilter !== 'All' && m.type !== typeFilter) return false;
        if (sizeFilter !== 'All' && m.size !== sizeFilter) return false;
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
  }, [monsters, search, typeFilter, sizeFilter, crMin, crMax]);

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
          <select value={sizeFilter} onChange={e => setSizeFilter(e.target.value)} style={{ width: 90, fontSize: 'var(--fs-sm)' }}>
            {SIZES.map(s => <option key={s}>{s}</option>)}
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
  const speedStr = [
    m.speed ? `${m.speed} ft.` : '',
    m.fly_speed ? `fly ${m.fly_speed} ft.` : '',
    m.swim_speed ? `swim ${m.swim_speed} ft.` : '',
    m.climb_speed ? `climb ${m.climb_speed} ft.` : '',
    m.burrow_speed ? `burrow ${m.burrow_speed} ft.` : '',
  ].filter(Boolean).join(', ');

  const savesStr = m.saving_throws
    ? Object.entries(m.saving_throws).map(([k,v]) => `${k} ${v >= 0 ? '+' : ''}${v}`).join(', ')
    : null;
  const skillsStr = m.skills
    ? Object.entries(m.skills).map(([k,v]) => `${k} ${v >= 0 ? '+' : ''}${v}`).join(', ')
    : null;
  const immunities = m.damage_immunities?.join(', ');
  const resistances = m.damage_resistances?.join(', ');
  const condImm = m.condition_immunities?.join(', ');
  const sensesStr = m.senses
    ? Object.entries(m.senses).filter(([k]) => k !== 'passive_perception')
        .map(([k, v]) => `${k.replace(/_/g,' ')} ${v}`).join(', ')
        + (m.senses.passive_perception ? `, Passive Perception ${m.senses.passive_perception}` : '')
    : null;

  return (
    <div style={{ fontFamily: 'var(--ff-body)', background: 'var(--c-card)', border: '1px solid var(--c-gold-bdr)', borderRadius: 12, overflow: 'hidden', maxHeight: '80vh', overflowY: 'auto' }}>
      {/* Header — red DnD stat block style */}
      <div style={{ background: 'rgba(139,0,0,0.15)', borderBottom: '2px solid var(--c-gold)', padding: '12px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--t-1)' }}>{m.name}</div>
            <div style={{ fontStyle: 'italic', fontSize: 12, color: 'var(--t-2)', marginTop: 2 }}>
              {m.size} {m.type}{m.subtype ? ` (${m.subtype})` : ''}{m.alignment ? `, ${m.alignment}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, fontSize: 12, color: 'var(--c-gold-l)', background: 'rgba(201,146,42,0.15)', border: '1px solid var(--c-gold-bdr)', borderRadius: 999, padding: '2px 10px' }}>CR {formatCR(m.cr)}</span>
            <span style={{ fontSize: 11, color: 'var(--t-3)', background: 'var(--c-raised)', border: '1px solid var(--c-border)', borderRadius: 999, padding: '2px 8px' }}>{xpLabel} XP</span>
            {onAddToCombat && (
              <button className="btn-gold btn-sm" onClick={() => onAddToCombat(m)} style={{ fontSize: 11 }}>+ Combat</button>
            )}
          </div>
        </div>
      </div>

      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Core defense row */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', paddingBottom: 10, borderBottom: '1px solid var(--c-border)' }}>
          <SBStat label="Armor Class" value={`${m.ac}${m.ac_note ? ` (${m.ac_note})` : ''}`}/>
          <SBStat label="Hit Points" value={`${m.hp} (${m.hp_formula})`}/>
          <SBStat label="Speed" value={speedStr || `${m.speed} ft.`}/>
        </div>

        {/* Ability scores */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4, textAlign: 'center', paddingBottom: 10, borderBottom: '1px solid var(--c-border)' }}>
          {(['STR','DEX','CON','INT','WIS','CHA'] as const).map((label, i) => {
            const score = [m.str, m.dex, m.con, m.int, m.wis, m.cha][i];
            const sv = m.saving_throws?.[label];
            return (
              <div key={label}>
                <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-3)', letterSpacing: '0.1em' }}>{label}</div>
                <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--t-1)', fontFamily: 'var(--ff-stat)' }}>{score}</div>
                <div style={{ fontSize: 10, color: 'var(--c-gold-l)' }}>{mod(score)}</div>
                {sv !== undefined && <div style={{ fontSize: 9, color: '#34d399' }}>Save {sv >= 0 ? '+' : ''}{sv}</div>}
              </div>
            );
          })}
        </div>

        {/* Secondary stats */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingBottom: 10, borderBottom: '1px solid var(--c-border)', fontSize: 12 }}>
          {skillsStr && <SBStat label="Skills" value={skillsStr}/>}
          {immunities && <SBStat label="Damage Immunities" value={immunities}/>}
          {resistances && <SBStat label="Resistances" value={resistances}/>}
          {condImm && <SBStat label="Condition Immunities" value={condImm}/>}
          {sensesStr && <SBStat label="Senses" value={sensesStr}/>}
          {m.languages && <SBStat label="Languages" value={m.languages}/>}
        </div>

        {/* Traits */}
        {m.traits && m.traits.length > 0 && (
          <div style={{ paddingBottom: 10, borderBottom: '1px solid var(--c-border)' }}>
            {m.traits.map(t => (
              <div key={t.name} style={{ marginBottom: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--t-1)' }}>{t.name}. </span>
                <span style={{ fontSize: 12, color: 'var(--t-2)', lineHeight: 1.6 }}>{t.desc}</span>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        {m.actions && m.actions.length > 0 ? (
          <div style={{ paddingBottom: 10, borderBottom: '1px solid var(--c-border)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#f87171', marginBottom: 8 }}>Actions</div>
            {m.actions.map(a => (
              <div key={a.name} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-1)' }}>{a.name}</span>
                  {a.attack_bonus !== undefined && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#fbbf24', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 999, padding: '1px 6px' }}>
                      +{a.attack_bonus} to hit
                    </span>
                  )}
                  {a.damage_dice && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#f87171', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 999, padding: '1px 6px' }}>
                      {a.damage_dice} {a.damage_type}
                    </span>
                  )}
                  {a.bonus_damage_dice && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#fb923c', background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.3)', borderRadius: 999, padding: '1px 6px' }}>
                      +{a.bonus_damage_dice} {a.bonus_damage_type}
                    </span>
                  )}
                  {a.dc_type && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa', background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.3)', borderRadius: 999, padding: '1px 6px' }}>
                      DC {a.dc_value} {a.dc_type}
                    </span>
                  )}
                  {a.usage && <span style={{ fontSize: 9, color: 'var(--t-3)', background: 'var(--c-raised)', border: '1px solid var(--c-border)', borderRadius: 999, padding: '1px 5px' }}>{a.usage}</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--t-3)', lineHeight: 1.5 }}>{a.desc}</div>
              </div>
            ))}
          </div>
        ) : (
          /* Fallback to legacy attack fields */
          <div style={{ paddingBottom: 10, borderBottom: '1px solid var(--c-border)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#f87171', marginBottom: 6 }}>Actions</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-1)' }}>{m.attack_name}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#fbbf24', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 999, padding: '1px 6px' }}>+{m.attack_bonus} to hit</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#f87171', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 999, padding: '1px 6px' }}>{m.attack_damage}</span>
            </div>
          </div>
        )}

        {/* Reactions */}
        {m.reactions && m.reactions.length > 0 && (
          <div style={{ paddingBottom: 10, borderBottom: '1px solid var(--c-border)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#34d399', marginBottom: 8 }}>Reactions</div>
            {m.reactions.map(r => (
              <div key={r.name} style={{ marginBottom: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--t-1)' }}>{r.name}. </span>
                <span style={{ fontSize: 12, color: 'var(--t-2)', lineHeight: 1.6 }}>{r.desc}</span>
              </div>
            ))}
          </div>
        )}

        {/* Legendary Actions */}
        {m.legendary_actions && m.legendary_actions.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#c084fc', marginBottom: 8 }}>
              Legendary Actions{m.legendary_resistance_count ? ` (${m.legendary_resistance_count}/Day)` : ''}
            </div>
            {m.legendary_actions.map(la => (
              <div key={la.name} style={{ marginBottom: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 12, color: '#c084fc' }}>{la.name}{la.cost && la.cost > 1 ? ` (Costs ${la.cost})` : ''}. </span>
                <span style={{ fontSize: 12, color: 'var(--t-2)', lineHeight: 1.6 }}>{la.desc}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SBStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ fontSize: 12 }}>
      <span style={{ fontWeight: 700, color: 'var(--t-1)' }}>{label}: </span>
      <span style={{ color: 'var(--t-2)' }}>{value}</span>
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
