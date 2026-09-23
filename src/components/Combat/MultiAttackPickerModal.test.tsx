// @vitest-environment happy-dom
import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import MultiAttackPickerModal from './MultiAttackPickerModal';
import type {Character,SpellData} from '../../types';
// v2.746 — Scorching Ray / Eldritch Blast picker. The caster is filtered out
// of the list, so the ranker only knows the caster's side if the picker says
// so; a bare id filed the party under "Enemies" (reviewer-caught regression).
const rows=[
  {id:'nyx',name:'Nyx',participant_type:'character',entity_id:'nyx-char',combatant_id:'nyx',current_hp:20,max_hp:20,is_dead:false},
  {id:'g1',name:'Goblin A',participant_type:'creature',entity_id:'goblin',combatant_id:'g1',current_hp:7,max_hp:7,is_dead:false},
  {id:'gd',name:'Goblin Dead',participant_type:'creature',entity_id:'goblin',combatant_id:'gd',current_hp:0,max_hp:7,is_dead:true},
];
vi.mock('../../lib/supabase',()=>({supabase:{from:(table:string)=>{
  const query={select:()=>query,eq:()=>query,
    maybeSingle:async()=>({data:table==='combat_encounters'?{id:'enc'}:{id:'hero',combatant_id:'hero-instance'}}),
    order:async()=>({data:rows}),
  };return query;
}}}));
// Map with the ally nearest the caster: pre-fix the 5 ft ally outranked the
// 40 ft goblin because both were "hostile" and distance broke the tie.
vi.mock('../../lib/battleMapGeometry',async original=>({...await original<object>(),loadActiveBattleMap:vi.fn().mockResolvedValue({id:'s',grid_size:70,walls:[],tokens:[
  {id:'hero',x:35,y:35,size:'medium',character_id:'hero',combatant_id:'hero-instance',row:0,col:0},
  {id:'nyx',x:105,y:35,size:'medium',character_id:'nyx-char',combatant_id:'nyx',row:0,col:1},
  {id:'g1',x:595,y:35,size:'medium',creature_id:'goblin',combatant_id:'g1',row:0,col:8},
  {id:'gd',x:175,y:35,size:'medium',creature_id:'goblin',combatant_id:'gd',row:0,col:2},
]})}));
vi.mock('../../lib/pendingAttack',()=>({declareAttack:vi.fn().mockResolvedValue({id:'attack'})}));
vi.mock('../shared/ActionLog',()=>({logAction:vi.fn().mockResolvedValue(undefined)}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('v2.746 — lists enemies first, the (nearer) party member under ALLIES, and the dead last',async()=>{
  render(<MultiAttackPickerModal open onClose={()=>{}} onDeclared={vi.fn()} campaignId="c" character={{id:'hero',name:'Hero'} as Character}
    spell={{name:'Scorching Ray',range:'120 feet',level:2} as SpellData} slotLevel={2} defaultAttackCount={3} perBeamDice="2d6" attackBonus={5}/>);
  await screen.findByText('Nyx');
  // Rows are divs; TargetGroupChip carries the same attribute on a span.
  const rows=()=>Array.from(document.querySelectorAll('div[data-target-group]'));
  expect(rows().map(el=>el.getAttribute('data-target-group'))).toEqual(['hostile','ally','dead']);
  const names=rows().map(el=>el.textContent?.replace(/\s+/g,' ')??'');
  expect(names[0]).toContain('Goblin A');expect(names[1]).toContain('Nyx');expect(names[2]).toContain('Goblin Dead');
  expect(Array.from(document.querySelectorAll('[data-target-group-header]')).map(h=>h.getAttribute('data-target-group-header'))).toEqual(['hostile','ally','dead']);
});
