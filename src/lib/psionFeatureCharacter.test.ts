import {expect,it} from 'vitest';
import type {Character} from '../types';
import {psionFeatureCharacter} from './psionFeatureCharacter';
import {psionicRestorationStatus} from '../rules/psionicRestoration';
import {characterProficiencyBonus} from '../rules/proficiency';
it('renders the secondary Psion without changing stored class identity or total-level rules',()=>{
 const c={id:'hero',class_name:'Fighter',level:11,subclass:'Champion',secondary_class:'Psion',secondary_level:7,secondary_subclass:'Telepath',class_resources:{'psionic-energy-dice':2,other:3}} as unknown as Character;
 const view=psionFeatureCharacter(c)!;
 expect(view).toMatchObject({id:'hero',class_name:'Psion',level:7,subclass:'Telepath',secondary_class:'Fighter',secondary_level:11,secondary_subclass:'Champion'});
 expect(characterProficiencyBonus(view)).toBe(6);expect(psionicRestorationStatus(view)).toMatchObject({maximum:6,remaining:2,reason:null});
 expect(c.class_name).toBe('Fighter');expect(c.level).toBe(11);expect(view.class_resources).toBe(c.class_resources);
});
it('keeps primary identity stable and refuses absent/invalid Psion progression',()=>{
 const c={class_name:'Psion',level:7} as Character;expect(psionFeatureCharacter(c)).toBe(c);
 expect(psionFeatureCharacter({...c,class_name:'Fighter'})).toBeNull();
 expect(psionFeatureCharacter({...c,secondary_class:'Fighter',secondary_level:14})).toBeNull();
});
