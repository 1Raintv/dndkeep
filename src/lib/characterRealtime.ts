import {isHitDiceAllocation} from '../rules/hitDice';
import type {Character} from '../types';
// Keep the healing ceiling current when another sheet changes maximum HP.
const fields = [
 'spell_preparation_sources','spell_sources','known_spells','prepared_spells','combat_hp_sync_id','current_hp','max_hp','temp_hp','hit_point_revision','active_conditions','concentration_spell','concentration_rounds_remaining',
 'exhaustion_level','concentration_revision','concentration_casting_context','concentration_slot_level','spell_slots','death_saves_successes','death_saves_failures','inspiration',
 'hit_dice_spent','hit_dice_spent_by_type','psionic_hit_dice_revision','psionic_energy_revision','class_resources','feature_uses','currency','inventory','experience_points',
] as const;

/** v2.765 — publish the next comparison snapshot synchronously. Two realtime
 * events can arrive before React renders; comparing both to the old rendered
 * state can discard the newest event and leave the sheet stuck on the first.
 * Pending local fields remain authoritative until the save queue settles. */
export function reconcileCharacterUpdate(ref:{current:Character},incoming:Record<string,unknown>,pending:Partial<Character>) {
 const previous=ref.current;
 const patch:Partial<Character>={};
 const hpRevision=incoming.hit_point_revision;
 const staleHp=typeof hpRevision==='number'&&hpRevision<(previous.hit_point_revision??0);
 const revision=incoming.psionic_hit_dice_revision;
 const staleHitDice=typeof revision==='number'&&revision<(previous.psionic_hit_dice_revision??0);
 const energyRevision=incoming.psionic_energy_revision;
 const staleEnergy=typeof energyRevision==='number'&&energyRevision<(previous.psionic_energy_revision??0);
 const concentrationRevision=incoming.concentration_revision;
 const staleConcentration=typeof concentrationRevision==='number'&&concentrationRevision<(previous.concentration_revision??0);
 for(const field of fields) {
  if(staleHp&&['current_hp','max_hp','temp_hp','hit_point_revision'].includes(field))continue;
  if(staleConcentration&&field.startsWith('concentration_'))continue;
  // v2.782 — late acknowledgements/events cannot refund a newer paid cost.
  if(staleHitDice&&(field==='hit_dice_spent'||field==='hit_dice_spent_by_type'||field==='psionic_hit_dice_revision'))continue;
  if(staleEnergy&&field==='psionic_energy_revision')continue;
  let value=Object.prototype.hasOwnProperty.call(pending,field)?pending[field]:incoming[field];
  // Keep allocation and its aggregate together when an older local rest is pending.
  if(field==='hit_dice_spent_by_type'&&pending.hit_dice_spent!==undefined&&pending.hit_dice_spent!==incoming.hit_dice_spent)value=pending.hit_dice_spent_by_type??null;
  // Transaction-owned keys override pending whole-map edits. Older echoes
  // retain the latest paid keys while unrelated local edits stay pending.
  if(typeof energyRevision==='number'&&value!==undefined&&(field==='class_resources'||field==='feature_uses')&&(staleEnergy||incoming[field]!==undefined)){
   const restored={...(value as Record<string,unknown>|null)};
   const prior=(staleEnergy?previous[field]:incoming[field]) as Record<string,unknown>??{};
   for(const key of field==='class_resources'?['psionic-energy-dice','psionic-restoration']:['Psionic Restoration','Telepathic Connection','Free Misty Step (Teleportation)']){
    if(Object.prototype.hasOwnProperty.call(prior,key))restored[key]=prior[key];else delete restored[key];
   }
   value=restored;
  }
  if(value!==undefined&&JSON.stringify(value)!==JSON.stringify(previous[field]))
   (patch as Record<string,unknown>)[field]=value;
 }
 if(Object.keys(patch).length)ref.current={...previous,...patch};
 return {previous,patch};
}

/** Accept a server payment without enqueueing another absolute-value write. */
export function acceptPsionicHitDiceReceipt(ref:{current:Character},receipt:{hitDiceSpent:number;hitDiceRevision:number;hitDiceSpentByType?:Record<string,number>|null},pending:Partial<Character>={}){
 if(!Number.isInteger(receipt.hitDiceSpent)||receipt.hitDiceSpent<0||receipt.hitDiceSpent>20||!Number.isSafeInteger(receipt.hitDiceRevision)||receipt.hitDiceRevision<0)throw new Error('Invalid Psion resource receipt');
 const counts=receipt.hitDiceSpentByType??null;
 if(counts!==null&&!isHitDiceAllocation(counts,receipt.hitDiceSpent))throw new Error('Invalid Hit Dice allocation receipt');
 return reconcileCharacterUpdate(ref,{hit_dice_spent:receipt.hitDiceSpent,hit_dice_spent_by_type:counts,psionic_hit_dice_revision:receipt.hitDiceRevision},pending);
}

/** v2.784 — merge the transaction-owned resource keys, preserving every other
 * resource. Receipts are acknowledgements, never another queued write. */
export function acceptPsionicEnergyReceipt(ref:{current:Character},receipt:{mistyStepUsed?:number|null;connectionUsed?:number|null;remaining:number;energyRevision:number;restorationResource:number|null;restorationUsed:number|null},pending:Partial<Character>={}){
 if(!Number.isInteger(receipt.remaining)||receipt.remaining<0||receipt.remaining>12||!Number.isSafeInteger(receipt.energyRevision)||receipt.energyRevision<0)throw new Error('Invalid Energy Dice receipt');
 const resources={...ref.current.class_resources,'psionic-energy-dice':receipt.remaining} as Record<string,unknown>;
 const uses={...ref.current.feature_uses};
 if(receipt.restorationResource===null)delete resources['psionic-restoration'];else resources['psionic-restoration']=receipt.restorationResource;
 if(receipt.mistyStepUsed!==undefined){if(receipt.mistyStepUsed===null)delete uses['Free Misty Step (Teleportation)'];else uses['Free Misty Step (Teleportation)']=receipt.mistyStepUsed;}
 if(receipt.connectionUsed!==undefined){if(receipt.connectionUsed===null)delete uses['Telepathic Connection'];else uses['Telepathic Connection']=receipt.connectionUsed;}
 if(receipt.restorationUsed===null)delete uses['Psionic Restoration'];else uses['Psionic Restoration']=receipt.restorationUsed;
 return reconcileCharacterUpdate(ref,{class_resources:resources,feature_uses:uses,psionic_energy_revision:receipt.energyRevision},pending);
}

/** Rest acknowledgements update only captured fields. New local edits and newer
 * realtime changes survive a delayed response, including sibling resource keys. */
export function acceptPsionicRestReceipt(ref:{current:Character},receipt:{character:Character;expected:Record<string,unknown>},pending:Partial<Character>={}){
 const current=ref.current as unknown as Record<string,unknown>,saved=receipt.character as unknown as Record<string,unknown>;
 const incoming:Record<string,unknown>={psionic_energy_revision:saved.psionic_energy_revision};
 if('current_hp' in receipt.expected||'temp_hp' in receipt.expected)incoming.hit_point_revision=saved.hit_point_revision;
 if('hit_dice_spent' in receipt.expected)incoming.psionic_hit_dice_revision=saved.psionic_hit_dice_revision;
 for(const key of fields){
  if(!(key in receipt.expected))continue;
  if(key==='class_resources'||key==='feature_uses'){
   const before=(receipt.expected[key]??{}) as Record<string,unknown>,now=(current[key]??{}) as Record<string,unknown>,after={...saved[key] as Record<string,unknown>};
   const owned=key==='class_resources'?['psionic-energy-dice','psionic-restoration']:['Psionic Restoration','Telepathic Connection','Free Misty Step (Teleportation)'];
   for(const entry of new Set([...Object.keys(before),...Object.keys(now),...Object.keys(after)])){
    if(owned.includes(entry)||JSON.stringify(now[entry])===JSON.stringify(before[entry]))continue;
    if(Object.prototype.hasOwnProperty.call(now,entry))after[entry]=now[entry];else delete after[entry];
   }
   incoming[key]=after;
  }else if(JSON.stringify(current[key]??null)===JSON.stringify(receipt.expected[key]))incoming[key]=saved[key];
 }
 if('hit_dice_spent' in incoming)incoming.hit_dice_spent_by_type=saved.hit_dice_spent_by_type??null;
 return reconcileCharacterUpdate(ref,incoming,pending);
}

/** Ordinary optimistic edits own only unrelated keys. Resource payments and
 * rests acknowledge these protected keys through their ordered receipts. */
export function preservePsionicResources(current:Partial<Character>,partial:Partial<Character>):Partial<Character>{
 if(current.class_name!=='Psion'&&current.secondary_class!=='Psion')return partial;
 const patch={...partial};
 for(const field of ['class_resources','feature_uses'] as const){
  if(!Object.prototype.hasOwnProperty.call(partial,field))continue;
  const values={...partial[field]} as Record<string,unknown>,source=current[field]??{};
  for(const key of field==='class_resources'?['psionic-energy-dice','psionic-restoration']:['Psionic Restoration','Telepathic Connection','Free Misty Step (Teleportation)']){
   if(Object.prototype.hasOwnProperty.call(source,key))values[key]=source[key];else delete values[key];
  }
  (patch as Record<string,unknown>)[field]=values;
 }
 return patch;
}
/** Ordinary-save receipts must repair an older tab even when its realtime
 * echo arrived while the stale local patch was still marked pending. */
export function acceptSavedPsionicResources(ref:{current:Character},saved:Partial<Character>,pending:Partial<Character>={}){
 if(saved.id!==ref.current.id||(ref.current.class_name!=='Psion'&&ref.current.secondary_class!=='Psion')||(saved.class_name!=='Psion'&&saved.secondary_class!=='Psion')||!Number.isSafeInteger(saved.psionic_energy_revision))return {previous:ref.current,patch:{}};
 const resources=preservePsionicResources(saved,{class_resources:ref.current.class_resources,feature_uses:ref.current.feature_uses});
 return reconcileCharacterUpdate(ref,{...resources,psionic_energy_revision:saved.psionic_energy_revision},pending);
}

/** v2.786: only a NEW carry-over marker suppresses external damage checks.
 * Later damage retains the marker and must still prompt normally. */
export function isCombatHpCarryover(previous: Record<string, unknown>, patch: Record<string, unknown>): boolean {
 return typeof patch.combat_hp_sync_id === 'string' && patch.combat_hp_sync_id.length > 0
  && patch.combat_hp_sync_id !== previous.combat_hp_sync_id;
}

/** v2.794 — apply only concentration fields from a confirmed cast/save receipt.
 * A late acknowledgment cannot restore a casting superseded in another tab. */
export function acceptConcentrationReceipt(ref:{current:Character},incoming:Partial<Character>,pending:Partial<Character>={}){
 if(!Number.isSafeInteger(incoming.concentration_revision)||(incoming.concentration_revision??-1)<0)return {previous:ref.current,patch:{} as Partial<Character>};
 const concentration=Object.fromEntries(Object.entries(incoming).filter(([field])=>field.startsWith('concentration_')));
 return reconcileCharacterUpdate(ref,concentration,pending);
}

/** v2.798 — ordered HP acknowledgment for healing and ordinary saves. The
 * receipt is never queued again, and cannot replace newer remote damage. */
export function acceptHitPointReceipt(ref:{current:Character},saved:Partial<Character>,pending:Partial<Character>={}){
 if(saved.id!==ref.current.id||!Number.isSafeInteger(saved.hit_point_revision)||(saved.hit_point_revision??-1)<0
  ||![saved.current_hp,saved.max_hp,saved.temp_hp].every(n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0))return {previous:ref.current,patch:{} as Partial<Character>};
 return reconcileCharacterUpdate(ref,{current_hp:saved.current_hp,max_hp:saved.max_hp,temp_hp:saved.temp_hp,hit_point_revision:saved.hit_point_revision},pending);
}

/** Apply a full server snapshot's ordered resources, without requeueing it. */
export function acceptSavedCharacterResources(ref:{current:Character},saved:Partial<Character>,pending:Partial<Character>={}){
 const previous=ref.current;if(saved.id!==previous.id)return {previous,patch:{} as Partial<Character>};
 const patch={...acceptSavedPsionicResources(ref,saved,pending).patch,...acceptConcentrationReceipt(ref,saved,pending).patch,...acceptHitPointReceipt(ref,saved,pending).patch};
 if(Number.isSafeInteger(saved.psionic_hit_dice_revision)&&(saved.psionic_hit_dice_revision??-1)>=0
  &&Number.isInteger(saved.hit_dice_spent)&&(saved.hit_dice_spent??-1)>=0&&(saved.hit_dice_spent??21)<=20
  &&(saved.hit_dice_spent_by_type==null||isHitDiceAllocation(saved.hit_dice_spent_by_type,saved.hit_dice_spent!))){
  Object.assign(patch,acceptPsionicHitDiceReceipt(ref,{hitDiceSpent:saved.hit_dice_spent!,hitDiceRevision:saved.psionic_hit_dice_revision!,hitDiceSpentByType:saved.hit_dice_spent_by_type},pending).patch);
 }
 return {previous,patch};
}
