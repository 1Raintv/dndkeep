import {beforeEach,expect,it,vi} from 'vitest';
import {enhanceTelepathReaction,beginTelepathReaction,finishTelepathReaction,listTelepathReactions,readTelepathReaction,validTelepathRecord,type TelepathRecord} from './telepathLifecycle';
import type {TelepathAttackContext} from './telepathReactions';
const mock=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('./psionicTurns',async importOriginal=>({...await importOriginal<typeof import('./psionicTurns')>(),psionicRpc:mock.rpc}));
vi.mock('../supabase',()=>({supabase:{}}));

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const saved=():TelepathAttackContext=>({characterId:id(1),feature:'distraction',psionLevel:10,energyRemaining:8,reactionAvailable:true,telepathyRange:60,rangeVerified:true,spatialReviewRequired:true,
 budget:{context:{actorId:id(1),turnId:id(8),ownerTurnId:'own',encounterId:id(2),participantId:id(3),isOwnTurn:false},spent:{action:false,bonusAction:false,reaction:false},claimed:{action:false,bonusAction:false,reaction:false}},
 subject:{participantId:id(4),combatantId:id(5),entityId:'enemy',participantType:'creature',self:false},
 attack:{id:id(6),triggerTurnId:id(8),updatedAt:'2026-10-10T16:00:00Z',total:17,targetAC:15,result:'hit',cover:null,snapshot:{version:1,attackId:id(6),campaignId:id(7),encounterId:id(2),attackerId:id(4),targetId:id(3),d20:12,total:17,targetAC:15,naturalOneAutoFails:true,criticalOnHit:false,automatic:'none',result:'hit'}}});
function declaration():TelepathRecord{
 const context=saved(),review={distanceFeet:30,visible:true,confirmed:true as const};
 return {request_id:id(10),character_id:id(1),attack_id:id(6),request:{attackId:id(6),feature:'distraction',expected:context,roll:3,review},context,review,
 base_roll:3,psion_level:10,source_feature:'Telepathic Distraction',created_at:'2026-10-10T16:00:00Z',enhancements:[],result:null,
 action_receipt:{claim:{requestId:id(10),actorId:id(1),turnId:id(8),ownerTurnId:'own',kind:'reaction',grantId:'normal:reaction',grantSource:'normal',purpose:'feature',sourceId:'Telepathic Distraction'},attackLimit:null,replayed:false}};
}
function completed():TelepathRecord{
 const r=declaration();r.result={requestId:r.request_id,cancelled:false,reactionCost:1,energyCost:1,replayed:false,originalTotal:17,total:14,result:'miss',changed:true,roll:3,originalRolls:[3],enkindledRolls:[],usedSurge:false,rolls:[3],
 energy:{requestId:r.request_id,remaining:7,energyRevision:1,restorationResource:null,restorationUsed:null,rolls:[3],replayed:false}};return r;
}
beforeEach(()=>mock.rpc.mockReset());
it('reads original reviewed evidence and validates conditional settlement',async()=>{
 for(const r of [declaration(),completed()]){expect(validTelepathRecord(r,id(1))).toBe(true);mock.rpc.mockResolvedValue(r);expect(await readTelepathReaction(id(1),id(10))).toEqual(r);}
 expect(mock.rpc).toHaveBeenLastCalledWith('telepath_reaction',{p_character:id(1),p_operation:'read',p_payload:{declarationId:id(10)}},true);
});
it.each([
 (r:TelepathRecord)=>{r.character_id=id(2);},(r:TelepathRecord)=>{r.attack_id=id(2);},
 (r:TelepathRecord)=>{r.base_roll=9;},(r:TelepathRecord)=>{r.psion_level=3;},
 (r:TelepathRecord)=>{r.source_feature='Telepathic Bolstering';},(r:TelepathRecord)=>{r.action_receipt.claim.kind='action';},
 (r:TelepathRecord)=>{r.action_receipt.claim.requestId=id(11);},(r:TelepathRecord)=>{r.action_receipt.claim.ownerTurnId='another';},
 (r:TelepathRecord)=>{r.review.distanceFeet=70;},(r:TelepathRecord)=>{r.review.visible=false;},
 (r:TelepathRecord)=>{r.result!.energyCost=0;},(r:TelepathRecord)=>{r.result!.energy=null;},
 (r:TelepathRecord)=>{r.result!.energy!.requestId=id(11);},(r:TelepathRecord)=>{r.result!.energy!.rolls=[4];},
 (r:TelepathRecord)=>{r.result!.energy!.energyRevision=-1;},(r:TelepathRecord)=>{r.result!.total=15;},
 (r:TelepathRecord)=>{r.result!.result='hit';},(r:TelepathRecord)=>{r.result!.changed=false;},
 (r:TelepathRecord)=>{r.result!.rolls=[4];},(r:TelepathRecord)=>{r.result!.originalRolls=[4];},
 (r:TelepathRecord)=>{r.result!.usedSurge=true;},(r:TelepathRecord)=>{r.result!.enkindledRolls=[1];},
])('rejects inconsistent saved identity, rules or payment %i',mutate=>{
 const r=completed();mutate(r);expect(validTelepathRecord(r,id(1))).toBe(false);
});
it('accepts a cancellation but never an Energy charge on cancellation',()=>{
 const r=declaration();r.result={requestId:r.request_id,cancelled:true,reactionCost:1,energyCost:0,energy:null,replayed:false};
 expect(validTelepathRecord(r,id(1))).toBe(true);r.result.energyCost=1;expect(validTelepathRecord(r,id(1))).toBe(false);
});
it('keeps natural 20 critical and does not charge for an ineffective reaction',()=>{
 const r=completed();r.context.attack.snapshot={...r.context.attack.snapshot,d20:20,total:25,result:'crit'};r.context.attack.total=25;r.context.attack.result='crit';
 Object.assign(r.result!,{originalTotal:25,total:22,result:'crit',changed:false,energyCost:0,energy:null});
 expect(validTelepathRecord(r,id(1))).toBe(true);r.result!.changed=true;expect(validTelepathRecord(r,id(1))).toBe(false);
});
it('validates linked Surge before accepting its adjusted result',()=>{
 const r=completed();r.enhancements=[{requestId:id(11),kind:'surge',request:{declarationId:r.request_id,kind:'surge',extraRolls:null,hitDie:6},originalRolls:[3],rolls:[4],extraRolls:[]}];
 Object.assign(r.result!,{total:13,roll:4,usedSurge:true,rolls:[4]});expect(validTelepathRecord(r,id(1))).toBe(true);
 r.enhancements[0].request.declarationId=id(12);expect(validTelepathRecord(r,id(1))).toBe(false);
});
it('validates Enkindled then Surge and rejects reversed or duplicate enhancements',()=>{
 const r=declaration();r.psion_level=20;r.context.psionLevel=20;r.context.energyRemaining=12;
 const extra={requestId:id(11),kind:'enkindled' as const,request:{declarationId:r.request_id,kind:'enkindled' as const,extraRolls:[2,8],hitDie:null},originalRolls:[3,2,8],rolls:[3,2,8],extraRolls:[2,8]};
 const surge={requestId:id(12),kind:'surge' as const,request:{declarationId:r.request_id,kind:'surge' as const,extraRolls:null,hitDie:6},originalRolls:[3,2,8],rolls:[4,4,8],extraRolls:[]};
 r.enhancements=[extra,surge];expect(validTelepathRecord(r,id(1))).toBe(true);
 r.enhancements=[surge,extra];expect(validTelepathRecord(r,id(1))).toBe(false);
 r.enhancements=[extra,extra];expect(validTelepathRecord(r,id(1))).toBe(false);
});
it('list rejects mixed attacks, duplicate identities and malformed rows',async()=>{
 mock.rpc.mockResolvedValue([declaration()]);expect(await listTelepathReactions(id(1),id(6))).toHaveLength(1);
 for(const rows of [[declaration(),declaration()],[{...declaration(),attack_id:id(9)}],[null],{}]){mock.rpc.mockResolvedValue(rows);await expect(listTelepathReactions(id(1),id(6))).rejects.toMatchObject({definitelyNotPaid:false});}
});
it('begin accepts JSONB key order but not a different saved roll',async()=>{
 const r=declaration(),request={...structuredClone(r.request),requestId:r.request_id};
 mock.rpc.mockResolvedValue({...r,request:Object.fromEntries(Object.entries(r.request).reverse())});
 expect(await beginTelepathReaction(id(1),request)).toMatchObject({request_id:r.request_id});
 r.request.roll=2;r.base_roll=2;mock.rpc.mockResolvedValue(r);await expect(beginTelepathReaction(id(1),request)).rejects.toMatchObject({definitelyNotPaid:false});
});
it('invalid preparation never sends a request',async()=>{
 const r=declaration();await expect(beginTelepathReaction(id(1),{...r.request,requestId:r.request_id,roll:9})).rejects.toMatchObject({definitelyNotPaid:true});
 await expect(readTelepathReaction('bad',id(10))).rejects.toMatchObject({definitelyNotPaid:true});expect(mock.rpc).not.toHaveBeenCalled();
});
it('finish requires the requested final outcome, leaving uncertain successes recoverable',async()=>{
 mock.rpc.mockResolvedValue(completed());expect((await finishTelepathReaction(id(1),id(10))).result?.energyCost).toBe(1);
 await expect(finishTelepathReaction(id(1),id(10),true)).rejects.toMatchObject({definitelyNotPaid:false});
 mock.rpc.mockResolvedValue(declaration());await expect(finishTelepathReaction(id(1),id(10))).rejects.toMatchObject({definitelyNotPaid:false});
});

it('enhancement requires its exact paid link and rejects a different request identity',async()=>{
 const r=declaration(),request={declarationId:r.request_id,requestId:id(11),kind:'surge' as const,extraRolls:null,hitDie:6};
 r.enhancements=[{requestId:id(11),kind:'surge',request:{declarationId:r.request_id,kind:'surge',extraRolls:null,hitDie:6},originalRolls:[3],rolls:[4],extraRolls:[]}];
 mock.rpc.mockResolvedValue(r);expect((await enhanceTelepathReaction(id(1),request)).enhancements).toHaveLength(1);
 await expect(enhanceTelepathReaction(id(1),{...request,requestId:id(12)})).rejects.toMatchObject({definitelyNotPaid:false});
});
it.each([{kind:'surge',extraRolls:[1],hitDie:6},{kind:'surge',extraRolls:null,hitDie:4},{kind:'enkindled',extraRolls:[],hitDie:null},{kind:'enkindled',extraRolls:[13],hitDie:null}])('rejects malformed enhancement before RPC %j',async bad=>{
 await expect(enhanceTelepathReaction(id(1),{declarationId:id(10),requestId:id(11),...bad} as Parameters<typeof enhanceTelepathReaction>[1])).rejects.toMatchObject({definitelyNotPaid:true});expect(mock.rpc).not.toHaveBeenCalled();
});

it.each([{d20:10,roll:3,total:15,result:'hit',cost:1},{d20:10,roll:1,total:13,result:'miss',cost:0},{d20:1,roll:3,total:15,result:'fumble',cost:0}])('validates Bolstering hit conversion and natural one %j',example=>{
 const r=completed();r.request.feature='bolstering';r.context.feature='bolstering';r.base_roll=example.roll;r.request.roll=example.roll;
 r.source_feature='Telepathic Bolstering';r.action_receipt.claim.sourceId=r.source_feature;
 Object.assign(r.context.attack,{total:12,result:example.d20===1?'fumble':'miss'});
 Object.assign(r.context.attack.snapshot,{d20:example.d20,total:12,result:example.d20===1?'fumble':'miss'});
 Object.assign(r.result!,{originalTotal:12,total:example.total,result:example.result,changed:!!example.cost,energyCost:example.cost,roll:example.roll,originalRolls:[example.roll],rolls:[example.roll]});
 if(example.cost)r.result!.energy!.rolls=[example.roll];else r.result!.energy=null;
 expect(validTelepathRecord(r,id(1))).toBe(true);
});
