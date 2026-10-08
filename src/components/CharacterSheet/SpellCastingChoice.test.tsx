// @vitest-environment happy-dom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import type {Character,ComputedStats} from '../../types';
import {SpellCastingProvider,useSpellCasting} from './SpellCastingContext';
import {SpellCastingChoice} from './SpellCastingChoice';
afterEach(cleanup);
const pc={id:'hero',class_name:'Cleric',level:11,secondary_class:'Psion',secondary_level:5,spell_sources:{spell:['class:Psion','class:Cleric']},spell_preparation_sources:{spell:['class:Psion','class:Cleric']},prepared_spells:['spell']} as unknown as Character;
const computed={modifiers:{intelligence:4,wisdom:1,charisma:-1},proficiency_bonus:5} as ComputedStats;
function View({character=pc}:{character?:Character}){
 const casting=useSpellCasting(character,{id:'spell',level:1},computed);
 return <><SpellCastingChoice casting={casting} name="Test spell"/><output>{casting.selected?`DC ${casting.selected.saveDC}`:'Choose source'}</output></>;
}
it('offers class-specific DCs and updates the chosen casting numbers',()=>{
 render(<SpellCastingProvider><View/></SpellCastingProvider>);
 const selector=screen.getByRole('combobox',{name:'Cast Test spell through'});
 expect(screen.getByRole('option',{name:'Psion · INT · DC 17'})).toBeTruthy();
 expect(screen.getByRole('option',{name:'Cleric · WIS · DC 14'})).toBeTruthy();
 fireEvent.change(selector,{target:{value:'Psion'}});expect(screen.getByText('DC 17')).toBeTruthy();
 fireEvent.change(selector,{target:{value:'Cleric'}});expect(screen.getByText('DC 14')).toBeTruthy();
});
it('explains missing source records instead of supplying a primary-class default',()=>{
 render(<View character={{...pc,spell_sources:{}}}/>);
 expect(screen.getByText(/Review this spell’s learned and prepared sources/)).toBeTruthy();
 expect(screen.queryByRole('combobox')).toBeNull();
});
