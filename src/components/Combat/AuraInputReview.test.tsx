// @vitest-environment happy-dom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import AuraInputReview from './AuraInputReview';
afterEach(cleanup);
const context={aura:{aura:{name:'Spirit Guardians',saveAbility:'WIS',saveDC:14,damageDice:'3d8',damageType:'radiant'}},save:{autoFail:false},target:{combatant:{name:'Fighter'},participant:{participant_type:'character'}}};
it('requires explicit modifiers, defenses and targeting before accepting',()=>{
 const done=vi.fn();render(<AuraInputReview context={context} onResolve={done}/>);
 const submit=screen.getByRole('button',{name:'Roll and review'});expect((submit as HTMLButtonElement).disabled).toBe(true);
 fireEvent.change(screen.getByLabelText('Base saving throw modifier'),{target:{value:'-1'}});
 fireEvent.change(screen.getByLabelText('Concentration save modifier'),{target:{value:'3'}});
 fireEvent.change(screen.getByLabelText('Damage defense'),{target:{value:'resistant'}});
 for(const checkbox of screen.getAllByRole('checkbox'))fireEvent.click(checkbox);
 expect((submit as HTMLButtonElement).disabled).toBe(false);fireEvent.click(submit);fireEvent.click(submit);
 expect(done).toHaveBeenCalledTimes(1);expect(done).toHaveBeenCalledWith({baseBonus:-1,conModifier:3,affinity:'resistant',geometryConfirmed:true,defensesReviewed:true});
});
it('Escape postpones without approving any inputs',()=>{
 const done=vi.fn();render(<AuraInputReview context={context} onResolve={done}/>);fireEvent.keyDown(document,{key:'Escape'});expect(done).toHaveBeenCalledWith(null);
});
it('automatic failures need no save bonus and creature targets need no character concentration modifier',()=>{
 render(<AuraInputReview context={{...context,save:{autoFail:true},target:{participant:{participant_type:'creature'},combatant:{name:'Ogre'}}}} onResolve={vi.fn()}/>);
 expect(screen.queryByLabelText('Base saving throw modifier')).toBeNull();expect(screen.queryByLabelText('Concentration save modifier')).toBeNull();expect(screen.getByText(/automatically fails/)).toBeTruthy();
});
it('traps reverse Tab on the dialog and rejects fractional bonuses',()=>{
 render(<AuraInputReview context={context} onResolve={vi.fn()}/>);
 fireEvent.keyDown(document,{key:'Tab',shiftKey:true});expect(document.activeElement).toBe(screen.getByRole('button',{name:'Review later'}));
 fireEvent.change(screen.getByLabelText('Base saving throw modifier'),{target:{value:'0.5'}});
 fireEvent.change(screen.getByLabelText('Concentration save modifier'),{target:{value:'0'}});fireEvent.change(screen.getByLabelText('Damage defense'),{target:{value:'normal'}});
 for(const checkbox of screen.getAllByRole('checkbox'))fireEvent.click(checkbox);
 expect((screen.getByRole('button',{name:'Roll and review'}) as HTMLButtonElement).disabled).toBe(true);
});
