import {expect,it} from 'vitest';
import type {Character,SpellData} from '../types';
import {createSpellDeclarationRequest,isSpellDeclarationRequest} from './spellDeclarationRequest';
const uuid='11111111-1111-4111-8111-111111111111';
const character={id:uuid,campaign_id:uuid,spell_slots:{3:{total:2,used:0}}} as unknown as Character;
const spell={id:'fly',name:'Fly',level:3,casting_time:'1 Action',range:'Touch',duration:'10 minutes'} as SpellData;
const source={source:'class:Psion',ability:'intelligence'} as const;
it('captures source, target and slot before later edits can change the intent',()=>{
 const c=structuredClone(character),request=createSpellDeclarationRequest(c,spell,uuid,uuid,3,source,'Ally',uuid);
 c.spell_slots[3].used=1;expect(request.expectedSlot).toEqual({total:2,used:0});
 expect(request.context).toMatchObject({source:'class:Psion',ability:'intelligence',target:'Ally',isBonusAction:false});
 expect(isSpellDeclarationRequest(JSON.parse(JSON.stringify(request)))).toBe(true);
});
it('cantrips never carry a slot debit or accept a leveled slot',()=>{
 const cantrip:SpellData={...spell,id:'light',name:'Light',level:0};
 expect(createSpellDeclarationRequest(character,cantrip,uuid,uuid,0,source,'',uuid).expectedSlot).toBeNull();
 expect(()=>createSpellDeclarationRequest(character,cantrip,uuid,uuid,3,source,'',uuid)).toThrow();
});
it.each([null,[],{}, {castId:'not-a-uuid'}])('rejects malformed disk data: %j',value=>expect(isSpellDeclarationRequest(value)).toBe(false));
it.each([2,4,10,3.5])('rejects missing or invalid slot level %i',level=>expect(()=>createSpellDeclarationRequest(character,spell,uuid,uuid,level,source,'',uuid)).toThrow());
it('rejects exhausted slots and a foreign-shaped source',()=>{
 expect(()=>createSpellDeclarationRequest({...character,spell_slots:{3:{total:1,used:1}}},spell,uuid,uuid,3,source,'',uuid)).toThrow();
 const request=createSpellDeclarationRequest(character,spell,uuid,uuid,3,source,'',uuid);
 expect(isSpellDeclarationRequest({...request,context:{...request.context,source:'unknown'}})).toBe(false);
});

it('captures the selected source DC for deferred effect choices',()=>{
 const request=createSpellDeclarationRequest(character,spell,uuid,uuid,3,{...source,saveDC:15},'',uuid);
 expect(request.context.saveDC).toBe(15);expect(isSpellDeclarationRequest(request)).toBe(true);
 expect(isSpellDeclarationRequest({...request,context:{...request.context,saveDC:NaN}})).toBe(false);
});
it('retains combat identity and rejects malformed cached targeting data',()=>{
 const request=createSpellDeclarationRequest(character,spell,uuid,uuid,3,{...source,saveDC:15},'Target',uuid);
 const combat={kind:'save',damageDice:'3d8+4',damageType:'Psychic',attackBonus:null,targetAC:null,saveAbility:'WIS',saveSuccessEffect:'half',actorCombatantId:uuid,target:{participantId:uuid,entityId:uuid,type:'character',combatantId:uuid}} as const;
 expect(isSpellDeclarationRequest({...request,context:{...request.context,combat}})).toBe(true);
 for(const invalid of [{...combat,target:null},{...combat,actorCombatantId:'bad'},{...combat,damageDice:''},{...combat,saveAbility:'LUCK'},{...combat,attackBonus:7},{...combat,attackMode:'ranged'},{...combat,target:{...combat.target,participantId:'bad'}}]){
  expect(isSpellDeclarationRequest({...request,context:{...request.context,combat:invalid}})).toBe(false);
 }
 expect(isSpellDeclarationRequest({...request,context:{...request.context,combat,saveDC:undefined}})).toBe(false);
});
it('requires real attack values and no saving throw on attack-roll intents',()=>{
 const request=createSpellDeclarationRequest(character,spell,uuid,uuid,3,{...source,saveDC:15},'Target',uuid);
 const combat={kind:'attack_roll',damageDice:'3d8',damageType:'Psychic',attackBonus:7,targetAC:15,saveAbility:null,saveSuccessEffect:null,actorCombatantId:null,target:{participantId:uuid,entityId:uuid,type:'character',combatantId:null}} as const;
 expect(isSpellDeclarationRequest({...request,context:{...request.context,combat}})).toBe(true);
 for(const invalid of [{...combat,targetAC:null},{...combat,attackBonus:Infinity},{...combat,attackBonus:0.5},{...combat,saveAbility:'WIS'},{...combat,attackMode:'touch'}])expect(isSpellDeclarationRequest({...request,context:{...request.context,combat:invalid}})).toBe(false);
});

it.each([['1 Action','action'],['1 Bonus Action','bonusAction'],['Reaction','reaction'],['Reaction, when a creature uses a Bonus Action','reaction']] as const)('saves the action kind for %s',(time,kind)=>{
 const r=createSpellDeclarationRequest(character,{...spell,casting_time:time},uuid,uuid,3,source,'',uuid);expect(r.context.actionKind).toBe(kind);
 expect(isSpellDeclarationRequest(r)).toBe(true);expect(isSpellDeclarationRequest({...r,context:{...r.context,isBonusAction:!r.context.isBonusAction}})).toBe(false);
});
