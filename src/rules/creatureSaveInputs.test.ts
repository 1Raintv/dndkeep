import {expect,it} from 'vitest';
import {creatureSaveInputs} from './creatureSaveInputs';
it.each(['int','INT','intelligence',' Intelligence '])('recognizes stored proficiency %s',name=>{
 expect(creatureSaveInputs('INT',{int:18},[name],'9')).toEqual({score:18,proficient:true,cr:9});
});
it.each([null,undefined,'', '5th','1/3',-1,31,NaN,Infinity,1.5])('requires review for proficient creature CR %s',cr=>{
 expect(creatureSaveInputs('INT',{int:18},['int'],cr)).toBeNull();
});
it.each(['1/8','1/4','1/2',0,4,5,8,9,28,29,30])('accepts standard CR %s without partial parsing',cr=>{
 expect(creatureSaveInputs('INT',{int:18},['int'],cr)?.proficient).toBe(true);
});
it.each([NaN,Infinity,0,31,10.5,'18',null,undefined])('requires review for missing/malformed score %s',int=>{
 expect(creatureSaveInputs('INT',{int},[],'1')).toBeNull();
});
it.each([null,undefined,'int',[3],['mystery']].map(profs=>({profs})))('requires an explicit valid proficiency list %j',({profs})=>{
 expect(creatureSaveInputs('INT',{int:18},profs,'1')).toBeNull();
});
it('does not require a CR for an explicitly nonproficient save',()=>{
 expect(creatureSaveInputs('INT',{int:18},['wis'],null)).toEqual({score:18,proficient:false,cr:null});
});
