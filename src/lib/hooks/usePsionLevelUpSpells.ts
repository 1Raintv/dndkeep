import {spellStateKey} from '../../rules/spellStateKey';
import {reviewSpellPreparation,type SpellPreparationSources} from '../../rules/spellPreparation';
import {isSpellSources} from '../../rules/spellSources';
import {useEffect,useState} from 'react';
import type {Character} from '../../types';
import {SPELLS} from '../../data/spells';
import {psionSpellReplacementContext,type SpellLevelUpTarget} from '../psionSpellReplacementContext';
import {maximumPsionSpellLevel,replaceOwnedPsionLevelUpSpells,type PsionLevelUpSwaps,type SpellSources,type SpellSource} from '../../rules/psionSpellChoices';

/** Shared by both level-up flows. Selection stays local until level-up confirms. */
export function usePsionLevelUpSpells(character:Character,newLevel:number,target?:SpellLevelUpTarget){
 const [swaps,setSwaps]=useState<PsionLevelUpSwaps>({});
 const sourceDataValid=isSpellSources(character.spell_sources??{})&&isSpellSources(character.spell_preparation_sources??{});
 const [sources,setSources]=useState<SpellSources>(sourceDataValid?character.spell_sources??{}:{});
 const [preparationSources,setPreparationSources]=useState<SpellPreparationSources>(isSpellSources(character.spell_preparation_sources??{})?character.spell_preparation_sources??{}:{});
 const [prepared,setPrepared]=useState(character.prepared_spells);
 const {selected,granted}=psionSpellReplacementContext(character,newLevel,target);
 const enabled=selected.className==='Psion'&&selected.level>=1;
 const savedSpellKey=spellStateKey({known:character.known_spells,prepared:character.prepared_spells,sources:character.spell_sources??{},preparationSources:character.spell_preparation_sources??{}});
 useEffect(()=>{setSwaps({});setPrepared(character.prepared_spells);setPreparationSources(isSpellSources(character.spell_preparation_sources??{})?character.spell_preparation_sources??{}:{});setSources(isSpellSources(character.spell_sources??{})?character.spell_sources??{}:{});},[character.id,savedSpellKey,selected.kind,selected.className,selected.level,selected.subclass,newLevel]);
 const result=enabled&&sourceDataValid?replaceOwnedPsionLevelUpSpells({currentLevel:selected.level,newLevel,
  known:character.known_spells,prepared,preparationSources,granted,catalog:SPELLS,swaps,sources}):null;
 const outgoing=SPELLS.filter(s=>character.known_spells.includes(s.id)&&s.classes.includes('Psion')&&!granted.includes(s.id)&&(!sources[s.id]?.length||sources[s.id].includes('class:Psion')||s.id===swaps.cantrip?.from||s.id===swaps.spell?.from));
 const incoming=SPELLS.filter(s=>s.classes.includes('Psion')&&(!character.known_spells.includes(s.id)||(!!sources[s.id]?.length&&!sources[s.id].includes('class:Psion')))&&!granted.includes(s.id)&&s.level<=maximumPsionSpellLevel(newLevel));
 const changedSources=JSON.stringify(sources)!==JSON.stringify(character.spell_sources??{});
 const patch:Partial<Character>=result?.ok&&(swaps.cantrip||swaps.spell||changedSources||JSON.stringify(preparationSources)!==JSON.stringify(character.spell_preparation_sources??{}))?{known_spells:result.known,prepared_spells:result.prepared,spell_sources:result.sources,spell_preparation_sources:result.preparationSources}:{};
 const sourceOptions:SpellSource[]=[...new Set([`class:${character.class_name}` as SpellSource,...(character.secondary_class?[`class:${character.secondary_class}` as SpellSource]:[]),'feat','species','other'] as SpellSource[])];
 const reviewable=SPELLS.filter(s=>character.known_spells.includes(s.id)&&s.classes.includes('Psion')&&!granted.includes(s.id));
 function changeSource(id:string,source:SpellSource,checked:boolean){
  setSources(previous=>{const next=new Set(previous[id]??[]);if(checked)next.add(source);else next.delete(source);return {...previous,[id]:[...next]};});
  // Changed ownership invalidates any earlier readiness review for that spell.
  setPreparationSources(previous=>{const next={...previous};delete next[id];return next;});
 }
 function reviewPreparation(id:string,readySources:readonly SpellSource[]){
  const reviewed=reviewSpellPreparation({id,readySources,sources,prepared,preparationSources});
  if(reviewed.ok){setPrepared(reviewed.prepared);setPreparationSources(reviewed.preparationSources);}
 }
 return {preparationSources,reviewPreparation,changeSource,enabled,swaps,setSwaps,sources,setSources,sourceOptions,reviewable,outgoing,incoming,valid:!enabled||(sourceDataValid&&!!result?.ok),error:!sourceDataValid?'Spell sources could not be read. Correct the saved source data before replacing spells.':result&&!result.ok?result.reason:null,patch};
}
