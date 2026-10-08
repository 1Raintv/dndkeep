import {expect,it} from 'vitest';
import type {Character} from '../types';
import {createDisciplineRequest,validDisciplineRequest,validDisciplineOutcomeRequest,validPsionicTurn} from './psionicDisciplineRequest';
const c={class_name:'Psion',level:5,intelligence:18,inventory:[{name:'Headband'}],class_resources:{'psion-disciplines':['Biofeedback']}} as unknown as Character;
it('freezes class, ability, inventory, learned picks, original rolls and turn',()=>{
 const hero=structuredClone(c),turn={soloTurn:2},rolls=[4,3];
 const r=createDisciplineRequest(hero,turn,'biofeedback',rolls,2,4,'saved');
 rolls[0]=8;turn.soloTurn=3;hero.intelligence=20;hero.inventory=[];hero.class_resources={};
 expect(r).toMatchObject({rolls:[4,3],turn:{soloTurn:2},expected:{intelligence:18,inventory:[{name:'Headband'}],disciplines:['Biofeedback'],secondary_class:null,secondary_level:null}});
 expect(validDisciplineRequest(r)).toBe(true);
});
it.each([{soloTurn:-1},{soloTurn:0,encounterId:'other'},{encounterId:'fight',round:1,index:0},{encounterId:'fight',round:1,index:0,turnId:''},[]])('rejects ambiguous/incomplete turn %j',turn=>expect(validPsionicTurn(turn)).toBe(false));
it('allows Guards to spend one unrolled die, but not a fabricated Guards roll',()=>{
 const r=createDisciplineRequest(c,{soloTurn:0},'psionic-guards',[],1,4,'guards');
 expect(validDisciplineRequest(r)).toBe(true);expect(validDisciplineRequest({...r,rolls:[4]})).toBe(false);
});
it.each([{count:0},{count:13},{count:2.5},{rolls:[0,3]},{rolls:[13,3]},{rolls:[3]},{sourceFeature:'Other'},{modifier:1.5},{expected:{}},{discipline:'constructor'}])('rejects malformed captured request %j',patch=>{
 const r=createDisciplineRequest(c,{soloTurn:0},'biofeedback',[2,3],2,4,'saved');
 expect(validDisciplineRequest({...r,...patch})).toBe(false);
});
it('requires a boolean outcome on a conditional discipline only',()=>{
 const r=createDisciplineRequest(c,{soloTurn:0},'inerrant-aim',[4],1,4,'saved');
 expect(validDisciplineOutcomeRequest({...r,changedOutcome:false})).toBe(true);
 expect(validDisciplineOutcomeRequest({...r,changedOutcome:'false'})).toBe(false);
 expect(validDisciplineOutcomeRequest({...r,discipline:'biofeedback',sourceFeature:'Biofeedback',changedOutcome:true})).toBe(false);
});
