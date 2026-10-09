/** Shared action-budget contract. The persistence layer must construct grants
 * from verified turn/effect state and serialize claims; caller-supplied grants
 * are never authorization. See ROADMAP for remaining transaction integration.
 * SRD 5.2: reactions refresh on the actor's next turn, not every global turn.
 */
export type ActionKind='action'|'bonusAction'|'reaction';
export type ActionPurpose='attack'|'dash'|'disengage'|'dodge'|'help'|'hide'|'influence'|'magic'|'ready'|'search'|'study'|'utilize'|'feature';
export type ActionGrantSource='normal'|'action-surge'|'haste';
export interface ActionGrant {
 id:string;kind:ActionKind;source:ActionGrantSource;
 /** Stable from the start of this actor's turn until its next turn begins.
  * Before its first turn the server supplies an encounter-start epoch. */
 ownerTurnId:string;
}
export interface ActionClaim {
 requestId:string;actorId:string;turnId:string;ownerTurnId:string;
 grantId:string;kind:ActionKind;purpose:ActionPurpose;sourceId:string;grantSource:ActionGrantSource;
}
export interface ActionBudget {
 actorId:string;turnId:string;ownerTurnId:string;isOwnTurn:boolean;
 canTakeActions:boolean;canTakeReactions:boolean;
 grants:readonly ActionGrant[];claims:readonly ActionClaim[];
}
export interface ActionIntent {
 requestId:string;actorId:string;turnId:string;grantId:string;
 kind:ActionKind;purpose:ActionPurpose;sourceId:string;
}
export type ActionPlan={ok:true;claim:ActionClaim;replayed:boolean;attackLimit:1|null}|
 {ok:false;reason:'invalid'|'identity-conflict'|'stale-turn'|'unavailable'|'wrong-turn'|'restricted'|'spent'};
const kinds:readonly string[]=['action','bonusAction','reaction'];
const purposes:readonly string[]=['attack','dash','disengage','dodge','help','hide','influence','magic','ready','search','study','utilize','feature'];
const hastePurposes:readonly ActionPurpose[]=['attack','dash','disengage','hide','utilize'];
const text=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>0;
/** Validate a single action declaration. A failed save or cancelled effect does
 * not erase a claim. A verified replay returns its historical claim without
 * consuming the current turn; resource/effect settlement uses the same ID. */
export function planActionSpend(budget:ActionBudget,intent:ActionIntent):ActionPlan {
 if(![intent.requestId,intent.actorId,intent.turnId,intent.grantId,intent.sourceId,budget.actorId,budget.turnId,budget.ownerTurnId].every(text)
  ||!kinds.includes(intent.kind)||!purposes.includes(intent.purpose)||intent.actorId!==budget.actorId)return {ok:false,reason:'invalid'};
 const previous=budget.claims.filter(c=>c.requestId===intent.requestId);
 if(previous.length){
  const claim=previous[0];
  if(previous.length!==1||claim.actorId!==intent.actorId||claim.turnId!==intent.turnId||claim.grantId!==intent.grantId
   ||claim.kind!==intent.kind||claim.purpose!==intent.purpose||claim.sourceId!==intent.sourceId)return {ok:false,reason:'identity-conflict'};
  // Replay preserves the original grant restriction, even after Haste expires.
  return {ok:true,claim:{...claim},replayed:true,attackLimit:claimAttackLimit(claim)};
 }
 if(intent.turnId!==budget.turnId)return {ok:false,reason:'stale-turn'};
 if((intent.kind==='reaction'?!budget.canTakeReactions:!budget.canTakeActions))return {ok:false,reason:'unavailable'};
 if(intent.kind!=='reaction'&&!budget.isOwnTurn)return {ok:false,reason:'wrong-turn'};
 const matches=budget.grants.filter(g=>g.id===intent.grantId);
 if(matches.length!==1)return {ok:false,reason:'invalid'};
 const grant=matches[0];
 if(grant.ownerTurnId!==budget.ownerTurnId||grant.kind!==intent.kind)return {ok:false,reason:'unavailable'};
 if(!['normal','action-surge','haste'].includes(grant.source)||(grant.source!=='normal'&&grant.kind!=='action'))return {ok:false,reason:'invalid'};
 if((grant.source==='action-surge'&&intent.purpose==='magic')||(grant.source==='haste'&&!hastePurposes.includes(intent.purpose)))return {ok:false,reason:'restricted'};
 if(budget.claims.some(c=>c.actorId===budget.actorId&&c.ownerTurnId===budget.ownerTurnId&&c.grantId===grant.id))return {ok:false,reason:'spent'};
 const claim:ActionClaim={...intent,ownerTurnId:budget.ownerTurnId,grantSource:grant.source};
 return {ok:true,claim,replayed:false,attackLimit:claimAttackLimit(claim)};
}
function claimAttackLimit(claim:ActionClaim):1|null{return claim.grantSource==='haste'&&claim.purpose==='attack'?1:null;}
