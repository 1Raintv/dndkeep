import {expect,it} from 'vitest';
import {formatHitDiceHealingEvent,mirroredHitDiceHealingRequests} from './hitDiceHealingHistory';
const payload={requestId:'paid',source:'Hit Dice',hitDie:6,rolls:[1,6],constitutionModifier:-3,healing:4,gained:4,old_hp:1,new_hp:5};
it('shows the selected size, original faces, modifier and actual HP change',()=>{
 expect(formatHitDiceHealingEvent(payload)).toEqual({requestId:'paid',title:'Short Rest: Hit Dice',detail:'Spent 2d6 · Rolls 1, 6 · CON -3 per die · Restored 4 HP (1 → 5)'});
});
it('distinguishes rolled healing from HP actually gained at the maximum',()=>{
 expect(formatHitDiceHealingEvent({...payload,hitDie:10,rolls:[10],constitutionModifier:2,healing:12,gained:1,old_hp:29,new_hp:30})?.detail).toBe('Spent 1d10 · Rolls 10 · CON +2 per die · Restored 1 HP (29 → 30) · 12 HP rolled');
});
it.each([null,{}, {...payload,source:'Other'},{...payload,healing:1},{...payload,gained:8},{...payload,new_hp:6},{...payload,rolls:[7]},{...payload,requestId:''},{...payload,hitDie:'6'},{...payload,constitutionModifier:99}])('does not interpret malformed or unrelated payloads: %j',value=>expect(formatHitDiceHealingEvent(value)).toBeNull());
it('deduplicates by verified request identity without hiding unrelated legacy history',()=>{
 expect([...mirroredHitDiceHealingRequests([{event_type:'healing_applied',payload},{event_type:'roll',payload:{...payload,requestId:'other'}},{event_type:'healing_applied',payload:{...payload,new_hp:99,requestId:'bad'}}])]).toEqual(['paid']);
 expect(mirroredHitDiceHealingRequests([]).size).toBe(0);
});
