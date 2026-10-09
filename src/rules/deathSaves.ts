/** 2024 death saves: natural faces take precedence over modified totals.
 * v2.869 audit: stabilization resets BOTH counters, without restoring HP.
 * Callers must verify that the creature is still dying before applying this.
 */
export function resolveDeathSave(d20: number, total: number, successes: number, failures: number) {
  if (!Number.isInteger(d20) || d20 < 1 || d20 > 20 || !Number.isFinite(total)
    || !Number.isInteger(successes) || successes < 0 || successes > 2
    || !Number.isInteger(failures) || failures < 0 || failures > 2) {
    throw new Error('Invalid dying creature save state');
  }
  const result = d20 === 20 ? 'crit_success' : d20 === 1 ? 'crit_failure'
    : total >= 10 ? 'success' : 'failure';
  const currentHp = d20 === 20 ? 1 : 0;
  if (currentHp) return { result, successes: 0, failures: 0, currentHp, isStable: false, isDead: false };
  if (result === 'success') successes += 1;
  else failures = Math.min(3, failures + (result === 'crit_failure' ? 2 : 1));
  const isStable = successes === 3;
  const isDead = failures === 3;
  return { result, successes: isStable ? 0 : successes, failures: isStable ? 0 : failures,
    currentHp, isStable, isDead };
}
