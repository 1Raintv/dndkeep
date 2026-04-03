import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { SPELLS } from '../../data/spells';

interface SpellPickerDropdownProps {
  label: string;
  isCantrip: boolean;
  className: string;
  maxLevel: number;
  selected: string[];
  onToggle: (id: string) => void;
}

const SCHOOL_COLORS: Record<string, string> = {
  Abjuration: '#60a5fa', Conjuration: '#a78bfa', Divination: '#34d399',
  Enchantment: '#f472b6', Evocation: '#fb923c', Illusion: '#c084fc',
  Necromancy: '#94a3b8', Transmutation: '#4ade80',
};

const LEVEL_LABELS = ['Cantrips', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

export default function SpellPickerDropdown({
  label, isCantrip, className, maxLevel, selected, onToggle,
}: SpellPickerDropdownProps) {
  const [open, setOpen] = useState(false);
  const [activeLevel, setActiveLevel] = useState(0);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  function openDropdown() {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX, width: Math.max(rect.width, 480) });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (triggerRef.current?.contains(e.target as Node) || dropRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function reposition() {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      setDropPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX, width: Math.max(rect.width, 480) });
    }
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => { window.removeEventListener('scroll', reposition, true); window.removeEventListener('resize', reposition); };
  }, [open]);

  const levelOptions: number[] = isCantrip ? [0] : [0, ...Array.from({ length: maxLevel }, (_, i) => i + 1)];

  const allByLevel = useMemo(() => {
    const map: Record<number, typeof SPELLS> = {};
    SPELLS.forEach(s => {
      if (!s.classes.includes(className)) return;
      if (isCantrip ? s.level !== 0 : s.level > maxLevel) return;
      if (!map[s.level]) map[s.level] = [];
      map[s.level].push(s);
    });
    return map;
  }, [className, isCantrip, maxLevel]);

  const spellsAtLevel = useMemo(() => {
    const base = allByLevel[activeLevel] ?? [];
    if (!search.trim()) return base;
    const q = search.toLowerCase();
    return base.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.school.toLowerCase().includes(q) ||
      s.description?.toLowerCase().includes(q)
    );
  }, [allByLevel, activeLevel, search]);

  const selectedSpells = SPELLS.filter(s => selected.includes(s.id));

  const dropdownContent = open && dropPos ? (
    <div
      ref={dropRef}
      style={{
        position: 'absolute', top: dropPos.top, left: dropPos.left, width: dropPos.width,
        background: 'var(--c-card)', border: '1px solid var(--c-border-m)',
        borderRadius: 14, boxShadow: '0 12px 48px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.05)',
        zIndex: 9999, overflow: 'hidden', maxHeight: 500, display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Search bar */}
      <div style={{ padding: '12px 14px 8px', borderBottom: '1px solid var(--c-border)', flexShrink: 0 }}>
        <input
          ref={searchRef}
          value={search}
          onChange={e => { setSearch(e.target.value); setExpanded(null); }}
          placeholder={`Search ${isCantrip ? 'cantrips' : 'spells'} by name, school, or effect…`}
          style={{
            width: '100%', fontSize: 13, padding: '7px 12px',
            borderRadius: 8, border: '1px solid var(--c-border-m)',
            background: 'var(--c-raised)', color: 'var(--t-1)',
          }}
        />
      </div>

      {/* Level tabs */}
      {!isCantrip && (
        <div style={{ display: 'flex', gap: 5, padding: '8px 14px', borderBottom: '1px solid var(--c-border)', flexShrink: 0, flexWrap: 'wrap' }}>
          {levelOptions.map(lvl => {
            const selAtLvl = (allByLevel[lvl] ?? []).filter(s => selected.includes(s.id)).length;
            const isActive = activeLevel === lvl;
            return (
              <button
                key={lvl}
                onClick={() => { setActiveLevel(lvl); setSearch(''); setExpanded(null); }}
                style={{
                  fontSize: 12, fontWeight: 600, padding: '5px 13px', borderRadius: 999,
                  cursor: 'pointer', minHeight: 0,
                  border: isActive ? '2px solid var(--c-gold)' : '1px solid var(--c-border-m)',
                  background: isActive ? 'var(--c-gold-bg)' : 'var(--c-raised)',
                  color: isActive ? 'var(--c-gold-l)' : 'var(--t-2)',
                }}
              >
                {LEVEL_LABELS[lvl]}
                {selAtLvl > 0 && (
                  <span style={{ marginLeft: 5, fontSize: 9, fontWeight: 800, color: 'var(--c-gold-l)', background: 'rgba(212,160,23,0.25)', padding: '0 5px', borderRadius: 999 }}>
                    {selAtLvl}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Spell count */}
      <div style={{ padding: '5px 14px 3px', fontSize: 10, color: 'var(--t-3)', flexShrink: 0 }}>
        {spellsAtLevel.length} {activeLevel === 0 ? 'cantrip' : `${LEVEL_LABELS[activeLevel]}-level spell`}{spellsAtLevel.length !== 1 ? 's' : ''} available
        {search && ` matching "${search}"`}
      </div>

      {/* Spell list */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {spellsAtLevel.length === 0 ? (
          <div style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--t-3)', fontSize: 13 }}>
            No {isCantrip ? 'cantrips' : 'spells'} found
          </div>
        ) : spellsAtLevel.map(spell => {
          const sel = selected.includes(spell.id);
          const isExp = expanded === spell.id;
          const schoolColor = SCHOOL_COLORS[spell.school] ?? '#94a3b8';
          return (
            <div key={spell.id} style={{
              borderBottom: '1px solid var(--c-border)',
              background: sel ? 'rgba(212,160,23,0.05)' : 'transparent',
            }}>
              {/* Main row */}
              <div
                onClick={() => setExpanded(isExp ? null : spell.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', minHeight: 48 }}
                onMouseEnter={e => { if (!sel) (e.currentTarget as HTMLDivElement).style.background = 'var(--c-raised)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
              >
                {/* School color bar */}
                <div style={{ width: 3, height: 32, borderRadius: 2, background: schoolColor, opacity: 0.8, flexShrink: 0 }} />

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: sel ? 700 : 500, fontSize: 14, color: sel ? 'var(--c-gold-l)' : 'var(--t-1)' }}>
                      {spell.name}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: schoolColor, background: `${schoolColor}15`, border: `1px solid ${schoolColor}30`, padding: '1px 5px', borderRadius: 4 }}>
                      {spell.school}
                    </span>
                    {spell.concentration && (
                      <span title="Concentration" style={{ fontSize: 9, fontWeight: 700, color: 'var(--c-amber-l)', background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.3)', padding: '1px 5px', borderRadius: 4 }}>
                        Conc.
                      </span>
                    )}
                    {spell.ritual && (
                      <span title="Ritual" style={{ fontSize: 9, fontWeight: 700, color: '#a78bfa', background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.3)', padding: '1px 5px', borderRadius: 4 }}>
                        Ritual
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--t-3)', marginTop: 3 }}>
                    {spell.casting_time} · {spell.range} · {spell.duration}
                  </div>
                </div>

                {/* Add/Remove button */}
                <button
                  onClick={e => { e.stopPropagation(); onToggle(spell.id); }}
                  style={{
                    fontSize: 12, fontWeight: 700, padding: '5px 14px', borderRadius: 8,
                    cursor: 'pointer', minHeight: 0, flexShrink: 0, whiteSpace: 'nowrap',
                    border: sel ? '1px solid rgba(248,113,113,0.35)' : '1px solid var(--c-gold-bdr)',
                    background: sel ? 'rgba(248,113,113,0.08)' : 'var(--c-gold-bg)',
                    color: sel ? '#f87171' : 'var(--c-gold-l)',
                    transition: 'all 0.15s',
                  }}
                >
                  {sel ? '− Remove' : '+ Add'}
                </button>

                <span style={{ fontSize: 9, color: 'var(--t-3)', flexShrink: 0, transform: isExp ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▼</span>
              </div>

              {/* Expanded description */}
              {isExp && (
                <div style={{ padding: '0 14px 12px 27px', borderTop: '1px solid var(--c-border)', background: 'rgba(255,255,255,0.02)' }}>
                  <p style={{ fontSize: 13, color: 'var(--t-2)', lineHeight: 1.65, margin: '10px 0 6px' }}>
                    {spell.description}
                  </p>
                  <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--t-3)', flexWrap: 'wrap' }}>
                    {spell.components && <span><strong style={{ color: 'var(--t-2)' }}>Components:</strong> {spell.components}</span>}
                    <span><strong style={{ color: 'var(--t-2)' }}>Duration:</strong> {spell.duration}</span>
                    <span><strong style={{ color: 'var(--t-2)' }}>Range:</strong> {spell.range}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer — selected spells summary */}
      {selected.length > 0 && (
        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--c-border)', flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t-3)', marginBottom: 5 }}>
            Selected ({selected.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {selectedSpells.map(s => (
              <span key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '2px 6px 2px 8px', borderRadius: 999, background: 'var(--c-gold-bg)', border: '1px solid var(--c-gold-bdr)', color: 'var(--c-gold-l)' }}>
                {s.name}
                <button onClick={() => onToggle(s.id)} style={{ fontSize: 10, color: 'var(--c-gold-l)', opacity: 0.6, background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}>✕</button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  ) : null;

  return (
    <div style={{ position: 'relative' }}>
      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => open ? setOpen(false) : openDropdown()}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
          border: selected.length > 0 ? '2px solid var(--c-gold-bdr)' : '1px solid var(--c-border-m)',
          background: selected.length > 0 ? 'rgba(212,160,23,0.05)' : 'var(--c-card)',
          textAlign: 'left', transition: 'all 0.15s',
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          {selected.length > 0 ? (
            <div>
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--c-gold-l)' }}>
                {selected.length} {isCantrip ? 'cantrip' : 'spell'}{selected.length !== 1 ? 's' : ''} selected
              </span>
              <div style={{ fontSize: 11, color: 'var(--t-3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedSpells.map(s => s.name).join(', ')}
              </div>
            </div>
          ) : (
            <span style={{ fontSize: 13, color: 'var(--t-3)' }}>
              {label} — click to browse and add {isCantrip ? 'cantrips' : 'spells'}…
            </span>
          )}
        </div>
        <span style={{ fontSize: 11, color: 'var(--t-3)', marginLeft: 8, flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▼</span>
      </button>

      {typeof document !== 'undefined' && createPortal(dropdownContent, document.body)}
    </div>
  );
}
