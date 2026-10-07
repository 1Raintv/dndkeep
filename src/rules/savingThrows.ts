/** v2.752 — SRD 5.2.1 pp.6–7: normal saves compare total with DC.
 * Natural extremes are an explicit house rule, unlike attack/death rolls.
 * Forced failures (conditions or willing targets) take precedence. */
export function savingThrowPassed(d20: number, total: number, dc: number,
  options: { naturalExtremes?: boolean; forceFailure?: boolean } = {}): boolean {
  if (options.forceFailure) return false;
  if (options.naturalExtremes && d20 === 1) return false;
  if (options.naturalExtremes && d20 === 20) return true;
  return total >= dc;
}
