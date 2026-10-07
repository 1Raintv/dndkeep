import {expect,it} from 'vitest';
import {psionicDisciplineCapacity,psionicDisciplineTotal} from './psionicDisciplineRoll';
it('adds Intelligence once to every chosen die and enforces the minimum',()=>{
 expect(psionicDisciplineTotal([2,5,3],8,4)).toBe(14);expect(psionicDisciplineTotal([1],8,-2)).toBe(1);
});
it.each([[],[0],[9],[1.5]].map(rolls=>[rolls]))('rejects malformed rolls %j',rolls=>expect(psionicDisciplineTotal(rolls,8,4)).toBeNull());
it('caps paid dice by availability and Intelligence',()=>{
 expect(psionicDisciplineCapacity(7,2,4)).toEqual({remaining:2,sides:8,maxDice:2});
 expect(psionicDisciplineCapacity(7,6,4)?.maxDice).toBe(4);
});
