import {expect,it,vi} from 'vitest';
import type {ComputedStats,InventoryItem,SpeciesTrait} from '../types';
vi.mock('./hooks/useMagicItems',()=>({getMagicItemById:()=>undefined}));
vi.mock('./attunement',()=>({itemRequiresAttunement:()=>false}));
import {inventoryItemToWeapon,naturalWeaponToWeapon} from './inventoryWeapon';
const stats=(str=4,dex=1)=>({modifiers:{strength:str,dexterity:dex,intelligence:5},proficiency_bonus:3}) as ComputedStats;
const item=(name:string,range:string|undefined,properties='')=>({id:'weapon',name,range,properties,damage:'1d8 slashing',equipped:true,category:'Weapon'}) as InventoryItem;
it.each([
 ['Greatsword','5 ft.','Heavy, Two-Handed'],['Glaive','10 ft.','Reach'],['Mace','5 ft.',''],
 ['Handaxe','5 ft. / 20/60 ft.','Light, Thrown'],['Javelin','30/120 ft.','Thrown'],['Spear','Ranged (20/60 ft.)','Thrown'],
 ['Greatsword +1',undefined,''],['Custom melee blade','5 ft.',''],['Custom thrown axe','20/60 ft.','Thrown'],
] as const)('%s uses Strength even when range text lacks the word Melee',(name,range,properties)=>{
 const w=inventoryItemToWeapon(item(name,range,properties),stats());expect(w.attackBonus).toBe(7);expect(w.damageBonus).toBe(4);expect(w.attackAbilityModifier).toBe(4);
});
it.each(['Shortbow','Longbow','Sling','Light Crossbow','Musket','Pistol'])('%s keeps Dexterity without range text',name=>{
 const w=inventoryItemToWeapon(item(name,undefined),stats());expect(w.attackBonus).toBe(4);expect(w.damageBonus).toBe(1);expect(w.attackAbilityModifier).toBe(1);
});
it.each(['Dagger','Rapier','Scimitar','Shortsword','Whip','Dart'])('%s preserves Finesse even if inventory properties are missing',name=>{
 expect(inventoryItemToWeapon(item(name,undefined),stats(1,4)).attackBonus).toBe(7);
 expect(inventoryItemToWeapon(item(name,undefined),stats(4,1)).attackBonus).toBe(7);
});
it.each(['80/320 ft.','Ranged (80/320 ft.)'])('custom ranged weapon %s still uses Dexterity',range=>{
 expect(inventoryItemToWeapon(item('Custom crossbow',range),stats()).attackBonus).toBe(4);
});
it('keeps magic and proficiency bonuses out of the captured ability contribution',()=>{
 const w=inventoryItemToWeapon({...item('Greatsword','5 ft.'),attackBonus:2,damageBonus:2} as InventoryItem,stats());
 expect(w).toMatchObject({attackBonus:9,damageBonus:6,attackAbilityModifier:4});
});
it('natural weapons retain an explicitly selected nonphysical ability',()=>{
 const trait={name:'Mind claw',naturalWeapon:{ability:'INT',dice:'1d6',damageType:'Psychic'}} as SpeciesTrait;
 expect(naturalWeaponToWeapon(trait,stats())).toMatchObject({attackBonus:8,damageBonus:5,attackAbilityModifier:5});
});
