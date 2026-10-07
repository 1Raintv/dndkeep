// @vitest-environment happy-dom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import ClassAbilityResolveModal from './ClassAbilityResolveModal';
import type {Character} from '../../types';
vi.mock('../../lib/supabase',()=>({supabase:{from:(table:string)=>{
 const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:{id:table==='combat_encounters'?'enc':'caster'}}),order:async()=>({data:[{id:'one',name:'Goblin one',participant_type:'creature',current_hp:5},{id:'two',name:'Goblin two',participant_type:'creature',current_hp:5}]})};return query;
}}}));
vi.mock('../../lib/automations',()=>({resolveAutomation:()=> 'manual'}));
const mocks=vi.hoisted(()=>({roll:vi.fn(),bonus:vi.fn()}));
vi.mock('../../rules/dice',()=>({rollDie:mocks.roll}));
vi.mock('../../lib/pendingAttack',()=>({getTargetSaveBonus:mocks.bonus}));
beforeEach(()=>{mocks.roll.mockReset().mockReturnValue(10);mocks.bonus.mockReset().mockResolvedValue({bonus:0,breakdown:'',confidence:'high'});});
vi.mock('../shared/ActionLog',()=>({logAction:vi.fn()}));
afterEach(cleanup);
it('Propel requires one chosen target and submits only that target save',async()=>{
 const onConfirmed=vi.fn();render(<ClassAbilityResolveModal open onClose={vi.fn()} character={{id:'hero'} as Character} campaign={null} campaignId="campaign" saveDC={13} onConfirmed={onConfirmed} ability={{name:'Telekinetic Propel',actionType:'bonus',minLevel:1,description:'',save:{ability:'STR',dc:'spell',targetMode:'any'},psionicUse:{kind:'propel',mode:'powered',roll:4}}}/>);
 const picker=await screen.findByRole('combobox',{name:'Propel target'});
 expect((screen.getByRole('button',{name:'Confirm'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.change(picker,{target:{value:'one'}});
 await waitFor(()=>expect(screen.getAllByRole('button',{name:/Mark Fail/})).toHaveLength(1));
 fireEvent.click(screen.getByRole('button',{name:/Mark Fail/}));
 fireEvent.change(picker,{target:{value:'two'}});
 expect((screen.getByRole('button',{name:'Confirm'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:/Mark Pass/}));fireEvent.click(screen.getByRole('button',{name:'Confirm'}));
 expect(onConfirmed).toHaveBeenCalledWith([expect.objectContaining({participantId:'two',outcome:'passed'})]);
});


it.each([
 {die:1,bonus:12,dc:13,house:false,outcome:'passed',cost:0},
 {die:20,bonus:0,dc:21,house:false,outcome:'failed',cost:1},
 {die:1,bonus:12,dc:13,house:true,outcome:'failed',cost:1},
 {die:20,bonus:0,dc:21,house:true,outcome:'passed',cost:0},
])('Propel save $die + $bonus vs $dc (house=$house) spends $cost dice',async({die,bonus,dc,house,outcome,cost})=>{
 mocks.roll.mockReturnValue(die);
 mocks.bonus.mockResolvedValue({bonus,breakdown:'test',confidence:'high',naturalExtremes:house});
 const onConfirmed=vi.fn();
 render(<ClassAbilityResolveModal open onClose={vi.fn()} character={{id:'hero'} as Character} campaign={null} campaignId="campaign" saveDC={dc} onConfirmed={onConfirmed} ability={{name:'Telekinetic Propel',actionType:'bonus',minLevel:1,description:'',save:{ability:'STR',dc:'spell',targetMode:'any'},psionicUse:{kind:'propel',mode:'powered',roll:4}}}/>);
 fireEvent.change(await screen.findByRole('combobox',{name:'Propel target'}),{target:{value:'one'}});
 await waitFor(()=>expect((screen.getByRole('button',{name:'Roll Save'}) as HTMLButtonElement).disabled).toBe(false));
 // Editing the bonus must not erase the house-rule preference.
 fireEvent.change(screen.getByRole('spinbutton'),{target:{value:String(bonus+1)}});
 fireEvent.change(screen.getByRole('spinbutton'),{target:{value:String(bonus)}});
 fireEvent.click(screen.getByRole('button',{name:'Roll Save'}));
 fireEvent.click(screen.getByRole('button',{name:'Confirm'}));
 expect(onConfirmed).toHaveBeenCalledWith([expect.objectContaining({participantId:'one',outcome,total:die+bonus})]);
 const {resolvePsionicPower}=await import('../../rules/psionicPowers');
 const settled=resolvePsionicPower({class_name:'Psion',level:5,class_resources:{'psionic-energy-dice':4}},{kind:'propel',mode:'powered',roll:4},outcome==='failed');
 expect(settled?.cost).toBe(cost);
 expect(settled?.patch.class_resources['psionic-energy-dice']).toBe(4-cost);
});
it('does not roll an unloaded target bonus; manual outcomes remain available',async()=>{
 mocks.bonus.mockReturnValue(new Promise(()=>{}));
 render(<ClassAbilityResolveModal open onClose={vi.fn()} character={{id:'hero'} as Character} campaign={null} campaignId="campaign" saveDC={13} onConfirmed={vi.fn()} ability={{name:'Telekinetic Propel',actionType:'bonus',minLevel:1,description:'',save:{ability:'STR',dc:'spell',targetMode:'any'},psionicUse:{kind:'propel',mode:'powered',roll:4}}}/>);
 fireEvent.change(await screen.findByRole('combobox',{name:'Propel target'}),{target:{value:'one'}});
 expect((screen.getByRole('button',{name:'Roll Save'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Roll Save'}));
 expect(mocks.roll).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Mark Fail'}));
 expect((screen.getByRole('button',{name:'Confirm'}) as HTMLButtonElement).disabled).toBe(false);
});
