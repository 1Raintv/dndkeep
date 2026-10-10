import {beforeEach,expect,it,vi} from 'vitest';
import {availablePropelTechniques,choosePropelTechnique,listPropelTechniques,validPropelTechniqueReceipt,type PropelTechniqueReceipt} from './propelTechniques';
import {validPropelRecord,type PropelRecord} from './psionicPropel';
import type {Character} from '../../types';
const mock=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../supabase',()=>({supabase:{}}));
vi.mock('./psionicTurns',()=>({psionicRpc:mock.rpc,PsionicRequestError:class extends Error {constructor(message:string,public definitelyNotPaid:boolean){super(message);}}}));
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function record():PropelRecord{
 const row:PropelRecord={request_id:id(1),character_id:id(2),source_feature:'Telekinetic Propel',mode:'powered',movement:'push',base_roll:4,psion_level:5,
  request:{turnId:id(3),mode:'powered',movement:'push',roll:4,target:{participantId:id(5),legalTargetConfirmed:true}},
  target:{participantId:id(5),legalTargetConfirmed:true},caster_snapshot:{id:id(2),campaign_id:id(6),class_name:'Psion',level:5,subclass:'Psykinetic'} as Character,created_at:'2026-10-10T12:00:00Z',
  turn_context:{encounterId:id(7),turnId:id(3),round:1,index:0},
  participant_bindings:{campaignId:id(6),encounterId:id(7),actor:{id:id(4),participantType:'character',entityId:id(2),combatantId:id(8),definitionType:'character',definitionId:id(2)},target:{id:id(5),participantType:'creature',entityId:id(10),combatantId:id(9),definitionType:'creature',definitionId:id(10)}},
  action_receipt:{claim:{requestId:id(1),actorId:id(2),turnId:id(3),ownerTurnId:'own',kind:'bonusAction',grantId:'normal:bonusAction',grantSource:'normal',purpose:'feature',sourceId:'Telekinetic Propel'},replayed:false,attackLimit:null},
  roll_result:{declarationId:id(1),originalRolls:[4],enkindledRolls:[],rolls:[4],usedSurge:false,total:4},save_details:null,outcome:'failed',result:null};
 row.result={declarationId:id(1),outcome:'failed',energyCost:1,energy:{requestId:id(1),remaining:2,energyRevision:1,replayed:false,rolls:[4],restorationResource:null,restorationUsed:null},feet:20,movement:'push',target:row.target,roll:row.roll_result,action:row.action_receipt,replayed:false};return row;
}
function receipt(row=record(),choice:PropelTechniqueReceipt['choice']='boost'):PropelTechniqueReceipt{
 return {declarationId:row.request_id,characterId:row.character_id,actorId:id(4),targetId:id(5),choice,roll:row.roll_result!,replayed:false,
  attackId:choice==='bolt'?row.request_id:null,damage:choice==='bolt'?row.roll_result!.total:null,
  buff:choice==='boost'||choice==='disorient'?{key:`telekinetic_${choice}:${row.request_id}`,name:choice==='boost'?'Telekinetic Boost':'Telekinetic Disorient',source:'Telekinetic Techniques',technique:choice,casterParticipantId:id(4),expiresAtStartOfTurnOf:choice==='boost'?id(4):id(5),...(choice==='boost'?{speedBonus:10}:{preventsOpportunityAttacks:true})}:null};
}
beforeEach(()=>{mock.rpc.mockReset();});
it.each(['boost','disorient','bolt','none'] as const)('validates and submits the saved %s choice',async choice=>{
 const row=record();expect(validPropelRecord(row,row.character_id)).toBe(true);mock.rpc.mockResolvedValue(receipt(row,choice));
 await expect(choosePropelTechnique(row,choice)).resolves.toEqual(receipt(row,choice));
 expect(mock.rpc).toHaveBeenCalledWith('choose_propel_technique',{p_character:id(2),p_declaration:id(1),p_choice:choice},true);
});
it('reads an undecided choice and a completed replay without effects or rolls',async()=>{
 mock.rpc.mockResolvedValueOnce(null).mockResolvedValueOnce({...receipt(),replayed:true});
 await expect(choosePropelTechnique(record())).resolves.toBeNull();await expect(choosePropelTechnique(record())).resolves.toMatchObject({replayed:true});
});
it.each([{declarationId:id(11)},{characterId:id(11)},{actorId:id(11)},{targetId:id(11)},{damage:10},{attackId:id(11)},{replayed:null},{roll:{...record().roll_result,total:5}},{choice:'other'}])('does not confirm a mismatched receipt %j',async patch=>{
 mock.rpc.mockResolvedValue({...receipt(),...patch});await expect(choosePropelTechnique(record(),'boost')).rejects.toMatchObject({definitelyNotPaid:false});
});
it.each([{speedBonus:20},{expiresAtStartOfTurnOf:id(5)},{casterParticipantId:id(5)},{key:'telekinetic_boost:other'},{extraDamage:3}])('rejects incorrect Boost effects %j',patch=>expect(validPropelTechniqueReceipt({...receipt(),buff:{...receipt().buff,...patch}},record())).toBe(false));
it('rejects Disorient ending on the caster turn and wrong Bolt damage',()=>{
 const row=record(),r=receipt(row,'disorient');expect(validPropelTechniqueReceipt({...r,buff:{...r.buff,expiresAtStartOfTurnOf:id(4)}},row)).toBe(false);
 expect(validPropelTechniqueReceipt({...receipt(row,'bolt'),damage:5},row)).toBe(false);
});
it('does not acknowledge a different saved choice or an empty success',async()=>{
 for(const value of [receipt(record(),'disorient'),null]){mock.rpc.mockResolvedValue(value);await expect(choosePropelTechnique(record(),'boost')).rejects.toMatchObject({definitelyNotPaid:false});}
});
it.each(['legacy','target','definition','campaign','encounter','actor','passed'] as const)('rejects invalid %s context before sending',async kind=>{
 const row=record(),b=row.participant_bindings!;
 if(kind==='legacy')row.participant_bindings=null;
 if(kind==='target')b.target.id=id(11);
 if(kind==='definition')b.target.definitionId=id(11);
 if(kind==='campaign')b.campaignId=id(11);
 if(kind==='encounter')b.encounterId=id(11);
 if(kind==='actor')b.actor.entityId=id(11);
 if(kind==='passed')row.outcome='passed';
 await expect(choosePropelTechnique(row,'boost')).rejects.toMatchObject({definitelyNotPaid:true});expect(mock.rpc).not.toHaveBeenCalled();
});
it('no-die uses permit Boost/Disorient but cannot invent Bolt damage',async()=>{
 const row=record();row.mode=row.request.mode='free';row.base_roll=row.request.roll=0;
 row.roll_result={declarationId:row.request_id,originalRolls:[],enkindledRolls:[],rolls:[],total:0,usedSurge:false};
 Object.assign(row.result!,{energyCost:0,energy:null,feet:5,roll:row.roll_result});
 expect(availablePropelTechniques(row).map(o=>o.kind)).toEqual(['boost','disorient']);
 await expect(choosePropelTechnique(row,'bolt')).rejects.toMatchObject({definitelyNotPaid:true});expect(mock.rpc).not.toHaveBeenCalled();
});
it('keeps input evidence stable while confirming and accepts reordered JSON keys',async()=>{
 const row=record();let finish!:(v:unknown)=>void;mock.rpc.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const pending=choosePropelTechnique(row,'boost'),r=receipt(row);row.participant_bindings!.target.id=id(11);row.roll_result!.total=100;
 const saved=receipt();finish({...saved,buff:Object.fromEntries(Object.entries(r.buff!).reverse())});await expect(pending).resolves.toMatchObject({damage:null});
});
it('secondary Psion progression grants the same techniques',()=>{
 const row=record();Object.assign(row.caster_snapshot,{class_name:'Fighter',level:10,subclass:'Champion',secondary_class:'Psion',secondary_level:5,secondary_subclass:'Psykinetic'});
 expect(availablePropelTechniques(row).map(o=>o.kind)).toEqual(['boost','disorient','bolt']);
});
it('Bolt preserves paid Surge and Enkindled dice evidence, rather than adding Intelligence or rerolling',()=>{
 const row=record();row.psion_level=row.caster_snapshot.level=20;row.base_roll=row.request.roll=2;
 row.roll_result={declarationId:row.request_id,originalRolls:[2,6,9],enkindledRolls:[6,9],rolls:[4,6,9],usedSurge:true,total:19};
 Object.assign(row.result!,{roll:row.roll_result,feet:95});row.result!.energy!.rolls=[2];
 expect(availablePropelTechniques(row).find(o=>o.kind==='bolt')).toEqual({kind:'bolt',damageType:'Force',damage:19});
 expect(validPropelTechniqueReceipt(receipt(row,'bolt'),row)).toBe(true);
 expect(validPropelTechniqueReceipt({...receipt(row,'bolt'),roll:{...row.roll_result,originalRolls:[4,6,9]}},row)).toBe(false);
});
it('the free Psykinetic d4 permits Bolt with the saved total and no Energy Die payment',()=>{
 const row=record();row.mode=row.request.mode='technique';Object.assign(row.result!,{energyCost:0,energy:null});
 expect(availablePropelTechniques(row).find(o=>o.kind==='bolt')).toEqual({kind:'bolt',damageType:'Force',damage:4});expect(validPropelTechniqueReceipt(receipt(row,'bolt'),row)).toBe(true);
});

it('validates current-turn recovery rows and never accepts another character or duplicate declaration',async()=>{
 mock.rpc.mockResolvedValue([record()]);await expect(listPropelTechniques(id(2))).resolves.toHaveLength(1);
 for(const rows of [[record(),record()],[{...record(),character_id:id(11)}],[{...record(),technique_result:receipt()}],[{...record(),participant_bindings:null}],null]){
  mock.rpc.mockResolvedValue(rows);await expect(listPropelTechniques(id(2))).rejects.toMatchObject({definitelyNotPaid:false});
 }
});
