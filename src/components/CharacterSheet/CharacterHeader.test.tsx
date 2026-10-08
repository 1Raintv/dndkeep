// @vitest-environment happy-dom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import type {Character,ComputedStats} from '../../types';
import CharacterHeader from './CharacterHeader';
afterEach(cleanup);
const character={name:'Test',current_hp:20,max_hp:20,temp_hp:0,level:5,class_name:'Psion'} as Character;
function setup(disabled=false){const update=vi.fn();render(<CharacterHeader character={character} computed={{} as ComputedStats} onOpenSettings={()=>{}} onUpdateHP={update} hpDisabled={disabled}/>);return update;}
it.each(['1.5','-5','1e2','12foo','2147483648'])('does not rewrite malformed HP input %s as damage',value=>{
 const update=setup();fireEvent.change(screen.getByRole('textbox',{name:'HP adjustment amount'}),{target:{value}});fireEvent.click(screen.getByRole('button',{name:'Damage'}));expect(update).not.toHaveBeenCalled();
});
it('accepts whole-number damage and zero temporary HP',()=>{
 const update=setup(),input=screen.getByRole('textbox',{name:'HP adjustment amount'});fireEvent.change(input,{target:{value:' 12 '}});fireEvent.click(screen.getByRole('button',{name:'Damage'}));expect(update).toHaveBeenLastCalledWith(-12);
 fireEvent.change(input,{target:{value:'0'}});fireEvent.click(screen.getByRole('button',{name:'Temp'}));expect(update).toHaveBeenLastCalledWith(0,0);
});
it('keeps controls visible and disabled while a damage request is unresolved',()=>{
 const update=setup(true);expect(screen.getByRole('button',{name:'Damage'}).closest('fieldset')?.disabled).toBe(true);expect((screen.getByRole('button',{name:'Rest'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.change(screen.getByRole('textbox',{name:'HP adjustment amount'}),{target:{value:'5'}});fireEvent.keyDown(screen.getByRole('textbox',{name:'HP adjustment amount'}),{key:'Enter'});expect(update).not.toHaveBeenCalled();
});
