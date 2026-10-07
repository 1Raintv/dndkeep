import {useRef} from 'react';
import type {Character} from '../../types';
/** v2.780 — modal/context rerenders can reuse the previous character prop while
 * a local ability has already paid a cost. Only a newly supplied character
 * snapshot may replace that optimistic state; identical props cannot refund it. */
export function useOptimisticCharacterRef(character:Character){
 const accepted=useRef(character),current=useRef(character);
 if(accepted.current!==character){accepted.current=character;current.current=character;}
 return current;
}
