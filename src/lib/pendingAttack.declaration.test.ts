import {expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({from:vi.fn(),event:vi.fn()}));
vi.mock('./supabase',()=>({supabase:{from:mocks.from}}));
vi.mock('./combatEvents',()=>({newChainId:()=> 'chain',emitCombatEvent:mocks.event}));
vi.mock('./api/attackCancellation',()=>({cancelPendingAttack:vi.fn()}));
import {cancelPendingAttack} from './api/attackCancellation';
import {declareAttack,declareMultiTargetAttack,cancelAttack} from './pendingAttack';
const input={requestId:'paid-roll',campaignId:'camp',attackerName:'Psion',attackerType:'character' as const,targetName:'Goblin',attackName:'Destructive Thoughts',attackKind:'auto_hit' as const,damageDice:'12',damageType:'Psychic'};
it('recovers an existing declaration on an ambiguous retry instead of duplicating damage',async()=>{
 const existing={id:'paid-roll',state:'declared'};const eq=vi.fn();
 const q={insert:vi.fn(()=>q),select:vi.fn(()=>q),eq,single:async()=>({data:null,error:{code:'23505'}}),maybeSingle:async()=>({data:existing,error:null})};eq.mockReturnValue(q);mocks.from.mockReturnValue(q);mocks.event.mockClear();
 expect(await declareAttack(input)).toBe(existing);expect(q.insert).toHaveBeenCalledWith(expect.objectContaining({id:'paid-roll',damage_dice:'12',attack_kind:'auto_hit'}));expect(eq).toHaveBeenCalledWith('campaign_id','camp');expect(mocks.event).not.toHaveBeenCalled();
});
it('returns a paid declaration while history remains pending',async()=>{
 const existing={id:'paid-roll',state:'declared'};const q={insert:vi.fn(()=>q),select:vi.fn(()=>q),single:async()=>({data:existing,error:null})};mocks.from.mockReturnValue(q);
 mocks.event.mockReturnValue(new Promise(()=>{}));expect(await declareAttack(input)).toBe(existing);
});

it('stores attack mode independently of the weapon source',async()=>{
 const q={insert:vi.fn(()=>q),select:vi.fn(()=>q),single:async()=>({data:{id:'hit',state:'declared'},error:null})};mocks.from.mockReturnValue(q);
 await declareAttack({...input,attackKind:'attack_roll',attackSource:'weapon',attackMode:'ranged'});
 expect(q.insert).toHaveBeenCalledWith(expect.objectContaining({attack_source:'weapon',attack_mode:'ranged',graze_resolution_version:1}));
});

it('the shared cancellation entry point propagates server failures',async()=>{
 vi.mocked(cancelPendingAttack).mockRejectedValueOnce(new Error('Decide Legendary Resistance'));
 await expect(cancelAttack('attack')).rejects.toThrow('Decide Legendary Resistance');expect(cancelPendingAttack).toHaveBeenCalledWith('attack');
});

it.each([4,0,-2,undefined])('saves ability contribution %s separately from the total bonus',async(modifier)=>{
 const q={insert:vi.fn(()=>q),select:vi.fn(()=>q),single:async()=>({data:{id:'hit',state:'declared'},error:null})};mocks.from.mockReturnValue(q);
 await declareAttack({...input,attackKind:'attack_roll',attackSource:'weapon',attackBonus:9,attackAbilityModifier:modifier});
 expect(q.insert).toHaveBeenCalledWith(expect.objectContaining({attack_bonus:9,attack_ability_modifier:modifier??null}));
});

it('retains the chosen ability on every row of a multi-target declaration',async()=>{
 const q={insert:vi.fn(()=>q),select:async()=>({data:[{id:'a'},{id:'b'}],error:null})};mocks.from.mockReturnValue(q);mocks.event.mockResolvedValue(undefined);
 await declareMultiTargetAttack({...input,attackKind:'attack_roll',attackBonus:9,attackAbilityModifier:4,targets:[{participantId:'a',name:'A',type:'creature'},{participantId:'b',name:'B',type:'creature'}]});
 expect(q.insert).toHaveBeenCalledWith([
  expect.objectContaining({target_participant_id:'a',attack_bonus:9,attack_ability_modifier:4}),
  expect.objectContaining({target_participant_id:'b',attack_bonus:9,attack_ability_modifier:4}),
 ]);
});
