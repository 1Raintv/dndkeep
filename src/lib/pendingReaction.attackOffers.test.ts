import {beforeEach,expect,it,vi} from 'vitest';
import type {PendingAttack} from '../types';
const m=vi.hoisted(()=>({query:vi.fn(),insert:vi.fn(),map:vi.fn(),token:vi.fn(),distance:vi.fn(),target:{} as Record<string,unknown>|null,character:{} as Record<string,unknown>|null,attacker:{} as Record<string,unknown>|null,targetError:null as unknown,characterError:null as unknown,attackerError:null as unknown}));
vi.mock('./log',()=>({log:{error:vi.fn()}}));
vi.mock('./supabase',()=>({supabase:{from:m.query}}));
vi.mock('./battleMapGeometry',()=>({loadActiveBattleMap:m.map,findTokenForParticipant:m.token,distanceBetweenTokensFt:m.distance}));
import {offerReactionsFor} from './pendingReaction';
const attack={id:'attack',campaign_id:'campaign',target_participant_id:'target',attacker_participant_id:'attacker',attack_kind:'attack_roll',hit_result:'hit'} as PendingAttack;
beforeEach(()=>{
 vi.clearAllMocks();m.targetError=null;m.characterError=null;m.attackerError=null;
 m.target={id:'target',name:'Psion',participant_type:'character',entity_id:'hero',reaction_used:false};
 m.character={id:'hero',class_name:'Psion',level:5,known_spells:['shield'],spell_slots:{'1':{total:2,used:0}}};m.attacker={id:'attacker'};
 m.map.mockResolvedValue(null);m.insert.mockResolvedValue({error:null});
 m.query.mockImplementation((table:string)=>{let id:string|undefined;const result=()=> table==='characters'?{data:m.character,error:m.characterError}:id==='attacker'?{data:m.attacker,error:m.attackerError}:{data:m.target,error:m.targetError};
 const q={select:()=>q,eq:(_k:string,v:string)=>{id=v;return q;},single:async()=>result(),maybeSingle:async()=>result(),insert:m.insert};return q;});
});
it.each(['error','missing'])('does not interpret a %s target read as no eligible reactions',async kind=>{
 if(kind==='error')m.targetError={message:'offline'};else m.target=null;
 await expect(offerReactionsFor(attack,'post_attack_roll')).rejects.toThrow('Reaction target');expect(m.insert).not.toHaveBeenCalled();
});
it.each(['error','missing'])('does not suppress Shield on a %s character read',async kind=>{
 if(kind==='error')m.characterError={message:'offline'};else m.character=null;
 await expect(offerReactionsFor(attack,'post_attack_roll')).rejects.toThrow('Reaction character');expect(m.insert).not.toHaveBeenCalled();
});
it.each(['error','missing'])('does not treat a %s attacker read as unknown range',async kind=>{
 m.map.mockResolvedValue({tokens:[]});if(kind==='error')m.attackerError={message:'offline'};else m.attacker=null;
 await expect(offerReactionsFor(attack,'post_attack_roll')).rejects.toThrow('Reaction range');expect(m.insert).not.toHaveBeenCalled();
});
it('still offers Shield when the character is readable and no map is active',async()=>{
 expect(await offerReactionsFor(attack,'post_attack_roll')).toBe(1);expect(m.insert).toHaveBeenCalledWith([expect.objectContaining({reaction_key:'shield',state:'offered'})]);
});
it('a used reaction is a verified reason to offer nothing',async()=>{
 m.target!.reaction_used=true;expect(await offerReactionsFor(attack,'post_attack_roll')).toBe(0);expect(m.insert).not.toHaveBeenCalled();expect(m.query).not.toHaveBeenCalledWith('characters');
});
it('an attack without a participant target needs no target lookup',async()=>{
 expect(await offerReactionsFor({...attack,target_participant_id:null},'post_attack_roll')).toBe(0);expect(m.query).not.toHaveBeenCalled();
});

it('requests strict map reads and surfaces a failed lookup before inserting offers',async()=>{
 m.map.mockRejectedValueOnce(new Error('Map unavailable'));
 await expect(offerReactionsFor(attack,'post_attack_roll')).rejects.toThrow('Map unavailable');
 expect(m.map).toHaveBeenCalledWith('campaign',{throwOnError:true});expect(m.insert).not.toHaveBeenCalled();
});

it.each(['returned','thrown'])('does not report offers created after a %s insert failure',async kind=>{
 if(kind==='returned')m.insert.mockResolvedValueOnce({error:{message:'offline'}});else m.insert.mockRejectedValueOnce(new Error('offline'));
 await expect(offerReactionsFor(attack,'post_attack_roll')).rejects.toThrow('Reaction offers could not be confirmed');
 expect(m.insert).toHaveBeenCalledTimes(1);
});
