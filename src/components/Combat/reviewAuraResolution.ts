import type {useModal} from '../shared/Modal';
import type {SavedAuraRequest} from '../../lib/api/auraResolution';
import {auraReviewPreview} from '../../rules/auraReviewPreview';
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
/** v2.869: reuse the accessible decision modal; this callback never spends a
 * charge or changes HP. The recovery API persists the choice before committing. */
export async function reviewAuraResolution(modal:Pick<ReturnType<typeof useModal>,'decide'>,request:SavedAuraRequest){
 if(request.phase!=='review')throw new Error('This aura request has already been submitted for resolution.');
 const preview=auraReviewPreview(request.expected,request.proposal),save=preview.normal.save;
 const target=object(request.expected.target)&&object(request.expected.target.combatant)?request.expected.target.combatant:{};
 const spec=object(request.expected.aura)&&object(request.expected.aura.aura)?request.expected.aura.aura:{};
 const name=typeof target.name==='string'?target.name:'Target',aura=typeof spec.name==='string'?spec.name:'Aura';
 const damageType=typeof spec.damageType==='string'?` ${spec.damageType}`:'';
 const roll=save.automaticFailure?'Automatic failure — no saving throw rolled.':
  `Saved dice: ${save.dice.join(', ')}. Kept ${save.d20}; modifier ${save.bonus>=0?'+':''}${save.bonus}. Total ${save.total}.`;
 const pools=preview.normal.pools;
 const hp=pools?`HP ${pools.beforeHP} → ${pools.afterHP}${pools.beforeTempHP?`; temporary HP ${pools.beforeTempHP} → ${pools.afterTempHP}`:''}.`:'HP stays unchanged.';
 const message=[`${name} · ${save.ability} save vs DC ${save.dc}`,roll,
  ...(preview.penalty?[`Includes Mind Sliver: −${preview.penalty}.`]:[]),
  `${save.passed?'Passed':'Failed'}: ${preview.normal.damage}${damageType} damage. ${hp}`];
 if(preview.canUseResistance&&preview.resisted){
  const lr=request.expected.legendaryResistance as {capacity:number;used:number};
  message.push(`Legendary Resistance: ${lr.capacity-lr.used} remaining. Spend 1 to succeed instead: ${preview.resisted.damage}${damageType} damage.`,
   'Tap outside or press Escape to review later. Your rolls stay saved.');
  const choice=await modal.decide({title:`${aura}: review save`,message:message.join('\n\n'),confirmLabel:'Use resistance',cancelLabel:'Accept failure'});
  return choice===null?null:{useResistance:choice};
 }
 message.push('Your rolls stay saved if you review later.');
 const choice=await modal.decide({title:`${aura}: review save`,message:message.join('\n\n'),confirmLabel:'Apply result',cancelLabel:'Review later'});
 return choice===true?{useResistance:false}:null;
}
