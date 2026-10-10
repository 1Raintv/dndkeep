import type {ActionKind} from './actionBudget';
export type SpellActionKind=ActionKind;
export interface ConfirmedSpellAction {encounterId:string;turnId:string;currentTurnId:string|null;kind:SpellActionKind}
/** v2.863: capture the action type when declaring, before reload/catalog changes. */
export function spellActionKind(castingTime:string|null|undefined):SpellActionKind|undefined {
 const time=(castingTime??'').trim();
 if(/^(?:1\s+)?bonus\s+action\b/i.test(time))return 'bonusAction';
 if(/^(?:1\s+)?reaction\b/i.test(time))return 'reaction';
 if(/^(?:1\s+)?action\b/i.test(time))return 'action';
 // Longer castings spend this initial Magic action; subsequent turns and
 // the delayed completion/payment still require manual handling.
 if(/^\d+\s+(?:minutes?|hours?)\b/i.test(time))return 'action';
 return undefined;
}
export function recoverableSpellAction(action:ConfirmedSpellAction|null|undefined,encounter:{id:string;status:string;psionic_turn_id?:string}|null):SpellActionKind|null {
 return action&&encounter?.status==='active'&&encounter.id===action.encounterId&&action.turnId===action.currentTurnId&&action.turnId===encounter.psionic_turn_id?action.kind:null;
}
