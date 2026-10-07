/** Psion UA v2, level 5: one-minute meditation, all dice, once per Long Rest. */
export function psionicDieCount(level:number):number {
  return level>=17?12:level>=13?10:level>=9?8:level>=5?6:4;
}
export interface PsionicRestorationState {
  class_name:string;
  level:number;
  class_resources?:Record<string,unknown>|null;
  feature_uses?:Record<string,number>|null;
}
export function psionicRestorationStatus(character:PsionicRestorationState) {
  const resources=character.class_resources??{};
  const maximum=psionicDieCount(character.level);
  const raw=resources['psionic-energy-dice'];
  const remaining=typeof raw==='number' && Number.isFinite(raw)?Math.max(0,Math.min(maximum,Math.floor(raw))):maximum;
  const used=(character.feature_uses?.['Psionic Restoration']??0)>0 || resources['psionic-restoration']===0;
  const reason=character.class_name!=='Psion'||character.level<5?'Requires Psion level 5':used?'Used · Long Rest':remaining===maximum?'Dice full':null;
  return {maximum,remaining,recovered:maximum-remaining,used,reason};
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
