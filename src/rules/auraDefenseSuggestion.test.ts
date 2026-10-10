import {expect,it} from 'vitest';
import {auraDefenseSuggestion} from './auraDefenseSuggestion';
const context=()=>({aura:{aura:{damageType:'Fire',damageDice:'3d8'}},target:{participant:{participant_type:'character'},definition:{species:'Human',species_choices:null,damage_resistances:[] as string[]|null,damage_immunities:[] as string[]|null,damage_vulnerabilities:[] as string[]|null,active_buffs:[] as unknown[]},combatant:{active_conditions:[] as string[],active_buffs:[] as unknown[]}}});
it.each(['acid','bludgeoning','cold','fire','lightning','piercing','poison','slashing','thunder'])('uses saved timed %s resistance without guessing the class or current clock',type=>{
 const c=context();c.aura.aura.damageType=type;c.target.definition.damage_resistances=[type];expect(auraDefenseSuggestion(c)).toBe('resistant');
 c.aura.aura.damageType='psychic';expect(auraDefenseSuggestion(c)).toBe('normal');
});
it('preserves immunity priority and resistance/vulnerability ordering',()=>{
 const c=context();c.target.definition.damage_resistances=['Fire'];c.target.definition.damage_vulnerabilities=[' FIRE '];expect(auraDefenseSuggestion(c)).toBe('resistant-vulnerable');
 c.target.definition.damage_immunities=['fire'];expect(auraDefenseSuggestion(c)).toBe('immune');
});
it('includes known species, buffs and Petrified without stacking',()=>{
 const c=context();c.target.definition.species='Dwarf';c.aura.aura.damageType='poison';expect(auraDefenseSuggestion(c)).toBe('resistant');
 c.aura.aura.damageType='fire';c.target.definition.active_buffs=[{resistances:['fire']}];expect(auraDefenseSuggestion(c)).toBe('resistant');
 c.target.combatant.active_buffs=[{immunities:['Fire']}];expect(auraDefenseSuggestion(c)).toBe('immune');
 c.target.combatant.active_buffs=[];c.target.definition.active_buffs=[];c.target.combatant.active_conditions=['Petrified'];expect(auraDefenseSuggestion(c)).toBe('resistant');
});
it('leaves missing Tiefling legacy, qualified defenses and malformed buffs for review',()=>{
 const c=context();c.target.definition.species='Tiefling';expect(auraDefenseSuggestion(c)).toBeNull();
 c.target.definition.species='Human';c.target.definition.damage_resistances=['fire from spells'];expect(auraDefenseSuggestion(c)).toBeNull();
 c.target.definition.damage_resistances=[];c.target.combatant.active_buffs=[{resistances:'fire'}];expect(auraDefenseSuggestion(c)).toBeNull();
});
it('distinguishes nullable character defenses from unknown creature defenses and missing fields',()=>{
 const c=context();c.target.definition.damage_resistances=null;expect(auraDefenseSuggestion(c)).toBe('normal');
 c.target.participant.participant_type='creature';expect(auraDefenseSuggestion(c)).toBeNull();
 c.target.definition.damage_resistances=[];expect(auraDefenseSuggestion(c)).toBe('normal');
 const {damage_resistances,...missing}=c.target.definition;expect(auraDefenseSuggestion({...c,target:{...c.target,definition:missing}})).toBeNull();
});
it('does not mutate the saved context while deriving a suggestion',()=>{
 const c=context();c.target.definition.active_buffs=[{resistances:['fire']}];const original=structuredClone(c);auraDefenseSuggestion(c);expect(c).toEqual(original);
});
it.each([null,{}, {aura:{aura:{damageType:'unknown',damageDice:'3d8'}}}])('rejects incomplete or unknown context',c=>expect(auraDefenseSuggestion(c)).toBeNull());
