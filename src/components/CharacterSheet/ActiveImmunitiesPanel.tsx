// v2.478.0 — ActiveImmunitiesPanel (Ship 4 of cross-encounter immunity arc).
//
// Renders below the Active Conditions panel on the character sheet.
// Shows each active cross-encounter immunity (source name + source_kind)
// and provides a one-click remove button per entry.
//
// Data source: character.active_immunities (denormalized JSONB
// snapshot, populated at end-of-encounter by the v2.477 carry-over).
// On remove, we both:
//   1. DELETE the authoritative row in campaign_condition_immunities
//      so the next end-of-encounter doesn't resurrect it.
//   2. Filter the local snapshot via applyUpdate so the sheet
//      reflects the change immediately.
//
// Hidden when the character has no active immunities. No expiry
// countdown surfaced — combat_rounds_elapsed only ticks during
// combat, so "expires in N rounds" reads weirdly out of combat
// (where most sheet-viewing happens). Instead we show the source
// + source_kind as a static chip; the underlying expiry still
// applies and the next end-of-encounter snapshot will drop the row
// if it expired.

import { useMemo } from 'react';
import type { ActiveImmunity, Character } from '../../types';
import { revokeImmunity } from '../../lib/campaignImmunities';
import { useImmunitySourceNames } from '../../lib/hooks/useImmunitySourceNames';

interface Props {
  character: Character;
  /** Bound applyUpdate from the parent sheet; takes a partial Character
   *  patch and persists immediately when immediate=true. We always
   *  use immediate=true here because the user just clicked Remove —
   *  a debounced flush would feel unresponsive. */
  applyUpdate: (partial: Partial<Character>, immediate?: boolean) => void;
  /** Toast surface from the parent sheet for confirmation messages. */
  showToast?: (msg: string, kind?: 'info' | 'warn' | 'error' | 'success') => void;
}

/** Title-case a source_kind slug. 'frightful_presence' → 'Frightful Presence'. */
function formatSourceKind(slug: string): string {
  return slug
    .split('_')
    .filter(Boolean)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

export default function ActiveImmunitiesPanel({ character, applyUpdate, showToast }: Props) {
  const immunities: ActiveImmunity[] = (character.active_immunities ?? []) as ActiveImmunity[];

  // Stable list of source_ids we need names for. useMemo here so
  // useImmunitySourceNames sees a stable reference whenever the
  // immunity list itself hasn't changed; the hook also dedupes via
  // its sorted-key heuristic but skipping the join saves cycles when
  // the list is long.
  const sourceIds = useMemo(
    () => immunities.map(i => i.source_id).filter(Boolean),
    [immunities],
  );
  const sourceNames = useImmunitySourceNames(sourceIds);

  if (!immunities.length) return null;

  async function handleRemove(entry: ActiveImmunity) {
    if (!character.campaign_id) {
      showToast?.('Cannot remove — character is not in a campaign.', 'warn');
      return;
    }
    // 1. Delete the authoritative row. If this fails we still update
    //    the local snapshot — the next end-of-encounter carry-over will
    //    re-snapshot from the table, so a stale local view is the
    //    worst case (and the user can hit remove again).
    const ok = await revokeImmunity({
      campaignId: character.campaign_id,
      target: { type: 'character', id: character.id },
      sourceKind: entry.source_kind,
      sourceId: entry.source_id,
    });
    if (!ok) {
      showToast?.('Failed to remove immunity. Please try again.', 'error');
      return;
    }
    // 2. Update the local snapshot. Compose by source_kind+source_id
    //    (the unique key for an immunity entry); same source_kind from
    //    a different attacker is a separate entry.
    const next = immunities.filter(
      i => !(i.source_kind === entry.source_kind && i.source_id === entry.source_id),
    );
    applyUpdate({ active_immunities: next }, true);
    const sourceLabel = sourceNames.get(entry.source_id) ?? 'Unknown source';
    showToast?.(`Removed immunity to ${sourceLabel}'s ${formatSourceKind(entry.source_kind)}.`, 'success');
  }

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
        padding: 'var(--sp-2) var(--sp-4)',
        background: 'rgba(34,211,238,0.06)',
        border: '1px solid rgba(34,211,238,0.25)',
        borderRadius: 'var(--r-md)',
        flexWrap: 'wrap',
        marginTop: 'var(--sp-2)',
      }}
    >
      <span
        style={{
          fontSize: 'var(--fs-xs)', fontWeight: 700,
          color: '#67e8f9',
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}
      >
        Active Immunities:
      </span>
      {immunities.map(entry => {
        const sourceLabel = sourceNames.get(entry.source_id) ?? '…';
        const kindLabel = formatSourceKind(entry.source_kind);
        return (
          <button
            key={`${entry.source_kind}:${entry.source_id}`}
            onClick={() => handleRemove(entry)}
            title={`Click to remove. Granted in encounter ${entry.encounter_id ? entry.encounter_id.slice(0, 8) : 'unknown'}.`}
            style={{
              fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 700,
              color: '#67e8f9',
              background: 'rgba(34,211,238,0.12)',
              border: '1px solid rgba(34,211,238,0.35)',
              padding: '3px 12px', borderRadius: 999,
              cursor: 'pointer', userSelect: 'none' as const,
              transition: 'background 0.15s, border-color 0.15s, transform 0.1s',
              minHeight: 0,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(34,211,238,0.22)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(34,211,238,0.12)'; }}
            onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.97)'; }}
            onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
          >
            <span>{sourceLabel} — {kindLabel}</span>
            <span style={{ opacity: 0.6, fontSize: 'var(--fs-xs)', fontWeight: 500 }}>×</span>
          </button>
        );
      })}
    </div>
  );
}
