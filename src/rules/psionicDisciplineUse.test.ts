import {expect,it} from 'vitest';
import {DISCIPLINE_NAMES,disciplineIsConditional,type DisciplineId} from './psionicDisciplineUse';
it('only the four outcome-dependent bonuses retain their die on failure',()=>{
 expect(Object.keys(DISCIPLINE_NAMES).filter(k=>disciplineIsConditional(k as DisciplineId))).toEqual(['devilish-tongue','expanded-awareness','inerrant-aim','observant-mind']);
});
