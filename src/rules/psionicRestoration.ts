import {psionProgression,type PsionicClassState} from './psionProgression';
/** UA update p.2: Energy Dice column, shared by rolls and pool displays. */
export function psionicDieSides(level:number):number {
  return level>=17?12:level>=11?10:level>=5?8:6;
}
/** Psion UA v2, level 5: one-minute meditation, all dice, once per Long Rest. */
export function psionicDieCount(level:number):number {
  return level>=17?12:level>=13?10:level>=9?8:level>=5?6:4;
}
/** v2.764 — missing legacy pools start full; malformed saved pools must not
 * become free dice or be silently rewritten by a power resolution. */
export function psionicPoolRemaining(level:number,pool:unknown):number|null {
  if(!Number.isInteger(level)||level<1||level>20)return null;
  const maximum=psionicDieCount(level);
  if(pool===undefined)return maximum;
  return typeof pool==='number'&&Number.isInteger(pool)&&pool>=0&&pool<=maximum?pool:null;
}
export interface PsionicRestorationState extends PsionicClassState {
  class_resources?:Record<string,unknown>|null;
  feature_uses?:Record<string,number>|null;
}
export function psionicRestorationStatus(character:PsionicRestorationState) {
  const resources=character.class_resources??{};
  const progression=psionProgression(character);
  const level=progression?.level??0;
  const maximum=progression?psionicDieCount(level):0;
  const raw=resources['psionic-energy-dice'];
  const pool=psionicPoolRemaining(level,raw);
  const remaining=pool??0;
  const used=(character.feature_uses?.['Psionic Restoration']??0)>0 || resources['psionic-restoration']===0;
  const reason=!progression||level<5?'Requires Psion level 5':pool===null?'Check Psionic Energy Dice':used?'Used · Long Rest':remaining===maximum?'Dice full':null;
  return {maximum,remaining,recovered:pool===null?0:maximum-remaining,used,reason};
}
export function restorePsionicDice(character:PsionicRestorationState) {
  const status=psionicRestorationStatus(character);
  if(status.reason)return null;
  // v2.747 — one patch updates the pool and both existing tracker representations.
  return {
    class_resources:{...character.class_resources,'psionic-energy-dice':status.maximum,'psionic-restoration':0},
    feature_uses:{...character.feature_uses,'Psionic Restoration':1},
  };
}
