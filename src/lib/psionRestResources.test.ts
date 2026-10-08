import {expect,it} from 'vitest';
import type {Character} from '../types';
import {psionRestResources} from './psionRestResources';
it.each([false,true])('restores both classes at their own levels (secondary Psion %s)',secondary=>{
 const c={class_name:secondary?'Fighter':'Psion',level:secondary?11:5,secondary_class:secondary?'Psion':'Fighter',secondary_level:secondary?5:11,
  strength:10,dexterity:10,constitution:10,intelligence:18,wisdom:10,charisma:10,
  class_resources:{'psionic-energy-dice':2,'psionic-restoration':0,'second-wind':0,'action-surge':0,other:3,'psion-disciplines':['Biofeedback']}} as unknown as Character;
 expect(psionRestResources(c,'short')).toMatchObject({'psionic-energy-dice':3,'psionic-restoration':0,'second-wind':1,'action-surge':1,other:3});
 expect(psionRestResources(c,'long')).toMatchObject({'psionic-energy-dice':6,'psionic-restoration':1,'second-wind':4,'action-surge':1,other:3,'psion-disciplines':['Biofeedback']});
});
