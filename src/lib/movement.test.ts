import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({row:{} as Record<string,unknown>}));
vi.mock('./supabase',()=>({supabase:{from:()=>({select:()=>({eq:()=>({single:async()=>({data:m.row,error:null})})})})}}));
vi.mock('./pendingReaction',()=>({offerOpportunityAttacks:vi.fn()}));
vi.mock('./combatEvents',()=>({emitCombatEvent:vi.fn(),newChainId:()=>''}));
import {canMove} from './movement';
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
