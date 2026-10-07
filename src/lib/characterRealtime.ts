import type {Character} from '../types';
const fields = [
 'current_hp','temp_hp','active_conditions','concentration_spell','concentration_rounds_remaining',
 'spell_slots','death_saves_successes','death_saves_failures','inspiration',
 'hit_dice_spent','psionic_hit_dice_revision','psionic_energy_revision','class_resources','feature_uses','currency','inventory','experience_points',
] as const;

/** v2.765 — publish the next comparison snapshot synchronously. Two realtime
 * events can arrive before React renders; comparing both to the old rendered
 * state can discard the newest event and leave the sheet stuck on the first.
 * Pending local fields remain authoritative until the save queue settles. */
export function reconcileCharacterUpdate(ref:{current:Character},incoming:Record<string,unknown>,pending:Partial<Character>) {
 const previous=ref.current;
 const patch:Partial<Character>={};
 const revision=incoming.psionic_hit_dice_revision;
 const staleHitDice=typeof revision==='number'&&revision<(previous.psionic_hit_dice_revision??0);
 const energyRevision=incoming.psionic_energy_revision;
 const staleEnergy=typeof energyRevision==='number'&&energyRevision<(previous.psionic_energy_revision??0);
 for(const field of fields) {
  // v2.782 — late acknowledgements/events cannot refund a newer paid cost.
  if(staleHitDice&&(field==='hit_dice_spent'||field==='psionic_hit_dice_revision'))continue;
  if(staleEnergy&&field==='psionic_energy_revision')continue;
  let value=Object.prototype.hasOwnProperty.call(pending,field)?pending[field]:incoming[field];
  // A stale Energy Dice event may still contain unrelated feature edits.
  // Preserve only the revision-owned keys, rather than dropping the whole map.
  if(staleEnergy&&value!==undefined&&(field==='class_resources'||field==='feature_uses')){
   const restored={...(value as Record<string,unknown>|null)};
   const prior=previous[field]??{};
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
export function acceptPsionicHitDiceReceipt(ref:{current:Character},receipt:{hitDiceSpent:number;hitDiceRevision:number},pending:Partial<Character>={}){
 if(!Number.isInteger(receipt.hitDiceSpent)||receipt.hitDiceSpent<0||receipt.hitDiceSpent>20||!Number.isSafeInteger(receipt.hitDiceRevision)||receipt.hitDiceRevision<0)throw new Error('Invalid Psion resource receipt');
 return reconcileCharacterUpdate(ref,{hit_dice_spent:receipt.hitDiceSpent,psionic_hit_dice_revision:receipt.hitDiceRevision},pending);
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
