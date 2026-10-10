import {useState} from 'react';
import type {Character,CombatParticipant,SpellData} from '../../types';
import type {ConcentrationCastSource} from '../../rules/concentrationCasting';
import {useCombatSelector} from '../../context/CombatContext';
import {createSpellDeclarationRequest,createTeleporterCantripRequest,isSpellDeclarationRequest,type SpellCombatIntent} from '../../lib/spellDeclarationRequest';
import {saveSpellDeclaration} from '../../lib/api/declaredSpells';
import TargetPickerModal from './TargetPickerModal';
interface Props {
 teleporterCombatParent?:string;onSaved?:()=>void;
 character:Character;spell:SpellData;userId:string;slotLevel:number;
 casting:ConcentrationCastSource&{saveDC:number};maxRangeFt:number|null;
 attackMode?:'melee'|'ranged'|null;attackKind:'attack_roll'|'save';attackBonus?:number;damageDice:string;damageType:string;
 saveAbility?:'STR'|'DEX'|'CON'|'INT'|'WIS'|'CHA';saveSuccessEffect?:'half'|'none'|'other';label?:string;
}
/** v2.856: pick only; the sheet's existing declaration host owns durable payment.
 * No attack row or optimistic slot edit is created from a target click. */
export default function SpellAttackCastButton(props:Props){
 const encounter=useCombatSelector(s=>s.encounter),participants=useCombatSelector(s=>s.participants);
 const [picking,setPicking]=useState(false),[error,setError]=useState('');
 const actor=participants.find(p=>p.participant_type==='character'&&p.entity_id===props.character.id);
 if(!encounter||encounter.status!=='active'||!actor)return null;
 function choose(target:CombatParticipant){
  try{
   if(!actor||!['character','creature'].includes(target.participant_type))throw new Error('Review this combat target.');
   if(props.attackKind==='attack_roll'&&target.ac==null)throw new Error('Target Armor Class is missing. Ask the DM to update this combat target.');
   const combat:SpellCombatIntent={kind:props.attackKind,attackMode:props.attackKind==='attack_roll'?props.attackMode??null:null,damageDice:props.damageDice,damageType:props.damageType,
    attackBonus:props.attackKind==='attack_roll'?props.attackBonus??0:null,targetAC:props.attackKind==='attack_roll'?target.ac:null,
    saveAbility:props.attackKind==='save'?props.saveAbility??null:null,saveSuccessEffect:props.attackKind==='save'?props.saveSuccessEffect??'half':null,
    actorCombatantId:actor.combatant_id??null,target:{participantId:target.id,entityId:target.entity_id,type:target.participant_type as 'character'|'creature',combatantId:target.combatant_id??null}};
   const request=props.teleporterCombatParent?createTeleporterCantripRequest(props.character,props.spell,actor.id,props.userId,props.casting,target.name,props.teleporterCombatParent):createSpellDeclarationRequest(props.character,props.spell,actor.id,props.userId,props.slotLevel,props.casting,target.name);
   request.context.combat=combat;
   if(!isSpellDeclarationRequest(request))throw new Error('Review the spell damage and selected target before casting.');
   saveSpellDeclaration(request);setPicking(false);setError('');props.onSaved?.();
  }catch(e){setError(e instanceof Error?e.message:'Could not save this casting.');}
 }
 return <>
  <button type="button" className="btn btn-secondary" onClick={()=>setPicking(true)} title={`Cast ${props.spell.name} at a combat target`}>{props.label??'Cast'}</button>
  {error&&!picking&&<span role="alert">{error}</span>}
  {picking&&<TargetPickerModal participants={participants} excludeParticipantId={actor.id} fromParticipant={actor} campaignId={encounter.campaign_id}
   error={error} maxRangeFt={props.maxRangeFt} title={`Cast ${props.spell.name}`} subtitle={`${props.damageDice} ${props.damageType}`} onPick={choose} onCancel={()=>setPicking(false)}/>}
 </>;
}
