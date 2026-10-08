import {acceptConcentrationReceipt} from './characterRealtime';
import {expect,it} from 'vitest';
import type {Character} from '../types';
import {acceptPsionicHitDiceReceipt,isCombatHpCarryover,preservePsionicResources,acceptSavedPsionicResources,acceptPsionicRestReceipt,acceptPsionicEnergyReceipt,reconcileCharacterUpdate} from './characterRealtime';
const character={id:'pc',current_hp:20,hit_dice_spent:2,feature_uses:{'Telepathic Connection':1},class_resources:{'psionic-energy-dice':2}} as unknown as Character;
it('accepts consecutive echoes before a React render, including a return to the original value',()=>{
 const ref={current:character};
 expect(reconcileCharacterUpdate(ref,{feature_uses:{}},{}).patch).toEqual({feature_uses:{}});
 expect(reconcileCharacterUpdate(ref,{feature_uses:character.feature_uses},{}).patch).toEqual({feature_uses:character.feature_uses});
 expect(ref.current.feature_uses).toEqual({'Telepathic Connection':1});
});
it('preserves queued local resource values while applying unrelated remote damage',()=>{
 const ref={current:character};
 const {previous,patch}=reconcileCharacterUpdate(ref,{current_hp:12,feature_uses:{},hit_dice_spent:0},
  {feature_uses:character.feature_uses,hit_dice_spent:3});
 expect(previous).toBe(character);
 expect(patch).toEqual({current_hp:12,hit_dice_spent:3,hit_dice_spent_by_type:null});
 expect(ref.current.feature_uses).toEqual(character.feature_uses);
});
it('ignores non-syncable fields and unchanged objects; applies zero, null and empty arrays',()=>{
 const ref={current:character};
 expect(reconcileCharacterUpdate(ref,{name:'remote rename',feature_uses:{'Telepathic Connection':1}},{}).patch).toEqual({});
 expect(ref.current).toBe(character);
 expect(reconcileCharacterUpdate(ref,{current_hp:0,concentration_rounds_remaining:null,active_conditions:[]},{}).patch)
  .toEqual({current_hp:0,concentration_rounds_remaining:null,active_conditions:[]});
});

it('ignores delayed Hit Point Dice receipts but accepts newer rest recovery',()=>{
 const ref={current:{...character,hit_dice_spent:3,psionic_hit_dice_revision:2}};
 expect(reconcileCharacterUpdate(ref,{hit_dice_spent:2,psionic_hit_dice_revision:1},{}).patch).toEqual({});
 expect(reconcileCharacterUpdate(ref,{hit_dice_spent:0,psionic_hit_dice_revision:3},{}).patch).toEqual({hit_dice_spent:0,psionic_hit_dice_revision:3});
 expect(reconcileCharacterUpdate(ref,{hit_dice_spent:3,psionic_hit_dice_revision:2},{}).patch).toEqual({});
});
it('keeps a queued local rest while recording the paid receipt revision',()=>{
 const ref={current:{...character,psionic_hit_dice_revision:0}};
 expect(reconcileCharacterUpdate(ref,{hit_dice_spent:3,psionic_hit_dice_revision:1},{hit_dice_spent:0}).patch).toEqual({hit_dice_spent:0,hit_dice_spent_by_type:null,psionic_hit_dice_revision:1});
});

it('accepts Energy Dice payments without replacing unrelated resources or feature uses',()=>{
 const ref={current:{...character,class_resources:{'psionic-energy-dice':6,Other:8},psionic_energy_revision:1}};
 acceptPsionicEnergyReceipt(ref,{remaining:4,energyRevision:2,restorationResource:null,restorationUsed:null});
 expect(ref.current.class_resources).toEqual({'psionic-energy-dice':4,Other:8});expect(ref.current.feature_uses).toEqual({'Telepathic Connection':1});
 acceptPsionicEnergyReceipt(ref,{remaining:5,energyRevision:1,restorationResource:0,restorationUsed:1});
 expect(ref.current.class_resources).toEqual({'psionic-energy-dice':4,Other:8});expect(ref.current.feature_uses).toEqual({'Telepathic Connection':1});
});
it('keeps newer Restoration recovery while accepting unrelated changes from an older echo',()=>{
 const ref={current:{...character,psionic_energy_revision:3}};
 acceptPsionicEnergyReceipt(ref,{remaining:6,energyRevision:4,restorationResource:0,restorationUsed:1});
 reconcileCharacterUpdate(ref,{class_resources:{'psionic-energy-dice':1,Other:9},feature_uses:{Other:2},psionic_energy_revision:3},{});
 expect(ref.current.class_resources).toEqual({'psionic-energy-dice':6,'psionic-restoration':0,Other:9});
 expect(ref.current.feature_uses).toEqual({'Psionic Restoration':1,'Telepathic Connection':1,Other:2});expect(ref.current.psionic_energy_revision).toBe(4);
 acceptPsionicEnergyReceipt(ref,{remaining:6,energyRevision:5,restorationResource:1,restorationUsed:null,connectionUsed:null});
 expect(ref.current.feature_uses).toEqual({Other:2});expect(ref.current.class_resources?.['psionic-restoration']).toBe(1);
});

it('a delayed rest preserves newer HP, exhaustion and sibling resources while acknowledging its dice',()=>{
 const ref={current:{...character,current_hp:12,exhaustion_level:1,class_resources:{'psionic-energy-dice':2,Other:9},psionic_energy_revision:1}};
 const expected={current_hp:20,exhaustion_level:2,class_resources:{'psionic-energy-dice':2,Other:7},feature_uses:character.feature_uses};
 const saved={...character,current_hp:40,exhaustion_level:1,class_resources:{'psionic-energy-dice':6,Other:7},feature_uses:{},psionic_energy_revision:2};
 acceptPsionicRestReceipt(ref,{character:saved,expected});
 expect(ref.current).toMatchObject({current_hp:12,exhaustion_level:1,class_resources:{'psionic-energy-dice':6,Other:9},feature_uses:{}});
});
it('rest receipts restore unchanged captured fields, preserve pending edits and reject old dice revisions',()=>{
 const ref={current:{...character,psionic_energy_revision:5,psionic_hit_dice_revision:4}};
 acceptPsionicRestReceipt(ref,{character:{...character,current_hp:40,hit_dice_spent:0,psionic_energy_revision:4,psionic_hit_dice_revision:3,class_resources:{'psionic-energy-dice':6}},expected:{current_hp:20,hit_dice_spent:2,class_resources:character.class_resources}},{current_hp:17});
 expect(ref.current).toMatchObject({current_hp:17,hit_dice_spent:2,psionic_energy_revision:5,class_resources:{'psionic-energy-dice':2}});
});

it('ordinary edits preserve only protected Psion keys, including missing legacy counters',()=>{
 const current={...character,class_name:'Psion'};
 expect(preservePsionicResources(current,{class_resources:{'psionic-energy-dice':6,'psionic-restoration':1,Other:9},feature_uses:{'Telepathic Connection':0,Other:2}})).toEqual({class_resources:{'psionic-energy-dice':2,Other:9},feature_uses:{'Telepathic Connection':1,Other:2}});
 const other={...current,class_name:'Fighter'},patch={class_resources:{Other:9}};expect(preservePsionicResources(other,patch)).toBe(patch);
});
it('queued whole-resource edits cannot replace a newer payment receipt',()=>{
 const ref={current:{...character,class_name:'Psion',psionic_energy_revision:1}};
 acceptPsionicEnergyReceipt(ref,{remaining:1,energyRevision:2,restorationResource:null,restorationUsed:null},{class_resources:{'psionic-energy-dice':2,Other:9}});
 expect(ref.current.class_resources).toEqual({'psionic-energy-dice':1,Other:9});
});
it('ordinary-save acknowledgements repair a stale tab while keeping its unrelated pending fields',()=>{
 const ref={current:{...character,class_name:'Psion',psionic_energy_revision:1}};
 const saved={...ref.current,class_resources:{'psionic-energy-dice':1,Other:5},feature_uses:{'Telepathic Connection':2},psionic_energy_revision:2};
 acceptSavedPsionicResources(ref,saved,{class_resources:{'psionic-energy-dice':2,Other:9}});
 expect(ref.current.class_resources).toEqual({'psionic-energy-dice':1,Other:9});expect(ref.current.feature_uses).toEqual({'Telepathic Connection':2});
 expect(acceptSavedPsionicResources(ref,{...saved,id:'different'}).patch).toEqual({});
});

it('identifies HP carry-over without suppressing later genuine damage',()=>{
 expect(isCombatHpCarryover({}, {combat_hp_sync_id:'first',current_hp:9})).toBe(true);
 expect(isCombatHpCarryover({combat_hp_sync_id:'first'}, {combat_hp_sync_id:'second',current_hp:8})).toBe(true);
 expect(isCombatHpCarryover({combat_hp_sync_id:'first'}, {combat_hp_sync_id:'first',current_hp:8})).toBe(false);
 expect(isCombatHpCarryover({combat_hp_sync_id:'first'}, {current_hp:8})).toBe(false);
 expect(isCombatHpCarryover({}, {combat_hp_sync_id:null,current_hp:8})).toBe(false);
});

it('accepts spell lists and their source metadata together, including cleared selections',()=>{
 const ref={current:{...character,known_spells:['old'],prepared_spells:['old'],spell_sources:{old:['class:Psion']}} as Character};
 const incoming={known_spells:['next'],prepared_spells:['next'],spell_sources:{next:['class:Psion']}};
 expect(reconcileCharacterUpdate(ref,incoming,{}).patch).toEqual(incoming);
 expect(ref.current.known_spells).toEqual(['next']);
 expect(reconcileCharacterUpdate(ref,{known_spells:[],prepared_spells:[],spell_sources:{}},{}).patch)
  .toEqual({known_spells:[],prepared_spells:[],spell_sources:{}});
});

it('syncs independent preparation and preserves explicit empty review entries',()=>{
 const ref={current:{...character,spell_preparation_sources:{armor:['class:Psion']},prepared_spells:['armor']} as Character};
 const patch={spell_preparation_sources:{armor:[]},prepared_spells:[]};
 expect(reconcileCharacterUpdate(ref,patch,{}).patch).toEqual(patch);
 expect(ref.current.spell_preparation_sources).toEqual({armor:[]});
 expect(reconcileCharacterUpdate(ref,{spell_preparation_sources:{}},{}).patch).toEqual({spell_preparation_sources:{}});
});

it('protects secondary Psion resources from stale ordinary edits and adopts paid receipts',()=>{
 const c={...character,class_name:'Fighter',level:11,secondary_class:'Psion',secondary_level:5};
 expect(preservePsionicResources(c,{class_resources:{'psionic-energy-dice':6,Other:9}})).toMatchObject({class_resources:{'psionic-energy-dice':2,Other:9}});
 const ref={current:c};const saved={...c,class_resources:{'psionic-energy-dice':1},psionic_energy_revision:10};
 acceptSavedPsionicResources(ref,saved);
 expect(ref.current.class_resources?.['psionic-energy-dice']).toBe(1);expect(ref.current.class_name).toBe('Fighter');
});

it('accepts casting context without replaying a save and ignores an older casting receipt',()=>{
 const ref={current:{id:'hero',concentration_spell:'detect-magic',concentration_revision:3,concentration_casting_context:null} as Character};
 const context={requestId:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',spellId:'invisibility',slotLevel:2,rounds:100,source:'class:Psion' as const,ability:'intelligence' as const};
 const result=acceptConcentrationReceipt(ref,{concentration_spell:'invisibility',concentration_revision:4,concentration_casting_context:context,concentration_slot_level:2,name:'Unrelated stale name'});
 expect(result.patch).toMatchObject({concentration_spell:'invisibility',concentration_revision:4,concentration_casting_context:context});expect(result.patch.name).toBeUndefined();
 expect(acceptConcentrationReceipt(ref,{concentration_spell:'detect-magic',concentration_revision:3,concentration_casting_context:null}).patch).toEqual({});
 expect(ref.current.concentration_casting_context).toEqual(context);
});

it('keeps die-size allocation and spending together across late payment receipts',()=>{
 const ref={current:{...character,psionic_hit_dice_revision:1,hit_dice_spent_by_type:{'6':2}}};
 acceptPsionicHitDiceReceipt(ref,{hitDiceSpent:3,hitDiceRevision:2,hitDiceSpentByType:{'6':2,'10':1}});
 expect(ref.current).toMatchObject({hit_dice_spent:3,hit_dice_spent_by_type:{'6':2,'10':1}});
 acceptPsionicHitDiceReceipt(ref,{hitDiceSpent:2,hitDiceRevision:1,hitDiceSpentByType:{'6':2}});
 expect(ref.current).toMatchObject({hit_dice_spent:3,hit_dice_spent_by_type:{'6':2,'10':1},psionic_hit_dice_revision:2});
});
it('legacy payments cannot leave an obsolete known allocation attached to a new total',()=>{
 const ref={current:{...character,hit_dice_spent_by_type:{'6':2}}};
 acceptPsionicHitDiceReceipt(ref,{hitDiceSpent:3,hitDiceRevision:1});
 expect(ref.current).toMatchObject({hit_dice_spent:3,hit_dice_spent_by_type:null});
});
it('does not pair incoming pool spending with a different queued rest total',()=>{
 const ref={current:{...character,hit_dice_spent_by_type:{'6':2}}};
 acceptPsionicHitDiceReceipt(ref,{hitDiceSpent:3,hitDiceRevision:1,hitDiceSpentByType:{'6':2,'10':1}},{hit_dice_spent:0});
 expect(ref.current).toMatchObject({hit_dice_spent:0,hit_dice_spent_by_type:null});
});
it('Long Rest receipts clear per-size spending with the aggregate',()=>{
 const ref={current:{...character,hit_dice_spent_by_type:{'6':2},psionic_hit_dice_revision:1}};
 acceptPsionicRestReceipt(ref,{character:{...ref.current,hit_dice_spent:0,hit_dice_spent_by_type:{},psionic_hit_dice_revision:2},expected:{hit_dice_spent:2}});
 expect(ref.current).toMatchObject({hit_dice_spent:0,hit_dice_spent_by_type:{},psionic_hit_dice_revision:2});
});
