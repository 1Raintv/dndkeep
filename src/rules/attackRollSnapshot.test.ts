import {expect,it} from 'vitest';
import {readAttackRollSnapshot,type AttackRollSnapshot} from './attackRollSnapshot';
const id='00000000-0000-4000-8000-000000000001';
const saved=():AttackRollSnapshot=>({version:1,attackId:id,campaignId:id,encounterId:null,attackerId:null,targetId:null,d20:12,total:17,targetAC:15,naturalOneAutoFails:true,criticalOnHit:false,automatic:'none',result:'hit'});
it('reads original attack evidence independently of future local settings',()=>{
 const s=saved();expect(readAttackRollSnapshot(s)).toEqual(s);expect(readAttackRollSnapshot(s)).not.toBe(s);
});
it.each([null,undefined,{}, {...saved(),attackId:'wrong'},{...saved(),targetId:undefined},{...saved(),version:2},{...saved(),result:'miss'},{...saved(),naturalOneAutoFails:undefined},{...saved(),criticalOnHit:'true'},{...saved(),total:NaN}])('rejects missing, malformed or inconsistent evidence %j',value=>{
 expect(readAttackRollSnapshot(value)).toBeNull();
});
it('preserves house rules and the cause of critical damage',()=>{
 expect(readAttackRollSnapshot({...saved(),d20:1,naturalOneAutoFails:false})).not.toBeNull();
 expect(readAttackRollSnapshot({...saved(),d20:1})).toBeNull();
 expect(readAttackRollSnapshot({...saved(),criticalOnHit:true,result:'crit'})).not.toBeNull();
 expect(readAttackRollSnapshot({...saved(),criticalOnHit:true,result:'crit',total:14})).toBeNull();
 expect(readAttackRollSnapshot({...saved(),d20:20,result:'crit',total:1})).not.toBeNull();
});
