import {expect,it} from 'vitest';
import {removeConditions} from './conditionRemoval';
it('waking leaves Prone without inherited save, expiry or caster metadata',()=>{
 const sources={Unconscious:{source:'spell:sleep'},Prone:{source:'cascade:Unconscious',expires_at_round:2,save_to_end:{dc:12},casterParticipantId:'caster'},Incapacitated:{source:'cascade:Unconscious'}};
 expect(removeConditions(['Unconscious','Prone','Incapacitated'],sources,['Unconscious'])).toEqual({conditions:['Prone'],sources:{Prone:{source:'fall:Unconscious'}},removed:['Unconscious','Incapacitated']});
 expect(sources.Prone.expires_at_round).toBe(2);
});
it.each(['Unconscious','Paralyzed','Stunned','Petrified'])('keeps incapacity required by remaining %s, then ends it with the last parent',parent=>{
 const ending=parent==='Paralyzed'?'Stunned':'Paralyzed';
 const result=removeConditions([ending,'Incapacitated',parent],{[ending]:{source:'spell:hold'},Incapacitated:{source:`cascade:${ending}`}},[ending]);
 expect(result.conditions).toEqual(['Incapacitated',parent]);expect(result.sources.Incapacitated).toEqual({source:`cascade:${parent}`});
 expect(removeConditions(result.conditions,result.sources,[parent]).conditions).toEqual([]);
});
it('preserves independently sourced Incapacitated and Prone',()=>{
 const sources={Incapacitated:{source:'spell:other'},Prone:{source:'manual'}};
 expect(removeConditions(['Stunned','Incapacitated','Prone'],sources,['Stunned'])).toEqual({conditions:['Incapacitated','Prone'],sources,removed:['Stunned']});
});
it('ends multiple parents together without retagging to an ending condition',()=>{
 expect(removeConditions(['Stunned','Paralyzed','Incapacitated'],{Incapacitated:{source:'cascade:Stunned'}},['Stunned','Paralyzed']).conditions).toEqual([]);
});
it('cannot remove implied Incapacitated while a parent remains',()=>{
 expect(removeConditions(['Stunned','Incapacitated'],{Incapacitated:{source:'cascade:Stunned'}},['Incapacitated']).conditions).toEqual(['Stunned','Incapacitated']);
});
it('explicitly removing Prone is separate from waking',()=>{
 expect(removeConditions(['Unconscious','Prone'],{Prone:{source:'cascade:Unconscious'}},['Unconscious','Prone']).conditions).toEqual([]);
});
it('missing condition removal is a no-op; untracked manual conditions survive',()=>{
 expect(removeConditions(['Prone','Incapacitated'],{},['Unconscious'])).toEqual({conditions:['Prone','Incapacitated'],sources:{},removed:[]});
});
