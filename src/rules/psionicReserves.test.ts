import {expect,it} from 'vitest';
import {hasPsionicReserves} from './psionicReserves';
it('requires eighteen actual Psion levels, primary or secondary',()=>{
 expect(hasPsionicReserves({class_name:'Psion',level:18})).toBe(true);
 expect(hasPsionicReserves({class_name:'Psion',level:17,secondary_class:'Wizard',secondary_level:3})).toBe(false);
 expect(hasPsionicReserves({class_name:'Wizard',level:2,secondary_class:'Psion',secondary_level:18})).toBe(true);
 expect(hasPsionicReserves({class_name:'Wizard',level:20})).toBe(false);
});
