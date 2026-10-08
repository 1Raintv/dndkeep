import {createContext,useContext,useState,type ReactNode} from 'react';
import type {Character,ComputedStats,SpellData} from '../../types';
import {characterSpellCasting} from '../../lib/characterSpellCasting';

interface CastingSelections {choices:Record<string,string>;choose:(key:string,className:string)=>void}
const Context=createContext<CastingSelections|null>(null);
/** v2.794 — Actions and Spells share a source choice, but a choice never edits
 * learned/prepared ownership. Invalidated choices remain unresolved until reviewed. */
export function SpellCastingProvider({children}:{children:ReactNode}){
 const [choices,setChoices]=useState<Record<string,string>>({});
 return <Context.Provider value={{choices,choose:(key,className)=>setChoices(current=>({...current,[key]:className}))}}>{children}</Context.Provider>;
}
export function useSpellCastingResolver(character:Character,computed:ComputedStats){
 const shared=useContext(Context);const [local,setLocal]=useState<Record<string,string>>({});
 return (spell:Pick<SpellData,'id'|'level'>)=>{
  const key=`${character.id}:${spell.id}`;
  const chosen=(shared?.choices??local)[key];
  const result=characterSpellCasting(character,spell,computed);
  const selected=chosen?result.options.find(option=>option.key===chosen)??null:
   result.options.length===1&&!result.unresolvedSources.length?result.options[0]:null;
  return {...result,selected,choose:(className:string)=>{
   if(shared)shared.choose(key,className);else setLocal(current=>({...current,[key]:className}));
  }};
 };
}
export function useSpellCasting(character:Character,spell:Pick<SpellData,'id'|'level'>,computed:ComputedStats){
 return useSpellCastingResolver(character,computed)(spell);
}
export type SpellCastingState=ReturnType<ReturnType<typeof useSpellCastingResolver>>;
