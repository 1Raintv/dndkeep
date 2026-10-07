// @vitest-environment happy-dom
import {act,renderHook,cleanup} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import type {Character} from '../../types';
import {usePsionLevelUpSpells} from './usePsionLevelUpSpells';
afterEach(cleanup);
it('keeps a draft on equivalent database echoes and resets it on a real spell change',()=>{
 const initial={id:'pc',class_name:'Psion',level:5,subclass:'',species:'Human',known_spells:['mage-armor','charm-person'],prepared_spells:['mage-armor'],spell_sources:{'mage-armor':['class:Psion'],'charm-person':['class:Psion']},spell_preparation_sources:{'mage-armor':['class:Psion'],'charm-person':[]}} as unknown as Character;
 const {result,rerender}=renderHook(({character})=>usePsionLevelUpSpells(character,6),{initialProps:{character:initial}});
 act(()=>result.current.setSwaps({spell:{from:'mage-armor',to:'hold-person'}}));
 rerender({character:{...initial,known_spells:['charm-person','mage-armor'],prepared_spells:[...initial.prepared_spells],spell_sources:{'charm-person':['class:Psion'],'mage-armor':['class:Psion']},spell_preparation_sources:{'charm-person':[],'mage-armor':['class:Psion']}}});
 expect(result.current.swaps.spell).toEqual({from:'mage-armor',to:'hold-person'});
 rerender({character:{...initial,known_spells:['charm-person']}});
 expect(result.current.swaps).toEqual({});
});
