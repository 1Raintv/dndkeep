import {psionProgression,type PsionicClassState} from './psionProgression';
/** v2.792 — initiative recovery uses the same validated class levels as powers. */
export function hasPsionicReserves(c:PsionicClassState):boolean {
 return (psionProgression(c)?.level??0)>=18;
}
