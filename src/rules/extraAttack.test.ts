import { describe, expect, it } from 'vitest';
import { attacksPerAction } from './extraAttack';

describe('Attack action progression', () => {
  it.each(['Barbarian', 'Monk', 'Paladin', 'Ranger'])('%s gains two attacks at its own level 5', class_name => {
    expect(attacksPerAction({class_name, level: 4})).toBe(1);
    expect(attacksPerAction({class_name, level: 5})).toBe(2);
    expect(attacksPerAction({class_name, level: 20})).toBe(2);
  });
  it.each([[4,1],[5,2],[10,2],[11,3],[19,3],[20,4]])('Fighter %i has %i attacks', (level, count) => {
    expect(attacksPerAction({class_name:'Fighter',level})).toBe(count);
  });
  it('grants Metamorph two at Psion 6 without granting it to other subclasses', () => {
    expect(attacksPerAction({class_name:'Psion',level:5,subclass:'Metamorph'})).toBe(1);
    expect(attacksPerAction({class_name:'Psion',level:6,subclass:'Metamorph'})).toBe(2);
    for (const subclass of ['Telepath','Psykinetic','Psi Warper',null]) {
      expect(attacksPerAction({class_name:'Psion',level:20,subclass})).toBe(1);
    }
  });
  it('uses each class level separately and takes the highest benefit', () => {
    expect(attacksPerAction({class_name:'Fighter',level:3,secondary_class:'Monk',secondary_level:3})).toBe(1);
    expect(attacksPerAction({class_name:'Fighter',level:5,secondary_class:'Monk',secondary_level:5})).toBe(2);
    expect(attacksPerAction({class_name:'Psion',level:6,subclass:'Metamorph',secondary_class:'Fighter',secondary_level:11})).toBe(3);
    expect(attacksPerAction({class_name:'Wizard',level:3,secondary_class:'Psion',secondary_level:6,secondary_subclass:'Metamorph'})).toBe(2);
    expect(attacksPerAction({class_name:'Psion',level:5,subclass:'Metamorph',secondary_class:'Wizard',secondary_level:6})).toBe(1);
  });
  it('does not manufacture attacks from malformed levels or unknown classes', () => {
    for (const level of [NaN,Infinity,-1,0,5.5,21]) expect(attacksPerAction({class_name:'Fighter',level})).toBe(1);
    expect(attacksPerAction({class_name:'Wizard',level:20})).toBe(1);
  });
});
