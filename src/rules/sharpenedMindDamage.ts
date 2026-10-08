import {applyDamageAffinities,type AppliedDamage} from './damageAffinities';
import type {DamageDieKind} from './damageComponents';
/** v2.837: UA2025 Psion Update pp.4-5 has DIFFERENT source scopes for
 * Bypassing Psionics and Attack Mode. Keep the latter open to any psychic
 * damage. Caller supplies a verified active effect and authoritative turn use. */
export type SharpenedDamageSource='weapon-attack'|'psion-spell'|'psion-feature'|'other'|'unknown';
export interface SharpenedDamageDie {value:number;faces:number;damageType:string;kind?:DamageDieKind}
const psychic=(type:string)=>type.trim().toLowerCase()==='psychic';
export function sharpenedIgnoresResistance(active:boolean,damageType:string,source:SharpenedDamageSource):boolean {
 return active&&psychic(damageType)&&['weapon-attack','psion-spell','psion-feature'].includes(source);
}
export function applySharpenedDamageAffinities(damage:number,damageType:string,source:SharpenedDamageSource,active:boolean,
 affinities:{immune?:boolean;resistant?:boolean;vulnerable?:boolean}={}):AppliedDamage {
 return applyDamageAffinities(damage,{...affinities,ignoreResistance:sharpenedIgnoresResistance(active,damageType,source)});
}
/** v2.868: Attack Mode's trigger requires Psychic damage, but UA p.5 does not
 * restrict the chosen die's type. It must belong to that same damage roll and
 * have been rolled, not a fixed critical maximum or an already adjusted value. */
export interface SharpenedReplacementRequest {active:boolean;usedThisTurn:boolean;psychicDamageDealt:boolean;recordedNumber:number}
export function sharpenedDamageReplacement(input:SharpenedReplacementRequest&{original:number;kind:DamageDieKind}):{original:number;replacement:number;delta:number}|null {
 const {active,usedThisTurn,psychicDamageDealt,recordedNumber,original,kind}=input;
 if(!active||usedThisTurn||!psychicDamageDealt||kind!=='rolled'
  ||!Number.isSafeInteger(recordedNumber)||recordedNumber<1||recordedNumber>36
  ||!Number.isSafeInteger(original)||original<1)return null;
 return {original,replacement:recordedNumber,delta:recordedNumber-original};
}
export interface SharpenedReplacement {dice:SharpenedDamageDie[];dieIndex:number;original:number;replacement:number;delta:number}
/** Pure preview only: no resource/turn mutation, no target multiplication.
 * One shared roll can damage several targets; replacement happens once before
 * per-target save reductions and affinities. It cannot replace a flat bonus.
 * Caller must establish that psychic damage is actually dealt (not a miss or
 * a roll whose targets all prevent it) before allowing this optional trigger. */
export function replaceSharpenedDamageDie(input:SharpenedReplacementRequest&{dice:readonly SharpenedDamageDie[];dieIndex:number}):SharpenedReplacement|null {
 const {dice,dieIndex}=input;
 if(!Number.isInteger(dieIndex)||dieIndex<0||dieIndex>=dice.length||!dice.length
  ||!dice.every(d=>Number.isSafeInteger(d.faces)&&d.faces>=1&&Number.isSafeInteger(d.value)&&d.value>=1&&d.value<=d.faces&&typeof d.damageType==='string'))return null;
 const selected=dice[dieIndex],replacement=sharpenedDamageReplacement({...input,original:selected.value,kind:selected.kind??'rolled'});
 if(!replacement)return null;
 return {dice:dice.map((d,i)=>i===dieIndex?{...d,value:replacement.replacement,kind:'adjusted'}:{...d}),dieIndex,...replacement};
}
