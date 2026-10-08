import {expect,it} from 'vitest';
import {combatMovementAllowance} from './combatMovement';
const base={baseSpeed:30,immobilized:false,halved:false,exhaustionLevel:0,masterySlowed:false,dashed:false};
it.each([[{},30],[{dashed:true},60],[{immobilized:true,dashed:true},0],[{exhaustionLevel:2},20],[{masterySlowed:true},20],[{halved:true},15],[{baseSpeed:35,exhaustionLevel:1,masterySlowed:true,halved:true,dashed:true},20],[{baseSpeed:25,halved:true,dashed:true},24],[{exhaustionLevel:5,masterySlowed:true},0],[{baseSpeed:100,exhaustionLevel:6},0]] as const)('computes the shared movement allowance for %j',(change,expected)=>{expect(combatMovementAllowance({...base,...change})).toBe(expected);});
it.each([NaN,Infinity,-1])('rejects an invalid speed %s',baseSpeed=>expect(combatMovementAllowance({...base,baseSpeed})).toBe(0));
