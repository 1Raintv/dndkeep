import {beforeEach,expect,it,vi} from 'vitest';
import type {PendingAttack} from '../types';
const {from,eq,maybeSingle}=vi.hoisted(()=>({from:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn()}));
vi.mock('./supabase',()=>({supabase:{from}}));
vi.mock('./combatEvents',()=>({emitCombatEvent:vi.fn(),newChainId:()=> 'test-chain'}));
import {getMasteryContext} from './masteryRiders';
const attack=(patch:Partial<PendingAttack>={})=>({attacker_type:'character',attacker_participant_id:'actor',campaign_id:'campaign',attack_kind:'attack_roll',attack_source:'weapon',attack_name:'Quarterstaff',...patch} as PendingAttack);
beforeEach(()=>{vi.clearAllMocks();maybeSingle.mockReset();const query={select:vi.fn().mockReturnThis(),eq,maybeSingle};eq.mockReturnValue(query);from.mockReturnValue(query);maybeSingle.mockResolvedValueOnce({data:{entity_id:'hero',participant_type:'character'}}).mockResolvedValueOnce({data:{weapon_masteries:['Quarterstaff','Dart','Longbow','Longsword'],level:4,secondary_class:'Rogue',secondary_level:1,strength:18,dexterity:12}});});
it.each(['spell','ability','monster_action',null])('a %s with a mastered weapon name does not gain mastery',async attack_source=>{
 expect(await getMasteryContext(attack({attack_source}))).toBeNull();expect(from).not.toHaveBeenCalled();
});
it.each(['save','auto_hit'] as const)('a %s cannot trigger attack-roll weapon mastery',async attack_kind=>{
 expect(await getMasteryContext(attack({attack_kind}))).toBeNull();expect(from).not.toHaveBeenCalled();
});
it('resolves a mastered weapon and total multiclass proficiency',async()=>{
 expect(await getMasteryContext(attack())).toEqual({mastery:'Topple',abilityMod:4,profBonus:3});
 expect(eq.mock.calls.filter(([key])=>key==='campaign_id')).toEqual([['campaign_id','campaign'],['campaign_id','campaign']]);
});
it('finesse ranged weapons retain their Strength option in the legacy default',async()=>{
 expect(await getMasteryContext(attack({attack_name:'Dart'}))).toMatchObject({mastery:'Vex',abilityMod:4});
});
it('ordinary ranged weapons retain Dexterity',async()=>{
 expect(await getMasteryContext(attack({attack_name:'Longbow'}))).toMatchObject({mastery:'Slow',abilityMod:1});
});
it.each(['weapon','melee','ranged'])('retains explicit %s weapon declarations including item suffixes',async attack_source=>{
 expect(await getMasteryContext(attack({attack_source,attack_name:'Longsword +1 (OA)'}))).toMatchObject({mastery:'Sap'});
});
it('an unselected mastery does not apply',async()=>{
 expect(await getMasteryContext(attack({attack_name:'Maul'}))).toBeNull();
});
