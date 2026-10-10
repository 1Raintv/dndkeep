import {psionicRpc} from './psionicTurns';
export const ACTION_BUDGET_CHANGED='dndkeep:action-budget-changed';
export interface ActionFlags {action:boolean;bonusAction:boolean;reaction:boolean}
export interface SavedActionBudget {context:{actorId:string;turnId:string;ownerTurnId:string;encounterId:string|null;participantId:string|null;isOwnTurn:boolean};spent:ActionFlags;claimed:ActionFlags}
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const text=(v:unknown)=>typeof v==='string'&&v.length>0;
const flags=(v:ActionFlags)=>v&&['action','bonusAction','reaction'].every(k=>typeof v[k as keyof ActionFlags]==='boolean');
export async function getActionBudget(characterId:string):Promise<SavedActionBudget>{
 if(!uuid(characterId))throw new Error('Invalid character for action budget.');
 const result=await psionicRpc('get_action_budget',{p_character:characterId},true) as SavedActionBudget;
 if(!validActionBudget(result,characterId))throw new Error('The saved action budget could not be verified.');
 return result;
}
export function validActionBudget(value:unknown,characterId:string):value is SavedActionBudget {
 const result=value as SavedActionBudget|null,c=result?.context;
 return !!c&&c.actorId===characterId&&text(c.turnId)&&text(c.ownerTurnId)&&typeof c.isOwnTurn==='boolean'
  &&((c.encounterId===null&&c.participantId===null)||(uuid(c.encounterId)&&uuid(c.participantId)))&&!!flags(result!.spent)&&!!flags(result!.claimed)
  &&!Object.keys(result!.claimed).some(k=>result!.claimed[k as keyof ActionFlags]&&!result!.spent[k as keyof ActionFlags]);
}

export function notifyActionBudgetChanged(){if(typeof window!=='undefined')window.dispatchEvent(new Event(ACTION_BUDGET_CHANGED));}
