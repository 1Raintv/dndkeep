// v2.144.0 — Phase N pt 2 of the Combat Backbone.
//
// Player-facing modal. When a downed character starts their turn at 0 HP
// AND the campaign/character automation resolves to 'prompt', the round
// advance hook creates a pending_death_saves row. This modal subscribes
// via realtime (filtered to character_id), shows a "Roll Death Save"
// button, and resolves via lib/deathSaves.resolvePendingDeathSave.
//
// Mounted once per CharacterSheet (scoped to that character_id). DM-side
// is not needed — DMs can see the current success/failure counters on
// the character in the party tracker, and the death_save_rolled event
// surfaces in the combat log regardless of path.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { resolvePendingDeathSave, type PendingDeathSaveRow } from '../../lib/deathSaves';

interface Props {
  /** The character id being viewed. Modal filters pending rows to this
   *  character_id only so two characters on the same screen don't
   *  accidentally cross-prompt. */
  characterId: string;
  campaignId: string;
}

export default function DeathSavePromptModal({ characterId, campaignId }: Props) {
  const [pending, setPending] = useState<PendingDeathSaveRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [rolled, setRolled] = useState<PendingDeathSaveRow | null>(null);

  async function load() {
    const { data } = await supabase
      .from('pending_death_saves')
      .select('*')
      .eq('character_id', characterId)
      .eq('state', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    setPending((data ?? null) as PendingDeathSaveRow | null);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`death-save:${characterId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'pending_death_saves',
        filter: `character_id=eq.${characterId}`,
      }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId, campaignId]);

  async function onRoll() {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const result = await resolvePendingDeathSave(pending.id);
      if (result) {
        // Show the result briefly before dismissing. The realtime echo
        // will clear `pending` since the row state flips to 'rolled'.
        setRolled(result);
        setTimeout(() => setRolled(null), 2800);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!pending && !rolled) return null;

  // Rolled state — brief result summary before auto-dismiss
  if (rolled) {
    const rColor =
      rolled.result === 'crit_success' ? '#34d399'
      : rolled.result === 'crit_failure' ? '#ef4444'
      : rolled.result === 'success' ? '#4ade80'
      : '#fbbf24';
    const rLabel =
      rolled.result === 'crit_success' ? 'Awake! +1 HP'
      : rolled.result === 'crit_failure' ? 'Critical Failure — 2 Failures'
      : rolled.result === 'success' ? 'Success'
      : 'Failure';
    return createPortal(
      <div style={{
        position: 'fixed', inset: 0, zIndex: 30000,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}>
        <div style={{
          background: 'var(--c-card)', borderRadius: 14,
          border: `2px solid ${rColor}`,
          maxWidth: 400, width: '100%',
          padding: 20, textAlign: 'center',
          boxShadow: `0 0 40px ${rColor}66`,
          animation: 'modalIn 0.2s ease',
        }}>
          <div style={{
            fontFamily: 'var(--ff-stat)', fontSize: 64, fontWeight: 900, color: rColor, lineHeight: 1,
          }}>{rolled.d20}</div>
          <div style={{
            fontFamily: 'var(--ff-body)', fontSize: 14, fontWeight: 800, color: rColor,
            marginTop: 6, letterSpacing: '0.08em', textTransform: 'uppercase' as const,
          }}>{rLabel}</div>
          <div style={{
            fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-3)', marginTop: 8,
          }}>
            Successes {rolled.successes_after ?? 0}/3 · Failures {rolled.failures_after ?? 0}/3
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  // Pending state — roll prompt
  const red = '#ef4444';
  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 30000,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: 'var(--c-card)', borderRadius: 14,
        border: `2px solid ${red}`,
        maxWidth: 400, width: '100%',
        display: 'flex', flexDirection: 'column',
        boxShadow: `0 0 40px ${red}66, 0 10px 40px rgba(0,0,0,0.8)`,
        animation: 'modalIn 0.2s ease',
      }}>
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--c-border)',
          background: `${red}15`,
        }}>
          <div style={{
            fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 800,
            letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: red,
          }}>
            Death Save
          </div>
          <div style={{
            fontFamily: 'var(--ff-body)', fontSize: 16, fontWeight: 800,
            color: 'var(--t-1)', marginTop: 2,
          }}>
            Dying — roll to stabilize
          </div>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{
            fontFamily: 'var(--ff-body)', fontSize: 13, color: 'var(--t-2)', lineHeight: 1.5,
          }}>
            You're at 0 HP. Roll 1d20: <strong style={{ color: 'var(--t-1)' }}>10+</strong> is a success, nat 20 wakes you with 1 HP, nat 1 counts as two failures.
          </div>
          <div style={{
            fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-3)', lineHeight: 1.4,
          }}>
            3 successes → stable. 3 failures → death.
          </div>
        </div>
        <div style={{
          padding: '12px 20px', borderTop: '1px solid var(--c-border)',
          display: 'flex', gap: 8, justifyContent: 'flex-end',
        }}>
          <button
            onClick={onRoll}
            disabled={busy}
            style={{
              fontSize: 13, fontWeight: 700, padding: '9px 18px',
              background: red, color: '#fff',
              border: `1px solid ${red}`, borderRadius: 7,
              cursor: busy ? 'wait' : 'pointer',
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? 'Rolling…' : 'Roll d20'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
