// @vitest-environment happy-dom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import ClassAbilityResolveModal from './ClassAbilityResolveModal';
import type {Character} from '../../types';
vi.mock('../../lib/supabase',()=>({supabase:{from:(table:string)=>{
 const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:{id:table==='combat_encounters'?'enc':'caster'}}),order:async()=>({data:[{id:'one',name:'Goblin one',participant_type:'creature',current_hp:5},{id:'two',name:'Goblin two',participant_type:'creature',current_hp:5}]})};return query;
}}}));
vi.mock('../../lib/automations',()=>({resolveAutomation:()=> 'manual'}));
vi.mock('../../lib/gameUtils',()=>({rollDie:()=>10}));
vi.mock('../../lib/pendingAttack',()=>({getTargetSaveBonus:async()=>({bonus:0,breakdown:'',confidence:'high'})}));
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

