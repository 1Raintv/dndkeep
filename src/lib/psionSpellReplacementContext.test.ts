import {expect,it} from 'vitest';
import type {Character} from '../types';
import {psionSpellReplacementContext} from './psionSpellReplacementContext';
const pc={class_name:'Psion',level:2,subclass:'',species:'Tiefling',species_choices:{tieflingLegacy:'infernal'}} as unknown as Character;
it('protects species and newly acquired subclass spells',()=>{
 const context=psionSpellReplacementContext(pc,3,{kind:'primary',className:'Psion',level:2,subclass:'Psi Warper'});
 expect(context.granted).toEqual(expect.arrayContaining(['mage-hand','misty-step','hellish-rebuke']));
 expect(context.granted).not.toContain('darkness');
});
it('uses total level for species grants while preserving the other class grants',()=>{
 const context=psionSpellReplacementContext({...pc,secondary_class:'Paladin',secondary_level:2},3);
 expect(context.granted).toEqual(expect.arrayContaining(['darkness','divine-smite','mage-hand']));
});
it('secondary Psion progression retains primary class grants and correct total level',()=>{
 const context=psionSpellReplacementContext({...pc,class_name:'Paladin',level:2,secondary_class:'Psion',secondary_level:2},3,
  {kind:'secondary',className:'Psion',level:2,subclass:'Psi Warper'});
 expect(context.granted).toEqual(expect.arrayContaining(['darkness','divine-smite','mage-hand','misty-step']));
 expect(context.selected.level).toBe(2);
});
