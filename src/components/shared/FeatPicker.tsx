import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FEATS } from '../../data/feats';

interface FeatPickerProps {
  selected: string | null;
  onSelect: (featName: string | null) => void;
  generalOnly?: boolean;
}

export default function FeatPicker({ selected, onSelect, generalOnly = true }: FeatPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Position the portal dropdown relative to the trigger button
  function openDropdown() {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropHeight = Math.min(440, spaceBelow - 12);
    setDropPos({
      top: rect.bottom + window.scrollY + 4,
      left: rect.left + window.scrollX,
      width: rect.width,
    });
    setOpen(true);
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        dropRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  // Focus search when opening
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50);
  }, [open]);

  // Reposition on scroll/resize
  useEffect(() => {
    if (!open) return;
    function reposition() {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      setDropPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX, width: rect.width });
    }
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => { window.removeEventListener('scroll', reposition, true); window.removeEventListener('resize', reposition); };
  }, [open]);

  const feats = (generalOnly ? FEATS.filter(f => f.category === 'general') : FEATS).filter(f => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return f.name.toLowerCase().includes(q) ||
      f.description.toLowerCase().includes(q) ||
      f.benefits?.some(b => b.toLowerCase().includes(q));
  });

  const selectedFeat = FEATS.find(f => f.name === selected);

  function pick(name: string) {
    onSelect(name === selected ? null : name);
    setOpen(false);
    setSearch('');
    setExpanded(null);
  }

  const dropdownContent = open && dropPos ? (
    <div
      ref={dropRef}
      style={{
        position: 'absolute',
        top: dropPos.top,
        left: dropPos.left,
        width: dropPos.width,
        background: 'var(--c-card)',
        border: '1px solid var(--c-border-m)',
        borderRadius: 12,
        boxShadow: '0 12px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05)',
        zIndex: 9999,
        overflow: 'hidden',
        maxHeight: 440,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Search */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--c-border)', flexShrink: 0 }}>
        <input
          ref={searchRef}
          value={search}
          onChange={e => { setSearch(e.target.value); setExpanded(null); }}
          placeholder="Search feats by name or effect…"
          style={{
            width: '100%', fontSize: 13, padding: '6px 10px',
            borderRadius: 7, border: '1px solid var(--c-border-m)',
            background: 'var(--c-raised)', color: 'var(--t-1)',
          }}
        />
      </div>

      {/* Count */}
      <div style={{ padding: '5px 12px 3px', fontSize: 10, color: 'var(--t-3)', flexShrink: 0 }}>
        {feats.length} feat{feats.length !== 1 ? 's' : ''} · click row to expand · click Select to choose
      </div>

      {/* Feat list */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {feats.length === 0 && (
          <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--t-3)', fontSize: 13 }}>
            No feats match "{search}"
          </div>
        )}
        {feats.map(feat => {
          const isSel = selected === feat.name;
          const isExp = expanded === feat.name;
          return (
            <div key={feat.name} style={{ borderBottom: '1px solid var(--c-border)', background: isSel ? 'rgba(212,160,23,0.06)' : 'transparent' }}>
              {/* Row */}
              <div
                onClick={() => setExpanded(isExp ? null : feat.name)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', cursor: 'pointer', minHeight: 44 }}
                onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLDivElement).style.background = 'var(--c-raised)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
              >
                {/* Radio dot */}
                <div
                  onClick={e => { e.stopPropagation(); pick(feat.name); }}
                  style={{
                    width: 14, height: 14, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
                    border: `2px solid ${isSel ? 'var(--c-gold)' : 'var(--c-border-m)'}`,
                    background: isSel ? 'var(--c-gold)' : 'transparent',
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: isSel ? 700 : 500, fontSize: 13, color: isSel ? 'var(--c-gold-l)' : 'var(--t-1)' }}>
                      {feat.name}
                    </span>
                    {/* ASI badge — e.g. "+1 STR" */}
                    {feat.asi && feat.asi.map((a, i) => (
                      <span key={i} style={{ fontSize: 9, fontWeight: 700, color: 'var(--c-green-l)', background: 'rgba(5,150,105,0.1)', border: '1px solid rgba(5,150,105,0.3)', padding: '1px 5px', borderRadius: 3, whiteSpace: 'nowrap' }}>
                        +{a.amount} {a.ability}
                      </span>
                    ))}
                    {feat.prerequisite && (
                      <span style={{ fontSize: 9, color: 'var(--c-amber-l)', background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)', padding: '1px 5px', borderRadius: 3, whiteSpace: 'nowrap' }}>
                        Req: {feat.prerequisite}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--t-3)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {feat.description}
                  </div>
                </div>
                <span style={{ fontSize: 10, color: 'var(--t-3)', flexShrink: 0, transform: isExp ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▼</span>
              </div>

              {/* Expanded */}
              {isExp && (
                <div style={{ padding: '0 14px 12px 38px', borderTop: '1px solid var(--c-border)' }}>

                  {/* Prerequisite banner */}
                  {feat.prerequisite && (
                    <div style={{ marginTop: 8, marginBottom: 6, padding: '4px 10px', borderRadius: 6, background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--c-amber-l)' }}>Prerequisite</span>
                      <span style={{ fontSize: 11, color: 'var(--c-amber-l)' }}>{feat.prerequisite}</span>
                    </div>
                  )}

                  {/* ASI section */}
                  {feat.asi && feat.asi.length > 0 && (
                    <div style={{ marginTop: feat.prerequisite ? 4 : 8, marginBottom: 8, padding: '8px 10px', borderRadius: 6, background: 'rgba(5,150,105,0.08)', border: '1px solid rgba(5,150,105,0.25)' }}>
                      <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--c-green-l)', marginBottom: 4 }}>
                        Ability Score Increase
                      </div>
                      {feat.asi.map((a, i) => (
                        <div key={i} style={{ fontSize: 12, color: 'var(--c-green-l)', fontWeight: 600 }}>
                          +{a.amount} {a.ability} (max 20)
                        </div>
                      ))}
                    </div>
                  )}

                  <p style={{ fontSize: 12, color: 'var(--t-2)', lineHeight: 1.65, margin: '8px 0 8px' }}>
                    {feat.description}
                  </p>
                  {feat.benefits && feat.benefits.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                      {feat.benefits.map((b, i) => (
                        <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                          <span style={{ color: 'var(--c-gold-l)', fontSize: 11, flexShrink: 0, marginTop: 1 }}>•</span>
                          <span style={{ fontSize: 12, color: 'var(--t-1)', lineHeight: 1.5 }}>{b}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => pick(feat.name)}
                    style={{
                      fontSize: 12, fontWeight: 700, padding: '6px 16px', borderRadius: 7,
                      cursor: 'pointer', minHeight: 0,
                      border: `1px solid ${isSel ? 'var(--c-border-m)' : 'var(--c-gold-bdr)'}`,
                      background: isSel ? 'var(--c-raised)' : 'rgba(212,160,23,0.12)',
                      color: isSel ? 'var(--t-3)' : 'var(--c-gold-l)',
                    }}
                  >
                    {isSel ? 'Deselect' : 'Select this feat'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      {selected && (
        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--c-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: 'var(--c-gold-l)', fontWeight: 600 }}>✓ {selected}</span>
          <button
            onClick={() => { onSelect(null); setOpen(false); }}
            style={{ fontSize: 11, color: 'var(--t-3)', background: 'none', border: '1px solid var(--c-border)', padding: '3px 10px', borderRadius: 6, cursor: 'pointer' }}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  ) : null;

  return (
    <div style={{ position: 'relative' }}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => open ? setOpen(false) : openDropdown()}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
          border: selectedFeat ? '2px solid var(--c-gold-bdr)' : '1px solid var(--c-border-m)',
          background: selectedFeat ? 'rgba(212,160,23,0.06)' : 'var(--c-card)',
          textAlign: 'left', transition: 'all 0.15s',
        }}
      >
        <div style={{ minWidth: 0 }}>
          {selectedFeat ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--c-gold-l)' }}>✓ {selectedFeat.name}</span>
                {selectedFeat.asi?.map((a, i) => (
                  <span key={i} style={{ fontSize: 9, fontWeight: 700, color: 'var(--c-green-l)', background: 'rgba(5,150,105,0.1)', border: '1px solid rgba(5,150,105,0.3)', padding: '1px 5px', borderRadius: 3 }}>
                    +{a.amount} {a.ability}
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--t-3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedFeat.description}
              </div>
            </>
          ) : (
            <span style={{ fontSize: 13, color: 'var(--t-3)' }}>Select a feat…</span>
          )}
        </div>
        <span style={{ fontSize: 11, color: 'var(--t-3)', marginLeft: 8, flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▼</span>
      </button>

      {/* Portal dropdown — escapes overflow:hidden parents */}
      {typeof document !== 'undefined' && createPortal(dropdownContent, document.body)}
    </div>
  );
}
