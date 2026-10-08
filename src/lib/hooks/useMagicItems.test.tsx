// @vitest-environment happy-dom
import {cleanup,renderHook,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({order:vi.fn(),select:vi.fn()}));
vi.mock('../supabase',()=>({supabase:{from:()=>({select:mocks.select})}}));
import {getMagicItemById,invalidateMagicItemsCache,useMagicItems} from './useMagicItems';
import {getEffectiveAbilityScores} from '../attunement';
import type {InventoryItem} from '../../types';
const base={strength:10,dexterity:10,constitution:10,intelligence:10,wisdom:10,charisma:10};
const row={id:'headband-of-intellect',owner_id:null,source:'srd',name:'Headband of Intellect',item_type:'wondrous',rarity:'uncommon',requires_attunement:true,description:'Database description',weight:0,ac_bonus:null,save_bonus:null,attack_bonus:null,damage_bonus:null,max_charges:null,recharge:null,recharge_dice:null,base_damage_dice:null};
const item={magic_item_id:'headband-of-intellect',equipped:true,attuned:true} as InventoryItem;
beforeEach(()=>{vi.resetAllMocks();invalidateMagicItemsCache();mocks.select.mockReturnValue({order:mocks.order});});
afterEach(()=>{cleanup();invalidateMagicItemsCache();});
async function load(rows:unknown[]){mocks.order.mockImplementation((field:string)=>field==='rarity'?{order:mocks.order}:Promise.resolve({data:rows,error:null}));const hook=renderHook(useMagicItems);await waitFor(()=>expect(hook.result.current.loading).toBe(false));return hook;}
it('keeps canonical ability effects after the database replaces the static entry',async()=>{
 expect(getEffectiveAbilityScores(base,[item]).intelligence).toBe(19);
 const hook=await load([row]);expect(hook.result.current.itemMap[row.id]).toMatchObject({description:'Database description',abilityOverride:{ability:'intelligence',value:19}});
 expect(getEffectiveAbilityScores(base,[item]).intelligence).toBe(19);
 expect(getEffectiveAbilityScores({...base,intelligence:20},[item]).intelligence).toBe(20);
 expect(getEffectiveAbilityScores(base,[{...item,attuned:false}]).intelligence).toBe(10);
 expect(getEffectiveAbilityScores(base,[{...item,equipped:false}]).intelligence).toBe(10);
});
it.each([{owner_id:'owner',source:'homebrew'},{owner_id:null,source:'expansion'}])('does not attach SRD mechanics to a noncanonical collision %j',async ownership=>{
 await load([{...row,...ownership}]);expect(getMagicItemById(row.id)?.abilityOverride).toBeUndefined();
 expect(getEffectiveAbilityScores(base,[item]).intelligence).toBe(10);
});
it('does not backfill unrelated database numeric fields or infer rules from a name',async()=>{
 const hook=await load([{...row,ac_bonus:2},{...row,id:'custom-headband',owner_id:'owner',source:'homebrew'}]);
 expect(hook.result.current.itemMap[row.id]).toMatchObject({acBonus:2,description:'Database description'});
 expect(hook.result.current.itemMap['custom-headband'].abilityOverride).toBeUndefined();
});
