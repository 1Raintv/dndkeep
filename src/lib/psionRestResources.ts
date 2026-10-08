import type {Character} from '../types';
import {getCharacterResources} from '../data/classResources';
import {psionProgression} from '../rules/psionProgression';
import {recoverResourcePools} from '../rules/resourceRecovery';
/** v2.792 — feed each class's own resource limits to the shared rest rules.
 * Psion's Energy Dice alone gain one on a Short Rest; meditation stays spent. */
export function psionRestResources(c:Character,kind:'short'|'long') {
 if(!psionProgression(c))return {...c.class_resources};
 const scores={strength:c.strength,dexterity:c.dexterity,constitution:c.constitution,intelligence:c.intelligence,wisdom:c.wisdom,charisma:c.charisma};
 const classes=[{name:c.class_name,level:c.level},...(c.secondary_class&&(c.secondary_level??0)>0?[{name:c.secondary_class,level:c.secondary_level!}]:[])];
 const definitions=classes.flatMap(({name,level})=>getCharacterResources(name,level,scores).map(r=>({id:r.id,maximum:r.getMax(level,scores),recovery:r.id==='psionic-energy-dice'?'short-partial' as const:r.recovery})));
 return recoverResourcePools(c.class_resources??{},definitions,kind);
}
