/** SRD 5.2.1 p.17: immunity prevents damage; apply resistance (round down)
 * before vulnerability. v2.824: odd damage does not cancel back to its input.
 * https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf */
export type DamageModifier='none'|'resistant'|'vulnerable'|'immune'|'resistant-vulnerable';
export interface AppliedDamage {final:number;modifier:DamageModifier}
export function applyDamageAffinities(damage:number,affinities:{immune?:boolean;resistant?:boolean;vulnerable?:boolean;ignoreResistance?:boolean}={}):AppliedDamage {
 if(!Number.isFinite(damage))throw new Error('Damage must be a finite number.');
 const amount=Math.max(0,Math.floor(damage));
 if(!amount)return {final:0,modifier:'none'};
 if(affinities.immune)return {final:0,modifier:'immune'};
 const resistant=!!affinities.resistant&&!affinities.ignoreResistance,vulnerable=!!affinities.vulnerable;
 const reduced=resistant?Math.floor(amount/2):amount;
 return {final:vulnerable?reduced*2:reduced,modifier:resistant?(vulnerable?'resistant-vulnerable':'resistant'):(vulnerable?'vulnerable':'none')};
}
