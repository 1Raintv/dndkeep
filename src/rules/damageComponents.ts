/** v2.838: preserve damage types and physical dice before saves, reactions,
 * defenses or DM overrides. A synthetic critical maximum is not a rolled die. */
export type DamageDieKind='rolled'|'adjusted'|'maximum'|'unknown';
export interface DamageRollComponent {key:string;source:'base'|'rider';label:string;damageType:string|null;expression:string;rolls:number[];dieKinds:DamageDieKind[];modifier:number;rawTotal:number}
export interface DamageComponentRecord {version:1;components:DamageRollComponent[]}
export function damageRollComponent(input:Omit<DamageRollComponent,'damageType'|'dieKinds'>&{damageType:string|null;dieKinds?:DamageDieKind[]}):DamageRollComponent {
 const value={...input,damageType:input.damageType?.trim().toLowerCase()||null,rolls:[...input.rolls],dieKinds:input.dieKinds?[...input.dieKinds]:input.rolls.map(()=>'rolled' as const)};
 if(value.damageType==='untyped')value.damageType=null;
 if(!validComponent(value))throw new Error('Damage component could not be verified.');return value;
}
function validComponent(c:DamageRollComponent):boolean {
 return !!c&&typeof c.key==='string'&&!!c.key&&['base','rider'].includes(c.source)&&typeof c.label==='string'&&typeof c.expression==='string'
  &&(c.damageType===null||typeof c.damageType==='string'&&!!c.damageType&&c.damageType===c.damageType.trim().toLowerCase())
  &&Array.isArray(c.rolls)&&c.rolls.every(n=>Number.isSafeInteger(n)&&n>0)&&Array.isArray(c.dieKinds)&&c.dieKinds.length===c.rolls.length&&c.dieKinds.every(k=>['rolled','adjusted','maximum','unknown'].includes(k))
  &&Number.isSafeInteger(c.modifier)&&Number.isSafeInteger(c.rawTotal)&&c.rawTotal===c.rolls.reduce((sum,n)=>sum+n,0)+c.modifier;
}
/** Invalid or legacy records are unknown, never silently reconstructed from a
 * final total that may include differently typed riders or reaction reductions. */
export function readDamageComponents(input:unknown):DamageComponentRecord|null {
 const r=input as DamageComponentRecord|null;
 if(!r||r.version!==1||!Array.isArray(r.components)||!r.components.every(validComponent)||new Set(r.components.map(c=>c.key)).size!==r.components.length||r.components.filter(c=>c.source==='base').length>1)return null;
 return {version:1,components:r.components.map(c=>({...c,rolls:[...c.rolls],dieKinds:[...c.dieKinds]}))};
}
