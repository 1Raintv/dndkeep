export interface SaveResolutionRecord {id:string;attack_kind:string;state:string;save_result:string|null;pending_lr_decision?:boolean|null}
export type SaveResolutionOutcome='passed'|'failed'|'awaiting_resistance';
/** v2.869: an absent or interrupted save is not a failed saving throw.
 * Only a recorded, live result can authorize downstream effects. */
export function saveResolutionOutcome(save:SaveResolutionRecord|null|undefined,attackId:string):SaveResolutionOutcome{
 if(!save||save.id!==attackId||save.attack_kind!=='save'||save.state!=='declared'||!['passed','failed'].includes(save.save_result??''))throw new Error('The saving throw could not be verified. Review its saved result before applying effects.');
 if(save.pending_lr_decision){
  if(save.save_result!=='failed')throw new Error('Review the inconsistent Legendary Resistance decision before applying effects.');
  return 'awaiting_resistance';
 }
 return save.save_result as 'passed'|'failed';
}
