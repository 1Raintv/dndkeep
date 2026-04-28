// v2.96.0 — Phase D of the Combat Backbone
// v2.355.0 — One-click start. The picker modal that used to open
// here is gone — DMs now place creatures via the NPC tab's "Place
// on Map" / "Add NPCs" flow, then click this button to roll
// initiative for everyone on the map. No intermediate dialog.
//
// User feedback: "When we click start combat it should just roll
// initiative for everyone as opposed to it opening a window — anyone
// on the battle map will then roll initiative."

import { useState } from 'react';
import { useCombat } from '../../context/CombatContext';
import { endEncounter } from '../../lib/combatEncounter';
import { startCombatFromMapTokens } from '../../lib/startCombatFromMap';

interface Props {
  campaignId: string;
}

export default function StartCombatButton({ campaignId }: Props) {
  const { encounter, refresh } = useCombat();
  const [starting, setStarting] = useState(false);
  // Inline error/info banner. Auto-clears after a few seconds so it
  // doesn't stick around when the DM moves on.
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  function flash(kind: 'error' | 'info', text: string) {
    setMessage({ kind, text });
    window.setTimeout(() => setMessage(null), 4000);
  }

  async function onStart() {
    if (starting) return;
    setStarting(true);
    try {
      const r = await startCombatFromMapTokens(campaignId);
      if (!r.ok) {
        if (r.reason === 'no_scene') {
          flash('error', 'Open the Battle Map tab first so a scene is loaded.');
        } else if (r.reason === 'no_tokens') {
          flash('error', 'No characters or creatures on the map. Place tokens via the NPC tab.');
        } else {
          flash('error', r.message ?? 'Failed to start combat.');
        }
        return;
      }
      flash('info', `Combat started — ${r.participantCount} in initiative.`);
      await refresh();
    } finally {
      setStarting(false);
    }
  }

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
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
      <button
        onClick={onStart}
        disabled={starting}
        className="btn-primary btn-sm"
        style={{ fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700 }}
        title="Start combat. Initiative auto-rolls for every character/creature on the active map."
      >
        {starting ? 'Rolling…' : '⚔ Start Combat'}
      </button>
      {message && (
        <span style={{
          fontFamily: 'var(--ff-body)', fontSize: 11,
          padding: '4px 10px', borderRadius: 4,
          background: message.kind === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(52,211,153,0.15)',
          color: message.kind === 'error' ? '#fca5a5' : '#6ee7b7',
          border: `1px solid ${message.kind === 'error' ? 'rgba(239,68,68,0.5)' : 'rgba(52,211,153,0.5)'}`,
          whiteSpace: 'nowrap',
        }}>
          {message.text}
        </span>
      )}
    </div>
  );
}
