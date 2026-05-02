// v2.96.0 — Phase D of the Combat Backbone
// v2.355.0 — One-click start. The picker modal that used to open
// here is gone — DMs now place creatures via the NPC tab's "Place
// on Map" / "Add NPCs" flow, then click this button to roll
// initiative for everyone on the map. No intermediate dialog.
//
// User feedback: "When we click start combat it should just roll
// initiative for everyone as opposed to it opening a window — anyone
// on the battle map will then roll initiative."

import { useState, useMemo } from 'react';
import { useCombat } from '../../context/CombatContext';
import { endEncounter } from '../../lib/combatEncounter';
import { startCombatFromMapTokens } from '../../lib/startCombatFromMap';
// v2.391.0 — Subscribe to the store so the button can show what
// scene combat will source from BEFORE the DM clicks. Fixes a class
// of "I had two ARDs but only one rolled initiative" confusion: the
// fast path in startCombatFromMapTokens reads from currentSceneId,
// which can be a different scene than the one the DM thinks they
// staged. The preview now surfaces this up front.
import { useBattleMapStore } from '../../lib/stores/battleMapStore';

interface Props {
  campaignId: string;
  // v2.385.0 — Fired after a successful start so the parent can
  // switch the user to the battle map tab. The previous flow showed
  // a "Open the Battle Map tab first so a scene is loaded." nag when
  // the store was empty; v2.385 added a DB fallback in
  // startCombatFromMapTokens so the click just works, and this
  // callback brings the DM where they wanted to be anyway.
  onStarted?: () => void;
}

export default function StartCombatButton({ campaignId, onStarted }: Props) {
  const { encounter, refresh } = useCombat();
  const [starting, setStarting] = useState(false);
  // Inline error/info banner. Auto-clears after a few seconds so it
  // doesn't stick around when the DM moves on.
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  // v2.391.0 — Live preview of what Start Combat will seed from. The
  // button title now reads "⚔ Start Combat · 4 tokens ready" when
  // the DM has the map open with 4 tokens; "no tokens visible" when
  // empty; bare label otherwise (cold path — fallback fetches the
  // first scene). Only updates while the store is primed; cold path
  // would need a DB roundtrip on every render which isn't worth it.
  const storeTokens = useBattleMapStore(s => s.tokens);
  const storeSceneId = useBattleMapStore(s => s.currentSceneId);
  const previewCount = useMemo(() => {
    if (!storeSceneId) return null;
    let n = 0;
    for (const t of Object.values(storeTokens)) {
      if (t.sceneId === storeSceneId) n++;
    }
    return n;
  }, [storeTokens, storeSceneId]);

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
          // v2.385.0 — With the DB fallback in place, no_scene now
          // means the campaign genuinely has no scenes yet. Tell the
          // DM to make one rather than asking them to switch tabs.
          flash('error', 'No scene exists yet. Create one in the Battle Map tab.');
        } else if (r.reason === 'no_tokens') {
          flash('error', 'No characters or creatures on the map. Place tokens via the NPC tab.');
        } else {
          flash('error', r.message ?? 'Failed to start combat.');
        }
        return;
      }
      flash('info', `Combat started — ${r.participantCount} in initiative.`);
      await refresh();
      // v2.385.0 — Bring the DM to the map after a successful start
      // so they're staring at the encounter, not the dashboard tab
      // they happened to click from.
      onStarted?.();
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
        title={
          starting
            ? 'Rolling initiative…'
            : previewCount === null
              ? 'Start combat. Initiative auto-rolls for every character/creature on the active map.'
              : previewCount === 0
                ? 'No tokens visible on the active scene. Place tokens via the NPC tab first.'
                : `Start combat. Initiative will roll for ${previewCount} token${previewCount === 1 ? '' : 's'} on the currently-viewed scene.`
        }
      >
        {starting
          ? 'Rolling…'
          : previewCount !== null && previewCount > 0
            ? `⚔ Start Combat · ${previewCount}`
            : '⚔ Start Combat'}
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
