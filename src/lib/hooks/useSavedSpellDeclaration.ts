import {useEffect,useState} from 'react';
import {savedSpellDeclaration,SPELL_DECLARATION_CHANGED} from '../api/declaredSpells';
import type {SpellDeclarationRequest} from '../spellDeclarationRequest';
interface Saved {scope:string;request:SpellDeclarationRequest|null;error:string}
/** One sheet-level subscription keeps recovery available even when the original
 * spell row/source/last slot is no longer rendered. */
export function useSavedSpellDeclaration(userId:string,characterId:string){
 const scope=JSON.stringify([userId,characterId]);
 const read=():Saved=>{try{return {scope,request:savedSpellDeclaration(userId,characterId),error:''};}catch(error){return {scope,request:null,error:error instanceof Error?error.message:'The saved casting could not be read.'};}};
 const [value,setValue]=useState<Saved>(read);
 useEffect(()=>{
  const update=()=>{try{setValue({scope,request:savedSpellDeclaration(userId,characterId),error:''});}catch(error){setValue({scope,request:null,error:error instanceof Error?error.message:'The saved casting could not be read.'});}};
  update();window.addEventListener(SPELL_DECLARATION_CHANGED,update);window.addEventListener('storage',update);
  return()=>{window.removeEventListener(SPELL_DECLARATION_CHANGED,update);window.removeEventListener('storage',update);};
 },[scope,userId,characterId]);
 const current=value.scope===scope?value:read();
 return {...current,blocked:!!current.request||!!current.error};
}
