// @vitest-environment happy-dom
// v2.746 — LegendaryActionResolverModal: the participants query must JOIN
// combatants (a bare select('*') has carried no is_dead / current_hp since
// v2.321, so the dead filter was a no-op and HP could not render), and a
// dead participant renders LAST with a DEAD chip instead of vanishing.
import {cleanup,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import LegendaryActionResolverModal from './LegendaryActionResolverModal';
import {JOINED_COMBATANT_FIELDS} from '../../lib/combatParticipantNormalize';
import type {CombatParticipant,MonsterLegendaryAction} from '../../types';

const h=vi.hoisted(()=>({selects:[] as Array<[string,string]>}));
vi.mock('../../lib/supabase',()=>({supabase:{from:(table:string)=>{
  const query={
    select:(s:string)=>{h.selects.push([table,s]);return query;},
    eq:()=>query,
    maybeSingle:async()=>({data:null}),
    then:(res:(v:unknown)=>unknown)=>Promise.resolve({data:table==='combat_participants'?[
      {id:'dragon',name:'Dragon',participant_type:'creature',entity_id:'drg',combatant_id:'cb-drg',combatants:{current_hp:100,max_hp:100,is_dead:false}},
      {id:'dead',name:'Fallen Knight',participant_type:'character',entity_id:'k',combatant_id:'cb-k',combatants:{current_hp:0,max_hp:30,is_dead:true}},
      {id:'live',name:'Ranger',participant_type:'character',entity_id:'r',combatant_id:'cb-r',combatants:{current_hp:20,max_hp:30,is_dead:false}},
    ]:[],error:null}).then(res),
  };return query;
}}}));
vi.mock('../../lib/battleMapGeometry',async original=>({...await original<object>(),loadActiveBattleMap:vi.fn().mockResolvedValue(null)}));
vi.mock('../../lib/legendaryActions',()=>({spendLegendaryAction:vi.fn()}));
vi.mock('../../lib/saveBatch',()=>({declareSaveBatch:vi.fn()}));
vi.mock('../../lib/conditions',()=>({applyCondition:vi.fn()}));
vi.mock('../../lib/pendingAttack',()=>({declareAttack:vi.fn(),rollAttackRoll:vi.fn(),rollDamage:vi.fn(),applyDamage:vi.fn(),cancelAttack:vi.fn(),rollSave:vi.fn(),getTargetSaveBonus:vi.fn()}));
afterEach(()=>{cleanup();h.selects.length=0;});

it('joins combatants and lists the dead participant last with a DEAD chip',async()=>{
  const dragon={id:'dragon',name:'Dragon',participant_type:'creature',entity_id:'drg',combatant_id:'cb-drg'} as CombatParticipant;
  const la={name:'Wing Attack',desc:'Each creature within 15 feet must succeed on a DC 20 Dexterity saving throw or take 15 (2d6 + 8) bludgeoning damage.',cost:2} as MonsterLegendaryAction;
  render(<LegendaryActionResolverModal participant={dragon} campaignId="camp" encounterId="enc" laOption={la} cost={2} onClose={()=>{}}/>);
  await waitFor(()=>expect(screen.getByText('Fallen Knight')).toBeTruthy());
  const participantSelect=h.selects.find(([t])=>t==='combat_participants')?.[1] ?? '';
  expect(participantSelect).toContain(JOINED_COMBATANT_FIELDS);
  const rows=Array.from(document.querySelectorAll('button[data-target-group]'));
  expect(rows.map(r=>r.getAttribute('data-target-group'))).toEqual(['hostile','dead']);
  expect(rows[1].textContent).toContain('Fallen Knight');
  expect(rows[1].querySelector('[data-target-group="dead"]')?.textContent).toBe('DEAD');
  // Fail-open: no map → in range → clickable.
  expect((rows[1] as HTMLButtonElement).disabled).toBe(false);
});
