import {expect,it} from 'vitest';
import {attackIsMelee,explicitAttackMode} from './attackMode';
it.each(['spell','weapon','monster_action'])('captured mode overrides %s source',source=>{
 expect(attackIsMelee({attack_source:source,attack_mode:'ranged'})).toBe(false);
 expect(attackIsMelee({attack_source:source,attack_mode:'melee'})).toBe(true);
});
it('retains explicitly documented legacy fallback without inventing stored metadata',()=>{
 expect(attackIsMelee({attack_source:'ranged'})).toBe(false);expect(attackIsMelee({attack_source:'spell'})).toBe(true);
});
it.each([['Melee','melee'],['Ranged (80/320 ft.)','ranged'],['80/320 ft.','ranged'],['Melee Weapon Attack','melee'],['Ranged Attack Roll','ranged'],['Melee or Ranged Attack Roll',null],['Touch',null],['60 feet',null],['',null],[null,null]] as const)('classifies explicit wording %s', (text,mode)=>expect(explicitAttackMode(text)).toBe(mode));
