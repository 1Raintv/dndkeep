import {useEffect,useState} from 'react';
import type {Character} from '../../types';
import {SPELLS} from '../../data/spells';
import {psionSpellReplacementContext,type SpellLevelUpTarget} from '../psionSpellReplacementContext';
import {maximumPsionSpellLevel,replacePsionLevelUpSpells,type PsionLevelUpSwaps} from '../../rules/psionSpellChoices';

/** Shared by both level-up flows. Selection stays local until level-up confirms. */
export function usePsionLevelUpSpells(character:Character,newLevel:number,target?:SpellLevelUpTarget){
 const [swaps,setSwaps]=useState<PsionLevelUpSwaps>({});
 const {selected,granted}=psionSpellReplacementContext(character,newLevel,target);
 const enabled=selected.className==='Psion'&&selected.level>=1;
 useEffect(()=>{setSwaps({});},[character.id,selected.kind,selected.className,selected.level,selected.subclass,newLevel]);
 const result=enabled?replacePsionLevelUpSpells({currentLevel:selected.level,newLevel,
  known:character.known_spells,prepared:character.prepared_spells,granted,catalog:SPELLS,swaps}):null;
 const outgoing=SPELLS.filter(s=>character.known_spells.includes(s.id)&&s.classes.includes('Psion')&&!granted.includes(s.id));
 const incoming=SPELLS.filter(s=>s.classes.includes('Psion')&&!character.known_spells.includes(s.id)&&!granted.includes(s.id)&&s.level<=maximumPsionSpellLevel(newLevel));
 const patch:Partial<Character>=result?.ok&&(swaps.cantrip||swaps.spell)?{known_spells:result.known,prepared_spells:result.prepared}:{};
 return {enabled,swaps,setSwaps,outgoing,incoming,valid:!enabled||!!result?.ok,error:result&&!result.ok?result.reason:null,patch};
}
