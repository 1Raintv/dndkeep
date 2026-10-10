import {applyDamageToPools} from './hp';
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

export interface DamageVitalState {
 current_hp:number;max_hp:number;temp_hp:number;death_save_failures:number;death_save_successes:number;is_stable:boolean;is_dead:boolean;
}
/** v2.869: shared non-attack damage lifecycle for auras and turn ticks.
 * Damage at zero still counts through temp HP; only excess HP damage after a
 * drop is compared with maximum HP. These sources cannot critically hit. */
export function resolveNonAttackDamage(state:DamageVitalState,isCharacter:boolean,damage:number){
 if(![state.current_hp,state.max_hp,state.temp_hp,damage].every(n=>Number.isSafeInteger(n)&&n>=0)||state.max_hp<1||state.current_hp>state.max_hp
  ||![state.death_save_failures,state.death_save_successes].every(n=>Number.isInteger(n)&&n>=0&&n<=3))throw new Error('Review damage and hit point state.');
 const updates={...state};let massiveDamage=false,damageAtZero=false,droppedTo0=false;
 if(!state.is_dead&&damage>0){
  const pools=applyDamageToPools(state.current_hp,state.temp_hp,damage);updates.current_hp=pools.hpAfter;updates.temp_hp=pools.tempAfter;droppedTo0=pools.droppedTo0;
  if(isCharacter&&state.current_hp===0){
   const result=resolveDamageAtZero(damage,state.max_hp,state.death_save_failures);
   updates.death_save_failures=result.failures;updates.is_stable=false;updates.is_dead=result.isDead;massiveDamage=result.massiveDamage;damageAtZero=true;
  }else if(isCharacter&&droppedTo0){
   massiveDamage=pools.dmgToHp-state.current_hp>=state.max_hp;
   updates.is_stable=false;if(massiveDamage){updates.is_dead=true;updates.death_save_failures=3;}
  }else if(!isCharacter&&updates.current_hp===0){updates.is_dead=true;updates.is_stable=false;}
 }
 return {updates,droppedTo0,damageAtZero,massiveDamage};
}
