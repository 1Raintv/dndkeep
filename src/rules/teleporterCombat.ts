import {psionProgression,type PsionicClassState} from './psionProgression';
/** Teleporter Combat (UA Psi Warper): one Psion cantrip whose casting time is
 * one Action. Long castings also use Magic actions, but do not qualify here. */
export function teleporterCantripEligible(character:PsionicClassState,spell:{id:string;level:number;casting_time:string},source:string):boolean {
 const psion=psionProgression(character);
 return !!psion&&psion.level>=6&&psion.subclass==='Psi Warper'&&spell.level===0
  // Produce Flame is a Bonus Action in 2024; its legacy catalog/throw flow
  // still needs repair. Never let that stale metadata authorize this feature.
  &&spell.id!=='produce-flame'&&/^(?:1\s+)?action$/i.test(spell.casting_time.trim())
  &&(source==='class:Psion'||source==='grant:class:Psion');
}
