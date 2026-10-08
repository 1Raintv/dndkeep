import {expect,it} from 'vitest';
import {readPsionicDamageDice,psionicDamageComponent} from './psionicDamageDice';
const dice={version:1 as const,sides:8,originalRolls:[1,5,3],rolls:[4,5,4],modifier:4};
it('keeps Surge originals separate and adds Intelligence exactly once',()=>{expect(psionicDamageComponent(dice)).toMatchObject({expression:'3d8+4',rolls:[4,5,4],dieKinds:['adjusted','rolled','adjusted'],modifier:4,rawTotal:17,damageType:'psychic'});});
it('preserves natural and extra dice without spending or rolling',()=>{const r={...dice,rolls:dice.originalRolls};expect(psionicDamageComponent(r)).toMatchObject({rolls:[1,5,3],dieKinds:['rolled','rolled','rolled'],rawTotal:13});});
it.each([null,{}, {...dice,sides:20},{...dice,modifier:0},{...dice,rolls:[4,5,3]},{...dice,originalRolls:[1,9,3]},{...dice,rolls:[]},{...dice,rolls:[NaN,5,4]}])('invalid saved rolls cannot become damage',r=>{expect(readPsionicDamageDice(r)).toBeNull();});
it('returns copies so display changes cannot mutate the queued roll',()=>{const r=readPsionicDamageDice(dice)!;r.rolls[0]=8;r.originalRolls[0]=8;expect(dice.rolls[0]).toBe(4);expect(dice.originalRolls[0]).toBe(1);});
