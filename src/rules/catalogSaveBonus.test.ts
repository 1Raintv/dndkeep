import {expect,it} from 'vitest';
import {catalogSaveBonus} from './catalogSaveBonus';
it('uses a listed total without adding score or proficiency twice',()=>{expect(catalogSaveBonus('INT',{int:18,saving_throws:{int:9}})).toBe(9);});
it.each(['INT','intelligence',' Intelligence '])('recognizes save alias %s',name=>{expect(catalogSaveBonus('INT',{saving_throws:{[name]:0}})).toBe(0);});
it('uses the score only when a known save map omits the ability',()=>{expect(catalogSaveBonus('STR',{str:9,saving_throws:{wis:5}})).toBe(-1);});
it('allows matching aliases but rejects contradictory ones',()=>{
 expect(catalogSaveBonus('INT',{saving_throws:{int:9,Intelligence:9}})).toBe(9);
 expect(catalogSaveBonus('INT',{saving_throws:{int:9,Intelligence:8}})).toBeNull();
});
it.each([null,undefined,[],{int:'9'},{int:NaN},{int:Infinity},{int:2.5},{unknown:4}])('keeps malformed or missing map %j unknown',saving_throws=>{expect(catalogSaveBonus('INT',{int:18,saving_throws})).toBeNull();});
it.each([null,undefined,0,31,10.5,Infinity])('does not invent a score from %s',int=>{expect(catalogSaveBonus('INT',{int,saving_throws:{}})).toBeNull();});
it('rejects unknown abilities',()=>{expect(catalogSaveBonus('mystery',{saving_throws:{}})).toBeNull();});
