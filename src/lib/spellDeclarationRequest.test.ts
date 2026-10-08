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
