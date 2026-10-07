import type {Character} from '../types';
const fields = [
 'current_hp','temp_hp','active_conditions','concentration_spell','concentration_rounds_remaining',
 'spell_slots','death_saves_successes','death_saves_failures','inspiration',
 'hit_dice_spent','class_resources','feature_uses','currency','inventory','experience_points',
] as const;

/** v2.765 — publish the next comparison snapshot synchronously. Two realtime
 * events can arrive before React renders; comparing both to the old rendered
 * state can discard the newest event and leave the sheet stuck on the first.
 * Pending local fields remain authoritative until the save queue settles. */
export function reconcileCharacterUpdate(ref:{current:Character},incoming:Record<string,unknown>,pending:Partial<Character>) {
 const previous=ref.current;
 const patch:Partial<Character>={};
 for(const field of fields) {
  const value=Object.prototype.hasOwnProperty.call(pending,field)?pending[field]:incoming[field];
  if(value!==undefined&&JSON.stringify(value)!==JSON.stringify(previous[field]))
   (patch as Record<string,unknown>)[field]=value;
 }
 if(Object.keys(patch).length)ref.current={...previous,...patch};
 return {previous,patch};
}
