import {beforeEach,expect,it,vi} from 'vitest';
import {loadTelepathSpatialEvidence} from './telepathSpatialEvidence';
import type {TelepathAttackContext} from './api/telepathReactions';
const mock=vi.hoisted(()=>({load:vi.fn()}));
vi.mock('./supabase',()=>({supabase:{}}));
vi.mock('./battleMapGeometry',async original=>({...await original<typeof import('./battleMapGeometry')>(),loadActiveBattleMap:mock.load}));
const context={characterId:'hero',subject:{combatantId:'enemy-instance',self:false},attack:{snapshot:{campaignId:'campaign'}}} as TelepathAttackContext;
const actor={id:'a',character_id:'hero',combatant_id:'hero-instance',row:0,col:0,size:2};
const subject={id:'b',combatant_id:'enemy-instance',creature_id:'goblin',row:0,col:7,size:2};
beforeEach(()=>{mock.load.mockReset();});
it('uses footprints of the exact enemy instance, not a closer same-name creature',async()=>{
 mock.load.mockResolvedValue({id:'scene',tokens:[actor,subject,{...subject,id:'other',combatant_id:'other-instance',col:1}]});
 expect(await loadTelepathSpatialEvidence(context,'scene')).toMatchObject({status:'measured',distanceFeet:30,subject:{id:'b'},visibilityReviewRequired:true});
 expect(mock.load).toHaveBeenCalledWith('campaign',{viewedSceneId:'scene',throwOnError:true});
});
it('does not guess when a required instance is missing or duplicated',async()=>{
 for(const tokens of [[actor,{...subject,combatant_id:'other'}],[actor,subject,{...subject,id:'duplicate'}],[actor,{...actor,id:'copy'},subject]]){
  mock.load.mockResolvedValue({id:'scene',tokens});expect(await loadTelepathSpatialEvidence(context,'scene')).toMatchObject({status:'review',reason:'identity'});
 }
});
it('never accepts another scene or a failed lookup',async()=>{
 expect(await loadTelepathSpatialEvidence(context,null)).toMatchObject({status:'review',reason:'scene'});expect(mock.load).not.toHaveBeenCalled();
 mock.load.mockResolvedValue({id:'other'});expect(await loadTelepathSpatialEvidence(context,'scene')).toMatchObject({status:'review',reason:'scene'});
 mock.load.mockRejectedValue(new Error('offline'));await expect(loadTelepathSpatialEvidence(context,'scene')).rejects.toThrow('offline');
});
it.each([{row:NaN},{col:1.5},{size:0},{size:5},{size:undefined}])('requires valid footprint evidence %j',patch=>{
 mock.load.mockResolvedValue({id:'scene',tokens:[actor,{...subject,...patch}]});
 return expect(loadTelepathSpatialEvidence(context,'scene')).resolves.toMatchObject({status:'review',reason:'geometry'});
});
it('does not alias different participants to the same token',async()=>{
 mock.load.mockResolvedValue({id:'scene',tokens:[{...actor,combatant_id:'enemy-instance'}]});
 expect(await loadTelepathSpatialEvidence(context,'scene')).toMatchObject({status:'review',reason:'identity'});
});
