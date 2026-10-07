import {beforeEach,expect,it,vi} from 'vitest';
import type {CombatParticipant} from '../../types';
const mocks=vi.hoisted(()=>({from:vi.fn(),declare:vi.fn()}));
vi.mock('../supabase',()=>({supabase:{from:mocks.from}}));
vi.mock('../pendingAttack',()=>({declareAttack:mocks.declare}));
import {loadPsionicDamageContext,queuePsionicDamage} from './psionicDamage';
const self={id:'self',participant_type:'character',entity_id:'psion'} as CombatParticipant;
const target={id:'target',name:'Goblin',participant_type:'creature'} as CombatParticipant;
const input={requestId:'paid',context:{campaignId:'camp',encounterId:'enc',self,participants:[self,target]},target,characterId:'psion',characterName:'Psion',amount:12};
function query(data:unknown,error:unknown=null){
 const q={select:vi.fn(()=>q),eq:vi.fn(()=>q),maybeSingle:async()=>({data,error}),then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data,error}).then(resolve)};return q;
}
beforeEach(()=>{vi.clearAllMocks();mocks.declare.mockResolvedValue({id:'paid'});});
it('needs a campaign and the character in an active encounter',async()=>{
 expect(await loadPsionicDamageContext(null,'psion')).toBeNull();expect(mocks.from).not.toHaveBeenCalled();
 mocks.from.mockReturnValueOnce(query({id:'enc'})).mockReturnValueOnce(query([target]));
 expect(await loadPsionicDamageContext('camp','psion')).toBeNull();
});
it('recovers an already queued result before rechecking an ended encounter',async()=>{
 const existing=query({id:'paid'});mocks.from.mockReturnValue(existing);await queuePsionicDamage(input);
 expect(existing.eq).toHaveBeenCalledWith('id','paid');expect(existing.eq).toHaveBeenCalledWith('campaign_id','camp');expect(mocks.from).toHaveBeenCalledTimes(1);expect(mocks.declare).not.toHaveBeenCalled();
});
it.each(['changed encounter','removed target'])('keeps paid damage for manual resolution after %s',async situation=>{
 mocks.from.mockReturnValueOnce(query(null)).mockReturnValueOnce(query({id:situation==='changed encounter'?'new':'enc'})).mockReturnValueOnce(query(situation==='removed target'?[self]:[self,target]));
 await expect(queuePsionicDamage(input)).rejects.toThrow('encounter or target changed');expect(mocks.declare).not.toHaveBeenCalled();
});
it('queues the fixed total without a second save, roll, or extra Intelligence modifier',async()=>{
 mocks.from.mockReturnValueOnce(query(null)).mockReturnValueOnce(query({id:'enc'})).mockReturnValueOnce(query([self,target]));
 await queuePsionicDamage(input);expect(mocks.declare).toHaveBeenCalledWith({requestId:'paid',campaignId:'camp',encounterId:'enc',attackerParticipantId:'self',attackerName:'Psion',attackerType:'character',targetParticipantId:'target',targetName:'Goblin',targetType:'creature',attackSource:'ability',attackName:'Destructive Thoughts',attackKind:'auto_hit',damageDice:'12',damageType:'Psychic'});
});
it('surfaces a rejected write for retry',async()=>{
 mocks.from.mockReturnValueOnce(query(null)).mockReturnValueOnce(query({id:'enc'})).mockReturnValueOnce(query([self,target]));mocks.declare.mockResolvedValue(null);
 await expect(queuePsionicDamage(input)).rejects.toThrow('without spending again');
});
it('does not queue malformed damage',async()=>{
 await expect(queuePsionicDamage({...input,amount:NaN})).rejects.toThrow('Invalid');expect(mocks.from).not.toHaveBeenCalled();
});
