import type {SpellDeclarationRequest} from '../spellDeclarationRequest';
import {acknowledgeSpellDeclaration} from './declaredSpells';
const key=(r:SpellDeclarationRequest)=>`dndkeep:spell-effects:${r.userId}:${r.characterId}:${r.castId}`;
export function spellEffectsStage(request:SpellDeclarationRequest):'started'|'done'|null{
 const value=localStorage.getItem(key(request));
 if(value!==null&&value!=='started'&&value!=='done')throw new Error('The saved spell effect status could not be read.');
 return value;
}
export class InterruptedSpellEffectsError extends Error{
 constructor(){super('Spell effects already started. Review your sheet and any buff or summon choices before marking this casting complete.');}
}
function locked<T>(request:SpellDeclarationRequest,action:()=>Promise<T>){
 if(!navigator.locks)return Promise.reject(new Error('This browser cannot safely resume spell effects. Open this sheet in a browser with Web Locks support.'));
 return navigator.locks.request(key(request),action);
}
/** v2.804: local side effects are not one database transaction. A crash after
 * starting them is ambiguous: retain the request and require review, never
 * silently create another summon or reset concentration. Web Locks serialize tabs. */
export function runDeclaredSpellEffects(request:SpellDeclarationRequest,apply:()=>Promise<void>){
 return locked(request,async()=>{
  const stage=spellEffectsStage(request);if(stage==='done')return;
  if(stage==='started')throw new InterruptedSpellEffectsError();
  localStorage.setItem(key(request),'started');await apply();
 });
}
/** Called only after verified settlement and completion/review of effect choices. */
export function finishDeclaredSpellEffects(request:SpellDeclarationRequest){
 return locked(request,async()=>{localStorage.setItem(key(request),'done');acknowledgeSpellDeclaration(request);});
}
