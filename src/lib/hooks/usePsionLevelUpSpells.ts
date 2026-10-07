import {useEffect,useState} from 'react';
import type {Character} from '../../types';
import {SPELLS} from '../../data/spells';
import {getGrantedSpellIds} from '../grantedSpells';
import {maximumPsionSpellLevel,replacePsionLevelUpSpells,type PsionLevelUpSwaps} from '../../rules/psionSpellChoices';

/** Shared by both level-up flows. Selection stays local until level-up confirms. */
export function usePsionLevelUpSpells(character:Character,newLevel:number){
 const [swaps,setSwaps]=useState<PsionLevelUpSwaps>({});
 const enabled=character.class_name==='Psion'&&character.level>=1;
 useEffect(()=>{setSwaps({});},[character.id,character.class_name,character.level,character.subclass,newLevel]);
 const granted=getGrantedSpellIds({...character,level:newLevel}).all;
 const result=enabled?replacePsionLevelUpSpells({currentLevel:character.level,newLevel,
  known:character.known_spells,prepared:character.prepared_spells,granted,catalog:SPELLS,swaps}):null;
 const outgoing=SPELLS.filter(s=>character.known_spells.includes(s.id)&&s.classes.includes('Psion')&&!granted.includes(s.id));
 const incoming=SPELLS.filter(s=>s.classes.includes('Psion')&&!character.known_spells.includes(s.id)&&!granted.includes(s.id)&&s.level<=maximumPsionSpellLevel(newLevel));
 const patch:Partial<Character>=result?.ok&&(swaps.cantrip||swaps.spell)?{known_spells:result.known,prepared_spells:result.prepared}:{};
 return {enabled,swaps,setSwaps,outgoing,incoming,valid:!enabled||!!result?.ok,error:result&&!result.ok?result.reason:null,patch};
}
