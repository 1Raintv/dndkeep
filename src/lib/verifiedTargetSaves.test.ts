import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({bonus:vi.fn()}));
vi.mock('./pendingAttack',()=>({getTargetSaveBonus:m.bonus}));
import {verifiedTargetSaves,UnverifiedSaveBonusError} from './verifiedTargetSaves';
beforeEach(()=>{m.bonus.mockReset();});
it('preserves verified zero and negative bonuses',async()=>{
 m.bonus.mockResolvedValueOnce({bonus:0,confidence:'high'}).mockResolvedValueOnce({bonus:-1,confidence:'high'});
 const result=await verifiedTargetSaves([{id:'a',name:'A'},{id:'b',name:'B'}],'INT');expect(result.get('a')?.bonus).toBe(0);expect(result.get('b')?.bonus).toBe(-1);
});
it.each([{bonus:0,confidence:'low'},{bonus:9},{bonus:NaN,confidence:'high'},{bonus:2.5,confidence:'high'}])('rejects unverified or malformed %j before returning a batch',async result=>{
 m.bonus.mockResolvedValueOnce({bonus:9,confidence:'high'}).mockResolvedValueOnce(result);
 await expect(verifiedTargetSaves([{id:'a',name:'Known'},{id:'b',name:'Unknown'}],'DEX')).rejects.toThrow(UnverifiedSaveBonusError);
});
it('identifies the target and ability needing review',async()=>{m.bonus.mockResolvedValue({bonus:0,confidence:'low'});await expect(verifiedTargetSaves([{id:'a',name:'Ogre'}],'CON')).rejects.toThrow('Review Ogre’s CON saving throw bonus');});
it('propagates read failure rather than replacing it with zero',async()=>{m.bonus.mockRejectedValue(new Error('unavailable'));await expect(verifiedTargetSaves([{id:'a',name:'A'}],'STR')).rejects.toThrow('unavailable');});
