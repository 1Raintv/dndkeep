import { useState, useEffect, useMemo } from 'react';
import * as rosterApi from '../../lib/api/npcRoster';
import * as homebrewApi from '../../lib/api/homebrewMonsters';
import type { RosterEntry } from '../../lib/api/npcRoster';
import { useToast } from '../shared/Toast';

/**
 * v2.242.0 — Phase Q.1 pt 30: Roster picker for bulk NPC token add.
 *
 * Lists the DM's `dm_npc_roster` entries and lets them stamp N tokens
 * per entry onto the current scene in one go. Each row has its own
 * count input (default 0); confirm is disabled until at least one
 * entry has count > 0.
 *
 * Empty state: if the roster has no rows, surfaces a hint pointing at
 * the v1 BattleMap (where the roster builder UI currently lives — a
 * future ship can move it into v2). The hint is a soft fallback;
 * existing DMs with populated rosters never see it.
 *
 * The modal is a controlled standalone component — opening/closing
 * state and confirmation handling lives in the parent (BattleMapV2).
 * On confirm, the parent receives an array of {entry, count} pairs
 * and does the actual NPC + token bulk-create.
 */

export interface RosterSelection {
  entry: RosterEntry;
  count: number;
}

interface Props {
  ownerId: string;
  onClose: () => void;
  onConfirm: (selections: RosterSelection[]) => void;
}

export default function NpcRosterPickerModal({ ownerId, onClose, onConfirm }: Props) {
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // v2.272.0 — track per-row "saving as homebrew" state so the button
  // can show a spinner / disabled state without blocking other rows.
  // Map of roster entry id → boolean (true while the create is in
  // flight). We don't track per-row "just saved" here; the toast
  // handles success/failure feedback.
  const [savingHomebrew, setSavingHomebrew] = useState<Record<string, boolean>>({});
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    rosterApi.listRoster(ownerId).then(rows => {
      if (cancelled) return;
      setRoster(rows);
    });
    return () => { cancelled = true; };
  }, [ownerId]);

  // Esc closes.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  function bumpCount(id: string, delta: number) {
    setCounts(prev => {
      const next = { ...prev };
      const curr = next[id] ?? 0;
      const v = Math.max(0, Math.min(20, curr + delta));
      if (v === 0) delete next[id];
      else next[id] = v;
      return next;
    });
  }

  function setCount(id: string, value: number) {
    setCounts(prev => {
      const next = { ...prev };
      const v = Math.max(0, Math.min(20, Math.floor(value)));
      if (v === 0) delete next[id];
      else next[id] = v;
      return next;
    });
  }

  // v2.272.0 — copy a roster entry into the user's homebrew_monsters
  // table so it can be tweaked freely without affecting the original
  // roster row. Non-destructive (homebrew is additive); on success we
  // toast and the picker stays open. On failure we toast an error.
  // The same row could be promoted multiple times; that's OK — each
  // creates a separate homebrew row, and the user can clean up dupes
  // in the Homebrew picker tab inside the builder.
  async function handlePromoteToHomebrew(entry: RosterEntry) {
    if (savingHomebrew[entry.id]) return;
    setSavingHomebrew(prev => ({ ...prev, [entry.id]: true }));
    const draft = rosterApi.rosterEntryToDraft(entry);
    const saved = await homebrewApi.createHomebrewFromDraft(ownerId, draft);
    setSavingHomebrew(prev => {
      const next = { ...prev };
      delete next[entry.id];
      return next;
    });
    if (saved) {
      showToast(`"${entry.name}" saved to homebrew.`, 'success');
    } else {
      showToast(`Couldn't save "${entry.name}" to homebrew. Check console.`, 'error');
    }
  }

  // Filter roster by search term (case-insensitive on name + type).
  const filtered = useMemo(() => {
    if (!roster) return null;
    if (!search.trim()) return roster;
    const needle = search.trim().toLowerCase();
    return roster.filter(r =>
      r.name.toLowerCase().includes(needle)
      || (r.type ?? '').toLowerCase().includes(needle)
    );
  }, [roster, search]);

  const selections: RosterSelection[] = useMemo(() => {
    if (!roster) return [];
    const out: RosterSelection[] = [];
    for (const r of roster) {
      const n = counts[r.id] ?? 0;
      if (n > 0) out.push({ entry: r, count: n });
    }
    return out;
  }, [roster, counts]);

  const totalTokens = selections.reduce((sum, s) => sum + s.count, 0);

  function handleConfirm() {
    if (totalTokens === 0 || submitting) return;
    setSubmitting(true);
    onConfirm(selections);
    // Parent owns close — but defensively close on next tick in case
    // the parent doesn't.
    setTimeout(onClose, 0);
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
        animation: 'fadeIn 150ms ease both',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          width: '100%', maxWidth: 640, maxHeight: '85vh',
          background: 'rgba(33,33,48,0.96)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 'var(--r-lg, 12px)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
          padding: 'var(--sp-5, 20px)',
          display: 'flex', flexDirection: 'column' as const,
          gap: 'var(--sp-3, 12px)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          gap: 12, flexWrap: 'wrap' as const,
        }}>
          <div style={{
            fontFamily: 'var(--ff-body)', fontSize: 16, fontWeight: 700,
            color: 'var(--t-1)',
          }}>
            Add NPCs to scene
          </div>
          <div style={{
            fontFamily: 'var(--ff-body)', fontSize: 11,
            color: 'var(--t-3)',
          }}>
            From your roster · pick counts and confirm
          </div>
        </div>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or type…"
          style={{
            padding: '8px 12px',
            borderRadius: 'var(--r-md, 8px)',
            border: '1px solid var(--c-border)',
            background: 'rgba(15,16,18,0.85)',
            color: 'var(--t-1)',
            fontFamily: 'var(--ff-body)', fontSize: 13,
            outline: 'none',
          }}
        />

        {/* Roster list */}
        <div style={{
          flex: 1, minHeight: 200, maxHeight: '50vh',
          overflowY: 'auto' as const,
          border: '1px solid var(--c-border)',
          borderRadius: 'var(--r-md, 8px)',
          background: 'rgba(15,16,18,0.4)',
          padding: 4,
        }}>
          {roster === null ? (
            <div style={{ padding: 16, color: 'var(--t-3)', fontSize: 12 }}>Loading roster…</div>
          ) : filtered && filtered.length === 0 && roster.length === 0 ? (
            <div style={{ padding: 24, color: 'var(--t-3)', fontSize: 13, lineHeight: 1.6 }}>
              <div style={{ fontWeight: 700, color: 'var(--t-2)', marginBottom: 6 }}>Your roster is empty.</div>
              {/* v2.289.0 — was a pointer to the old v1 BattleMap "DM Roster" panel
                  (which no longer exists). The modern path is the Roster Builder
                  modal opened from the Battle Map tab — typically a "Build Roster"
                  button in the same area as the NPC tools. Roster entries are
                  owner-scoped and reusable across all your campaigns. */}
              Open the Roster Builder from the Battle Map tab to add reusable monster entries —
              they're owner-scoped and reusable across all your campaigns.
            </div>
          ) : filtered && filtered.length === 0 ? (
            <div style={{ padding: 16, color: 'var(--t-3)', fontSize: 12 }}>
              No matches for "{search}".
            </div>
          ) : (
            filtered!.map(entry => {
              const count = counts[entry.id] ?? 0;
              const active = count > 0;
              return (
                <div
                  key={entry.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px',
                    borderRadius: 'var(--r-md, 6px)',
                    border: `1px solid ${active ? entry.color + '66' : 'transparent'}`,
                    background: active ? entry.color + '0f' : 'transparent',
                    transition: 'background 0.12s, border-color 0.12s',
                  }}
                >
                  {/* Emoji / image badge */}
                  <div style={{
                    width: 36, height: 36, flexShrink: 0,
                    borderRadius: '50%',
                    background: entry.color + '24',
                    border: `1px solid ${entry.color}66`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20,
                  }}>
                    {entry.image_url ? (
                      <img
                        src={entry.image_url}
                        alt=""
                        style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                      />
                    ) : (
                      entry.emoji
                    )}
                  </div>
                  {/* Name + meta */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: 'var(--ff-body)', fontSize: 13, fontWeight: 700,
                      color: 'var(--t-1)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {entry.name}
                    </div>
                    <div style={{
                      fontFamily: 'var(--ff-body)', fontSize: 10,
                      color: 'var(--t-3)',
                      display: 'flex', gap: 8, flexWrap: 'wrap' as const,
                    }}>
                      <span>{entry.type}</span>
                      <span>·</span>
                      <span>CR {entry.cr}</span>
                      <span>·</span>
                      <span>HP {entry.max_hp}</span>
                      <span>·</span>
                      <span>AC {entry.ac}</span>
                      {entry.times_used > 0 && (
                        <>
                          <span>·</span>
                          <span style={{ color: 'var(--t-2)' }}>used {entry.times_used}×</span>
                        </>
                      )}
                    </div>
                  </div>
                  {/* v2.272.0 — Save as Homebrew. Non-destructive
                      "promote this entry into my reusable homebrew
                      template list" action. The roster row stays put;
                      a copy lands in homebrew_monsters scoped to the
                      DM. Renders next to the count stepper so it's
                      one consistent affordance group on the right
                      side of the row. */}
                  <button
                    onClick={() => handlePromoteToHomebrew(entry)}
                    disabled={!!savingHomebrew[entry.id]}
                    title={savingHomebrew[entry.id]
                      ? 'Saving…'
                      : `Save "${entry.name}" as a reusable homebrew monster (a copy you can tweak in any future campaign).`}
                    style={{
                      flexShrink: 0,
                      padding: '4px 8px',
                      borderRadius: 'var(--r-sm, 4px)',
                      border: '1px solid rgba(167,139,250,0.4)',
                      background: savingHomebrew[entry.id]
                        ? 'rgba(167,139,250,0.18)'
                        : 'rgba(167,139,250,0.08)',
                      color: '#a78bfa',
                      fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700,
                      letterSpacing: '0.04em',
                      cursor: savingHomebrew[entry.id] ? 'wait' : 'pointer',
                      minHeight: 0,
                      transition: 'background 0.12s',
                    }}
                  >
                    {savingHomebrew[entry.id] ? '⏳' : '📚 Homebrew'}
                  </button>
                  {/* Count stepper */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    <button
                      onClick={() => bumpCount(entry.id, -1)}
                      disabled={count === 0}
                      style={{
                        width: 26, height: 26,
                        borderRadius: 'var(--r-sm, 4px)',
                        border: '1px solid var(--c-border)',
                        background: count === 0 ? 'transparent' : 'rgba(255,255,255,0.04)',
                        color: count === 0 ? 'var(--t-3)' : 'var(--t-2)',
                        cursor: count === 0 ? 'not-allowed' : 'pointer',
                        fontWeight: 700,
                        minHeight: 0,
                        opacity: count === 0 ? 0.5 : 1,
                      }}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      value={count}
                      min={0}
                      max={20}
                      onChange={(e) => setCount(entry.id, Number(e.target.value))}
                      style={{
                        width: 44, textAlign: 'center' as const,
                        padding: '3px 0',
                        borderRadius: 'var(--r-sm, 4px)',
                        border: '1px solid var(--c-border)',
                        background: 'rgba(15,16,18,0.85)',
                        color: count > 0 ? entry.color : 'var(--t-2)',
                        fontFamily: 'var(--ff-stat)', fontSize: 13, fontWeight: 700,
                        outline: 'none',
                        MozAppearance: 'textfield',
                      }}
                    />
                    <button
                      onClick={() => bumpCount(entry.id, 1)}
                      style={{
                        width: 26, height: 26,
                        borderRadius: 'var(--r-sm, 4px)',
                        border: `1px solid ${entry.color}66`,
                        background: entry.color + '20',
                        color: entry.color,
                        cursor: 'pointer',
                        fontWeight: 700,
                        minHeight: 0,
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: 'var(--sp-2, 8px)',
          marginTop: 'var(--sp-2, 8px)',
        }}>
          <div style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-3)' }}>
            {totalTokens > 0 ? (
              <span>
                <strong style={{ color: 'var(--t-1)' }}>{totalTokens}</strong> token{totalTokens === 1 ? '' : 's'} ready
              </span>
            ) : (
              <span>Pick counts above to add NPCs.</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 'var(--sp-2, 8px)' }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--r-md, 8px)',
                background: 'transparent',
                border: '1px solid var(--c-border)',
                color: 'var(--t-2)',
                fontFamily: 'var(--ff-body)', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', minHeight: 0,
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={totalTokens === 0 || submitting}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--r-md, 8px)',
                background: totalTokens > 0 ? 'rgba(239,68,68,0.18)' : 'transparent',
                border: `1px solid ${totalTokens > 0 ? 'rgba(239,68,68,0.55)' : 'var(--c-border)'}`,
                color: totalTokens > 0 ? '#fca5a5' : 'var(--t-3)',
                fontFamily: 'var(--ff-body)', fontSize: 13, fontWeight: 700,
                cursor: totalTokens > 0 && !submitting ? 'pointer' : 'not-allowed',
                minHeight: 0,
                opacity: totalTokens > 0 && !submitting ? 1 : 0.55,
              }}
            >
              {submitting
                ? 'Adding…'
                : totalTokens > 0
                  ? `Add ${totalTokens} Token${totalTokens === 1 ? '' : 's'}`
                  : 'Add'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
