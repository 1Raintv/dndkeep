import {expect,it} from 'vitest';
import type {Character} from '../types';
import {createPsionicRestRequest,validPsionicRestRequest,LONG_REST_FIELDS} from './psionicRestRequest';
const character={id:'hero',class_name:'Psion',level:7,max_hp:40,class_resources:{'psionic-energy-dice':2},feature_uses:{},spell_slots:{}} as unknown as Character;
const patch={class_resources:{'psionic-energy-dice':3},feature_uses:{},spell_slots:{}};
it('freezes the expected resources and proposed recovery independently of later edits',()=>{
 const c=structuredClone(character),updates=structuredClone(patch),request=createPsionicRestRequest(c,'short',updates,'stable');
 c.class_resources!['psionic-energy-dice']=0;updates.class_resources['psionic-energy-dice']=6;
 expect(request.expected.class_resources).toEqual({'psionic-energy-dice':2});expect(request.updates.class_resources).toEqual({'psionic-energy-dice':3});
 expect(request.expected.secondary_class).toBeNull();expect(validPsionicRestRequest(JSON.parse(JSON.stringify(request)))).toBe(true);
});
it('preserves item recharge outcomes and rejects missing or unexpected fields',()=>{
 const updates:Record<string,unknown>=Object.fromEntries(LONG_REST_FIELDS.map(key=>[key,null]));Object.assign(updates,{class_resources:{},feature_uses:{},inventory:[{id:'wand',charges_current:5}]});
 const request=createPsionicRestRequest(character,'long',updates as Partial<Character>,'rest');
 (updates.inventory as {charges_current:number}[])[0].charges_current=7;
 expect(request.updates.inventory).toEqual([{id:'wand',charges_current:5}]);
 expect(validPsionicRestRequest({...request,updates:{...request.updates,name:'unexpected'}})).toBe(false);
 const missing=structuredClone(request);delete missing.expected.max_hp;expect(validPsionicRestRequest(missing)).toBe(false);
 expect(()=>createPsionicRestRequest(character,'long',patch,'rest')).toThrow('Incomplete');
});
it.each([null,[],{}, {requestId:'id',restKind:'other'}, {requestId:'id',restKind:'short',sourceFeature:'Long Rest',updates:patch,expected:{}}])('rejects malformed recovery records: %j',value=>expect(validPsionicRestRequest(value)).toBe(false));
