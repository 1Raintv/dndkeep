// v2.96.0 — Phase D of the Combat Backbone
//
// DM-only header button that:
//  - If no active encounter: opens the Start Combat modal
//  - If active encounter:    shows "Combat active" badge + End Combat

import { useState } from 'react';
import { useCombat } from '../../context/CombatContext';
import { endEncounter } from '../../lib/combatEncounter';
import StartCombatModal from './StartCombatModal';

interface Props {
  campaignId: string;
}

export default function StartCombatButton({ campaignId }: Props) {
  const { encounter, refresh } = useCombat();
  const [open, setOpen] = useState(false);

  async function onEnd() {
    if (!encounter) return;
    if (!window.confirm('End combat?')) return;
    await endEncounter(encounter.id);
    await refresh();
  }

  if (encounter && encounter.status === 'active') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 800,
          letterSpacing: '0.1em', textTransform: 'uppercase',
          padding: '4px 10px', borderRadius: 4,
          background: 'rgba(234,179,8,0.15)', color: '#fde68a',
          border: '1px solid rgba(234,179,8,0.5)',
        }}>
          ⚔ Combat · Round {encounter.round_number}
        </span>
        <button
          onClick={onEnd}
          className="btn-danger btn-sm"
          style={{ fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700 }}
        >
          End Combat
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="btn-primary btn-sm"
        style={{ fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700 }}
      >
        ⚔ Start Combat
      </button>
      {open && (
        <StartCombatModal
          campaignId={campaignId}
          onClose={() => setOpen(false)}
          onStarted={() => { setOpen(false); refresh(); }}
        />
      )}
    </>
  );
}
