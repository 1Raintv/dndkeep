import {recoverPsionicReserves} from './api/psionicReserves';
import {emitCombatEvent} from './combatEvents';
import {log} from './log';
/** v2.754 — Called only after an initiative roll is persisted, never on turn
 * advance or manual initiative edits. A recovery failure must not orphan a
 * successfully started encounter; surface it in the combat log instead. */
export async function recoverInitiativeResources(p:{participant_type:string;entity_id?:string|null;campaign_id:string;encounter_id:string;name:string;hidden_from_players?:boolean|null}):Promise<void> {
  if(p.participant_type!=='character'||!p.entity_id)return;
  let description:string;
  let recovered=0;
  try {
    recovered=await recoverPsionicReserves(p.entity_id);
    if(!recovered)return;
    description=`Psionic Reserves: recovered ${recovered} Psionic Energy ${recovered===1?'Die':'Dice'} (4 remaining).`;
  } catch(error) {
    log.error('Psionic Reserves recovery failed',error,{characterId:p.entity_id});
    description='Psionic Reserves could not sync. If eligible, check the dice pool and restore it to 4 manually.';
  }
  await emitCombatEvent({campaignId:p.campaign_id,encounterId:p.encounter_id,actorType:'player',actorName:p.name,
    eventType:'character_field_changed',payload:{field:'Psionic Reserves',description,recovered},
    visibility:p.hidden_from_players?'hidden_from_players':'public'});
}
