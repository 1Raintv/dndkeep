import type {Character} from '../types';
import {psionProgression} from '../rules/psionProgression';
/** v2.792 — a read-only class context for existing feature renderers. Keep
 * both levels so proficiency and Hit Point Dice still use the whole character.
 * Never save this object: feature controls persist only their resource patches. */
export function psionFeatureCharacter(c:Character):Character|null {
 const progression=psionProgression(c);if(!progression)return null;
 if(c.class_name==='Psion')return c;
 return {...c,class_name:'Psion',level:progression.level,subclass:progression.subclass??'',
  secondary_class:c.class_name,secondary_level:c.level,secondary_subclass:c.subclass};
}
