import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../supabase',()=>({supabase:{}}));
vi.mock('./psionicTurns',async()=>({...await vi.importActual('./psionicTurns'),psionicRpc:m.rpc}));
import {validDeferredPropel,readPropelMovement,choosePropelMovement,closePropelMovement,listPropelMovements} from './propelMovement';
const character='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002';
const target={name:'Goblin',legalTargetConfirmed:true};
const roll={declarationId:id,originalRolls:[],enkindledRolls:[],usedSurge:false,rolls:[],total:0};
const action={claim:{requestId:id,actorId:character,turnId:`solo:${character}:0`,ownerTurnId:'own',kind:'bonusAction',grantId:'normal:bonusAction',grantSource:'normal',purpose:'feature',sourceId:'Telekinetic Propel'},replayed:false,attackLimit:null};
const row=()=>({request_id:id,character_id:character,turn_context:{soloTurn:0},request:{turnId:`solo:${character}:0`,mode:'free',movement:'push',roll:0,target},source_feature:'Telekinetic Propel',mode:'free',movement:'push',base_roll:0,psion_level:5,target,caster_snapshot:{id:character,class_name:'Psion',subclass:'Psi Warper',level:5},created_at:'2026-10-10T16:59:00Z',action_receipt:action,roll_result:roll,outcome:'failed',save_details:null,result:{declarationId:id,outcome:'failed',energyCost:0,energy:null,feet:5,movement:'push',target,roll,action,replayed:false},movement_choice_required:true,movement_choice:null});
const receipt=()=>({declarationId:id,characterId:character,choice:'warp',feet:30,target,roll,replayed:false});
beforeEach(()=>{vi.resetAllMocks();});
it('reads an unresolved choice without treating the original five feet as permission',async()=>{
 m.rpc.mockResolvedValue(row());expect(await readPropelMovement(character,id)).toMatchObject({movement_choice:null});
 expect(m.rpc).toHaveBeenCalledWith('propel_movement',{p_character:character,p_operation:'read',p_payload:{declarationId:id}},true);
});
it('confirms the selected Warp receipt while retaining original payment evidence',async()=>{
 m.rpc.mockResolvedValue({...row(),movement_choice:receipt()});
 expect(await choosePropelMovement(character,id,'warp')).toMatchObject({result:{feet:5},movement_choice:{feet:30}});
 await expect(choosePropelMovement(character,id,'push')).rejects.toMatchObject({definitelyNotPaid:false});
});
it.each([{feet:35},{characterId:id},{declarationId:character},{choice:'teleport'},{replayed:'false'},{target:{...target,name:'Other'}},{roll:{...roll,total:8}},{roll:{...roll,rolls:[3]}}])('rejects altered movement evidence %j',patch=>{
 expect(validDeferredPropel({...row(),movement_choice:{...receipt(),...patch}},character)).toBe(false);
});
it('rejects fabricated Warp eligibility and undeclared deferred movement',()=>{
 expect(validDeferredPropel({...row(),movement_choice_required:false},character)).toBe(false);
 expect(validDeferredPropel({...row(),caster_snapshot:{...row().caster_snapshot,subclass:'Telepath'},movement_choice:receipt()},character)).toBe(false);
});
it('closure accepts an earlier winner or a zero-movement receipt',async()=>{
 for(const movement_choice of [receipt(),{...receipt(),choice:'none',feet:0}]){
  m.rpc.mockResolvedValue({...row(),movement_choice});expect((await closePropelMovement(character,id)).movement_choice).toEqual(movement_choice);
 }
 m.rpc.mockResolvedValue(row());await expect(closePropelMovement(character,id)).rejects.toMatchObject({definitelyNotPaid:false});
});
it('keeps invalid successful replies uncertain and sends no malformed requests',async()=>{
 m.rpc.mockResolvedValue({...row(),movement_choice:{...receipt(),feet:99}});
 await expect(choosePropelMovement(character,id,'warp')).rejects.toMatchObject({definitelyNotPaid:false});m.rpc.mockClear();
 await expect(readPropelMovement('bad',id)).rejects.toMatchObject({definitelyNotPaid:true});
 await expect(readPropelMovement(character,'bad')).rejects.toMatchObject({definitelyNotPaid:true});expect(m.rpc).not.toHaveBeenCalled();
});
it('lists only distinct unresolved failed-save choices and verifies cursor ordering',async()=>{
 m.rpc.mockResolvedValue({items:[row()],nextCursor:null});expect((await listPropelMovements(character)).items).toHaveLength(1);
 for(const page of [{items:[row(),row()],nextCursor:null},{items:[{...row(),movement_choice:receipt()}],nextCursor:null},{items:[row()],nextCursor:{createdAt:row().created_at,requestId:id}}]){
  m.rpc.mockResolvedValue(page);await expect(listPropelMovements(character)).rejects.toMatchObject({definitelyNotPaid:false});
 }
 m.rpc.mockResolvedValue({items:[row()],nextCursor:null});
 await expect(listPropelMovements(character,{createdAt:row().created_at,requestId:id})).rejects.toMatchObject({definitelyNotPaid:false});
});
