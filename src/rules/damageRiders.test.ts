import {expect,it} from 'vitest';
import {damageRiderForAttack,type DamageRiderAttack} from './damageRiders';
const attack:DamageRiderAttack={attackKind:'attack_roll',hitResult:'hit',attackSource:'weapon',targetParticipantId:'target',isMelee:true};
const rider=(key:string)=>({key,damageRider:{dice:'1d6',damageType:'piercing'},onlyVsTargetParticipantId:'target'});
it.each(['hunters_mark','hex','divine_favor','absorb_elements_rider'])('%s cannot fire on a save, automatic damage or a miss',key=>{
 for(const patch of [{attackKind:'save'},{attackKind:'auto_hit'},{hitResult:'miss'},{hitResult:null}])expect(damageRiderForAttack(rider(key),{...attack,...patch})).toBeNull();
});
it('Hunter’s Mark adds Force on a spell attack without rewriting the saved buff',()=>{const b=rider('hunters_mark');expect(damageRiderForAttack(b,{...attack,attackSource:'spell',isMelee:false})?.damageRider.damageType).toBe('force');expect(b.damageRider.damageType).toBe('piercing');});
it('Hex works on a ranged spell hit and critical hit',()=>{for(const hitResult of ['hit','crit'])expect(damageRiderForAttack(rider('hex'),{...attack,hitResult,attackSource:'spell',isMelee:false})).not.toBeNull();});
it('Divine Favor supports ranged weapons even with its old melee-only flag',()=>{expect(damageRiderForAttack({...rider('divine_favor'),onlyMelee:true},{...attack,isMelee:false})).not.toBeNull();});
it.each(['spell','ability','melee',null])('Divine Favor cannot infer a weapon from %s',attackSource=>{expect(damageRiderForAttack(rider('divine_favor'),{...attack,attackSource})).toBeNull();});
it('Absorb Elements remains melee-only, including melee spell attacks',()=>{const b=rider('absorb_elements_rider');expect(damageRiderForAttack(b,{...attack,attackSource:'spell'})).not.toBeNull();expect(damageRiderForAttack(b,{...attack,isMelee:false})).toBeNull();});
it('target-specific riders cannot hit another creature',()=>{expect(damageRiderForAttack(rider('hex'),{...attack,targetParticipantId:'other'})).toBeNull();});
it('custom save riders and their delivery filters stay intact',()=>{expect(damageRiderForAttack(rider('custom'),{...attack,attackKind:'save'})).not.toBeNull();expect(damageRiderForAttack({...rider('custom'),onlyRanged:true},attack)).toBeNull();});
