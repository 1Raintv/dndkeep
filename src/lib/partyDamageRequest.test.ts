import {afterEach,expect,it,vi} from 'vitest';
vi.mock('./hooks/useMagicItems',()=>({getMagicItemById:(id:string)=>({requiresAttunement:true,...(id==='amulet'?{abilityOverride:{ability:'constitution',value:19}}:{})})}));
import {createPartyDamageRequest,previewPartyDamage,validPartyDamageRequest,verifyPartyDamageReceipt,type PartyDamageContext} from './partyDamageRequest';
const char='11111111-1111-4111-8111-111111111111',campaign='22222222-2222-4222-8222-222222222222',user='33333333-3333-4333-8333-333333333333';
const context=():PartyDamageContext=>({character:{id:char,name:'Hero',species:'Human',strength:10,dexterity:10,constitution:14,intelligence:10,wisdom:10,charisma:10,inventory:[],damage_resistances:['psychic'],damage_vulnerabilities:['psychic'],damage_immunities:[],concentration_spell:'detect-magic',hit_point_revision:0,active_conditions:[],automation_overrides:{},advanced_automations_unlocked:false},campaign:{id:campaign,automation_defaults:{}},participant:null,combatant:null,pools:{current_hp:40,max_hp:50,temp_hp:5}});

it('keeps raw damage and typed rounding separate from temporary HP absorption',()=>{
 const r=createPartyDamageRequest(context(),23,'psychic',false);expect(r).toMatchObject({amount:23,damage:22,affinity:'resistant-vulnerable',modifier:2});
 expect(previewPartyDamage(context(),23,'psychic',false)).toMatchObject({final:22,tempAfter:0,hpAfter:23,absorbedByTemp:5,concentration:{kind:'save',dc:11}});
 expect(previewPartyDamage(context(),47,'psychic',true).final).toBe(22);expect(validPartyDamageRequest({...r,damage:23})).toBe(false);
});
it('captures a detached context and uses equipped attuned CON overrides',()=>{
 const ctx=context();ctx.character.inventory=[{magic_item_id:'amulet',equipped:true,attuned:true} as NonNullable<typeof ctx.character.inventory>[number]];
 const r=createPartyDamageRequest(ctx,5,null,false);expect(r.modifier).toBe(4);ctx.pools.current_hp=1;expect(r.expected.pools.current_hp).toBe(40);
 ctx.character.inventory[0].attuned=false;expect(createPartyDamageRequest(ctx,5,null,false).modifier).toBe(2);
});
it('condition resistance never stacks with typed resistance and untyped bypass stays explicit',()=>{
 const ctx=context();ctx.character.active_conditions=['Petrified'];
 expect(previewPartyDamage(ctx,23,'fire',false)).toMatchObject({final:11,concentration:{kind:'ends'}});
 expect(previewPartyDamage(ctx,23,'psychic',false).final).toBe(22);expect(previewPartyDamage(ctx,23,null,false).final).toBe(23);
});
it('uses combat conditions instead of stale sheet conditions',()=>{
 const ctx=context();ctx.character.active_conditions=['Petrified'];ctx.participant={id:user,encounter_id:campaign,combatant_id:char};ctx.combatant={id:char,...ctx.pools,active_conditions:[]};
 expect(previewPartyDamage(ctx,23,'fire',false).final).toBe(23);
});
it('immunity and automation-off previews do not invent a concentration check',()=>{
 const ctx=context();ctx.character.damage_immunities=['psychic'];expect(previewPartyDamage(ctx,23,'psychic',false).concentration.kind).toBe('none');
 ctx.campaign.automation_defaults={concentration_on_damage:'off'};expect(previewPartyDamage(ctx,1,null,false).concentration.kind).toBe('off');expect(previewPartyDamage(ctx,45,null,false).concentration.kind).toBe('ends');
});
it('rejects invalid amount or context before creating a usable request',()=>{
 expect(()=>createPartyDamageRequest(context(),1.5,null,false)).toThrow();const ctx=context();ctx.character.hit_point_revision=undefined;expect(()=>createPartyDamageRequest(ctx,5,null,false)).toThrow();
});
it('verifies original pool math while accepting newer current HP on replay',()=>{
 const r=createPartyDamageRequest(context(),23,'psychic',false);
 const receipt={requestId:r.requestId,saveId:r.saveId,damage:22,damageType:'psychic',beforeHP:40,beforeTempHP:5,afterHP:23,afterTempHP:0,checkId:r.saveId,concentrationBroken:false,automation:'prompt',participantId:null,replayed:true,character:{id:char,current_hp:45,max_hp:50,temp_hp:0,hit_point_revision:2}};
 expect(verifyPartyDamageReceipt(receipt,r).character.current_hp).toBe(45);expect(()=>verifyPartyDamageReceipt({...receipt,afterHP:22},r)).toThrow();expect(()=>verifyPartyDamageReceipt({...receipt,checkId:null},r)).toThrow();expect(()=>verifyPartyDamageReceipt({...receipt,concentrationBroken:true,checkId:null},r)).toThrow();
});

it('captures the chosen legacy in party damage previews and saved requests',()=>{
 const ctx=context();ctx.character.species='Tiefling';ctx.character.species_choices={tieflingLegacy:'abyssal'};
 const r=createPartyDamageRequest(ctx,23,'poison',false);expect(r.damage).toBe(11);expect(r.expected.character.species_choices).toEqual({tieflingLegacy:'abyssal'});
 ctx.character.species_choices.tieflingLegacy='infernal';expect(r.expected.character.species_choices?.tieflingLegacy).toBe('abyssal');
 expect(previewPartyDamage(ctx,23,'poison',false).final).toBe(23);
});

it('preserves pre-upgrade saved calculation validation without reintroducing old defaults into new previews',()=>{
 const ctx=context();ctx.character.species='Goliath';
 const fresh=createPartyDamageRequest(ctx,23,'cold',false);expect(fresh.damage).toBe(23);expect(fresh.affinityRules).toBe(2);
 const legacy={...fresh,affinityRules:undefined,damage:11,affinity:'resistant' as const};
 expect(validPartyDamageRequest(legacy)).toBe(true);expect(validPartyDamageRequest({...legacy,damage:10})).toBe(false);
 expect(validPartyDamageRequest({...legacy,affinityRules:2})).toBe(false);
});

afterEach(()=>vi.restoreAllMocks());
it('includes eligible equipment and persists signed effects without proficiency or exhaustion twice',()=>{
 vi.spyOn(Math,'random').mockReturnValue(0);const ctx=context();ctx.character.exhaustion_level=2;
 ctx.character.inventory=[{magic_item_id:'ring-protection',name:'Ring',magical:true,equipped:true,attuned:true,saveBonus:1} as NonNullable<typeof ctx.character.inventory>[number]];
 ctx.character.active_buffs=[{name:'Bless',saveBonus:0},{name:'Penalty',saveBonus:-2}];
 const r=createPartyDamageRequest(ctx,5,null,false);expect(r.baseModifier).toBe(3);expect(r.modifier).toBe(2);expect(r.effectRolls?.map(x=>x.total)).toEqual([1,-2]);expect(validPartyDamageRequest(r)).toBe(true);
 r.effectRolls![0].total=4;expect(validPartyDamageRequest(r)).toBe(false);
});
it('uses active combat effects rather than stale sheet buffs',()=>{
 const ctx=context();ctx.character.active_buffs=[{name:'Bless'}];ctx.participant={id:user,encounter_id:campaign,combatant_id:char};ctx.combatant={id:char,...ctx.pools,active_conditions:[],active_buffs:[{name:'Penalty',saveBonus:-2}]};
 expect(createPartyDamageRequest(ctx,5,null,false).modifier).toBe(0);
});
it('does not roll save effects for zero HP, immunity or disabled automation',()=>{
 const random=vi.spyOn(Math,'random'),ctx=context();ctx.character.active_buffs=[{name:'Bless'}];
 expect(createPartyDamageRequest(ctx,100,null,false).effectRolls).toEqual([]);
 ctx.character.damage_immunities=['psychic'];expect(createPartyDamageRequest(ctx,5,'psychic',false).effectRolls).toEqual([]);
 ctx.campaign.automation_defaults={concentration_on_damage:'off'};expect(createPartyDamageRequest(ctx,5,null,false).effectRolls).toEqual([]);expect(random).not.toHaveBeenCalled();
});

it('rejects persisted concentration bonus dice changed without changing their total',()=>{
 vi.spyOn(Math,'random').mockReturnValue(0);const ctx=context();ctx.character.active_buffs=[{name:'Bless'}];
 const request=createPartyDamageRequest(ctx,5,null,false);expect(validPartyDamageRequest(request)).toBe(true);
 request.effectRolls![0].dice[0].die=20;expect(validPartyDamageRequest(request)).toBe(false);
});
