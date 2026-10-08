import {expect,it} from 'vitest';
import {characterHitDice} from './characterHitDice';
const hero={class_name:'Psion',level:7,secondary_class:'Fighter',secondary_level:3,hit_dice_spent:0};
it('reads each class actual die rather than reusing the primary die',()=>{
 expect(characterHitDice(hero)).toMatchObject({status:'ready',pools:[{die:6,total:7},{die:10,total:3}]});
});
it('ignores an orphaned secondary level but rejects unknown or invalid classes',()=>{
 expect(characterHitDice({...hero,secondary_class:null})).toMatchObject({status:'ready',total:7});
 expect(characterHitDice({...hero,class_name:'Missing Class'}).status).toBe('invalid');
 expect(characterHitDice({...hero,secondary_level:-1}).status).toBe('invalid');
});
it('does not turn a zero-level secondary class into extra Hit Dice',()=>{
 expect(characterHitDice({...hero,secondary_level:0,hit_dice_spent:2})).toMatchObject({status:'ready',total:7,pools:[{die:6,spent:2,available:5}]});
});
it('retains the legacy uncertainty until actual spent die sizes are reviewed',()=>{
 expect(characterHitDice({...hero,hit_dice_spent:2}).status).toBe('review');
 expect(characterHitDice({...hero,hit_dice_spent:2,hit_dice_spent_by_type:{'10':2}})).toMatchObject({status:'ready',pools:[{die:6,available:7},{die:10,available:1}]});
});
