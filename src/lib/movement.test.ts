vi.mock('./api/movementReset',()=>({resetMovementAtomically:vi.fn()}));
import {resetMovementAtomically} from './api/movementReset';
vi.mock('./api/movementActions',()=>({commitMovementAction:vi.fn()}));
import {commitMovementAction} from './api/movementActions';
import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({row:{} as Record<string,unknown>}));
vi.mock('./supabase',()=>({supabase:{from:()=>({select:()=>({eq:()=>({single:async()=>({data:m.row,error:null})})})})}}));
vi.mock('./pendingReaction',()=>({offerOpportunityAttacks:vi.fn()}));
vi.mock('./combatEvents',()=>({emitCombatEvent:vi.fn(),newChainId:()=>''}));
import {canMove,takeDash,takeDisengage,resetMovement} from './movement';
beforeEach(()=>{m.row={movement_used_ft:5,max_speed_ft:30,dash_used_this_turn:false,combatants:{active_conditions:['Stunned','Incapacitated'],exhaustion_level:0,active_buffs:[]}};});
it('a Stunned actor can spend its remaining movement without gaining extra movement',async()=>{
 expect(await canMove('actor',25)).toMatchObject({allowed:true,maxSpeed:30,remaining:25});expect(await canMove('actor',26)).toMatchObject({allowed:false,maxSpeed:30});
});
it.each(['Paralyzed','Petrified','Unconscious','Grappled','Restrained'])('%s blocks movement even after Dash',async name=>{
 m.row.dash_used_this_turn=true;m.row.combatants={active_conditions:[name]};expect(await canMove('actor',1)).toMatchObject({allowed:false,maxSpeed:0});
});
it('uses joined combatant conditions and reductions before Dash',async()=>{
 m.row.max_speed_ft=35;m.row.dash_used_this_turn=true;m.row.combatants={active_conditions:['Encumbered'],exhaustion_level:1,active_buffs:[{key:'mastery_slowed'}]};
 expect(await canMove('actor',15)).toMatchObject({allowed:true,maxSpeed:20,remaining:15});
});

it('dead actors have no voluntary movement even with missing condition tags',async()=>{
 m.row.combatants={is_dead:true,active_conditions:[]};expect(await canMove('actor',1)).toMatchObject({allowed:false,maxSpeed:0});
});

it.each([['dash',takeDash],['disengage',takeDisengage]] as const)('delegates %s as one atomic operation and reports failure',async(kind,action)=>{
 const input={campaignId:'campaign',encounterId:'encounter',participantId:'actor',turnId:'rendered-turn',participantName:'Hero',participantType:'character' as const};
 vi.mocked(commitMovementAction).mockResolvedValueOnce({} as never);expect(await action(input)).toEqual({ok:true});expect(commitMovementAction).toHaveBeenCalledWith('encounter','actor','rendered-turn',kind);
 vi.mocked(commitMovementAction).mockRejectedValueOnce(new Error('Your normal Action is already spent'));expect(await action(input)).toEqual({ok:false,reason:'Your normal Action is already spent'});
});

it('reset delegates the rendered turn and surfaces a rejected movement snapshot',async()=>{
 const input={campaignId:'campaign',encounterId:'encounter',participantId:'actor',turnId:'rendered-turn',participantName:'Hero',participantType:'character' as const};
 vi.mocked(resetMovementAtomically).mockResolvedValueOnce({} as never);expect(await resetMovement(input)).toEqual({ok:true});expect(resetMovementAtomically).toHaveBeenCalledWith('encounter','actor','rendered-turn');
 vi.mocked(resetMovementAtomically).mockRejectedValueOnce(new Error('Movement changed'));expect(await resetMovement(input)).toEqual({ok:false,reason:'Movement changed'});
});

it('joined Boost effects increase validated movement once and removal restores the original allowance',async()=>{
 const boost=(id:string)=>({key:`telekinetic_boost:${id}`,technique:'boost',speedBonus:10});
 m.row.combatants={active_conditions:[],exhaustion_level:0,active_buffs:[boost('one'),boost('two')]};
 expect(await canMove('actor',35)).toMatchObject({allowed:true,maxSpeed:40,remaining:35});
 expect(await canMove('actor',36)).toMatchObject({allowed:false,maxSpeed:40});
 m.row.dash_used_this_turn=true;expect(await canMove('actor',75)).toMatchObject({allowed:true,maxSpeed:80,remaining:75});
 m.row.combatants={active_conditions:[],exhaustion_level:0,active_buffs:[]};
 expect(await canMove('actor',56)).toMatchObject({allowed:false,maxSpeed:60,remaining:55});
});
