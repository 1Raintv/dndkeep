/** v2.869: known on-hit spells cannot ride a save or automatic damage.
 * SRD 5.2.1: Hunter's Mark is Force on an attack-roll hit; Hex is Necrotic;
 * Divine Favor works with melee and ranged weapons. Preserve custom riders. */
interface Rider {key:string;damageRider?:{dice:string;damageType:string};onlyMelee?:boolean;onlyRanged?:boolean;onlyVsTargetParticipantId?:string}
export interface DamageRiderAttack {attackKind:string;attackSource:string|null|undefined;hitResult:string|null|undefined;targetParticipantId:string|null;isMelee:boolean}
export function damageRiderForAttack<T extends Rider>(buff:T,attack:DamageRiderAttack):T|null {
 if(!buff.damageRider)return null;
 const known=['hunters_mark','hex','divine_favor','absorb_elements_rider'].includes(buff.key);
 if(known&&(attack.attackKind!=='attack_roll'||!['hit','crit'].includes(attack.hitResult??'')))return null;
 if(buff.key==='divine_favor'&&attack.attackSource!=='weapon')return null;
 if(buff.onlyVsTargetParticipantId&&buff.onlyVsTargetParticipantId!==attack.targetParticipantId)return null;
 // The old Divine Favor template incorrectly set onlyMelee. Correct saved
 // entries in the calculation without rewriting or consuming the stored buff.
 if(buff.key!=='divine_favor'&&(buff.onlyMelee&&!attack.isMelee||buff.onlyRanged&&attack.isMelee))return null;
 if(buff.key==='absorb_elements_rider'&&!attack.isMelee)return null;
 return buff.key==='hunters_mark'?{...buff,damageRider:{...buff.damageRider,damageType:'force'}}:buff;
}
