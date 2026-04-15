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
  // Limits — when provided, enforce caps and gray out options at the limit
  cantripMax?: number;         // max cantrips for this class/level
  prepareMax?: number;         // max total prepared/known spells (non-cantrips)
  prepareCount?: number;       // current prepared/known count
  slotsPerLevel?: Record<number, number>; // how many slots at each spell level
  grantedSpellIds?: string[];  // auto-granted spells excluded from limit counts
  isKnownCaster?: boolean;     // true for Bard/Sorcerer/Warlock/Ranger — show "X known" not "X prepared"
}

const SCHOOL_COLORS: Record<string, string> = {
  Abjuration: '#60a5fa', Conjuration: '#a78bfa', Divination: '#34d399',
  Enchantment: '#f472b6', Evocation: '#fb923c', Illusion: '#c084fc',
  Necromancy: '#94a3b8', Transmutation: '#4ade80',
};

const LEVEL_LABELS = ['Cantrips', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

export default function SpellPickerDropdown({
  label, isCantrip, className, maxLevel, selected, onToggle,
  cantripMax, prepareMax, prepareCount, slotsPerLevel, grantedSpellIds = [], isKnownCaster = false,
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

  // Count selected spells by level for limit display
  const selectedByLevel = useMemo(() => {
    const counts: Record<number, number> = {};
    // Exclude auto-granted spells from limit counts
    SPELLS.filter(s => selected.includes(s.id) && !grantedSpellIds.includes(s.id)).forEach(s => {
      counts[s.level] = (counts[s.level] ?? 0) + 1;
    });
    return counts;
  }, [selected, grantedSpellIds]);

  // Is adding a spell at this level at the cap?
  function isAtLimit(level: number): boolean {
    if (level === 0 && cantripMax !== undefined) {
      return (selectedByLevel[0] ?? 0) >= cantripMax;
    }
    if (level > 0 && prepareMax !== undefined && prepareCount !== undefined) {
      return prepareCount >= prepareMax;
    }
    return false;
  }

  const levelOptions: number[] = isCantrip ? [0] : [0, ...Array.from({ length: maxLevel }, (_, i) => i + 1)];

  const allByLevel = useMemo(() => {
    const map: Record<number, typeof SPELLS> = {};
    SPELLS.forEach(s => {
      if (!s.classes.includes(className)) return;
      if (isCantrip ? s.level !== 0 : s.level > maxLevel) return;
      // Hide spells already owned (granted spells are auto-added so keep showing them)
      if (selected.includes(s.id) && !grantedSpellIds.includes(s.id)) return;
      if (!map[s.level]) map[s.level] = [];
      map[s.level].push(s);
    });
    return map;
  }, [className, isCantrip, maxLevel, selected, grantedSpellIds]);

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
            const atCap = isAtLimit(lvl) && selAtLvl === 0;
            const limitForLevel = lvl === 0
              ? cantripMax
              : (slotsPerLevel ? slotsPerLevel[lvl] : undefined);
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
                  opacity: atCap ? 0.5 : 1,
                }}
              >
                {LEVEL_LABELS[lvl]}
                {selAtLvl > 0 && (
                  <span style={{ marginLeft: 5, fontSize: 9, fontWeight: 800, color: 'var(--c-gold-l)', background: 'rgba(212,160,23,0.25)', padding: '0 5px', borderRadius: 999 }}>
                    {selAtLvl}
                    {limitForLevel !== undefined ? `/${limitForLevel}` : ''}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Spell count + limit indicator */}
      <div style={{ padding: '5px 14px 3px', fontSize: 10, color: 'var(--t-3)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>
          {spellsAtLevel.length} {activeLevel === 0 ? 'cantrip' : `${LEVEL_LABELS[activeLevel]}-level spell`}{spellsAtLevel.length !== 1 ? 's' : ''} available
          {search && ` matching "${search}"`}
        </span>
        {/* Limit badge */}
        {activeLevel === 0 && cantripMax !== undefined && (
          <span style={{
            fontWeight: 700, padding: '1px 7px', borderRadius: 999, fontSize: 10,
            background: isAtLimit(0) ? 'rgba(239,68,68,0.15)' : 'rgba(212,160,23,0.1)',
            border: `1px solid ${isAtLimit(0) ? 'rgba(239,68,68,0.4)' : 'rgba(212,160,23,0.3)'}`,
            color: isAtLimit(0) ? '#ef4444' : 'var(--c-gold-l)',
          }}>
            {selectedByLevel[0] ?? 0}/{cantripMax} cantrips
            {isAtLimit(0) ? ' — FULL' : ''}
          </span>
        )}
        {activeLevel > 0 && prepareMax !== undefined && prepareCount !== undefined && (
          <span style={{
            fontWeight: 700, padding: '1px 7px', borderRadius: 999, fontSize: 10,
            background: isAtLimit(activeLevel) ? 'rgba(239,68,68,0.15)' : 'rgba(212,160,23,0.1)',
            border: `1px solid ${isAtLimit(activeLevel) ? 'rgba(239,68,68,0.4)' : 'rgba(212,160,23,0.3)'}`,
            color: isAtLimit(activeLevel) ? '#ef4444' : 'var(--c-gold-l)',
          }}>
            {prepareCount}/{prepareMax} {isKnownCaster ? 'known' : 'prepared'}
            {isAtLimit(activeLevel) ? ' — FULL' : ''}
          </span>
        )}
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
          // Gray out: at limit AND this spell isn't already selected
          const blocked = !sel && isAtLimit(spell.level);
          return (
            <div key={spell.id} style={{
              borderBottom: '1px solid var(--c-border)',
              background: sel ? 'rgba(212,160,23,0.05)' : blocked ? 'rgba(0,0,0,0.15)' : 'transparent',
              opacity: blocked ? 0.5 : 1,
            }}>
              {/* Main row */}
              <div
                onClick={() => !blocked && setExpanded(isExp ? null : spell.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: blocked ? 'not-allowed' : 'pointer', minHeight: 48 }}
                onMouseEnter={e => { if (!sel && !blocked) (e.currentTarget as HTMLDivElement).style.background = 'var(--c-raised)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
              >
                {/* School color bar */}
                <div style={{ width: 3, height: 32, borderRadius: 2, background: schoolColor, opacity: blocked ? 0.3 : 0.8, flexShrink: 0 }} />

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: sel ? 700 : 500, fontSize: 14, color: sel ? 'var(--c-gold-l)' : blocked ? 'var(--t-3)' : 'var(--t-1)' }}>
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
                  onClick={e => { e.stopPropagation(); if (!blocked) onToggle(spell.id); }}
                  disabled={blocked}
                  title={blocked ? `${activeLevel === 0 ? 'Cantrip' : 'Spell'} limit reached — remove one first` : undefined}
                  style={{
                    fontSize: 12, fontWeight: 700, padding: '5px 14px', borderRadius: 8,
                    cursor: blocked ? 'not-allowed' : 'pointer',
                    minHeight: 0, flexShrink: 0, whiteSpace: 'nowrap',
                    border: sel
                      ? '1px solid rgba(248,113,113,0.35)'
                      : blocked
                        ? '1px solid var(--c-border)'
                        : '1px solid var(--c-gold-bdr)',
                    background: sel
                      ? 'rgba(248,113,113,0.08)'
                      : blocked
                        ? 'var(--c-surface)'
                        : 'var(--c-gold-bg)',
                    color: sel ? '#f87171' : blocked ? 'var(--t-3)' : 'var(--c-gold-l)',
                    transition: 'all 0.15s',
                  }}
                >
                  {sel ? '− Remove' : blocked ? '🔒 Full' : '+ Add'}
                </button>

                <span style={{ fontSize: 9, color: 'var(--t-3)', flexShrink: 0, transform: isExp ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▼</span>
              </div>

              {/* Expanded description */}
              {isExp && (
                <div style={{ padding: '0 14px 12px 27px', borderTop: '1px solid var(--c-border)', background: 'rgba(255,255,255,0.02)' }}>
                  <p style={{ fontSize: 13, color: 'var(--t-2)', lineHeight: 1.65, margin: '10px 0 8px' }}>
                    {spell.description}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
                    <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--t-3)', flexWrap: 'wrap', flex: 1 }}>
                      {spell.components && <span><strong style={{ color: 'var(--t-2)' }}>Components:</strong> {spell.components}</span>}
                      <span><strong style={{ color: 'var(--t-2)' }}>Duration:</strong> {spell.duration}</span>
                      <span><strong style={{ color: 'var(--t-2)' }}>Range:</strong> {spell.range}</span>
                    </div>
                    {/* Remove button — only shown when spell is already added */}
                    {sel && (
                      <button
                        onClick={e => { e.stopPropagation(); onToggle(spell.id); }}
                        style={{
                          fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 6,
                          cursor: 'pointer', flexShrink: 0,
                          border: '1px solid rgba(248,113,113,0.4)',
                          background: 'rgba(248,113,113,0.1)',
                          color: '#f87171',
                        }}
                      >
                        − Remove Spell
                      </button>
                    )}
                    {!sel && !blocked && (
                      <button
                        onClick={e => { e.stopPropagation(); onToggle(spell.id); }}
                        style={{
                          fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 6,
                          cursor: 'pointer', flexShrink: 0,
                          border: '1px solid var(--c-gold-bdr)',
                          background: 'var(--c-gold-bg)',
                          color: 'var(--c-gold-l)',
                        }}
                      >
                        + Add Spell
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>


    </div>
  ) : null;

  return (
    <div style={{ position: 'relative' }}>
      {/* Trigger button — compact gold CTA */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => open ? setOpen(false) : openDropdown()}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px',
          borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
          border: open ? '1px solid var(--c-gold-bdr)' : '1px solid rgba(212,160,23,0.35)',
          background: open ? 'var(--c-gold-bg)' : 'rgba(212,160,23,0.06)',
          color: 'var(--c-gold-l)',
          fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 12,
          transition: 'all 0.15s',
        }}
      >
        <span>{label}</span>
        <span style={{ fontSize: 9, opacity: 0.7, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▼</span>
      </button>

      {typeof document !== 'undefined' && createPortal(dropdownContent, document.body)}
    </div>
  );
}
