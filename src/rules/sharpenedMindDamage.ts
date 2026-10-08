import {applyDamageAffinities,type AppliedDamage} from './damageAffinities';
/** v2.837: UA2025 Psion Update pp.4-5 has DIFFERENT source scopes for
 * Bypassing Psionics and Attack Mode. Keep the latter open to any psychic
 * damage. Caller supplies a verified active effect and authoritative turn use. */
export type SharpenedDamageSource='weapon-attack'|'psion-spell'|'psion-feature'|'other'|'unknown';
export interface SharpenedDamageDie {value:number;faces:number;damageType:string}
const psychic=(type:string)=>type.trim().toLowerCase()==='psychic';
export function sharpenedIgnoresResistance(active:boolean,damageType:string,source:SharpenedDamageSource):boolean {
 return active&&psychic(damageType)&&['weapon-attack','psion-spell','psion-feature'].includes(source);
}
export function applySharpenedDamageAffinities(damage:number,damageType:string,source:SharpenedDamageSource,active:boolean,
 affinities:{immune?:boolean;resistant?:boolean;vulnerable?:boolean}={}):AppliedDamage {
 return applyDamageAffinities(damage,{...affinities,ignoreResistance:sharpenedIgnoresResistance(active,damageType,source)});
}
export interface SharpenedReplacement {dice:SharpenedDamageDie[];dieIndex:number;original:number;replacement:number;delta:number}
/** Pure preview only: no resource/turn mutation, no target multiplication.
 * One shared roll can damage several targets; replacement happens once before
 * per-target save reductions and affinities. It cannot replace a flat bonus.
 * Caller must establish that psychic damage is actually dealt (not a miss or
 * a roll whose targets all prevent it) before allowing this optional trigger. */
export function replaceSharpenedDamageDie(input:{active:boolean;usedThisTurn:boolean;psychicDamageDealt:boolean;recordedNumber:number;dice:readonly SharpenedDamageDie[];dieIndex:number}):SharpenedReplacement|null {
 const {active,usedThisTurn,psychicDamageDealt,recordedNumber,dice,dieIndex}=input;
 if(!active||usedThisTurn||!psychicDamageDealt||!Number.isSafeInteger(recordedNumber)||recordedNumber<1||recordedNumber>36
  ||!Number.isInteger(dieIndex)||dieIndex<0||dieIndex>=dice.length||!dice.length
  ||!dice.every(d=>Number.isSafeInteger(d.faces)&&d.faces>=1&&Number.isSafeInteger(d.value)&&d.value>=1&&d.value<=d.faces&&typeof d.damageType==='string')
  ||!psychic(dice[dieIndex].damageType))return null;
 const original=dice[dieIndex].value;
 return {dice:dice.map((d,i)=>({...d,value:i===dieIndex?recordedNumber:d.value})),dieIndex,original,replacement:recordedNumber,delta:recordedNumber-original};
}
