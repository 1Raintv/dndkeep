// @vitest-environment happy-dom
// v2.746 — BuffTargetPickerModal: the query must never filter on
// is_dead (the column left combat_participants in v2.321, so the filter
// made PostgREST reject the whole request and Bless listed nobody), and a
// dead participant renders LAST with a DEAD chip instead of vanishing.
import {cleanup,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import BuffTargetPickerModal from './BuffTargetPickerModal';

const h=vi.hoisted(()=>({eqCalls:[] as Array<[string,unknown]>}));
vi.mock('../../lib/supabase',()=>({supabase:{from:(table:string)=>{
  let selectStr='';
  const query={
    select:(s:string)=>{selectStr=s;return query;},
    eq:(col:string,val:unknown)=>{h.eqCalls.push([col,val]);return query;},
    maybeSingle:async()=>({data:table==='combat_encounters'?{id:'enc'}:{id:'caster',name:'Cleric',combatant_id:'cb-caster'}}),
    order:async()=>({data:[
      {id:'dead',name:'Zombie',participant_type:'creature',entity_id:'z',combatant_id:'cb-z',combatants:{current_hp:0,max_hp:10,is_dead:true}},
      {id:'ally',name:'Fighter',participant_type:'character',entity_id:'f',combatant_id:'cb-f',combatants:{current_hp:12,max_hp:12,is_dead:false}},
      {id:'caster',name:'Cleric',participant_type:'character',entity_id:'c',combatant_id:'cb-caster',combatants:{current_hp:9,max_hp:9,is_dead:false}},
    ].filter(()=>selectStr.length>0)}),
  };return query;
}}}));
vi.mock('../../lib/battleMapGeometry',async original=>({...await original<object>(),loadActiveBattleMap:vi.fn().mockResolvedValue(null)}));
vi.mock('../../lib/buffs',()=>({BUFF_SPELL_REGISTRY:{bless:{scope:'per_target'}},applyBuffFromSpell:vi.fn()}));
afterEach(()=>{cleanup();h.eqCalls.length=0;});

it('never filters on is_dead and lists the dead participant last with a DEAD chip',async()=>{
  render(<BuffTargetPickerModal campaignId="camp" casterCharacterId="c" spellName="Bless" onClose={()=>{}}/>);
  await waitFor(()=>expect(screen.getByText('Zombie')).toBeTruthy());
  expect(h.eqCalls.some(([col])=>col==='is_dead')).toBe(false);
  const rows=Array.from(document.querySelectorAll('button[data-target-group]'));
  expect(rows.map(r=>r.getAttribute('data-target-group'))).toEqual(['ally','self','dead']);
  expect(rows[2].textContent).toContain('Zombie');
  expect(rows[2].querySelector('[data-target-group="dead"]')?.textContent).toBe('DEAD');
  expect((rows[2] as HTMLButtonElement).disabled).toBe(false);
});
