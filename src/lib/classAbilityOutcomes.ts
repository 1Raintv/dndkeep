// v2.443.0 — Lifted from ClassAbilityResolveModal so the modal can
// be lazy-loaded. The types and formatter are needed by the parent
// (ClassAbilitiesSection) to build log lines AFTER the modal closes;
// keeping them in the modal file forced eager import of all 574
// lines (including the heavy modal JSX) just to read the types and
// call a 20-line pure function. They live here now and the modal
// re-exports them for backward compat.

export type SaveOutcome = 'pending' | 'passed' | 'failed' | 'auto-failed';

export interface TargetOutcome {
  participantId: string;
  participantName: string;
  outcome: SaveOutcome;
  d20?: number;
  // v2.249.0 — total includes the bonus applied at roll time. Used by
  // the action log so the line reads "(d20=12 +3 = 15)" rather than
  // just the raw d20.
  total?: number;
  bonus?: number;
}

/**
 * Build a single-line summary of a class-ability resolution suitable
 * for the action log. Each target gets its outcome + roll detail
 * (d20, bonus, total) joined with " · ".
 *
 * Pure function — no DOM, no DB. Safe to import from anywhere.
 */
export function formatOutcomesLog(
  abilityName: string,
  saveDC: number,
  saveAbility: string,
  outcomes: TargetOutcome[],
): string {
  if (outcomes.length === 0) return `${abilityName} · DC ${saveDC} ${saveAbility} · no targets`;
  const parts = outcomes.map(o => {
    const rollDetail = o.total != null && o.bonus != null && o.d20 != null
      ? ` (d20=${o.d20}${o.bonus >= 0 ? '+' : ''}${o.bonus}=${o.total})`
      : o.d20 != null ? ` (d20=${o.d20})` : '';
    const tag = o.outcome === 'auto-failed' ? 'willing' :
                o.outcome === 'passed' ? `passed${rollDetail}` :
                o.outcome === 'failed' ? `failed${rollDetail}` :
                'pending';
    return `${o.participantName}: ${tag}`;
  });
  return `${abilityName} · DC ${saveDC} ${saveAbility} · ${parts.join(' · ')}`;
}
