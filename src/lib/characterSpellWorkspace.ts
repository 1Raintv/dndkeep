import type {Character} from '../types';
import {CLASS_MAP} from '../data/classes';

/** v2.787 — Slot records describe resources, not whether spell management is
 * available. Missing imports must not hide a caster's repair/review controls. */
export function hasCharacterSpellWorkspace(character:Character):boolean{
 if(character.known_spells.length||character.prepared_spells.length)return true;
 if(Object.values(character.spell_slots??{}).some(slot=>slot.total>0))return true;
 const classCasts=(name:string,subclass:string|null,level:number)=>{
  const cls=CLASS_MAP[name];
  return !!cls?.is_spellcaster||!!cls?.subclasses.find(sub=>sub.name===subclass)?.features?.some(feature=>feature.name==='Spellcasting'&&feature.level<=level);
 };
 return classCasts(character.class_name,character.subclass,character.level)
  ||!!character.secondary_class&&classCasts(character.secondary_class,character.secondary_subclass,character.secondary_level??0);
}
