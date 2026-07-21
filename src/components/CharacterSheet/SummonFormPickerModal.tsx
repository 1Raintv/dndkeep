// v2.615.0 — Phase B1 of the playable-forms arc
// (docs/PLAYABLE_FORMS_AND_MINIONS.md): form picker for
// creature-backed summons (Find Familiar's 2024 RAW form list). Only
// the spell's own allowed forms are ever listed — same
// only-show-what-you-can-use rule as the Wild Shape picker (v2.612).
// On pick, the caller places the summon with a real monster statblock
// behind it (definition_type 'srd_monster'), owned by the caster.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';

interface FormRow { id: string; name: string; hp: number | null; size: string | null; speed: number | null; fly_speed: number | null; swim_speed: number | null }

interface Props {
  title: string;
  formIds: string[];
  onPick: (monsterId: string) => void;
  onClose: () => void;
}

export default function SummonFormPickerModal({ title, formIds, onPick, onClose }: Props) {
  const [rows, setRows] = useState<FormRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('monsters')
        .select('id, name, hp, size, speed, fly_speed, swim_speed')
        .in('id', formIds);
      if (!cancelled) {
        const list = ((data as FormRow[] | null) ?? [])
          .sort((a, b) => a.name.localeCompare(b.name));
        setRows(list);
      }
    })();
    return () => { cancelled = true; };
  }, [formIds]);

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 340, maxHeight: '70vh', overflowY: 'auto',
          background: 'var(--bg-2, #1a1d24)', borderRadius: 12,
          border: '1px solid rgba(103,232,249,0.35)', padding: 14,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 800, fontSize: 13, color: '#67e8f9', flex: 1 }}>
            {title}
          </span>
          <button
            onClick={onClose}
            style={{
              fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 12,
              padding: '2px 8px', borderRadius: 6, cursor: 'pointer', minHeight: 0,
              background: 'rgba(148,163,184,0.08)', border: '1px solid rgba(148,163,184,0.3)', color: 'var(--t-2)',
            }}
          >
            ×
          </button>
        </div>
        {rows === null && (
          <span style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-3)' }}>Loading forms…</span>
        )}
        {rows !== null && rows.length === 0 && (
          <span style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-3)' }}>No forms found.</span>
        )}
        {(rows ?? []).map(r => {
          const speeds: string[] = [];
          if (r.speed) speeds.push(`${r.speed} ft.`);
          if (r.fly_speed) speeds.push(`fly ${r.fly_speed}`);
          if (r.swim_speed) speeds.push(`swim ${r.swim_speed}`);
          return (
            <button
              key={r.id}
              onClick={() => { onPick(r.id); onClose(); }}
              style={{
                display: 'flex', alignItems: 'baseline', gap: 8, textAlign: 'left',
                padding: '6px 10px', borderRadius: 8, cursor: 'pointer', minHeight: 0,
                background: 'rgba(103,232,249,0.05)', border: '1px solid rgba(103,232,249,0.25)',
              }}
            >
              <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 12, color: 'var(--t-1)', flex: 1 }}>
                {r.name}
              </span>
              <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-3)', flexShrink: 0 }}>
                {r.size ?? ''} · {r.hp ?? '?'} HP{speeds.length ? ` · ${speeds.join(' · ')}` : ''}
              </span>
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
}
