// @vitest-environment happy-dom
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
vi.mock('./hooks/useMagicItems',()=>({getMagicItemById:()=>null}));
import {createPartyDamageRequest,type PartyDamageContext} from './partyDamageRequest';
import {savePartyDamage,savedPartyDamage,forgetPartyDamage} from './partyDamageRecovery';
const char='11111111-1111-4111-8111-111111111111',campaign='22222222-2222-4222-8222-222222222222',user='33333333-3333-4333-8333-333333333333';
const context=():PartyDamageContext=>({character:{id:char,name:'Hero',species:'Human',strength:10,dexterity:10,constitution:14,intelligence:10,wisdom:10,charisma:10,inventory:[],damage_resistances:['psychic'],damage_vulnerabilities:['psychic'],damage_immunities:[],concentration_spell:'detect-magic',hit_point_revision:0,active_conditions:[],automation_overrides:{},advanced_automations_unlocked:false},campaign:{id:campaign,automation_defaults:{}},participant:null,combatant:null,pools:{current_hp:40,max_hp:50,temp_hp:5}});

beforeEach(()=>localStorage.clear());afterEach(()=>vi.restoreAllMocks());
it('stores all original requests before returning and survives a fresh read',()=>{
 const request=createPartyDamageRequest(context(),23,'psychic',false),batch=savePartyDamage(user,campaign,[request]);
 expect(savedPartyDamage(user,campaign)).toEqual([batch]);request.damage=0;expect(savedPartyDamage(user,campaign)[0].requests[0].damage).toBe(22);
 expect(()=>savePartyDamage(user,campaign,[createPartyDamageRequest(context(),1,null,false)])).toThrow('saved damage first');forgetPartyDamage(batch);expect(savedPartyDamage(user,campaign)).toEqual([]);
});
it('does not overwrite or clear another batch and keeps accounts isolated',()=>{
 const batch=savePartyDamage(user,campaign,[createPartyDamageRequest(context(),1,null,false)]);
 expect(savedPartyDamage(char,campaign)).toEqual([]);const key=localStorage.key(0)!;localStorage.setItem(key,JSON.stringify({...batch,version:2}));
 expect(()=>savedPartyDamage(user,campaign)).toThrow('could not be verified');expect(()=>forgetPartyDamage(batch)).toThrow('changed');expect(localStorage.getItem(key)).not.toBeNull();
});
it('refuses invalid, duplicate-target and unwritable batches',()=>{
 const r=createPartyDamageRequest(context(),1,null,false);expect(()=>savePartyDamage(user,campaign,[r,r])).toThrow();
 vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('Storage full');});expect(()=>savePartyDamage(user,campaign,[r])).toThrow('Storage full');
});
