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

/** 2024 damage at zero HP: any damage breaks stability and adds a failure.
 * Temporary HP changes pool loss, not damage taken. Tick damage is not a crit.
 * v2.869 audit: a hit at least as large as maximum HP is immediately fatal. */
export function resolveDamageAtZero(damage:number,maxHp:number,failures:number){
 if(!Number.isSafeInteger(damage)||damage<=0||!Number.isSafeInteger(maxHp)||maxHp<=0
  ||!Number.isInteger(failures)||failures<0||failures>2)throw new Error('Invalid damage-at-zero state');
 const massiveDamage=damage>=maxHp;
 const nextFailures=massiveDamage?3:Math.min(3,failures+1);
 return {failures:nextFailures,isStable:false,isDead:nextFailures===3,massiveDamage};
}
