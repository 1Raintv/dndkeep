// @vitest-environment happy-dom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import type {Character,ComputedStats} from '../../types';
import {SpellCastingProvider,useSpellCasting} from './SpellCastingContext';
afterEach(cleanup);
const character={id:'a',class_name:'Cleric',level:11,secondary_class:'Psion',secondary_level:5,spell_sources:{spell:['class:Psion','class:Cleric']},spell_preparation_sources:{spell:['class:Psion','class:Cleric']},prepared_spells:['spell']} as unknown as Character;
const computed={modifiers:{intelligence:4,wisdom:1,charisma:-1},proficiency_bonus:5} as ComputedStats;
const spell={id:'spell',level:1 as const};
it('shares a chosen source across two views without silently changing an invalidated choice',()=>{
 const {result,rerender}=renderHook(({pc})=>({actions:useSpellCasting(pc,spell,computed),spells:useSpellCasting(pc,spell,computed)}),{wrapper:SpellCastingProvider,initialProps:{pc:character}});
 expect(result.current.actions.selected).toBeNull();
 act(()=>result.current.actions.choose('Psion'));
 expect(result.current.spells.selected?.saveDC).toBe(17);
 rerender({pc:{...character,spell_preparation_sources:{spell:['class:Cleric']}}});
 expect(result.current.spells.selected).toBeNull();
 act(()=>result.current.spells.choose('Cleric'));
 expect(result.current.actions.selected?.saveDC).toBe(14);
});
it('scopes fallback selections to the character and does not auto-pick across class/feat sources',()=>{
 const {result,rerender}=renderHook(({pc})=>useSpellCasting(pc,spell,computed),{initialProps:{pc:character}});
 act(()=>result.current.choose('Psion'));expect(result.current.selected?.className).toBe('Psion');
 rerender({pc:{...character,id:'b'}});expect(result.current.selected).toBeNull();
 rerender({pc:{...character,id:'b',spell_sources:{spell:['class:Psion','feat']},spell_preparation_sources:{spell:['class:Psion','feat']}}});
 expect(result.current.selected).toBeNull();expect(result.current.unresolvedSources).toEqual(['feat']);
});
